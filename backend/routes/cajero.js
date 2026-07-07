const express = require('express');
const store = require('../db/store');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function cashierRequired(req, res, next) {
    authRequired(req, res, () => {
        if (req.user.role !== 'cashier' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso de cajero requerido' });
        }
        next();
    });
}

router.use(cashierRequired);

router.get('/me', (req, res) => {
    const user = store.findUserById(req.user.id);
    res.json({
        user: store.sanitizeUser(user),
        machines: store.listMachines().filter((m) => m.active),
        recentSales: store.getTransactions(20, { cashierId: req.user.id, type: 'cash_sale' }),
    });
});

router.get('/machines', (_req, res) => {
    res.json({ machines: store.listMachines().filter((m) => m.active) });
});

router.post('/sell', (req, res) => {
    const machineId = parseInt(req.body.machineId, 10);
    const amount = parseInt(req.body.amount, 10);
    if (!machineId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Selecciona máquina y monto en pesos' });
    }
    try {
        const result = store.creditMachine(machineId, amount, {
            cashierId: req.user.id,
            cashCents: amount * 100,
            paymentMethod: 'efectivo',
            note: req.body.note || 'Venta en efectivo',
        });
        const cashier = store.findUserById(req.user.id);
        res.json({
            ...result,
            float_balance: cashier.float_balance,
            message: `$${amount} cargados a máquina #${result.machine.number}`,
        });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/sales', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 30;
    res.json({
        sales: store.getTransactions(limit, { cashierId: req.user.id, type: 'cash_sale' }),
    });
});

module.exports = router;
