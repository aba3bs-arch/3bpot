const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data.json');
const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

function emptyData() {
    return {
        users: [],
        wallets: [],
        transactions: [],
        game_rounds: [],
        credit_packages: [],
        counters: { users: 0, transactions: 0, game_rounds: 0, credit_packages: 0 },
    };
}

let data = emptyData();
let dirty = false;

function loadFromFile() {
    if (!fs.existsSync(DB_FILE)) return emptyData();
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
        return emptyData();
    }
}

async function loadFromBlob() {
    const { getStore } = require('@netlify/blobs');
    const blobStore = getStore({ name: 'winpot-db', consistency: 'strong' });
    const stored = await blobStore.get('data', { type: 'json' });
    return stored || emptyData();
}

async function saveToBlob() {
    const { getStore } = require('@netlify/blobs');
    const blobStore = getStore({ name: 'winpot-db', consistency: 'strong' });
    await blobStore.setJSON('data', data);
}

function persist() {
    if (isServerless) {
        dirty = true;
        return;
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function initLocal() {
    data = loadFromFile();
    seedDefaults();
}

async function reload() {
    data = isServerless ? await loadFromBlob() : loadFromFile();
    seedDefaults();
}

async function flush() {
    if (!dirty) return;
    if (isServerless) {
        await saveToBlob();
        dirty = false;
    }
}

function nextId(key) {
    data.counters[key] = (data.counters[key] || 0) + 1;
    return data.counters[key];
}

function now() {
    return new Date().toISOString();
}

function findUserByEmail(email) {
    return data.users.find((u) => u.email === email.toLowerCase()) || null;
}

function findUserById(id) {
    return data.users.find((u) => u.id === id) || null;
}

function createUser(email, passwordHash, name, role = 'user') {
    const user = {
        id: nextId('users'),
        email: email.toLowerCase(),
        password_hash: passwordHash,
        name,
        role,
        active: 1,
        created_at: now(),
    };
    data.users.push(user);
    persist();
    return user;
}

function listUsers(q) {
    let users = data.users.map((u) => ({
        ...u,
        balance: getBalance(u.id),
    }));
    if (q) {
        const term = q.toLowerCase();
        users = users.filter((u) =>
            u.email.includes(term) || u.name.toLowerCase().includes(term)
        );
    }
    return users.sort((a, b) => b.id - a.id).slice(0, 100);
}

function setUserActive(id, active) {
    const user = findUserById(id);
    if (!user) return null;
    user.active = active ? 1 : 0;
    persist();
    return user;
}

function createWallet(userId, balance = 0) {
    const wallet = { user_id: userId, balance, updated_at: now() };
    data.wallets.push(wallet);
    persist();
    return wallet;
}

function getBalance(userId) {
    const w = data.wallets.find((x) => x.user_id === userId);
    return w ? w.balance : 0;
}

function setBalance(userId, balance) {
    const w = data.wallets.find((x) => x.user_id === userId);
    if (w) {
        w.balance = balance;
        w.updated_at = now();
        persist();
    }
}

function getWallet(userId) {
    const user = findUserById(userId);
    if (!user) return null;
    return {
        balance: getBalance(userId),
        updated_at: data.wallets.find((w) => w.user_id === userId)?.updated_at,
        email: user.email,
        name: user.name,
        role: user.role,
    };
}

function addTransaction(row) {
    const tx = {
        id: nextId('transactions'),
        created_at: now(),
        ...row,
    };
    data.transactions.push(tx);
    persist();
    return tx;
}

function getTransactions(userId, limit = 50) {
    return data.transactions
        .filter((t) => t.user_id === userId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(({ id, type, amount, balance_after, game, note, created_at }) =>
            ({ id, type, amount, balance_after, game, note, created_at })
        );
}

function getAllTransactions(limit = 100) {
    return data.transactions
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map((t) => {
            const u = findUserById(t.user_id);
            return { ...t, email: u?.email, name: u?.name };
        });
}

function addGameRound(row) {
    const round = { id: nextId('game_rounds'), created_at: now(), ...row };
    data.game_rounds.push(round);
    persist();
    return round;
}

function getStats() {
    const today = new Date().toISOString().slice(0, 10);
    const roundsToday = data.game_rounds.filter((r) => r.created_at.startsWith(today));
    const users = data.users.filter((u) => u.role === 'user').length;
    const totalBalance = data.wallets.reduce((s, w) => s + w.balance, 0);
    const betsToday = roundsToday.reduce((s, r) => s + r.bet, 0);
    const payoutsToday = roundsToday.reduce((s, r) => s + r.payout, 0);

    const cashSales = data.transactions.filter((t) => t.type === 'cash_sale');
    const cashSalesToday = cashSales.filter((t) => t.created_at.startsWith(today));
    const cashRevenueToday = cashSalesToday.reduce((s, t) => s + (t.cash_cents || 0), 0);
    const wcSoldToday = cashSalesToday.reduce((s, t) => s + t.amount, 0);
    const totalCashRevenue = cashSales.reduce((s, t) => s + (t.cash_cents || 0), 0);
    const totalWcSold = cashSales.reduce((s, t) => s + t.amount, 0);

    return {
        users,
        totalBalance,
        roundsToday: roundsToday.length,
        betsToday,
        payoutsToday,
        houseProfitToday: betsToday - payoutsToday,
        roundsTotal: data.game_rounds.length,
        cashSalesToday: cashSalesToday.length,
        cashRevenueToday,
        wcSoldToday,
        totalCashRevenue,
        totalWcSold,
    };
}

function getCashSales(limit = 30) {
    return data.transactions
        .filter((t) => t.type === 'cash_sale')
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map((t) => {
            const u = findUserById(t.user_id);
            return {
                id: t.id,
                created_at: t.created_at,
                user_id: t.user_id,
                name: u?.name,
                email: u?.email,
                coins: t.amount,
                cash_cents: t.cash_cents,
                payment_method: t.payment_method,
                note: t.note,
            };
        });
}

function updatePackage(id, updates) {
    const pkg = findPackage(id);
    if (!pkg) return null;
    if (updates.name != null) pkg.name = String(updates.name).trim();
    if (updates.coins != null) pkg.coins = parseInt(updates.coins, 10);
    if (updates.price_cents != null) pkg.price_cents = parseInt(updates.price_cents, 10);
    if (updates.active != null) pkg.active = updates.active ? 1 : 0;
    persist();
    return pkg;
}

function getUserRounds(userId, limit = 20) {
    return data.game_rounds
        .filter((r) => r.user_id === userId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(({ game, bet, payout, net, created_at }) => ({ game, bet, payout, net, created_at }));
}

function getPackages(activeOnly = false) {
    let pkgs = [...data.credit_packages];
    if (activeOnly) pkgs = pkgs.filter((p) => p.active);
    return pkgs.sort((a, b) => a.sort_order - b.sort_order);
}

function findPackage(id) {
    return data.credit_packages.find((p) => p.id === id) || null;
}

function seedDefaults() {
    if (data.credit_packages.length === 0) {
        const pkgs = [
            { name: 'Starter', coins: 500, price_cents: 499, sort_order: 1 },
            { name: 'Popular', coins: 1200, price_cents: 999, sort_order: 2 },
            { name: 'Pro', coins: 3000, price_cents: 1999, sort_order: 3 },
            { name: 'Mega', coins: 8000, price_cents: 4999, sort_order: 4 },
        ];
        pkgs.forEach((p) => {
            data.credit_packages.push({ id: nextId('credit_packages'), active: 1, ...p });
        });
        persist();
    }

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@winpot.local').toLowerCase();
    if (!findUserByEmail(adminEmail)) {
        const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
        const admin = createUser(adminEmail, hash, 'Administrador', 'admin');
        createWallet(admin.id, 10000);
    }
}

module.exports = {
    isServerless,
    initLocal,
    reload,
    flush,
    findUserByEmail,
    findUserById,
    createUser,
    listUsers,
    setUserActive,
    createWallet,
    getBalance,
    setBalance,
    getWallet,
    addTransaction,
    getTransactions,
    getAllTransactions,
    addGameRound,
    getStats,
    getCashSales,
    getUserRounds,
    getPackages,
    findPackage,
    updatePackage,
};
