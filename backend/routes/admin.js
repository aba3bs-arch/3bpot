const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { adminRequired } = require('../middleware/auth');

const router = express.Router();
router.use(adminRequired);

async function saveOrFail(res, work) {
    const snap = store.snapshotData();
    try {
        const payload = await work();
        await store.flushOrThrow();
        return res.status(payload.status || 200).json(payload.body);
    } catch (e) {
        // Roll back in-memory create so retry doesn't hit "ya existe" with unsaved data
        if (e.code === 'PERSIST_FAILED') {
            store.restoreSnapshot(snap);
        }
        const status = e.status || (e.code === 'PERSIST_FAILED' ? 503 : 400);
        const persist = store.getPersistStatus ? store.getPersistStatus() : null;
        const detail = e.code === 'PERSIST_FAILED' && persist && persist.lastBlobError
            ? ` (${persist.lastBlobError})`
            : '';
        return res.status(status).json({
            error: (e.message || 'Error') + detail,
            persist: e.code === 'PERSIST_FAILED' ? persist : undefined,
        });
    }
}

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

router.post('/agents', (req, res) => saveOrFail(res, async () => {
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || req.body.email || '').trim();
    const password = String(req.body.password || '').trim();
    if (!name || !username) {
        const err = new Error('Nombre y usuario requeridos');
        err.status = 400;
        throw err;
    }
    const key = username.toLowerCase().replace(/\s+/g, '');
    if (!/^[a-z0-9._-]{3,32}$/.test(key)) {
        const err = new Error('Usuario: 3-32 caracteres (letras, números, . _ -)');
        err.status = 400;
        throw err;
    }
    if (store.findUserByUsername(key)) {
        const err = new Error('Usuario ya registrado');
        err.status = 409;
        throw err;
    }
    const pwd = password && password.length >= 6 ? password : 'agente123';
    const user = store.createUser(key, bcrypt.hashSync(pwd, 10), name, 'agent', null);
    return {
        status: 201,
        body: {
            agent: store.sanitizeUser(user),
            username: user.username,
            password: pwd,
            message: `Agente ${name} creado`,
        },
    };
}));

router.post('/agents/:id/float', (req, res) => saveOrFail(res, async () => {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) {
        const err = new Error('Monto inválido');
        err.status = 400;
        throw err;
    }
    const balance = store.topUpAgent(parseInt(req.params.id, 10), amount, req.user.id, req.body.note);
    return { body: { float_balance: balance, message: `$${amount} inyectados al agente` } };
}));

router.patch('/agents/:id', (req, res) => saveOrFail(res, async () => {
    const agent = store.updateStaffUser(parseInt(req.params.id, 10), {
        name: req.body.name,
        username: req.body.username || req.body.email,
        password: req.body.password || undefined,
        active: req.body.active,
    });
    return { body: { agent, message: 'Agente actualizado' } };
}));

router.delete('/agents/:id', (req, res) => saveOrFail(res, async () => {
    store.deleteStaffUser(parseInt(req.params.id, 10));
    return { body: { message: 'Agente eliminado' } };
}));

/* —— Cajeros —— */
router.get('/cashiers', (_req, res) => res.json({ cashiers: store.listCashiers() }));

router.post('/cashiers', (req, res) => saveOrFail(res, async () => {
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || req.body.email || '').trim();
    const password = String(req.body.password || '').trim();
    const branchId = req.body.branch_id || null;
    if (!name || !username) {
        const err = new Error('Nombre y usuario requeridos');
        err.status = 400;
        throw err;
    }
    const key = username.toLowerCase().replace(/\s+/g, '');
    if (!/^[a-z0-9._-]{3,32}$/.test(key)) {
        const err = new Error('Usuario: 3-32 caracteres (letras, números, . _ -)');
        err.status = 400;
        throw err;
    }
    if (store.findUserByUsername(key)) {
        const err = new Error('Usuario ya registrado');
        err.status = 409;
        throw err;
    }
    if (!branchId) {
        const err = new Error('Asigna una sucursal al cajero');
        err.status = 400;
        throw err;
    }
    if (!store.findBranchById(branchId)) {
        const err = new Error('Sucursal no encontrada');
        err.status = 404;
        throw err;
    }
    const pwd = password && password.length >= 6 ? password : 'cajero123';
    const user = store.createUser(key, bcrypt.hashSync(pwd, 10), name, 'cashier', branchId);
    return {
        status: 201,
        body: {
            cashier: store.sanitizeUser(user),
            username: user.username,
            password: pwd,
            message: `Cajero ${name} creado · entra en /cajero/ con usuario ${user.username}`,
        },
    };
}));

router.patch('/cashiers/:id', (req, res) => saveOrFail(res, async () => {
    store.updateStaffUser(parseInt(req.params.id, 10), {
        name: req.body.name,
        username: req.body.username || req.body.email,
        password: req.body.password || undefined,
        active: req.body.active,
    });
    if (req.body.branch_id !== undefined) {
        if (req.body.branch_id) store.assignCashierToBranch(parseInt(req.params.id, 10), req.body.branch_id);
        else store.unassignCashier(parseInt(req.params.id, 10));
    }
    return {
        body: {
            cashier: store.sanitizeUser(store.findUserById(parseInt(req.params.id, 10))),
            message: 'Cajero actualizado',
        },
    };
}));

router.delete('/cashiers/:id', (req, res) => saveOrFail(res, async () => {
    store.deleteStaffUser(parseInt(req.params.id, 10));
    return { body: { message: 'Cajero eliminado' } };
}));

router.post('/cashiers/:id/float', (req, res) => saveOrFail(res, async () => {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) {
        const err = new Error('Monto inválido');
        err.status = 400;
        throw err;
    }
    const balance = store.topUpCashier(parseInt(req.params.id, 10), amount, req.user.id, req.body.note);
    return { body: { float_balance: balance, message: `$${amount} inyectados al cajero` } };
}));

/* —— Juegos (quitar de sucursales) —— */
router.get('/games', (_req, res) => {
    res.json({ catalog: store.getGamesCatalog() });
});

router.delete('/games/:gameId', (req, res) => saveOrFail(res, async () => {
    const branchId = req.query.branch_id || req.body?.branch_id || null;
    const out = store.removeGameEverywhere(req.params.gameId, branchId);
    return { body: { ...out, message: out.message } };
}));

/* —— Sucursales —— */
router.get('/branches', (_req, res) => {
    res.json({
        branches: store.listBranches().map((b) => ({
            ...store.sanitizeBranch(b),
            stats: store.branchStats(b.id),
        })),
    });
});

router.post('/branches', (req, res) => saveOrFail(res, async () => {
    try {
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
    } catch (e) {
        // Warm Lambda still holds a prior failed create — try to persist it instead of blocking
        if (e.code === 'BRANCH_EXISTS' || /ya existe/i.test(e.message || '')) {
            const existing = store.findBranchById(req.body.id);
            if (existing) {
                store.persist();
                await store.flushOrThrow();
                return {
                    status: 200,
                    body: {
                        branch: store.sanitizeBranch(existing),
                        machines: store.listMachines(existing.id),
                        message: `Sucursal ${existing.name} ya estaba creada; se sincronizó el guardado`,
                        recovered: true,
                    },
                };
            }
        }
        throw e;
    }
}));

router.post('/branches/seed', async (_req, res) => {
    if (process.env.ENABLE_DEMO_SEED !== '1') {
        return res.status(403).json({
            error: 'Seed demo desactivado. Crea sucursales manualmente desde Admin. (ENABLE_DEMO_SEED=1 para habilitar)',
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

router.patch('/branches/:id/games', (req, res) => saveOrFail(res, async () => {
    const games = store.setBranchGames(req.params.id, req.body.games);
    return { body: { games, message: 'Juegos de la sucursal actualizados' } };
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
    const balance = store.topUpBranch(req.params.id, amount, req.user.id, req.body.note);
    return { body: { float_balance: balance, message: `$${amount} inyectados a la sucursal` } };
}));

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

/* —— Cajeros (legado + panel) —— */
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
            adminId: req.user.id,
            note: 'Crédito inicial admin',
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
        adminId: req.user.id,
        note: req.body.note || 'Crédito admin a jugador',
    });
    return { body: { ...result, message: `$${amount} acreditados` } };
}));

router.get('/settings', (_req, res) => res.json({ settings: store.getSettings() }));
router.patch('/settings', (req, res) => saveOrFail(res, async () => ({
    body: { settings: store.setSettings(req.body), message: 'Configuración guardada' },
})));

router.get('/persist', (_req, res) => {
    res.json({ persist: store.getPersistStatus() });
});

router.post('/persist/sync', async (_req, res) => {
    try {
        // Mark dirty so flush runs even if a prior attempt left memory ahead of blob
        store.persist();
        const result = await store.flush();
        res.status(result && result.ok === false ? 503 : 200).json({
            result,
            persist: store.getPersistStatus(),
        });
    } catch (e) {
        res.status(503).json({
            error: e.message || 'Error al sincronizar',
            persist: store.getPersistStatus(),
        });
    }
});

module.exports = router;
