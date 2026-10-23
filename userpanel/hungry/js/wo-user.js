/* Wash Order - helper bersama halaman pemesan (tanpa login) */
(function (w) {
    var KEY_ME = 'wo_user_profile', KEY_ORDERS = 'wo_user_orders';
    function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    var STEPS = [['Menunggu', 'Diterima', 'fa-inbox'], ['Ditugaskan', 'Ditugaskan', 'fa-user'], ['Dicuci', 'Dicuci', 'fa-tint'], ['Siap', 'Siap', 'fa-check'], ['Selesai', 'Selesai', 'fa-flag']];

    var WU = {
        me: function () { return load(KEY_ME, {}); },
        saveMe: function (p) { save(KEY_ME, p); },
        myOrders: function () { return load(KEY_ORDERS, []); },
        rememberOrder: function (code) {
            var l = WU.myOrders().filter(function (c) { return c !== code; }); l.unshift(code); save(KEY_ORDERS, l.slice(0, 20));
        },
        api: function (path, opts) {
            opts = opts || {};
            return fetch('/api' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined })
                .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan'); return j; }); });
        },
        esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
        svcImg: function (name) {
            var n = String(name).toLowerCase(), f = null;
            if (n.indexOf('safety') > -1) f = 'safety';
            else if (n.indexOf('sepatu') > -1) f = 'sepatu';
            else if (n.indexOf('tas') > -1) f = 'tas';
            else if (n.indexOf('steam') > -1) f = 'steam';
            else if (n.indexOf('lipat') > -1) f = 'lipat';
            else if (n.indexOf('basah') > -1) f = 'basah';
            else if (n.indexOf('kering') > -1) f = 'kering';
            return f ? 'img/service/' + f + '.png' : 'img/chibi/default.svg';
        },
        rp: function (n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); },
        date: function (s) { var d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); },
        label: function (s) { return { Menunggu: 'Menunggu konfirmasi', Ditugaskan: 'Akan segera dicuci', Dicuci: 'Sedang dicuci', Siap: 'Siap diambil / diantar', Selesai: 'Selesai', Dibatalkan: 'Dibatalkan' }[s] || s; },
        badge: function (s) { return '<span class="wo-badge s-' + s + '">' + WU.label(s) + '</span>'; },
        progress: function (status) {
            if (status === 'Dibatalkan') return '';
            var idx = STEPS.map(function (s) { return s[0]; }).indexOf(status);
            return '<div class="wo-progress">' + STEPS.map(function (s, i) {
                return '<div class="st' + (i <= idx ? ' on' : '') + (i === idx ? ' now' : '') + '"><div class="dot"><i class="fa ' + s[2] + '"></i></div>' + s[1] + '</div>';
            }).join('') + '</div>';
        },
        toast: function (m) {
            var t = document.createElement('div'); t.className = 'wo-toast'; t.textContent = m; document.body.appendChild(t);
            setTimeout(function () { t.remove(); }, 2600);
        },
        /* Header + side nav (dipasang sebelum main.js menginisialisasi sideNav) */
        shell: function () {
            var me = WU.me();
            document.getElementById('wo-shell').innerHTML =
                '<div class="navbar-top"><div class="side-nav-panel-left"><a href="#" data-activates="slide-out-left" class="side-nav-left"><i class="fa fa-bars"></i></a></div>' +
                '<a href="/login" class="wo-staff" title="Login Staf"><i class="fa fa-lock"></i><span>Login <span class="lbl">Staf</span></span></a>' +
                '<div class="site-brand"><a href="index.html"><h1>Wash<span>Order</span></h1></a></div>' +
                '<div class="side-nav-panel-right"><a href="track.html" class="side-nav-right"><i class="fa fa-search"></i></a></div></div>' +
                '<div class="side-nav-panel-left"><ul id="slide-out-left" class="side-nav side-nav-panel collapsible">' +
                '<li class="profil"><img src="img/profile.jpg" alt=""><h2>' + (me.name ? 'Halo, ' + WU.esc(me.name) : 'Selamat datang') + '</h2></li>' +
                '<li class="li-top"><a href="index.html"><i class="fa fa-home"></i>Beranda</a></li>' +
                '<li><a href="order.html"><i class="fa fa-shopping-basket"></i>Pesan Cuci</a></li>' +
                '<li><a href="track.html"><i class="fa fa-search"></i>Lacak Pesanan</a></li>' +
                '<li><a href="index.html#harga"><i class="fa fa-tags"></i>Daftar Harga</a></li></ul></div>';
        }
    };
    w.WU = WU;
})(window);
