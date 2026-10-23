// Endpoint publik untuk pemesan (userpanel) - tanpa password
const express = require('express');
const { all } = require('../../db');
const svc = require('./orders.service');
const router = express.Router();

// Data yang boleh dilihat pemesan (tanpa info internal)
const publicView = (o) => ({
    code: o.code, client_name: o.client_name, client_phone: o.client_phone, client_address: o.client_address,
    delivery_type: o.delivery_type, notes: o.notes, status: o.status, total: o.total, paid: o.paid,
    washer_name: o.washer_name, created_at: o.created_at, updated_at: o.updated_at,
    items: o.items, logs: o.logs.map(l => ({ status: l.status, note: l.note, created_at: l.created_at }))
});

router.get('/services', async (req, res, next) => {
    try { res.json({ data: await all('SELECT id, name, type, price FROM services WHERE active = 1 ORDER BY type, price') }); }
    catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
    try { const r = await svc.createOrder(req.body); res.json({ message: 'Pesanan berhasil dibuat', code: r.code }); }
    catch (e) { next(e); }
});

router.get('/track/:code', async (req, res, next) => {
    try {
        const o = await svc.getOrderFull('o.code = ?', [String(req.params.code).trim().toUpperCase()]);
        if (!o) return res.status(404).json({ error: 'Kode pesanan tidak ditemukan.' });
        res.json({ data: publicView(o) });
    } catch (e) { next(e); }
});

router.get('/by-phone/:phone', async (req, res, next) => {
    try {
        const phone = String(req.params.phone).replace(/[^\d+]/g, '');
        if (phone.length < 8) return res.status(400).json({ error: 'Nomor HP tidak valid.' });
        const rows = await all(`${svc.ORDER_SELECT} WHERE o.client_phone = ? ORDER BY o.id DESC LIMIT 30`, [phone]);
        res.json({ data: rows.map(o => ({ code: o.code, status: o.status, total: o.total, paid: o.paid, created_at: o.created_at })) });
    } catch (e) { next(e); }
});

module.exports = router;
