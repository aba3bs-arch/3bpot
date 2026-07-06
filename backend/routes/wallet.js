const express = require('express');
const store = require('../db/store');
const { authRequired } = require('../middleware/auth');
const wallet = require('../services/wallet');

const router = express.Router();

router.get('/balance', authRequired, (req, res) => {
    res.json({
        balance: wallet.getBalance(req.user.id),
        currency: process.env.CURRENCY_NAME || 'WinCoins',
        symbol: process.env.CURRENCY_SYMBOL || 'WC',
        minBet: wallet.MIN_BET,
        maxBet: wallet.MAX_BET,
    });
});

router.get('/transactions', authRequired, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    res.json({ transactions: wallet.getTransactions(req.user.id, limit) });
});

router.get('/packages', authRequired, (_req, res) => {
    res.json({ packages: store.getPackages(true) });
});

router.post('/purchase/:packageId', authRequired, (req, res) => {
    try {
        const result = wallet.purchasePackage(req.user.id, parseInt(req.params.packageId, 10));
        res.json({
            message: `¡${result.package.coins} WinCoins acreditados!`,
            balance: result.balance,
            package: result.package,
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
