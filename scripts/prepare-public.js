// Dijalankan Vercel saat build: menyusun file statis ke ./public (disajikan CDN, tanpa lewat fungsi)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');
fs.rmSync(OUT, { recursive: true, force: true });
const map = { user: 'userpanel/hungry', admin: 'adminpanel2/tixia/xhtml', washer: 'washerpanel', login: 'login' };
for (const [dest, src] of Object.entries(map)) fs.cpSync(path.join(ROOT, src), path.join(OUT, dest), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'userpanel/hungry/img/favicon.png'), path.join(OUT, 'favicon.png'));
console.log('public/ siap:', Object.keys(map).join(', '));
