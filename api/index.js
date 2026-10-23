// Pintu masuk Vercel: seluruh /api/* ditangani aplikasi Express yang sama dengan versi lokal
const app = require('../src/server');
const store = require('../src/db');

module.exports = async (req, res) => {
    try { await store.init(); } catch (e) { console.error(e); return res.status(500).json({ error: 'Database tidak dapat dihubungi.' }); }
    return app(req, res);
};
