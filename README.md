# Wash Order

Aplikasi laundry dengan tiga panel yang memakai satu database (Node.js + Express + SQLite bawaan Node `node:sqlite`).

Satu alamat untuk semua: **http://localhost:3000** (satu server, satu database, satu perintah `npm start`).

| Panel | Pengguna | Alamat | Template | Login |
|---|---|---|---|---|
| Pemesan | Pelanggan | `/` atau `/user/` | `userpanel/hungry` (Hungry mobile) | **Tidak perlu** |
| Login Staf | Admin & Washer | `/login` | halaman login tunggal | satu form, peran dikenali otomatis |
| Admin | Administrator | `/admin/` | `adminpanel2/tixia/xhtml` (Tixia) | `admin` / `admin123` |
| Washer | Pekerja | `/washer/` | UI sederhana buatan sendiri (mobile-first) | `budi`, `agus`, `siti` / `washer123` |

Staf cukup login di `/login`; admin otomatis masuk ke panel admin, washer ke panel washer. Mengakses `/admin/` atau `/washer/` tanpa login diarahkan ke `/login`. Tautan "Login Staf" ada di menu dan footer halaman pemesan.

> Ganti password bawaan setelah pertama kali masuk (admin: lewat database; washer: menu *Washer (Pekerja)* di panel admin).

## Menjalankan
Butuh Node.js 22.13+ (tanpa kompilasi native).

```
npm install
npm start          # http://localhost:3000
```
Database `laundry.db` dibuat otomatis saat server pertama kali jalan (`npm run db:setup` juga bisa dipakai).

## Alur data
1. **Pelanggan** memilih layanan di `/user/order.html` → mendapat kode pesanan (mis. `WO-AB3XK`). Status bisa dilacak di `/user/track.html` dengan kode atau nomor HP.
2. **Admin** melihat pesanan masuk (*Menunggu*), menimbang/mengubah berat, lalu **menugaskan washer** → status *Ditugaskan*.
3. **Washer** login, melihat tugas miliknya, menekan **Mulai Cuci** (*Dicuci*) lalu **Cucian Sudah Selesai** (*Siap*).
4. **Admin** mencatat pembayaran (otomatis menjadi **pemasukan** di Kas) dan menandai *Selesai*.
5. Pengeluaran (deterjen, listrik, gaji, dll.) dicatat admin di menu **Kas Masuk / Keluar**. Pembatalan pesanan yang sudah dibayar otomatis membuat catatan *Refund* (pengeluaran).

Setiap perubahan status tercatat di riwayat pesanan dan langsung terlihat di ketiga panel.

## Struktur
- `database.sql` – skema; `src/db.js` – koneksi, helper, seed awal
- `src/modules/orders` – API publik pemesan; `admin` – pesanan/keuangan/layanan/washer; `washer` – tugas pekerja; `auth` – login
- `adminpanel2/tixia/xhtml/*.html` – halaman admin (`login`, `dashboard`, `orders`, `finance`, `workers`, `services`) + `js/wo-admin.js` (layout & helper). Template Qubes lama di `adminpanel/` tidak dipakai lagi.
- `userpanel/hungry/{index,order,track}.html` + `css/washorder.css`, `js/wo-user.js`
- `washerpanel/` – UI washer

## Catatan
- Pelanggan tidak punya password: siapa pun yang tahu kode pesanan bisa melihat status, dan riwayat per nomor HP hanya menampilkan kode, status, dan total.
- Reset data: hentikan server, hapus `laundry.db*`, jalankan ulang.
