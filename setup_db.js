// Membuat tabel + data awal. Pakai: npm run db:setup
// - TURSO_DATABASE_URL terisi (.env) -> membuat di Turso; kosong -> file lokal laundry.db
// - `--reset` hanya untuk database lokal (menghapus laundry.db)
const fs = require('fs');
const store = require('./src/db');

(async () => {
    if (process.argv.includes('--reset')) {
        if (store.REMOTE) { console.error('--reset tidak dijalankan untuk Turso (hapus data lewat dashboard Turso bila perlu).'); return; }
        store.close();
        if (fs.existsSync(store.DB_FILE)) fs.unlinkSync(store.DB_FILE);
        console.log('Database lokal dihapus. Jalankan ulang tanpa --reset.');
        return;
    }
    await store.init();
    console.log('Database siap: ' + (store.REMOTE ? 'Turso (' + process.env.TURSO_DATABASE_URL + ')' : store.DB_FILE));
    const n = async (t) => (await store.get(`SELECT COUNT(*) AS n FROM ${t}`)).n;
    console.log(`admins=${await n('admins')} workers=${await n('workers')} services=${await n('services')} orders=${await n('orders')}`);
    if (!store.REMOTE) { console.log('Admin  : admin / admin123'); console.log('Washer : budi, agus, siti / washer123'); }
    store.close();
})().catch(e => { console.error(e); process.exit(1); });
