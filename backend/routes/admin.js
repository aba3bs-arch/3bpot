const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { adminRequired } = require('../middleware/auth');

const router = express.Router();
router.use(adminRequired);

router.get('/stats', (_req, res) => {
    res.json({
        stats: store.getStats(),
        agents: store.listAgents().length,
        cashiers: store.listCashiers().length,
        branches: store.listBranches().length,
    });
});

/* —— Agentes —— */
router.get('/agents', (_req, res) => res.json({ agents: store.listAgents() }));

router.post('/agents', (req, res) => {
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || req.body.email || '').trim();
    const password = String(req.body.password || '').trim();
    if (!name || !username) return res.status(400).json({ error: 'Nombre y usuario requeridos' });
    const key = username.toLowerCase().replace(/\s+/g, '');
    if (!/^[a-z0-9._-]{3,32}$/.test(key)) {
        return res.status(400).json({ error: 'Usuario: 3-32 caracteres (letras, números, . _ -)' });
    }
    if (store.findUserByUsername(key)) return res.status(409).json({ error: 'Usuario ya registrado' });
    const pwd = password && password.length >= 6 ? password : 'agente123';
    const user = store.createUser(key, bcrypt.hashSync(pwd, 10), name, 'agent', null);
    res.status(201).json({
        agent: store.sanitizeUser(user),
        username: user.username,
        password: pwd,
        message: `Agente ${name} creado`,
    });
});

router.post('/agents/:id/float', (req, res) => {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    try {
        const balance = store.topUpAgent(parseInt(req.params.id, 10), amount, req.user.id, req.body.note);
        res.json({ float_balance: balance, message: `$${amount} inyectados al agente` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/agents/:id', (req, res) => {
    try {
        const agent = store.updateStaffUser(parseInt(req.params.id, 10), {
            name: req.body.name,
            username: req.body.username || req.body.email,
            password: req.body.password || undefined,
            active: req.body.active,
        });
        res.json({ agent, message: 'Agente actualizado' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/agents/:id', (req, res) => {
    try {
        store.deleteStaffUser(parseInt(req.params.id, 10));
        res.json({ message: 'Agente eliminado' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

/* —— Sucursales —— */
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
            ? `${added} sucursales agregadas (clave por defecto: sucursal123)`
            : 'Sucursales listas (clave por defecto: sucursal123)',
    });
});

router.patch('/branches/:id/games', (req, res) => {
    try {
        const games = store.setBranchGames(req.params.id, req.body.games);
        res.json({ games, message: 'Juegos de la sucursal actualizados' });
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
        const balance = store.topUpBranch(req.params.id, amount, req.user.id, req.body.note);
        res.json({ float_balance: balance, message: `$${amount} inyectados a la sucursal` });
    } catch (e) { res.status(400).json({ error: e.message }); }
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

/* —— Cajeros (legado: opcional; el panel opera como sucursal) —— */
router.get('/cashiers', (_req, res) => res.json({ cashiers: store.listCashiers() }));

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
                adminId: req.user.id,
                note: 'Crédito inicial admin',
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
            adminId: req.user.id,
            note: req.body.note || 'Crédito admin a jugador',
        });
        res.json({ ...result, message: `$${amount} acreditados` });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/settings', (_req, res) => res.json({ settings: store.getSettings() }));
router.patch('/settings', (req, res) => {
    res.json({ settings: store.setSettings(req.body), message: 'Configuración guardada' });
});

module.exports = router;
