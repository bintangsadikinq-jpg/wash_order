const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'laundry.db');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// API berbasis Promise agar kode modul tetap sederhana
const run = async (sql, params = []) => { const r = db.prepare(sql).run(...params); return { lastID: Number(r.lastInsertRowid), changes: r.changes }; };
const get = async (sql, params = []) => db.prepare(sql).get(...params);
const all = async (sql, params = []) => db.prepare(sql).all(...params);
const exec = async (sql) => db.exec(sql);

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return salt + ':' + crypto.scryptSync(password, salt, 32).toString('hex');
}
function verifyPassword(password, stored) {
    const [salt, hash] = String(stored).split(':');
    if (!salt || !hash) return false;
    const test = crypto.scryptSync(String(password), salt, 32);
    const real = Buffer.from(hash, 'hex');
    return test.length === real.length && crypto.timingSafeEqual(test, real);
}

async function init() {
    await exec(fs.readFileSync(path.join(ROOT, 'database.sql'), 'utf8'));

    if (!(await get('SELECT id FROM admins LIMIT 1'))) {
        await run('INSERT INTO admins (name, username, password_hash) VALUES (?,?,?)',
            ['Administrator', 'admin', hashPassword('admin123')]);
    }
    if (!(await get('SELECT id FROM services LIMIT 1'))) {
        const services = [
            ['Cuci Kering', 'kg', 6000], ['Cuci Basah', 'kg', 5000], ['Cuci Steam', 'kg', 8000],
            ['Cuci Kering Lipat', 'kg', 7000], ['Cuci Sepatu', 'satuan', 25000],
            ['Cuci Tas', 'satuan', 30000], ['Cuci Sepatu Safety', 'satuan', 35000]
        ];
        for (const s of services) await run('INSERT INTO services (name, type, price) VALUES (?,?,?)', s);
    }
    if (!(await get('SELECT id FROM workers LIMIT 1'))) {
        const workers = [['Budi', '081200000001', 'budi'], ['Agus', '081200000002', 'agus'], ['Siti', '081200000003', 'siti']];
        for (const w of workers) await run('INSERT INTO workers (name, phone, username, password_hash) VALUES (?,?,?,?)',
            [w[0], w[1], w[2], hashPassword('washer123')]);
    }
}

module.exports = { db, run, get, all, exec, init, hashPassword, verifyPassword, DB_FILE };
