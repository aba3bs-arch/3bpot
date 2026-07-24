const express = require('express');
const store = require('../db/store');
const spinWheel = require('../engines/spin-wheel');
const comicSlot = require('../engines/comic-slot');
const crystalWins = require('../engines/crystal-wins');
const ranchoLazo = require('../engines/rancho-lazo');
const lagunaAnzuelo = require('../engines/laguna-anzuelo');
const rascadito = require('../engines/rascadito');
const desenredaCable = require('../engines/desenreda-cable');
const loteria = require('../engines/loteria');
const rompecabezas = require('../engines/rompecabezas');
const callePelea = require('../engines/calle-pelea');
const zonaLibre = require('../engines/zona-libre');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/portal', (req, res) => {
    const branchId = req.query.branch || req.query.branch_id || null;
    if (!branchId) return res.status(400).json({ error: 'Enlace de sucursal requerido' });
    if (!store.findBranchById(branchId)) {
        return res.status(404).json({ error: 'Sucursal no encontrada' });
    }
    res.json({
        games: store.getBranchGames(branchId),
        machines: store.listMachines(branchId)
            .filter((m) => m.active)
            .map((m) => ({ number: m.number, name: m.name, balance: m.balance })),
    });
});

router.get('/branches', (_req, res) => {
    res.json({
        branches: store.listBranches().map((b) => ({
            id: b.id,
            name: b.name,
            games: store.getBranchGames(b.id),
        })),
    });
});

router.get('/machine/:number', (req, res) => {
    const branchId = req.query.branch || req.query.branch_id || null;
    const m = store.findMachineByNumber(req.params.number, branchId);
    if (!m) return res.status(404).json({ error: 'Máquina no encontrada en esta sucursal' });
    if (branchId && m.branch_id !== branchId) {
        return res.status(404).json({ error: 'Máquina no encontrada en esta sucursal' });
    }
    res.json({
        id: m.id,
        number: m.number,
        name: m.name,
        balance: m.balance,
        active: m.active,
        currency: 'MXN',
        minBet: store.getSettings().min_bet,
        maxBet: store.getSettings().max_bet,
        games: store.getBranchGames(m.branch_id),
    });
});

router.get('/machines', (req, res) => {
    const branchId = req.query.branch || req.query.branch_id || null;
    res.json({
        machines: store.listMachines(branchId)
            .filter((m) => m.active)
            .map((m) => ({
                number: m.number,
                name: m.name,
                balance: m.balance,
            })),
    });
});

function playGame(req, res, engine, gameName) {
    const machineNumber = parseInt(req.body.machineNumber, 10);
    const branchId = req.body.branch_id || req.body.branch || null;
    const bet = parseInt(req.body.bet, 10);
    const settings = store.getSettings();

    if (!machineNumber) return res.status(400).json({ error: 'Número de máquina requerido' });
    if (!branchId) return res.status(400).json({ error: 'Sucursal requerida' });
    if (!bet || bet < settings.min_bet || bet > settings.max_bet) {
        return res.status(400).json({ error: `Apuesta entre $${settings.min_bet} y $${settings.max_bet}` });
    }

    const machine = store.findMachineByNumber(machineNumber, branchId);
    if (!machine || !machine.active) return res.status(404).json({ error: 'Máquina no disponible' });
    if (machine.branch_id !== branchId) {
        return res.status(404).json({ error: 'Máquina no disponible en este portal' });
    }

    try {
        const result = engine.play(bet, settings.retention_percent);
        const out = store.playMachine(machine.id, bet, gameName, result);
        res.json(out);
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
}

router.post('/spin-wheel', (req, res) => playGame(req, res, spinWheel, 'spin-wheel'));
router.post('/comic-slot', (req, res) => playGame(req, res, comicSlot, 'comic-slot'));
router.post('/crystal-wins', (req, res) => playGame(req, res, crystalWins, 'crystal-wins'));
router.post('/rancho-lazo', (req, res) => playGame(req, res, ranchoLazo, 'rancho-lazo'));
router.post('/laguna-anzuelo', (req, res) => playGame(req, res, lagunaAnzuelo, 'laguna-anzuelo'));

function playScratchGame(req, res, gameName) {
    const machineNumber = parseInt(req.body.machineNumber, 10);
    const branchId = req.body.branch_id || req.body.branch || null;
    const bet = parseInt(req.body.bet, 10);
    const settings = store.getSettings();

    if (!machineNumber) return res.status(400).json({ error: 'Número de máquina requerido' });
    if (!branchId) return res.status(400).json({ error: 'Sucursal requerida' });
    if (!bet || bet < settings.min_bet || bet > settings.max_bet) {
        return res.status(400).json({ error: `Apuesta entre $${settings.min_bet} y $${settings.max_bet}` });
    }

    const machine = store.findMachineByNumber(machineNumber, branchId);
    if (!machine || !machine.active) return res.status(404).json({ error: 'Máquina no disponible' });
    if (machine.branch_id !== branchId) {
        return res.status(404).json({ error: 'Máquina no disponible en este portal' });
    }

    try {
        const poolInfo = store.getScratchPrizePool(branchId);
        const result = rascadito.play(bet, settings.retention_percent, poolInfo);
        const out = store.playMachine(machine.id, bet, gameName, result);
        res.json({ ...out, prizePool: poolInfo, poolAvailableAfter: result.poolAvailableAfter });
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
}

function playScratchUserGame(req, res, gameName) {
    const bet = parseInt(req.body.bet, 10);
    const settings = store.getSettings();
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo usuarios jugadores' });
    if (!bet || bet < settings.min_bet || bet > settings.max_bet) {
        return res.status(400).json({ error: `Apuesta entre $${settings.min_bet} y $${settings.max_bet}` });
    }
    try {
        const poolInfo = store.getScratchPrizePool(null, req.user.id);
        const result = rascadito.play(bet, settings.retention_percent, poolInfo);
        const out = store.playUser(req.user.id, bet, gameName, result);
        res.json({ ...out, prizePool: poolInfo, poolAvailableAfter: result.poolAvailableAfter });
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
}

router.get('/rascadito/pool', (req, res) => {
    const branchId = req.query.branch || req.query.branch_id || null;
    if (branchId) {
        if (!store.findBranchById(branchId)) return res.status(404).json({ error: 'Sucursal no encontrada' });
        return res.json(store.getScratchPrizePool(branchId));
    }
    res.status(400).json({ error: 'Sucursal requerida' });
});

router.post('/rascadito', (req, res) => playScratchGame(req, res, 'rascadito'));

const CABLE_BETS = [1, 2, 5, 10, 15, 20];

function validateCableBet(bet) {
    return CABLE_BETS.includes(bet);
}

router.post('/desenreda-cable/start', (req, res) => {
    const machineNumber = parseInt(req.body.machineNumber, 10);
    const branchId = req.body.branch_id || req.body.branch || null;
    const bet = parseInt(req.body.bet, 10);
    const settings = store.getSettings();

    if (!machineNumber) return res.status(400).json({ error: 'Número de máquina requerido' });
    if (!branchId) return res.status(400).json({ error: 'Sucursal requerida' });
    if (!validateCableBet(bet)) {
        return res.status(400).json({ error: 'Apuesta de cable: $1, $2, $5, $10, $15 o $20' });
    }

    const machine = store.findMachineByNumber(machineNumber, branchId);
    if (!machine || !machine.active) return res.status(404).json({ error: 'Máquina no disponible' });

    try {
        const puzzle = desenredaCable.generatePuzzle(bet, settings.retention_percent);
        const out = store.startCableSessionMachine(machine.id, bet, puzzle.knots);
        res.json({
            ...desenredaCable.publicSession(out.session),
            balance: out.balance,
            machine_number: out.machine_number,
        });
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
});

router.post('/desenreda-cable/pull', (req, res) => {
    const machineNumber = parseInt(req.body.machineNumber, 10);
    const branchId = req.body.branch_id || req.body.branch || null;
    const sessionId = parseInt(req.body.sessionId, 10);
    const end = req.body.end;

    if (!machineNumber || !sessionId) return res.status(400).json({ error: 'Datos incompletos' });
    const machine = store.findMachineByNumber(machineNumber, branchId);
    if (!machine) return res.status(404).json({ error: 'Máquina no encontrada' });

    try {
        const out = store.pullCableSession(sessionId, end, { machineId: machine.id });
        res.json(out);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/user/desenreda-cable/start', authRequired, (req, res) => {
    const bet = parseInt(req.body.bet, 10);
    const settings = store.getSettings();
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!validateCableBet(bet)) {
        return res.status(400).json({ error: 'Apuesta de cable: $1, $2, $5, $10, $15 o $20' });
    }
    try {
        const puzzle = desenredaCable.generatePuzzle(bet, settings.retention_percent);
        const out = store.startCableSessionUser(req.user.id, bet, puzzle.knots);
        res.json({
            ...desenredaCable.publicSession(out.session),
            balance: out.balance,
            user_name: out.user_name,
        });
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
});

router.post('/user/desenreda-cable/pull', authRequired, (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const end = req.body.end;
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const out = store.pullCableSession(sessionId, end, { userId: req.user.id });
        res.json(out);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

function validatePuzzleBet(bet) {
    return rompecabezas.BETS.includes(bet);
}

function puzzleOwnerFromMachine(req) {
    const machineNumber = parseInt(req.body.machineNumber, 10);
    const branchId = req.body.branch_id || req.body.branch || null;
    if (!machineNumber) throw Object.assign(new Error('Número de máquina requerido'), { status: 400 });
    if (!branchId) throw Object.assign(new Error('Sucursal requerida'), { status: 400 });
    const machine = store.findMachineByNumber(machineNumber, branchId);
    if (!machine || !machine.active) throw Object.assign(new Error('Máquina no disponible'), { status: 404 });
    return { machineId: machine.id };
}

router.post('/rompecabezas/start', (req, res) => {
    const bet = parseInt(req.body.bet, 10);
    const restart = !!req.body.restart;
    const settings = store.getSettings();
    if (!validatePuzzleBet(bet)) {
        return res.status(400).json({ error: 'Apuesta: $1, $2, $5, $10, $15 o $20' });
    }
    try {
        const owner = puzzleOwnerFromMachine(req);
        const out = store.startPuzzleSession(owner, bet, settings.retention_percent, { restart });
        res.json(out);
    } catch (e) {
        const status = e.status || (e.message.includes('insuficiente') ? 402 : 400);
        res.status(status).json({ error: e.message });
    }
});

router.post('/rompecabezas/move', (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const tileIndex = req.body.tileIndex;
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const owner = puzzleOwnerFromMachine(req);
        const out = store.movePuzzleSession(sessionId, tileIndex, owner);
        res.json(out);
    } catch (e) {
        const status = e.status || 400;
        res.status(status).json({ error: e.message });
    }
});

router.post('/rompecabezas/retry', (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const settings = store.getSettings();
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const owner = puzzleOwnerFromMachine(req);
        const out = store.retryPuzzleLevel(sessionId, owner, settings.retention_percent);
        res.json(out);
    } catch (e) {
        const status = e.status || (e.message.includes('insuficiente') ? 402 : 400);
        res.status(status).json({ error: e.message });
    }
});

router.post('/user/rompecabezas/start', authRequired, (req, res) => {
    const bet = parseInt(req.body.bet, 10);
    const restart = !!req.body.restart;
    const settings = store.getSettings();
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!validatePuzzleBet(bet)) {
        return res.status(400).json({ error: 'Apuesta: $1, $2, $5, $10, $15 o $20' });
    }
    try {
        const out = store.startPuzzleSession(
            { userId: req.user.id },
            bet,
            settings.retention_percent,
            { restart }
        );
        res.json(out);
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
});

router.post('/user/rompecabezas/move', authRequired, (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const tileIndex = req.body.tileIndex;
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const out = store.movePuzzleSession(sessionId, tileIndex, { userId: req.user.id });
        res.json(out);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/user/rompecabezas/retry', authRequired, (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const settings = store.getSettings();
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const out = store.retryPuzzleLevel(sessionId, { userId: req.user.id }, settings.retention_percent);
        res.json(out);
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
});

function validateFightBet(bet) {
    return callePelea.BETS.includes(bet);
}

router.post('/calle-pelea/start', (req, res) => {
    const bet = parseInt(req.body.bet, 10);
    const restart = !!req.body.restart;
    const settings = store.getSettings();
    if (!validateFightBet(bet)) {
        return res.status(400).json({ error: 'Apuesta: $1, $2, $5, $10, $15 o $20' });
    }
    try {
        const owner = puzzleOwnerFromMachine(req);
        const out = store.startFightSession(owner, bet, settings.retention_percent, { restart });
        res.json(out);
    } catch (e) {
        const status = e.status || (e.message.includes('insuficiente') ? 402 : 400);
        res.status(status).json({ error: e.message });
    }
});

router.post('/calle-pelea/action', (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const action = req.body.action;
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const owner = puzzleOwnerFromMachine(req);
        const out = store.actionFightSession(sessionId, action, owner);
        res.json(out);
    } catch (e) {
        const status = e.status || 400;
        res.status(status).json({ error: e.message });
    }
});

router.post('/calle-pelea/retry', (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const settings = store.getSettings();
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const owner = puzzleOwnerFromMachine(req);
        const out = store.retryFightLevel(sessionId, owner, settings.retention_percent);
        res.json(out);
    } catch (e) {
        const status = e.status || (e.message.includes('insuficiente') ? 402 : 400);
        res.status(status).json({ error: e.message });
    }
});

router.post('/user/calle-pelea/start', authRequired, (req, res) => {
    const bet = parseInt(req.body.bet, 10);
    const restart = !!req.body.restart;
    const settings = store.getSettings();
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!validateFightBet(bet)) {
        return res.status(400).json({ error: 'Apuesta: $1, $2, $5, $10, $15 o $20' });
    }
    try {
        const out = store.startFightSession(
            { userId: req.user.id },
            bet,
            settings.retention_percent,
            { restart }
        );
        res.json(out);
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
});

router.post('/user/calle-pelea/action', authRequired, (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const action = req.body.action;
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const out = store.actionFightSession(sessionId, action, { userId: req.user.id });
        res.json(out);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/user/calle-pelea/retry', authRequired, (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const settings = store.getSettings();
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const out = store.retryFightLevel(sessionId, { userId: req.user.id }, settings.retention_percent);
        res.json(out);
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
});

function validateZoneBet(bet) {
    return zonaLibre.BETS.includes(bet);
}

router.post('/zona-libre/start', (req, res) => {
    const bet = parseInt(req.body.bet, 10);
    const restart = !!req.body.restart;
    const settings = store.getSettings();
    if (!validateZoneBet(bet)) {
        return res.status(400).json({ error: 'Apuesta: $1, $2, $5, $10, $15 o $20' });
    }
    try {
        const owner = puzzleOwnerFromMachine(req);
        const out = store.startZoneSession(owner, bet, settings.retention_percent, { restart });
        res.json(out);
    } catch (e) {
        const status = e.status || (e.message.includes('insuficiente') ? 402 : 400);
        res.status(status).json({ error: e.message });
    }
});

router.post('/zona-libre/complete', (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const owner = puzzleOwnerFromMachine(req);
        const out = store.completeZoneSession(sessionId, {
            kills: req.body.kills,
            survived: req.body.survived,
            playerHp: req.body.playerHp,
            elapsed: req.body.elapsed,
        }, owner);
        res.json(out);
    } catch (e) {
        const status = e.status || 400;
        res.status(status).json({ error: e.message });
    }
});

router.post('/zona-libre/retry', (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const settings = store.getSettings();
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const owner = puzzleOwnerFromMachine(req);
        const out = store.retryZoneLevel(sessionId, owner, settings.retention_percent);
        res.json(out);
    } catch (e) {
        const status = e.status || (e.message.includes('insuficiente') ? 402 : 400);
        res.status(status).json({ error: e.message });
    }
});

router.post('/user/zona-libre/start', authRequired, (req, res) => {
    const bet = parseInt(req.body.bet, 10);
    const restart = !!req.body.restart;
    const settings = store.getSettings();
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!validateZoneBet(bet)) {
        return res.status(400).json({ error: 'Apuesta: $1, $2, $5, $10, $15 o $20' });
    }
    try {
        const out = store.startZoneSession(
            { userId: req.user.id },
            bet,
            settings.retention_percent,
            { restart }
        );
        res.json(out);
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
});

router.post('/user/zona-libre/complete', authRequired, (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const out = store.completeZoneSession(sessionId, {
            kills: req.body.kills,
            survived: req.body.survived,
            playerHp: req.body.playerHp,
            elapsed: req.body.elapsed,
        }, { userId: req.user.id });
        res.json(out);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/user/zona-libre/retry', authRequired, (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const settings = store.getSettings();
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo jugadores' });
    if (!sessionId) return res.status(400).json({ error: 'Sesión requerida' });
    try {
        const out = store.retryZoneLevel(sessionId, { userId: req.user.id }, settings.retention_percent);
        res.json(out);
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
});

function playUserGame(req, res, engine, gameName) {
    const bet = parseInt(req.body.bet, 10);
    const settings = store.getSettings();
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Solo usuarios jugadores' });
    if (!bet || bet < settings.min_bet || bet > settings.max_bet) {
        return res.status(400).json({ error: `Apuesta entre $${settings.min_bet} y $${settings.max_bet}` });
    }
    try {
        const result = engine.play(bet, settings.retention_percent);
        const out = store.playUser(req.user.id, bet, gameName, result);
        res.json(out);
    } catch (e) {
        const status = e.message.includes('insuficiente') ? 402 : 400;
        res.status(status).json({ error: e.message });
    }
}

router.post('/user/spin-wheel', authRequired, (req, res) => playUserGame(req, res, spinWheel, 'spin-wheel'));
router.post('/user/comic-slot', authRequired, (req, res) => playUserGame(req, res, comicSlot, 'comic-slot'));
router.post('/user/crystal-wins', authRequired, (req, res) => playUserGame(req, res, crystalWins, 'crystal-wins'));
router.post('/user/rancho-lazo', authRequired, (req, res) => playUserGame(req, res, ranchoLazo, 'rancho-lazo'));
router.post('/user/laguna-anzuelo', authRequired, (req, res) => playUserGame(req, res, lagunaAnzuelo, 'laguna-anzuelo'));
router.post('/user/rascadito', authRequired, (req, res) => playScratchUserGame(req, res, 'rascadito'));
router.post('/loteria', (req, res) => playGame(req, res, loteria, 'loteria'));
router.post('/user/loteria', authRequired, (req, res) => playUserGame(req, res, loteria, 'loteria'));

module.exports = router;
