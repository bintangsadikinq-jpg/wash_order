-- Skema Database Wash Order. Waktu disimpan dalam WIB (UTC+7) agar sama di server lokal maupun Vercel/Turso.
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);

CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'kg',      -- kg | satuan
    price INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

-- status: Menunggu > Ditugaskan > Dicuci > Siap > Selesai | Dibatalkan
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    client_address TEXT,
    delivery_type TEXT NOT NULL DEFAULT 'jemput',   -- jemput | antar_sendiri
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Menunggu',
    washer_id INTEGER,
    total INTEGER NOT NULL DEFAULT 0,
    paid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    FOREIGN KEY(washer_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    service_id INTEGER,
    service_name TEXT NOT NULL,
    type TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    qty REAL NOT NULL,
    subtotal INTEGER NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS order_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    actor TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    FOREIGN KEY(order_id) REFERENCES orders(id)
);

-- Buku kas: type in = pemasukan, out = pengeluaran. Pembayaran order otomatis tercatat sebagai 'in'.
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL,
    method TEXT,
    description TEXT,
    order_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(client_phone);
CREATE INDEX IF NOT EXISTS idx_orders_washer ON orders(washer_id);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);
