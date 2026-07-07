const express = require('express');
const store = require('../db/store');
const spinWheel = require('../engines/spin-wheel');
const comicSlot = require('../engines/comic-slot');

const router = express.Router();

router.get('/machine/:number', (req, res) => {
    const m = store.findMachineByNumber(req.params.number);
    if (!m) return res.status(404).json({ error: 'Máquina no encontrada' });
    res.json({
        id: m.id,
        number: m.number,
        name: m.name,
        balance: m.balance,
        active: m.active,
        currency: 'MXN',
        minBet: store.getSettings().min_bet,
        maxBet: store.getSettings().max_bet,
    });
});

router.get('/machines', (_req, res) => {
    res.json({
        machines: store.listMachines()
            .filter((m) => m.active)
            .map((m) => ({ number: m.number, name: m.name, balance: m.balance })),
    });
});

function playGame(req, res, engine, gameName) {
    const machineNumber = parseInt(req.body.machineNumber, 10);
    const bet = parseInt(req.body.bet, 10);
    const settings = store.getSettings();

    if (!machineNumber) return res.status(400).json({ error: 'Número de máquina requerido' });
    if (!bet || bet < settings.min_bet || bet > settings.max_bet) {
        return res.status(400).json({ error: `Apuesta entre $${settings.min_bet} y $${settings.max_bet}` });
    }

    const machine = store.findMachineByNumber(machineNumber);
    if (!machine || !machine.active) return res.status(404).json({ error: 'Máquina no disponible' });

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

module.exports = router;
