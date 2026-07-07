const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { adminRequired } = require('../middleware/auth');

const router = express.Router();
router.use(adminRequired);

router.get('/stats', (_req, res) => res.json({ stats: store.getStats() }));

router.get('/settings', (_req, res) => res.json({ settings: store.getSettings() }));

router.patch('/settings', (req, res) => {
    res.json({ settings: store.setSettings(req.body), message: 'Configuración guardada' });
});

/* Máquinas */
router.get('/machines', (_req, res) => res.json({ machines: store.listMachines() }));

router.post('/machines', (req, res) => {
    try {
        const machine = store.createMachine(req.body.number, req.body.name);
        res.status(201).json({ machine, message: `Máquina #${machine.number} creada` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/machines/:id/status', (req, res) => {
    const m = store.setMachineActive(parseInt(req.params.id, 10), !!req.body.active);
    if (!m) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: req.body.active ? 'Máquina activada' : 'Máquina desactivada' });
});

router.post('/machines/:id/adjust', (req, res) => {
    const amount = parseInt(req.body.amount, 10);
    if (!amount) return res.status(400).json({ error: 'Monto inválido' });
    try {
        const balance = store.adjustMachineBalance(parseInt(req.params.id, 10), amount, req.user.id, req.body.note || 'Ajuste admin');
        res.json({ balance, message: 'Saldo actualizado' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

/* Cajeros */
router.get('/cashiers', (_req, res) => res.json({ cashiers: store.listCashiers() }));

router.post('/cashiers', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nombre y email requeridos' });
    if (store.findUserByEmail(email)) return res.status(409).json({ error: 'Email ya registrado' });
    const pwd = password && password.length >= 6 ? password : 'cajero123';
    const user = store.createUser(email, bcrypt.hashSync(pwd, 10), name, 'cashier');
    res.status(201).json({
        cashier: store.sanitizeUser(user),
        tempPassword: password ? null : pwd,
        message: 'Cajero creado',
    });
});

router.post('/cashiers/:id/float', (req, res) => {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    try {
        const balance = store.topUpCashier(parseInt(req.params.id, 10), amount, req.user.id, req.body.note);
        res.json({ float_balance: balance, message: `$${amount} agregados a la caja del cajero` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/cashiers/:id/status', (req, res) => {
    const u = store.setUserActive(parseInt(req.params.id, 10), !!req.body.active);
    if (!u) return res.status(404).json({ error: 'No encontrado' });
    res.json({ message: req.body.active ? 'Cajero activado' : 'Cajero desactivado' });
});

/* Venta directa admin → máquina */
router.post('/sell', (req, res) => {
    const machineId = parseInt(req.body.machineId, 10);
    const amount = parseInt(req.body.amount, 10);
    if (!machineId || !amount || amount <= 0) return res.status(400).json({ error: 'Datos inválidos' });
    try {
        const result = store.creditMachine(machineId, amount, {
            adminId: req.user.id,
            cashCents: amount * 100,
            paymentMethod: req.body.paymentMethod || 'efectivo',
            note: req.body.note || 'Venta directa admin',
        });
        res.json({ ...result, message: `$${amount} cargados a máquina #${result.machine.number}` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/transactions', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    res.json({ transactions: store.getTransactions(limit) });
});

module.exports = router;
