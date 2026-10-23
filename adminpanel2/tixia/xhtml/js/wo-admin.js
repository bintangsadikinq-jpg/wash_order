/* Wash Order - helper, layout, dan router tanpa-reload untuk panel admin (template Tixia).
   Sidebar & header dimuat sekali; pindah menu hanya mengganti area isi (tanpa kedip). */
(function (w) {
    var KEY = 'wo_admin_token';
    var token = null;
    try { token = localStorage.getItem(KEY); } catch (e) {}

    var STATUS_CLASS = { Menunggu: 'warning', Ditugaskan: 'info', Dicuci: 'primary', Siap: 'success', Selesai: 'dark', Dibatalkan: 'danger' };

    var MENU = [
        { href: 'dashboard.html', icon: 'flaticon-381-networking', label: 'Dashboard' },
        { href: 'orders.html', icon: 'flaticon-381-notepad', label: 'Pesanan' },
        { href: 'finance.html', icon: 'flaticon-381-calculator', label: 'Kas Masuk / Keluar' },
        { href: 'workers.html', icon: 'flaticon-381-user-9', label: 'Washer (Pekerja)' },
        { href: 'services.html', icon: 'flaticon-381-price-tag', label: 'Layanan & Harga' }
    ];

    // Data yang dimuat lebih dulu saat pindah menu, supaya halaman langsung terisi (persis sama dengan request yang dibuat halamannya)
    var PREFETCH = {
        'dashboard.html': ['/admin/dashboard'],
        'orders.html': ['/admin/orders?status=&payment=&q=', '/admin/services', '/admin/workers'],
        'finance.html': ['/admin/finance/transactions?type=&from=&to=&q='],
        'workers.html': ['/admin/workers'],
        'services.html': ['/admin/services']
    };

    var DROP = '<svg viewBox="0 0 40 40" width="40" height="40"><path d="M20 4 C20 4 7 18 7 26 a13 13 0 0 0 26 0 C33 18 20 4 20 4Z" fill="#fff"/><path d="M14 27 a6 6 0 0 0 6 6" stroke="#6418c3" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';

    /* ---- pelacakan efek samping halaman (interval & listener document) agar bersih saat pindah ---- */
    var nav = 0, tracking = false, intervals = [], docListeners = [];
    var _setInterval = w.setInterval.bind(w);
    w.setInterval = function () { var id = _setInterval.apply(null, arguments); if (tracking) intervals.push(id); return id; };
    var _docAdd = document.addEventListener.bind(document);
    document.addEventListener = function (type, fn, opt) { if (tracking) docListeners.push([type, fn, opt]); return _docAdd(type, fn, opt); };
    function cleanupPage() {
        intervals.forEach(clearInterval); intervals = [];
        docListeners.forEach(function (l) { document.removeEventListener(l[0], l[1], l[2]); }); docListeners = [];
    }

    var prefetched = {};
    function rawGet(path) {
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        return fetch('/api' + path, { headers: headers }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (json) {
                if (res.status === 401) { try { localStorage.removeItem(KEY); } catch (e) {} location.href = '/login'; }
                if (!res.ok) throw new Error(json.error || 'Terjadi kesalahan');
                return json;
            });
        });
    }

    var WO = {
        token: function () { return token; },
        setToken: function (t) { token = t; try { localStorage.setItem(KEY, t); } catch (e) {} },
        logout: function () {
            var t = token;
            token = null; try { localStorage.removeItem(KEY); } catch (e) {}
            var done = function () { location.href = '/login'; };
            if (!t) return done();
            fetch('/api/auth/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).then(done, done);
        },

        api: function (path, opts) {
            opts = opts || {};
            var method = opts.method || 'GET', myNav = nav, p;
            var pre = method === 'GET' && prefetched[path];
            if (pre && Date.now() - pre.t < 15000) { delete prefetched[path]; p = pre.p; }
            else {
                var headers = { 'Content-Type': 'application/json' };
                if (token) headers.Authorization = 'Bearer ' + token;
                p = fetch('/api' + path, { method: method, headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
                    .then(function (res) {
                        return res.json().catch(function () { return {}; }).then(function (json) {
                            if (res.status === 401 && token && path.indexOf('/auth/') !== 0) {
                                try { localStorage.removeItem(KEY); } catch (e) {}
                                location.href = '/login';
                            }
                            if (!res.ok) throw new Error(json.error || 'Terjadi kesalahan');
                            return json;
                        });
                    });
            }
            // hasil untuk halaman yang sudah ditinggalkan diabaikan (tidak merender ke DOM yang sudah diganti)
            return p.then(function (r) { return myNav === nav ? r : new Promise(function () {}); },
                function (e) { return myNav === nav ? Promise.reject(e) : new Promise(function () {}); });
        },

        esc: function (s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
        },
        rp: function (n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); },
        date: function (s) {
            var d = new Date(String(s).replace(' ', 'T'));
            return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        },
        qty: function (i) { return i.qty + (i.type === 'kg' ? ' kg' : ' pcs'); },
        badge: function (status) { return '<span class="badge light badge-' + (STATUS_CLASS[status] || 'secondary') + '">' + WO.esc(status) + '</span>'; },
        payBadge: function (o) {
            if (o.status === 'Dibatalkan') return '<span class="badge light badge-secondary">-</span>';
            if (o.paid >= o.total) return '<span class="badge light badge-success">Lunas</span>';
            if (o.paid > 0) return '<span class="badge light badge-warning">Kurang ' + WO.rp(o.total - o.paid) + '</span>';
            return '<span class="badge light badge-danger">Belum bayar</span>';
        },

        toast: function (msg, bad) {
            var el = document.createElement('div');
            el.className = 'wo-toast ' + (bad ? 'bad' : 'ok');
            el.textContent = msg;
            document.body.appendChild(el);
            setTimeout(function () { el.classList.add('show'); }, 10);
            setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); }, 3000);
        },
        fail: function (e) { WO.toast(e.message || String(e), true); },

        /* Menulis kerangka halaman: header, sidebar, pembuka konten (hanya saat muat pertama) */
        begin: function (cfg) {
            if (!token) { location.href = '/login'; return; }
            var menu = MENU.map(function (m) {
                return '<li><a class="ai-icon" href="' + m.href + '" aria-expanded="false"><i class="' + m.icon + '"></i><span class="nav-text">' + m.label + '</span></a></li>';
            }).join('');
            document.write(
                '<div id="main-wrapper">' +
                '<div class="nav-header"><a href="dashboard.html" class="brand-logo"><span class="logo-abbr">' + DROP + '</span>' +
                '<span class="brand-title wo-brand">Wash<b>Order</b></span></a>' +
                '<div class="nav-control"><div class="hamburger"><span class="line"></span><span class="line"></span><span class="line"></span></div></div></div>' +
                '<div class="header"><div class="header-content"><nav class="navbar navbar-expand"><div class="collapse navbar-collapse justify-content-between">' +
                '<div class="header-left"><div class="dashboard_bar">' + cfg.title + '</div></div>' +
                '<ul class="navbar-nav header-right">' +
                '<li class="nav-item"><a class="btn btn-outline-primary btn-sm btn-rounded mr-3 d-none d-sm-inline-block" href="/user/" target="_blank"><i class="fa fa-external-link mr-1"></i> Halaman Pemesan</a></li>' +
                '<li class="nav-item dropdown header-profile"><a class="nav-link" href="#" role="button" data-toggle="dropdown">' +
                '<div class="wo-avatar"><i class="fa fa-user"></i></div><div class="header-info"><span id="wo-admin-name">Administrator</span><small>Admin</small></div></a>' +
                '<div class="dropdown-menu dropdown-menu-right"><a href="javascript:void(0);" id="wo-logout" class="dropdown-item ai-icon">' +
                '<svg xmlns="http://www.w3.org/2000/svg" class="text-danger" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
                '<span class="ml-2">Keluar</span></a></div></li></ul></div></nav></div></div>' +
                '<div class="deznav"><div class="deznav-scroll"><ul class="metismenu" id="menu">' + menu + '</ul>' +
                '<div class="copyright"><p><strong>Wash Order</strong> Admin Panel</p></div></div></div>' +
                '<div class="content-body"><div class="container-fluid" id="wo-view">' + topRow(cfg)
            );
        },

        /* Menutup kerangka halaman dan memuat script template (hanya saat muat pertama) */
        end: function () {
            document.write('</div></div>' +
                '<div class="footer"><div class="copyright"><p>Wash Order &copy; ' + new Date().getFullYear() + '</p></div></div></div>' +
                '<script src="./vendor/global/global.min.js"><\/script>' +
                '<script>jQuery.fn.selectpicker = jQuery.fn.datetimepicker = function () { return this; };<\/script>' + // plugin tidak dipakai; select tetap native
                '<script src="./js/custom.min.js"><\/script>' +
                '<script src="./js/deznav-init.js"><\/script>');
        },

        /* Jalankan kode halaman setelah DOM & script template siap */
        ready: function (fn) {
            var run = function () { tracking = true; try { fn(); } finally { tracking = false; } };
            if (document.readyState === 'complete') setTimeout(run, 0);
            else window.addEventListener('load', run);
        },

        /* Pindah halaman tanpa reload */
        go: function (href, opts) { return navigate(href, opts); }
    };

    function topRow(cfg) {
        return cfg.actions ? '<div class="d-flex justify-content-between align-items-center flex-wrap mb-4"><div>' +
            (cfg.subtitle ? '<span class="text-muted">' + cfg.subtitle + '</span>' : '') + '</div><div class="mt-2 mt-sm-0">' + cfg.actions + '</div></div>' : '';
    }

    /* ---------------- Router ---------------- */
    var loadedSrc = {};
    function pageName(href) { return String(href).split('#')[0].split('?')[0].split('/').pop(); }

    function parsePage(html) {
        var b = html.match(/<script>\s*WO\.begin\(([\s\S]*?)\);\s*<\/script>/);
        var endTag = '<script>WO.end();</script>', e = html.indexOf(endTag);
        if (!b || e < 0) return null;
        var cfg = (new Function('return (' + b[1] + ')'))();
        var body = html.slice(b.index + b[0].length, e);
        var scripts = [], re = /<script([^>]*)>([\s\S]*?)<\/script>/g, m, rest = html.slice(e + endTag.length);
        while ((m = re.exec(rest))) {
            var src = (m[1].match(/src="([^"]+)"/) || [])[1];
            scripts.push({ src: src, code: m[2] });
        }
        var title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
        return { cfg: cfg, body: body, scripts: scripts, title: title };
    }

    function loadScript(s) {
        return new Promise(function (resolve, reject) {
            var el = document.createElement('script');
            if (s.src) {
                if (loadedSrc[s.src]) return resolve();
                el.src = s.src; el.onload = function () { loadedSrc[s.src] = 1; resolve(); }; el.onerror = reject;
                document.head.appendChild(el);
            } else {
                el.textContent = s.code; document.head.appendChild(el); el.remove(); resolve();
            }
        });
    }

    function setActive(page) {
        [].forEach.call(document.querySelectorAll('#menu li'), function (li) {
            var a = li.querySelector('a');
            li.classList.toggle('mm-active', !!a && pageName(a.getAttribute('href')) === page);
        });
    }

    function closeOverlays() {
        if (window.jQuery) { window.jQuery('.modal').modal('hide'); }
        [].forEach.call(document.querySelectorAll('.modal-backdrop'), function (b) { b.remove(); });
        document.body.classList.remove('modal-open'); document.body.style.paddingRight = '';
    }

    var navBusy = 0;
    function navigate(href, opts) {
        opts = opts || {};
        var page = pageName(href), my = ++navBusy;
        if (!/\.html$/.test(page) || page === 'login.html' || !document.getElementById('wo-view')) { location.href = href; return Promise.resolve(); }

        var pre = {};
        (PREFETCH[page] || []).forEach(function (p) { pre[p] = { t: Date.now(), p: rawGet(p) }; pre[p].p.catch(function () {}); });

        return fetch(href.split('#')[0], { headers: { 'X-Requested-With': 'wo-router' } })
            .then(function (r) { if (!r.ok) throw new Error('page'); return r.text(); })
            .then(function (html) {
                var pg = parsePage(html);
                if (!pg) throw new Error('parse');
                // tunggu data awal siap (maks 1.5 dtk) supaya halaman langsung terisi saat tampil
                var wait = Promise.all(Object.keys(pre).map(function (k) { return pre[k].p.catch(function () {}); }));
                var timeout = new Promise(function (r) { setTimeout(r, 1500); });
                return Promise.race([wait, timeout]).then(function () { return pg; });
            })
            .then(function (pg) {
                if (my !== navBusy) return;               // ada navigasi yang lebih baru
                nav++; cleanupPage(); closeOverlays();
                Object.keys(pre).forEach(function (k) { prefetched[k] = pre[k]; });

                var view = document.getElementById('wo-view');
                view.style.transition = 'none'; view.style.opacity = .3;
                view.innerHTML = topRow(pg.cfg) + pg.body;
                var bar = document.querySelector('.dashboard_bar'); if (bar) bar.innerHTML = pg.cfg.title;
                if (pg.title) document.title = pg.title.trim();
                if (!opts.pop) history.pushState({ wo: 1 }, '', href);
                setActive(page);
                window.scrollTo(0, 0);
                var sc = document.querySelector('.content-body'); if (sc) sc.scrollTop = 0;

                return pg.scripts.reduce(function (p, s) { return p.then(function () { return loadScript(s); }); }, Promise.resolve())
                    .then(function () {
                        requestAnimationFrame(function () { view.style.transition = 'opacity .18s ease'; view.style.opacity = 1; });
                    });
            })
            .catch(function () { if (my === navBusy) location.href = href; });
    }

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a || a.target === '_blank') return;
        var href = a.getAttribute('href');
        if (!href || /^(#|javascript:|mailto:|tel:|https?:|\/)/.test(href) || !/\.html(\?|#|$)/.test(href)) return;
        e.preventDefault();
        navigate(href);
    });
    window.addEventListener('popstate', function () { navigate(location.pathname.split('/').pop() + location.search, { pop: true }); });

    // inisialisasi sekali saat muat pertama
    window.addEventListener('load', function () {
        [].forEach.call(document.querySelectorAll('script[src]'), function (s) { loadedSrc[s.getAttribute('src')] = 1; });
        var b = document.getElementById('wo-logout');
        if (b) b.addEventListener('click', function (e) { e.preventDefault(); WO.logout(); });
        if (document.getElementById('wo-view')) {
            history.replaceState({ wo: 1 }, '', location.href);
            WO.api('/auth/admin/me').then(function (r) {
                var n = document.getElementById('wo-admin-name'); if (n) n.textContent = r.user.name;
            }).catch(function () {});
        }
    });

    var css = document.createElement('style');
    css.textContent =
        '.wo-toast{position:fixed;right:20px;top:20px;z-index:99999;padding:12px 20px;border-radius:8px;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:0;transform:translateY(-10px);transition:all .25s;max-width:340px}' +
        '.wo-toast.show{opacity:1;transform:none}.wo-toast.ok{background:#2bc155}.wo-toast.bad{background:#f72b50}' +
        '.wo-empty{text-align:center;color:#999;padding:30px 10px}.table tbody tr.clickable{cursor:pointer}' +
        '.wo-code{font-weight:700;letter-spacing:.5px}' +
        '.wo-brand{color:#fff;font-size:22px;font-weight:600;margin-left:10px;vertical-align:middle}.wo-brand b{color:#d7b5ff}' +
        '.nav-header .brand-logo{display:flex;align-items:center}.nav-header .logo-abbr{display:inline-block;width:40px;height:40px;flex:none}' +
        '.wo-avatar{width:46px;height:46px;border-radius:50%;background:#6418c3;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;float:left;margin-right:12px}' +
        '.wo-log{list-style:none;margin:0;padding:0 0 0 14px;border-left:2px solid #e6e6e6}.wo-log li{position:relative;padding:0 0 12px 14px}' +
        '.wo-log li:before{content:"";position:absolute;left:-21px;top:5px;width:10px;height:10px;border-radius:50%;background:#6418c3}' +
        '.table td,.table th{vertical-align:middle}.modal-backdrop{z-index:1040}.modal{z-index:1050}';
    document.head.appendChild(css);

    w.WO = WO;
})(window);
