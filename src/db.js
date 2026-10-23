const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
/*  Dua backend dengan API yang sama:
 *  - TURSO_DATABASE_URL terisi  -> Turso (libSQL) : dipakai di Vercel / produksi
 *  - kosong                     -> file SQLite lokal (node:sqlite) : pengembangan di komputer sendiri */
const REMOTE = !!process.env.TURSO_DATABASE_URL;
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'laundry.db');

let run, get, all, exec, close;

if (REMOTE) {
    const { createClient } = require('@libsql/client/web');
    const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
    const plain = (rows) => rows.map(r => Object.fromEntries(Object.keys(r).filter(k => isNaN(k)).map(k => [k, typeof r[k] === 'bigint' ? Number(r[k]) : r[k]])));
    run = async (sql, params = []) => { const r = await client.execute({ sql, args: params }); return { lastID: Number(r.lastInsertRowid || 0), changes: r.rowsAffected }; };
    all = async (sql, params = []) => plain((await client.execute({ sql, args: params })).rows);
    get = async (sql, params = []) => (await all(sql, params))[0];
    exec = async (sql) => { await client.executeMultiple(sql); };
    close = () => client.close();
} else {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(DB_FILE);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    run = async (sql, params = []) => { const r = db.prepare(sql).run(...params); return { lastID: Number(r.lastInsertRowid), changes: r.changes }; };
    get = async (sql, params = []) => db.prepare(sql).get(...params);
    all = async (sql, params = []) => db.prepare(sql).all(...params);
    exec = async (sql) => db.exec(sql);
    close = () => db.close();
}

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

/*  Membuat tabel (aman diulang) + data awal.
 *  ADMIN_PASSWORD        : password admin awal (default lokal: admin123; di Turso tanpa nilai ini dibuat acak & dicetak ke log)
 *  SEED_DEMO_WORKERS=0   : jangan buat washer contoh (default: dibuat hanya pada database lokal) */
let initPromise;
function init() {
    if (!initPromise) initPromise = doInit().catch(e => { initPromise = null; throw e; });
    return initPromise;
}
async function doInit() {
    await exec(fs.readFileSync(path.join(ROOT, 'database.sql'), 'utf8'));

    if (!(await get('SELECT id FROM admins LIMIT 1'))) {
        let pass = process.env.ADMIN_PASSWORD;
        if (!pass && REMOTE) { pass = crypto.randomBytes(9).toString('base64url'); console.log('[init] Password admin awal (username: admin): ' + pass); }
        await run('INSERT INTO admins (name, username, password_hash) VALUES (?,?,?)', ['Administrator', 'admin', hashPassword(pass || 'admin123')]);
    }
    if (!(await get('SELECT id FROM services LIMIT 1'))) {
        const services = [
            ['Cuci Kering', 'kg', 6000], ['Cuci Basah', 'kg', 5000], ['Cuci Steam', 'kg', 8000],
            ['Cuci Kering Lipat', 'kg', 7000], ['Cuci Sepatu', 'satuan', 25000],
            ['Cuci Tas', 'satuan', 30000], ['Cuci Sepatu Safety', 'satuan', 35000]
        ];
        for (const s of services) await run('INSERT INTO services (name, type, price) VALUES (?,?,?)', s);
    }
    const demo = process.env.SEED_DEMO_WORKERS ? process.env.SEED_DEMO_WORKERS !== '0' : !REMOTE;
    if (demo && !(await get('SELECT id FROM workers LIMIT 1'))) {
        const workers = [['Budi', '081200000001', 'budi'], ['Agus', '081200000002', 'agus'], ['Siti', '081200000003', 'siti']];
        for (const w of workers) await run('INSERT INTO workers (name, phone, username, password_hash) VALUES (?,?,?,?)',
            [w[0], w[1], w[2], hashPassword('washer123')]);
    }
}

module.exports = { run, get, all, exec, init, close, hashPassword, verifyPassword, DB_FILE, REMOTE };
