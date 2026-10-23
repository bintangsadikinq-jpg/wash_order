// Membuat/Mereset database. Pakai: npm run db:setup  (tambahkan --reset untuk menghapus data lama)
const fs = require('fs');
const store = require('./src/db');

(async () => {
    if (process.argv.includes('--reset') && fs.existsSync(store.DB_FILE)) {
        store.db.close();
        fs.unlinkSync(store.DB_FILE);
        console.log('Database lama dihapus. Jalankan ulang tanpa --reset.');
        return;
    }
    await store.init();
    console.log('Database siap: ' + store.DB_FILE);
    console.log('Admin  : admin / admin123');
    console.log('Washer : budi, agus, siti / washer123');
})().catch(e => { console.error(e); process.exit(1); });
