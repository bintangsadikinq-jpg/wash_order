const crypto = require('crypto');
const { run, get } = require('./db');

async function createSession(role, userId) {
    const token = crypto.randomBytes(24).toString('hex');
    await run('INSERT INTO sessions (token, role, user_id) VALUES (?,?,?)', [token, role, userId]);
    return token;
}

function requireRole(role) {
    return async (req, res, next) => {
        try {
            const header = req.headers.authorization || '';
            const token = header.startsWith('Bearer ') ? header.slice(7) : '';
            const session = token && await get('SELECT * FROM sessions WHERE token = ? AND role = ?', [token, role]);
            if (!session) return res.status(401).json({ error: 'Sesi berakhir, silakan login kembali.' });
            const table = role === 'admin' ? 'admins' : 'workers';
            const user = await get(`SELECT * FROM ${table} WHERE id = ?`, [session.user_id]);
            if (!user || (role === 'washer' && !user.active)) return res.status(401).json({ error: 'Akun tidak aktif.' });
            req.user = user;
            req.token = token;
            next();
        } catch (e) { next(e); }
    };
}

module.exports = { createSession, requireAdmin: requireRole('admin'), requireWasher: requireRole('washer') };
