const { run, get, all } = require('../../db');

const STATUSES = ['Menunggu', 'Ditugaskan', 'Dicuci', 'Siap', 'Selesai', 'Dibatalkan'];

const ORDER_SELECT = 'SELECT o.*, w.name AS washer_name FROM orders o LEFT JOIN workers w ON w.id = o.washer_id';

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function logStatus(orderId, status, actor, note) {
    await run('INSERT INTO order_logs (order_id, status, actor, note) VALUES (?,?,?,?)', [orderId, status, actor || null, note || null]);
}

async function setStatus(orderId, status, actor, note, extra = {}) {
    const cols = ['status = ?', "updated_at = datetime('now','localtime')"];
    const vals = [status];
    for (const [k, v] of Object.entries(extra)) { cols.push(`${k} = ?`); vals.push(v); }
    await run(`UPDATE orders SET ${cols.join(', ')} WHERE id = ?`, [...vals, orderId]);
    await logStatus(orderId, status, actor, note);
}

function newCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return 'WO-' + s;
}

// items: [{ service_id, qty }] -> baris dengan harga dari tabel services (atau harga lama bila dipertahankan)
async function buildItems(items, keepPrices = {}) {
    if (!Array.isArray(items) || !items.length) throw httpError(400, 'Pilih minimal satu layanan.');
    const rows = [];
    for (const it of items) {
        const svc = await get('SELECT * FROM services WHERE id = ?', [it.service_id]);
        if (!svc || (!svc.active && keepPrices[svc.id] === undefined)) throw httpError(400, 'Layanan tidak tersedia.');
        let qty = Number(it.qty);
        qty = svc.type === 'satuan' ? Math.round(qty) : Math.round(qty * 10) / 10;
        if (!(qty > 0)) throw httpError(400, `Jumlah untuk ${svc.name} tidak valid.`);
        const price = keepPrices[svc.id] !== undefined ? keepPrices[svc.id] : svc.price;
        rows.push({ service_id: svc.id, service_name: svc.name, type: svc.type, unit_price: price, qty, subtotal: Math.round(price * qty) });
    }
    return rows;
}

async function saveItems(orderId, rows) {
    await run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    for (const r of rows)
        await run('INSERT INTO order_items (order_id, service_id, service_name, type, unit_price, qty, subtotal) VALUES (?,?,?,?,?,?,?)',
            [orderId, r.service_id, r.service_name, r.type, r.unit_price, r.qty, r.subtotal]);
    const total = rows.reduce((a, r) => a + r.subtotal, 0);
    await run("UPDATE orders SET total = ?, updated_at = datetime('now','localtime') WHERE id = ?", [total, orderId]);
    return total;
}

async function createOrder(body) {
    const name = String(body.client_name || '').trim();
    const phone = String(body.client_phone || '').replace(/[^\d+]/g, '');
    const address = String(body.client_address || '').trim();
    const delivery = body.delivery_type === 'antar_sendiri' ? 'antar_sendiri' : 'jemput';
    if (name.length < 2) throw httpError(400, 'Nama wajib diisi.');
    if (phone.length < 8) throw httpError(400, 'Nomor HP tidak valid.');
    if (delivery === 'jemput' && address.length < 5) throw httpError(400, 'Alamat jemput wajib diisi.');
    const rows = await buildItems(body.items);

    let code, tries = 0;
    do { code = newCode(); tries++; } while (await get('SELECT id FROM orders WHERE code = ?', [code]) && tries < 10);

    const { lastID } = await run(
        'INSERT INTO orders (code, client_name, client_phone, client_address, delivery_type, notes) VALUES (?,?,?,?,?,?)',
        [code, name, phone, address, delivery, String(body.notes || '').trim() || null]);
    await saveItems(lastID, rows);
    await logStatus(lastID, 'Menunggu', name, 'Pesanan dibuat');
    return { id: lastID, code };
}

async function getOrderFull(where, params) {
    const order = await get(`${ORDER_SELECT} WHERE ${where}`, params);
    if (!order) return null;
    order.items = await all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [order.id]);
    order.logs = await all('SELECT status, actor, note, created_at FROM order_logs WHERE order_id = ? ORDER BY id', [order.id]);
    order.payments = await all("SELECT amount, method, created_at FROM transactions WHERE order_id = ? AND type = 'in' ORDER BY id", [order.id]);
    return order;
}

module.exports = { STATUSES, ORDER_SELECT, httpError, logStatus, setStatus, buildItems, saveItems, createOrder, getOrderFull };
