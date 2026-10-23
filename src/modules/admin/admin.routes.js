// Semua endpoint admin (pesanan, layanan, washer) - wajib login admin
const express = require('express');
const { run, get, all, hashPassword } = require('../../db');
const { requireAdmin } = require('../../auth');
const orders = require('../orders/orders.service');
const { httpError } = orders;
const router = express.Router();
router.use(requireAdmin);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const int = (v) => Math.round(Number(v));

/* ---------- Dashboard ---------- */
router.get('/dashboard', wrap(async (req, res) => {
    const byStatus = await all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
    const counts = Object.fromEntries(orders.STATUSES.map(s => [s, 0]));
    byStatus.forEach(r => { counts[r.status] = r.n; });

    const sum = (type, where) => get(`SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type = ? AND ${where}`, [type]);
    const today = "date(created_at) = date('now','+7 hours')";
    const month = "strftime('%Y-%m', created_at) = strftime('%Y-%m','now','+7 hours')";
    const [inToday, outToday, inMonth, outMonth] = await Promise.all([sum('in', today), sum('out', today), sum('in', month), sum('out', month)]);

    const receivable = await get("SELECT COALESCE(SUM(total - paid),0) AS v FROM orders WHERE status != 'Dibatalkan' AND total > paid");
    const series = await all(`
        WITH RECURSIVE d(day) AS (SELECT date('now','+7 hours','-6 days') UNION ALL SELECT date(day,'+1 day') FROM d WHERE day < date('now','+7 hours'))
        SELECT day,
            COALESCE((SELECT SUM(amount) FROM transactions WHERE type='in' AND date(created_at)=day),0) AS income,
            COALESCE((SELECT SUM(amount) FROM transactions WHERE type='out' AND date(created_at)=day),0) AS expense
        FROM d`);
    const recent = await all(`${orders.ORDER_SELECT} ORDER BY o.id DESC LIMIT 8`);
    const busy = await all(`SELECT w.id, w.name, COUNT(o.id) AS active_jobs FROM workers w
        LEFT JOIN orders o ON o.washer_id = w.id AND o.status IN ('Ditugaskan','Dicuci')
        WHERE w.active = 1 GROUP BY w.id ORDER BY active_jobs DESC, w.name`);
    res.json({
        counts, receivable: receivable.v,
        today: { income: inToday.v, expense: outToday.v }, month: { income: inMonth.v, expense: outMonth.v },
        series, recent, workers: busy
    });
}));

/* ---------- Pesanan ---------- */
router.get('/orders', wrap(async (req, res) => {
    const { status, q, payment } = req.query;
    const where = [], params = [];
    if (status) { where.push('o.status = ?'); params.push(status); }
    if (q) { where.push('(o.code LIKE ? OR o.client_name LIKE ? OR o.client_phone LIKE ?)'); params.push(...Array(3).fill(`%${q}%`)); }
    if (payment === 'unpaid') where.push("o.total > o.paid AND o.status != 'Dibatalkan'");
    if (payment === 'paid') where.push('o.total <= o.paid');
    const sql = `${orders.ORDER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 300`;
    res.json({ data: await all(sql, params) });
}));

router.post('/orders', wrap(async (req, res) => {
    const r = await orders.createOrder(req.body);
    await orders.logStatus(r.id, 'Menunggu', req.user.name, 'Dibuat oleh admin');
    res.json({ message: 'Pesanan dibuat', id: r.id, code: r.code });
}));

router.get('/orders/:id', wrap(async (req, res) => {
    const o = await orders.getOrderFull('o.id = ?', [req.params.id]);
    if (!o) throw httpError(404, 'Pesanan tidak ditemukan.');
    res.json({ data: o });
}));

const isFinal = (s) => s === 'Selesai' || s === 'Dibatalkan';
async function mustOpen(id) {
    const o = await get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!o) throw httpError(404, 'Pesanan tidak ditemukan.');
    return o;
}

router.post('/orders/:id/assign', wrap(async (req, res) => {
    const o = await mustOpen(req.params.id);
    if (o.status !== 'Menunggu' && o.status !== 'Ditugaskan') throw httpError(400, 'Washer hanya bisa diatur sebelum pencucian dimulai.');
    const w = await get('SELECT * FROM workers WHERE id = ? AND active = 1', [req.body.washer_id]);
    if (!w) throw httpError(400, 'Washer tidak ditemukan / tidak aktif.');
    await orders.setStatus(o.id, 'Ditugaskan', req.user.name, `Ditugaskan ke ${w.name}`, { washer_id: w.id });
    res.json({ message: `Pesanan ditugaskan ke ${w.name}` });
}));

const NEXT = { Ditugaskan: 'Dicuci', Dicuci: 'Siap', Siap: 'Selesai' };
router.post('/orders/:id/status', wrap(async (req, res) => {
    const o = await mustOpen(req.params.id);
    const target = req.body.status;
    if (isFinal(o.status)) throw httpError(400, 'Pesanan sudah ditutup.');
    if (target === 'Dibatalkan') {
        await orders.setStatus(o.id, 'Dibatalkan', req.user.name, req.body.note || 'Dibatalkan admin');
        if (o.paid > 0) {
            await run("INSERT INTO transactions (type, category, amount, description, order_id) VALUES ('out','Refund',?,?,?)",
                [o.paid, `Refund pesanan ${o.code}`, o.id]);
            await run('UPDATE orders SET paid = 0 WHERE id = ?', [o.id]);
        }
    } else if (NEXT[o.status] === target) {
        await orders.setStatus(o.id, target, req.user.name, req.body.note);
    } else throw httpError(400, `Status tidak bisa diubah dari ${o.status} ke ${target}.`);
    res.json({ message: 'Status diperbarui' });
}));

router.put('/orders/:id/items', wrap(async (req, res) => {
    const o = await mustOpen(req.params.id);
    if (isFinal(o.status)) throw httpError(400, 'Pesanan sudah ditutup.');
    const old = await all('SELECT service_id, unit_price FROM order_items WHERE order_id = ?', [o.id]);
    const keep = Object.fromEntries(old.map(r => [r.service_id, r.unit_price]));
    const rows = await orders.buildItems(req.body.items, keep);
    const total = await orders.saveItems(o.id, rows);
    await orders.logStatus(o.id, o.status, req.user.name, `Rincian diperbarui, total Rp ${total.toLocaleString('id-ID')}`);
    res.json({ message: 'Rincian pesanan diperbarui', total });
}));

router.post('/orders/:id/pay', wrap(async (req, res) => {
    const o = await mustOpen(req.params.id);
    if (o.status === 'Dibatalkan') throw httpError(400, 'Pesanan dibatalkan.');
    const amount = int(req.body.amount);
    if (!(amount > 0)) throw httpError(400, 'Nominal tidak valid.');
    if (amount > o.total - o.paid) throw httpError(400, 'Nominal melebihi sisa tagihan.');
    const method = ['Tunai', 'Transfer', 'QRIS'].includes(req.body.method) ? req.body.method : 'Tunai';
    await run("INSERT INTO transactions (type, category, amount, method, description, order_id) VALUES ('in','Pembayaran Order',?,?,?,?)",
        [amount, method, `Pembayaran ${o.code} - ${o.client_name}`, o.id]);
    await run("UPDATE orders SET paid = paid + ?, updated_at = datetime('now','+7 hours') WHERE id = ?", [amount, o.id]);
    await orders.logStatus(o.id, o.status, req.user.name, `Pembayaran Rp ${amount.toLocaleString('id-ID')} (${method})`);
    res.json({ message: 'Pembayaran dicatat' });
}));

/* ---------- Keuangan ---------- */
router.get('/finance/transactions', wrap(async (req, res) => {
    const { type, from, to, q } = req.query;
    const where = [], params = [];
    if (type === 'in' || type === 'out') { where.push('t.type = ?'); params.push(type); }
    if (from) { where.push('date(t.created_at) >= date(?)'); params.push(from); }
    if (to) { where.push('date(t.created_at) <= date(?)'); params.push(to); }
    if (q) { where.push('(t.description LIKE ? OR t.category LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await all(`SELECT t.*, o.code AS order_code FROM transactions t LEFT JOIN orders o ON o.id = t.order_id ${w} ORDER BY t.id DESC LIMIT 500`, params);
    const totals = await get(`SELECT COALESCE(SUM(CASE WHEN type='in' THEN amount END),0) AS income,
        COALESCE(SUM(CASE WHEN type='out' THEN amount END),0) AS expense FROM transactions t ${w}`, params);
    const categories = await all(`SELECT type, category, SUM(amount) AS total FROM transactions t ${w} GROUP BY type, category ORDER BY total DESC`, params);
    res.json({ data: rows, totals, categories });
}));

router.post('/finance/transactions', wrap(async (req, res) => {
    const type = req.body.type === 'in' ? 'in' : 'out';
    const amount = int(req.body.amount);
    const category = String(req.body.category || '').trim();
    if (!(amount > 0)) throw httpError(400, 'Nominal tidak valid.');
    if (!category) throw httpError(400, 'Kategori wajib diisi.');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date + ' ' + new Date(Date.now() + 7 * 3600e3).toISOString().slice(11, 19) : null;
    await run(`INSERT INTO transactions (type, category, amount, method, description, created_at) VALUES (?,?,?,?,?,COALESCE(?, datetime('now','+7 hours')))`,
        [type, category, amount, req.body.method || null, String(req.body.description || '').trim(), date]);
    res.json({ message: 'Transaksi dicatat' });
}));

router.delete('/finance/transactions/:id', wrap(async (req, res) => {
    const t = await get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!t) throw httpError(404, 'Transaksi tidak ditemukan.');
    if (t.order_id) throw httpError(400, 'Transaksi dari pesanan tidak bisa dihapus.');
    await run('DELETE FROM transactions WHERE id = ?', [t.id]);
    res.json({ message: 'Transaksi dihapus' });
}));

/* ---------- Layanan ---------- */
router.get('/services', wrap(async (req, res) => res.json({ data: await all('SELECT * FROM services ORDER BY active DESC, type, price') })));

function serviceFields(b) {
    const name = String(b.name || '').trim();
    const price = int(b.price);
    if (!name) throw httpError(400, 'Nama layanan wajib diisi.');
    if (!(price > 0)) throw httpError(400, 'Harga tidak valid.');
    return [name, b.type === 'satuan' ? 'satuan' : 'kg', price];
}
router.post('/services', wrap(async (req, res) => {
    await run('INSERT INTO services (name, type, price) VALUES (?,?,?)', serviceFields(req.body));
    res.json({ message: 'Layanan ditambahkan' });
}));
router.put('/services/:id', wrap(async (req, res) => {
    await run('UPDATE services SET name = ?, type = ?, price = ?, active = ? WHERE id = ?',
        [...serviceFields(req.body), req.body.active === 0 || req.body.active === false ? 0 : 1, req.params.id]);
    res.json({ message: 'Layanan diperbarui' });
}));

/* ---------- Washer ---------- */
router.get('/workers', wrap(async (req, res) => {
    res.json({ data: await all(`SELECT w.id, w.name, w.phone, w.username, w.active, w.created_at,
        (SELECT COUNT(*) FROM orders o WHERE o.washer_id = w.id AND o.status IN ('Ditugaskan','Dicuci')) AS active_jobs,
        (SELECT COUNT(*) FROM orders o WHERE o.washer_id = w.id AND o.status IN ('Siap','Selesai')) AS done_jobs
        FROM workers w ORDER BY w.active DESC, w.name`) });
}));

async function workerBody(b, id) {
    const name = String(b.name || '').trim();
    const username = String(b.username || '').trim().toLowerCase();
    if (!name) throw httpError(400, 'Nama wajib diisi.');
    if (!/^[a-z0-9._-]{3,}$/.test(username)) throw httpError(400, 'Username minimal 3 karakter (huruf kecil/angka).');
    const dup = await get('SELECT id FROM workers WHERE username = ? AND id != ?', [username, id || 0]);
    if (dup) throw httpError(400, 'Username sudah dipakai.');
    return { name, username, phone: String(b.phone || '').trim() };
}
router.post('/workers', wrap(async (req, res) => {
    const w = await workerBody(req.body);
    if (String(req.body.password || '').length < 6) throw httpError(400, 'Password minimal 6 karakter.');
    await run('INSERT INTO workers (name, phone, username, password_hash) VALUES (?,?,?,?)', [w.name, w.phone, w.username, hashPassword(req.body.password)]);
    res.json({ message: 'Washer ditambahkan' });
}));
router.put('/workers/:id', wrap(async (req, res) => {
    const w = await workerBody(req.body, Number(req.params.id));
    const active = req.body.active === 0 || req.body.active === false ? 0 : 1;
    await run('UPDATE workers SET name = ?, phone = ?, username = ?, active = ? WHERE id = ?', [w.name, w.phone, w.username, active, req.params.id]);
    if (req.body.password) {
        if (String(req.body.password).length < 6) throw httpError(400, 'Password minimal 6 karakter.');
        await run('UPDATE workers SET password_hash = ? WHERE id = ?', [hashPassword(req.body.password), req.params.id]);
    }
    if (!active) await run("DELETE FROM sessions WHERE role = 'washer' AND user_id = ?", [req.params.id]);
    res.json({ message: 'Washer diperbarui' });
}));

module.exports = router;
