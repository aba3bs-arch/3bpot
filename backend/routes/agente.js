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

async function saveOrFail(res, work) {
    const snap = store.snapshotData();
    try {
        const payload = await work();
        await store.flushOrThrow();
        return res.status(payload.status || 200).json(payload.body);
    } catch (e) {
        if (e.code === 'PERSIST_FAILED') store.restoreSnapshot(snap);
        const status = e.status || (e.code === 'PERSIST_FAILED' ? 503 : 400);
        return res.status(status).json({ error: e.message || 'Error' });
    }
}

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

router.post('/branches', (req, res) => saveOrFail(res, async () => {
    const out = store.createBranch(req.body.id, req.body.name, req.body.password);
    return {
        status: 201,
        body: {
            branch: out.branch,
            password: out.password,
            machines: store.listMachines(out.branch.id),
            message: `Sucursal ${out.branch.name} creada · clave: ${out.password}`,
        },
    };
}));

router.post('/branches/seed', async (_req, res) => {
    if (process.env.ENABLE_DEMO_SEED !== '1') {
        return res.status(403).json({
            error: 'Seed demo desactivado. Crea sucursales desde el panel. (ENABLE_DEMO_SEED=1 para habilitar)',
        });
    }
    return saveOrFail(res, async () => {
        const added = store.ensureDefaultBranches();
        return {
            body: {
                branches: store.listBranches().map((b) => store.sanitizeBranch(b)),
                message: added
                    ? `${added} sucursales demo agregadas (clave: sucursal123)`
                    : 'Sucursales demo ya existían',
            },
        };
    });
});

router.patch('/branches/:id', (req, res) => saveOrFail(res, async () => {
    const branch = store.updateBranch(req.params.id, {
        name: req.body.name,
        password: req.body.password || undefined,
        active: req.body.active,
    });
    if (req.body.games) store.setBranchGames(req.params.id, req.body.games);
    return {
        body: {
            branch,
            games: store.getBranchGames(req.params.id),
            message: 'Sucursal actualizada',
        },
    };
}));

router.delete('/branches/:id', (req, res) => saveOrFail(res, async () => {
    store.deleteBranch(req.params.id);
    return { body: { message: 'Sucursal eliminada' } };
}));

router.post('/branches/:id/machines', (req, res) => saveOrFail(res, async () => {
    const out = store.ensureMachinesForBranch(req.params.id, parseInt(req.body.count, 10) || 3);
    return {
        body: { ...out, message: out.created ? `${out.created} máquinas creadas` : 'Ya tiene sus máquinas' },
    };
}));

router.post('/branches/:id/float', (req, res) => saveOrFail(res, async () => {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) {
        const err = new Error('Monto inválido');
        err.status = 400;
        throw err;
    }
    const balance = store.transferAgentToBranch(req.user.id, req.params.id, amount, req.body.note);
    return { body: { float_balance: balance, message: `$${amount} transferidos a la sucursal` } };
}));

router.get('/machines', (req, res) => {
    res.json({ machines: store.listMachines(req.query.branch_id || null) });
});

router.post('/machines', (req, res) => saveOrFail(res, async () => {
    if (!req.body.branch_id) {
        const err = new Error('Sucursal requerida');
        err.status = 400;
        throw err;
    }
    const machine = store.createMachine(req.body.number, req.body.name, req.body.branch_id);
    return {
        status: 201,
        body: { machine, message: `Máquina #${machine.number} creada` },
    };
}));

router.patch('/machines/:id', (req, res) => saveOrFail(res, async () => {
    const machine = store.updateMachine(parseInt(req.params.id, 10), {
        name: req.body.name,
        number: req.body.number,
        active: req.body.active,
    });
    return { body: { machine, message: 'Máquina actualizada' } };
}));

router.delete('/machines/:id', (req, res) => saveOrFail(res, async () => {
    store.deleteMachine(parseInt(req.params.id, 10));
    return { body: { message: 'Máquina eliminada' } };
}));

router.get('/players', (_req, res) => res.json({ players: store.listPlayers() }));

router.post('/players', (req, res) => saveOrFail(res, async () => {
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
    return {
        status: 201,
        body: {
            player: out.user,
            username: out.user.username,
            password: out.password,
            message: `Jugador ${out.user.name} creado`,
        },
    };
}));

router.post('/players/:id/credit', (req, res) => saveOrFail(res, async () => {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) {
        const err = new Error('Monto inválido');
        err.status = 400;
        throw err;
    }
    const result = store.creditPlayer(parseInt(req.params.id, 10), amount, {
        agentId: req.user.id,
        note: req.body.note || 'Crédito agente a jugador',
    });
    return { body: { ...result, message: `$${amount} acreditados` } };
}));

module.exports = router;
