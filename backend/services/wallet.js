const store = require('../db/store');

const MIN_BET = 5;
const MAX_BET = 500;

function getBalance(userId) {
    return store.getBalance(userId);
}

function getWallet(userId) {
    return store.getWallet(userId);
}

function recordTransaction(userId, type, amount, balanceAfter, opts = {}) {
    store.addTransaction({
        user_id: userId,
        type,
        amount,
        balance_after: balanceAfter,
        game: opts.game || null,
        note: opts.note || null,
        admin_id: opts.adminId || null,
    });
}

function credit(userId, amount, type, note, adminId) {
    if (amount <= 0) throw new Error('El monto debe ser positivo');
    const newBalance = getBalance(userId) + amount;
    store.setBalance(userId, newBalance);
    recordTransaction(userId, type, amount, newBalance, { note, adminId });
    return newBalance;
}

function debit(userId, amount, type, opts = {}) {
    if (amount <= 0) throw new Error('El monto debe ser positivo');
    const current = getBalance(userId);
    if (current < amount) throw new Error('Saldo insuficiente');
    const newBalance = current - amount;
    store.setBalance(userId, newBalance);
    recordTransaction(userId, type, -amount, newBalance, opts);
    return newBalance;
}

function playRound(userId, game, bet, enginePlay) {
    if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
        throw new Error(`Apuesta entre ${MIN_BET} y ${MAX_BET} WinCoins`);
    }

    const current = getBalance(userId);
    if (current < bet) throw new Error('Saldo insuficiente');

    const result = enginePlay(bet);
    let balanceAfter = current - bet;
    store.setBalance(userId, balanceAfter);
    recordTransaction(userId, 'bet', -bet, balanceAfter, { game });

    if (result.payout > 0) {
        balanceAfter += result.payout;
        store.setBalance(userId, balanceAfter);
        recordTransaction(userId, 'win', result.payout, balanceAfter, { game });
    }

    store.addGameRound({
        user_id: userId,
        game,
        bet,
        payout: result.payout,
        net: result.net,
        result_json: JSON.stringify(result),
    });

    return { ...result, balance: balanceAfter };
}

function getTransactions(userId, limit = 50) {
    return store.getTransactions(userId, limit);
}

function purchasePackage(userId, packageId) {
    const pkg = store.findPackage(packageId);
    if (!pkg || !pkg.active) throw new Error('Paquete no encontrado');

    const balance = credit(
        userId,
        pkg.coins,
        'purchase',
        `Compra: ${pkg.name} (${pkg.coins} WC)`,
        null
    );

    return { package: pkg, balance };
}

module.exports = {
    MIN_BET,
    MAX_BET,
    getBalance,
    getWallet,
    credit,
    debit,
    playRound,
    getTransactions,
    purchasePackage,
};
