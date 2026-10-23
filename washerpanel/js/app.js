(function () {
    const KEY = 'wo_washer_token';
    const $ = (id) => document.getElementById(id);
    let token = null, tab = 'active', data = { active: [], done: [], stats: {} }, timer = null;
    try { token = localStorage.getItem(KEY); } catch (e) {}

    async function api(path, opts = {}) {
        const res = await fetch('/api' + path, {
            method: opts.method || 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 401 && token) { doLogout(false); throw new Error(json.error || 'Sesi berakhir'); }
        if (!res.ok) throw new Error(json.error || 'Terjadi kesalahan');
        return json;
    }

    function toast(msg, bad) {
        const t = $('toast');
        t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : '');
        clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600);
    }
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtQty = (i) => (i.type === 'kg' ? i.qty + ' kg' : i.qty + ' pcs');
    const waNumber = (p) => { p = String(p).replace(/\D/g, ''); return p.startsWith('0') ? '62' + p.slice(1) : p; };
    const fmtTime = (s) => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

    function show(loggedIn) {
        if (!loggedIn) { location.replace('/login'); return; }   // login terpadu di /login
        $('app-view').classList.remove('hidden');
    }

    function taskCard(o, finished) {
        const washing = o.status === 'Dicuci';
        const cls = finished ? 'finished' : (washing ? 'washing' : '');
        const label = { Ditugaskan: 'Belum dicuci', Dicuci: 'Sedang dicuci', Siap: 'Selesai - siap', Selesai: 'Sudah diambil' }[o.status] || o.status;
        const addr = o.delivery_type === 'jemput'
            ? `<div class="addr">📍 ${esc(o.client_address)}</div>`
            : '<div class="addr">🏠 Pelanggan antar sendiri</div>';
        let action = '';
        if (!finished) action = washing
            ? `<button class="btn btn-ok" data-act="${o.id}">✅ Cucian Sudah Selesai</button>`
            : `<button class="btn btn-primary" data-act="${o.id}">▶ Mulai Cuci</button>`;
        return `<article class="task ${cls}">
            <div class="task-head"><span class="code">${esc(o.code)}</span><span class="badge">${label}</span></div>
            <div class="client">${esc(o.client_name)}</div>${addr}
            <ul class="items">${o.items.map(i => `<li><span>${esc(i.service_name)}</span><b>${fmtQty(i)}</b></li>`).join('')}</ul>
            ${o.notes ? `<p class="note">📝 ${esc(o.notes)}</p>` : ''}
            ${finished ? '' : `<div class="contact"><a href="tel:${esc(o.client_phone)}">📞 Telepon</a><a class="wa" target="_blank" rel="noopener" href="https://wa.me/${waNumber(o.client_phone)}">💬 WhatsApp</a></div>`}
            ${action}
            <div class="time">${finished ? 'Selesai ' : 'Masuk '}${fmtTime(finished ? o.updated_at : o.created_at)}</div>
        </article>`;
    }

    function render() {
        $('st-active').textContent = data.active.length;
        $('st-today').textContent = data.stats.done_today || 0;
        $('st-total').textContent = data.stats.done_total || 0;
        const rows = tab === 'active' ? data.active : data.done;
        if (!rows.length) {
            $('list').innerHTML = tab === 'active'
                ? '<div class="empty"><div class="big">🧺</div><p><b>Belum ada tugas</b><br>Tugas baru dari admin akan muncul di sini.</p></div>'
                : '<div class="empty"><div class="big">📋</div><p>Belum ada riwayat pekerjaan.</p></div>';
            return;
        }
        $('list').innerHTML = rows.map(o => taskCard(o, tab === 'done')).join('');
    }

    async function load() {
        try { data = await api('/washer/tasks'); render(); } catch (e) { if (token) toast(e.message, true); }
    }

    async function start() {
        try {
            const me = await api('/auth/washer/me');
            $('who').textContent = me.user.name;
            show(true);
            await load();
            clearInterval(timer); timer = setInterval(load, 20000);
        } catch (e) { show(false); }
    }

    function doLogout(callApi = true) {
        if (callApi && token) api('/auth/washer/logout', { method: 'POST' }).catch(() => {});
        token = null; try { localStorage.removeItem(KEY); } catch (e) {}
        clearInterval(timer); show(false);
    }

    $('logout').addEventListener('click', () => doLogout());
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
        tab = b.dataset.tab;
        document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
        render();
    }));

    $('list').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const order = data.active.find(o => String(o.id) === btn.dataset.act);
        const finishing = order && order.status === 'Dicuci';
        if (finishing && !confirm('Yakin cucian ini sudah selesai?')) return;
        btn.disabled = true;
        try {
            const r = await api(`/washer/tasks/${btn.dataset.act}/advance`, { method: 'POST' });
            toast(r.message);
            await load();
        } catch (ex) { toast(ex.message, true); btn.disabled = false; }
    });

    document.addEventListener('visibilitychange', () => { if (!document.hidden && token) load(); });

    if (token) start(); else show(false);
})();
