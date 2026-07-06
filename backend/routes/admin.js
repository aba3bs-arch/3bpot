const express = require('express');
const store = require('../db/store');
const { adminRequired } = require('../middleware/auth');
const wallet = require('../services/wallet');

const router = express.Router();
router.use(adminRequired);

router.get('/stats', (_req, res) => {
    res.json({ stats: store.getStats() });
});

router.get('/users', (req, res) => {
    const q = (req.query.q || '').trim();
    const users = store.listUsers(q).map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        active: u.active,
        created_at: u.created_at,
        balance: u.balance,
    }));
    res.json({ users });
});

router.get('/users/:id', (req, res) => {
    const user = store.findUserById(parseInt(req.params.id, 10));
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            active: user.active,
            created_at: user.created_at,
            balance: wallet.getBalance(user.id),
        },
        transactions: wallet.getTransactions(user.id, 30),
        rounds: store.getUserRounds(user.id, 20),
    });
});

router.post('/users/:id/credit', (req, res) => {
    const amount = parseInt(req.body.amount, 10);
    const note = req.body.note || 'Recarga administrativa';
    const userId = parseInt(req.params.id, 10);

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    if (!store.findUserById(userId)) return res.status(404).json({ error: 'Usuario no encontrado' });

    try {
        const balance = wallet.credit(userId, amount, 'admin_credit', note, req.user.id);
        res.json({ message: `${amount} WC acreditados`, balance });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/users/:id/debit', (req, res) => {
    const amount = parseInt(req.body.amount, 10);
    const note = req.body.note || 'Ajuste administrativo';
    const userId = parseInt(req.params.id, 10);

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    if (!store.findUserById(userId)) return res.status(404).json({ error: 'Usuario no encontrado' });

    try {
        const balance = wallet.debit(userId, amount, 'admin_debit', { note, adminId: req.user.id });
        res.json({ message: `${amount} WC debitados`, balance });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.patch('/users/:id/status', (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const user = store.findUserById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.role === 'admin' && !req.body.active) {
        return res.status(400).json({ error: 'No se puede desactivar un administrador' });
    }

    store.setUserActive(userId, !!req.body.active);
    res.json({ message: req.body.active ? 'Usuario activado' : 'Usuario desactivado' });
});

router.get('/transactions', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    res.json({ transactions: store.getAllTransactions(limit) });
});

router.get('/packages', (_req, res) => {
    res.json({ packages: store.getPackages() });
});

module.exports = router;
