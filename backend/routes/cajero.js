const express = require('express');
const store = require('../db/store');
const { branchRequired } = require('../middleware/auth');

const router = express.Router();
router.use(branchRequired);

function branchId(req) {
    return req.user.branch_id || req.user.id;
}

router.get('/me', (req, res) => {
    const id = branchId(req);
    const branch = store.findBranchById(id);
    if (!branch) return res.status(404).json({ error: 'Sucursal no encontrada' });
    res.json({
        user: store.sanitizeBranch(branch),
        branch: store.sanitizeBranch(branch),
        machines: store.listMachines(id),
        recentSales: store.getTransactions(20, { branchId: id, type: 'cash_sale' }),
        terminal_url: `/inicio/?branch=${encodeURIComponent(id)}&m=1`,
    });
});

router.get('/machines', (req, res) => {
    res.json({ machines: store.listMachines(branchId(req)) });
});

router.post('/machines', (req, res) => {
    try {
        const machine = store.createMachine(req.body.number, req.body.name, branchId(req));
        res.status(201).json({ machine, message: `Máquina #${machine.number} creada` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/machines/:id', (req, res) => {
    try {
        const machine = store.findMachineById(parseInt(req.params.id, 10));
        if (!machine || machine.branch_id !== branchId(req)) {
            return res.status(404).json({ error: 'Máquina no encontrada' });
        }
        const updated = store.updateMachine(machine.id, {
            name: req.body.name,
            number: req.body.number,
            active: req.body.active,
        });
        res.json({ machine: updated, message: 'Máquina actualizada' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/machines/:id', (req, res) => {
    try {
        const machine = store.findMachineById(parseInt(req.params.id, 10));
        if (!machine || machine.branch_id !== branchId(req)) {
            return res.status(404).json({ error: 'Máquina no encontrada' });
        }
        store.deleteMachine(machine.id);
        res.json({ message: 'Máquina eliminada' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/sell', (req, res) => {
    const machineId = parseInt(req.body.machineId, 10);
    const amount = parseInt(req.body.amount, 10);
    const id = branchId(req);
    if (!machineId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Selecciona máquina y monto' });
    }
    try {
        store.assertBranchMachineAccess(id, machineId);
        const result = store.creditMachine(machineId, amount, {
            branchId: id,
            cashCents: amount * 100,
            paymentMethod: 'efectivo',
            note: req.body.note || 'Recarga en sucursal',
        });
        const branch = store.findBranchById(id);
        res.json({
            ...result,
            float_balance: branch.float_balance,
            message: `$${amount} cargados a máquina #${result.machine.number}`,
        });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/sales', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 30;
    res.json({ sales: store.getTransactions(limit, { branchId: branchId(req), type: 'cash_sale' }) });
});

router.get('/players', (req, res) => {
    res.json({ players: store.listPlayers({ branchId: branchId(req) }) });
});

router.post('/players', (req, res) => {
    try {
        const out = store.createPlayer(req.body.username, req.body.password, req.body.name, {
            branchId: branchId(req),
            parentId: null,
        });
        const credit = parseInt(req.body.credit, 10) || 0;
        if (credit > 0) {
            store.creditPlayer(out.user.id, credit, {
                branchId: branchId(req),
                note: 'Crédito inicial sucursal',
            });
            out.user = store.sanitizeUser(store.findUserById(out.user.id));
        }
        res.status(201).json({
            player: out.user,
            username: out.user.username,
            password: out.password,
            message: `Jugador ${out.user.name} creado`,
        });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/players/:id/credit', (req, res) => {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    try {
        const result = store.creditPlayer(parseInt(req.params.id, 10), amount, {
            branchId: branchId(req),
            note: req.body.note || 'Crédito sucursal a jugador',
        });
        res.json({ ...result, message: `$${amount} acreditados` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
