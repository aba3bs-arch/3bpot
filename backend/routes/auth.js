const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const user = store.findUserByEmail(String(email).trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    if (!user.active) return res.status(403).json({ error: 'Cuenta desactivada' });
    if (user.role === 'user') return res.status(403).json({ error: 'Acceso no permitido' });

    const token = signToken(user);
    res.json({
        token,
        user: store.sanitizeUser(user),
    });
});

router.get('/me', authRequired, (req, res) => {
    const user = store.findUserById(req.user.id);
    if (!user || !user.active) return res.status(403).json({ error: 'Cuenta no disponible' });
    res.json({ user: store.sanitizeUser(user) });
});

module.exports = router;
