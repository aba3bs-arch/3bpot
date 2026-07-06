const express = require('express');
const { authRequired } = require('../middleware/auth');
const wallet = require('../services/wallet');
const spinWheel = require('../engines/spin-wheel');
const comicSlot = require('../engines/comic-slot');

const router = express.Router();

router.post('/spin-wheel', authRequired, (req, res) => {
    const bet = parseInt(req.body.bet, 10);
    try {
        const result = wallet.playRound(req.user.id, 'spin-wheel', bet, (b) => spinWheel.play(b));
        res.json(result);
    } catch (err) {
        const status = err.message === 'Saldo insuficiente' ? 402 : 400;
        res.status(status).json({ error: err.message });
    }
});

router.post('/comic-slot', authRequired, (req, res) => {
    const bet = parseInt(req.body.bet, 10);
    try {
        const result = wallet.playRound(req.user.id, 'comic-slot', bet, (b) => comicSlot.play(b));
        res.json(result);
    } catch (err) {
        const status = err.message === 'Saldo insuficiente' ? 402 : 400;
        res.status(status).json({ error: err.message });
    }
});

module.exports = router;
