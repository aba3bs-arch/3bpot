const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { signToken, authRequired } = require('../middleware/auth');
const wallet = require('../services/wallet');

const router = express.Router();

router.post('/register', (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, contraseña y nombre son requeridos' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (store.findUserByEmail(normalizedEmail)) {
        return res.status(409).json({ error: 'Este email ya está registrado' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const user = store.createUser(normalizedEmail, hash, String(name).trim());
    store.createWallet(user.id, 100);
    store.addTransaction({
        user_id: user.id,
        type: 'bonus',
        amount: 100,
        balance_after: 100,
        note: 'Bono de bienvenida',
    });

    const token = signToken(user);
    res.status(201).json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        balance: 100,
        message: '¡Cuenta creada! Recibiste 100 WinCoins de bienvenida',
    });
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const user = store.findUserByEmail(String(email).trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    if (!user.active) {
        return res.status(403).json({ error: 'Cuenta desactivada' });
    }

    const token = signToken(user);
    res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        balance: wallet.getBalance(user.id),
    });
});

router.get('/me', authRequired, (req, res) => {
    const user = store.findUserById(req.user.id);
    if (!user || !user.active) {
        return res.status(403).json({ error: 'Cuenta no disponible' });
    }
    res.json({
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            active: user.active,
            created_at: user.created_at,
        },
        balance: wallet.getBalance(user.id),
    });
});

module.exports = router;
