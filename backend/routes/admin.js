const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { adminRequired } = require('../middleware/auth');
const wallet = require('../services/wallet');

const router = express.Router();
router.use(adminRequired);

router.get('/stats', (_req, res) => {
    res.json({ stats: store.getStats() });
});

router.get('/cash-sales', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    res.json({ sales: store.getCashSales(limit) });
});

router.post('/users', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'Nombre y email son requeridos' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (store.findUserByEmail(normalizedEmail)) {
        return res.status(409).json({ error: 'Este email ya está registrado' });
    }

    const pwd = password && String(password).length >= 6 ? password : 'winpot123';
    const hash = bcrypt.hashSync(pwd, 10);
    const user = store.createUser(normalizedEmail, hash, String(name).trim());
    store.createWallet(user.id, 0);

    res.status(201).json({
        message: 'Cliente creado',
        user: { id: user.id, email: user.email, name: user.name, balance: 0 },
        tempPassword: password ? null : pwd,
    });
});

router.post('/sell-coins', (req, res) => {
    const userId = parseInt(req.body.userId, 10);
    const packageId = req.body.packageId ? parseInt(req.body.packageId, 10) : null;
    let coins = req.body.coins != null ? parseInt(req.body.coins, 10) : null;
    let cashCents = req.body.cashCents != null ? parseInt(req.body.cashCents, 10) : null;
    const paymentMethod = req.body.paymentMethod || 'efectivo';
    const note = req.body.note || '';

    if (!userId) return res.status(400).json({ error: 'Selecciona un cliente' });

    let packageName = null;
    if (packageId) {
        const pkg = store.findPackage(packageId);
        if (!pkg) return res.status(404).json({ error: 'Paquete no encontrado' });
        if (coins == null) coins = pkg.coins;
        if (cashCents == null) cashCents = pkg.price_cents;
        packageName = pkg.name;
    }

    if (!coins || coins <= 0) return res.status(400).json({ error: 'Cantidad de WinCoins inválida' });
    if (cashCents == null || cashCents < 0) return res.status(400).json({ error: 'Monto en efectivo inválido' });

    try {
        const result = wallet.sellForCash(userId, coins, cashCents, req.user.id, {
            paymentMethod,
            note,
            packageId,
            packageName,
        });
        res.json({
            message: `Venta registrada: ${coins} WC → $${(cashCents / 100).toFixed(2)} ${paymentMethod}`,
            ...result,
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
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

router.patch('/packages/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const pkg = store.updatePackage(id, req.body);
    if (!pkg) return res.status(404).json({ error: 'Paquete no encontrado' });
    res.json({ message: 'Paquete actualizado', package: pkg });
});

module.exports = router;
