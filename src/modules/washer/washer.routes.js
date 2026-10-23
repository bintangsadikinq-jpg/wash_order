// Endpoint untuk washer - hanya melihat pesanan miliknya, tanpa info harga
const express = require('express');
const { all, get } = require('../../db');
const { requireWasher } = require('../../auth');
const orders = require('../orders/orders.service');
const { httpError } = orders;
const router = express.Router();
router.use(requireWasher);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

async function withItems(rows) {
    for (const o of rows)
        o.items = await all('SELECT service_name, type, qty FROM order_items WHERE order_id = ? ORDER BY id', [o.id]);
    return rows;
}
const FIELDS = 'o.id, o.code, o.client_name, o.client_phone, o.client_address, o.delivery_type, o.notes, o.status, o.created_at, o.updated_at';

router.get('/tasks', wrap(async (req, res) => {
    const active = await withItems(await all(
        `SELECT ${FIELDS} FROM orders o WHERE o.washer_id = ? AND o.status IN ('Ditugaskan','Dicuci') ORDER BY o.status DESC, o.id`, [req.user.id]));
    const done = await withItems(await all(
        `SELECT ${FIELDS} FROM orders o WHERE o.washer_id = ? AND o.status IN ('Siap','Selesai') ORDER BY o.updated_at DESC LIMIT 15`, [req.user.id]));
    const stat = await get(`SELECT
        SUM(CASE WHEN status IN ('Siap','Selesai') AND date(updated_at) = date('now','+7 hours') THEN 1 ELSE 0 END) AS done_today,
        SUM(CASE WHEN status IN ('Siap','Selesai') THEN 1 ELSE 0 END) AS done_total
        FROM orders WHERE washer_id = ?`, [req.user.id]);
    res.json({ active, done, stats: { done_today: stat.done_today || 0, done_total: stat.done_total || 0 } });
}));

const NEXT = { Ditugaskan: 'Dicuci', Dicuci: 'Siap' };
router.post('/tasks/:id/advance', wrap(async (req, res) => {
    const o = await get('SELECT * FROM orders WHERE id = ? AND washer_id = ?', [req.params.id, req.user.id]);
    if (!o) throw httpError(404, 'Tugas tidak ditemukan.');
    const next = NEXT[o.status];
    if (!next) throw httpError(400, 'Tugas ini sudah tidak bisa diubah.');
    await orders.setStatus(o.id, next, req.user.name, next === 'Dicuci' ? 'Mulai dicuci' : 'Cucian selesai & siap');
    res.json({ message: next === 'Dicuci' ? 'Pencucian dimulai' : 'Cucian ditandai selesai', status: next });
}));

module.exports = router;
