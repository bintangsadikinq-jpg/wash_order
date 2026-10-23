const express = require('express');
const { get, run, verifyPassword } = require('../../db');
const { createSession, requireAdmin, requireWasher } = require('../../auth');
const router = express.Router();

const login = (role, table) => async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const user = await get(`SELECT * FROM ${table} WHERE username = ?`, [String(username || '').trim().toLowerCase()]);
        if (!user || !verifyPassword(password, user.password_hash) || user.active === 0)
            return res.status(401).json({ error: 'Username atau password salah.' });
        const token = await createSession(role, user.id);
        res.json({ token, user: { id: user.id, name: user.name, username: user.username } });
    } catch (e) { next(e); }
};
const logout = async (req, res, next) => {
    try { await run('DELETE FROM sessions WHERE token = ?', [req.token]); res.json({ ok: true }); } catch (e) { next(e); }
};
const me = (req, res) => res.json({ user: { id: req.user.id, name: req.user.name, username: req.user.username } });

// Login terpadu untuk staf: sistem menentukan peran (admin / washer) dari akunnya
router.post('/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const name = String(username || '').trim().toLowerCase();
        for (const [role, table] of [['admin', 'admins'], ['washer', 'workers']]) {
            const user = await get(`SELECT * FROM ${table} WHERE username = ?`, [name]);
            if (user && user.active !== 0 && verifyPassword(password, user.password_hash)) {
                const token = await createSession(role, user.id);
                return res.json({ role, token, user: { id: user.id, name: user.name, username: user.username } });
            }
        }
        res.status(401).json({ error: 'Username atau password salah.' });
    } catch (e) { next(e); }
});

router.post('/admin/login', login('admin', 'admins'));
router.post('/admin/logout', requireAdmin, logout);
router.get('/admin/me', requireAdmin, me);
router.post('/washer/login', login('washer', 'workers'));
router.post('/washer/logout', requireWasher, logout);
router.get('/washer/me', requireWasher, me);

module.exports = router;
