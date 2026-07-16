const express = require('express');
const store = require('../db/store');
const { staffRequired } = require('../middleware/auth');

const router = express.Router();
router.use(staffRequired);

function agentOnly(req, res, next) {
    if (req.user.role !== 'agent') {
        return res.status(403).json({ error: 'Solo agentes pueden usar este panel' });
    }
    next();
}

router.use(agentOnly);

router.get('/stats', (req, res) => {
    const me = store.findUserById(req.user.id);
    res.json({
        stats: store.getStats(),
        my_float: me?.float_balance || 0,
        branches: store.listBranches().length,
    });
});

router.get('/branches', (_req, res) => {
    res.json({
        branches: store.listBranches().map((b) => ({
            ...store.sanitizeBranch(b),
            stats: store.branchStats(b.id),
        })),
    });
});

router.post('/branches', (req, res) => {
    try {
        const out = store.createBranch(req.body.id, req.body.name, req.body.password);
        res.status(201).json({
            branch: out.branch,
            password: out.password,
            machines: store.listMachines(out.branch.id),
            message: `Sucursal ${out.branch.name} creada · clave: ${out.password}`,
        });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/branches/seed', (_req, res) => {
    const added = store.ensureDefaultBranches();
    res.json({
        branches: store.listBranches().map((b) => store.sanitizeBranch(b)),
        message: added
            ? `${added} sucursales agregadas (clave: sucursal123)`
            : 'Sucursales listas (clave: sucursal123)',
    });
});

router.patch('/branches/:id', (req, res) => {
    try {
        const branch = store.updateBranch(req.params.id, {
            name: req.body.name,
            password: req.body.password || undefined,
            active: req.body.active,
        });
        if (req.body.games) store.setBranchGames(req.params.id, req.body.games);
        res.json({
            branch,
            games: store.getBranchGames(req.params.id),
            message: 'Sucursal actualizada',
        });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/branches/:id', (req, res) => {
    try {
        store.deleteBranch(req.params.id);
        res.json({ message: 'Sucursal eliminada' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/branches/:id/machines', (req, res) => {
    try {
        const out = store.ensureMachinesForBranch(req.params.id, parseInt(req.body.count, 10) || 3);
        res.json({ ...out, message: out.created ? `${out.created} máquinas creadas` : 'Ya tiene sus máquinas' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/branches/:id/float', (req, res) => {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    try {
        const balance = store.transferAgentToBranch(req.user.id, req.params.id, amount, req.body.note);
        res.json({ float_balance: balance, message: `$${amount} transferidos a la sucursal` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/machines', (req, res) => {
    res.json({ machines: store.listMachines(req.query.branch_id || null) });
});

router.post('/machines', (req, res) => {
    try {
        if (!req.body.branch_id) return res.status(400).json({ error: 'Sucursal requerida' });
        const machine = store.createMachine(req.body.number, req.body.name, req.body.branch_id);
        res.status(201).json({ machine, message: `Máquina #${machine.number} creada` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/machines/:id', (req, res) => {
    try {
        const machine = store.updateMachine(parseInt(req.params.id, 10), {
            name: req.body.name,
            number: req.body.number,
            active: req.body.active,
        });
        res.json({ machine, message: 'Máquina actualizada' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/machines/:id', (req, res) => {
    try {
        store.deleteMachine(parseInt(req.params.id, 10));
        res.json({ message: 'Máquina eliminada' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/players', (_req, res) => res.json({ players: store.listPlayers() }));

router.post('/players', (req, res) => {
    try {
        const out = store.createPlayer(req.body.username, req.body.password, req.body.name, {
            branchId: req.body.branch_id || null,
            parentId: req.user.id,
        });
        const credit = parseInt(req.body.credit, 10) || 0;
        if (credit > 0) {
            store.creditPlayer(out.user.id, credit, {
                agentId: req.user.id,
                note: 'Crédito inicial agente',
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
            agentId: req.user.id,
            note: req.body.note || 'Crédito agente a jugador',
        });
        res.json({ ...result, message: `$${amount} acreditados` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
