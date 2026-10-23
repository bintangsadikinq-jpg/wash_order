const express = require('express');
const cors = require('cors');
const path = require('path');
const store = require('./db');

const app = express();
const ROOT = path.join(__dirname, '..');

app.use(cors());
app.use(express.json());

// API
app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/orders', require('./modules/orders/orders.routes'));      // publik (pemesan)
app.use('/api/admin', require('./modules/admin/admin.routes'));         // administrator
app.use('/api/washer', require('./modules/washer/washer.routes'));      // pekerja
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// Tampilan
const adminDir = path.join(ROOT, 'adminpanel2', 'tixia', 'xhtml');
app.get(['/admin', '/admin/'], (req, res) => res.redirect('/admin/dashboard.html'));
app.use('/admin', express.static(adminDir));
app.use('/user', express.static(path.join(ROOT, 'userpanel', 'hungry')));
app.use('/washer', express.static(path.join(ROOT, 'washerpanel')));
app.use('/login', express.static(path.join(ROOT, 'login')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(ROOT, 'userpanel', 'hungry', 'img', 'favicon.png')));
app.get('/', (req, res) => res.redirect('/user/'));

// Error handler
app.use((err, req, res, next) => {
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Terjadi kesalahan pada server.' });
});

const PORT = process.env.PORT || 3000;
store.init().then(() => {
    app.listen(PORT, () => {
        console.log(`Wash Order berjalan di http://localhost:${PORT}`);
        console.log(`  Pemesan : http://localhost:${PORT}/user/`);
        console.log(`  Washer  : http://localhost:${PORT}/washer/`);
        console.log(`  Admin   : http://localhost:${PORT}/admin/login.html`);
    });
}).catch(e => { console.error(e); process.exit(1); });
