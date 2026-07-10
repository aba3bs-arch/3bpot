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

/* Sucursales */
router.get('/branches', (_req, res) => {
    const branches = store.listBranches().map((b) => ({
        ...b,
        stats: store.branchStats(b.id),
    }));
    res.json({ branches });
});

router.post('/branches', (req, res) => {
    try {
        const branch = store.createBranch(req.body.id, req.body.name);
        res.status(201).json({ branch, message: `Sucursal ${branch.name} creada` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/branches/:id', (req, res) => {
    try {
        const branch = store.updateBranch(req.params.id, req.body.name);
        res.json({ branch, message: 'Sucursal actualizada' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/branches/:id', (req, res) => {
    try {
        store.deleteBranch(req.params.id);
        res.json({ message: 'Sucursal eliminada' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/branches/seed', (_req, res) => {
    const added = store.ensureDefaultBranches();
    res.json({ branches: store.listBranches(), message: added ? `${added} sucursales agregadas` : 'Todas las sucursales ya existen' });
});

/* Máquinas */
router.get('/machines', (req, res) => {
    const branchId = req.query.branch_id || null;
    res.json({ machines: store.listMachines(branchId) });
});

router.post('/machines', (req, res) => {
    try {
        if (!req.body.branch_id) return res.status(400).json({ error: 'Selecciona una sucursal' });
        const machine = store.createMachine(req.body.number, req.body.name, req.body.branch_id);
        res.status(201).json({ machine, message: `Máquina #${machine.number} creada en ${machine.branch_name}` });
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
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    if (!name || !email) return res.status(400).json({ error: 'Nombre y email requeridos' });
    if (!req.body.branch_id) return res.status(400).json({ error: 'Selecciona una sucursal' });
    if (password && password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (store.findUserByEmail(email)) return res.status(409).json({ error: 'Email ya registrado' });
    if (req.body.branch_id && !store.findBranchById(req.body.branch_id)) {
        return res.status(400).json({ error: 'Sucursal no válida' });
    }
    const pwd = password || 'cajero123';
    const user = store.createUser(email, bcrypt.hashSync(pwd, 10), name, 'cashier', req.body.branch_id || null);
    res.status(201).json({
        cashier: store.sanitizeUser(user),
        email: user.email,
        password: pwd,
        message: `Cajero ${name} creado`,
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
