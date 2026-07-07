const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data.json');
const TMP_DB = path.join('/tmp', 'winpot-data.json');
const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

function emptyData() {
    return {
        settings: { retention_percent: 15, min_bet: 5, max_bet: 500 },
        machines: [],
        users: [],
        transactions: [],
        game_rounds: [],
        counters: { users: 0, machines: 0, transactions: 0, game_rounds: 0 },
    };
}

let data = emptyData();
let dirty = false;

function loadFromFile(filePath) {
    if (!fs.existsSync(filePath)) return emptyData();
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!raw.settings) raw.settings = emptyData().settings;
        if (!raw.machines) raw.machines = [];
        return raw;
    } catch {
        return emptyData();
    }
}

async function loadFromBlob() {
    const { getStore } = require('@netlify/blobs');
    const blobStore = getStore('winpot-db');
    const stored = await blobStore.get('data', { type: 'json' });
    if (!stored) return emptyData();
    if (!stored.settings) stored.settings = emptyData().settings;
    if (!stored.machines) stored.machines = [];
    return stored;
}

async function saveToBlob() {
    const { getStore } = require('@netlify/blobs');
    await getStore('winpot-db').setJSON('data', data);
}

function persist() { if (isServerless) dirty = true; else saveToFile(DB_FILE); }
function saveToFile(fp) { fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8'); }

function initLocal() { data = loadFromFile(DB_FILE); seedDefaults(); }

async function reload() {
    if (isServerless) {
        try { data = await loadFromBlob(); } catch (e) {
            console.warn('[store] blob load:', e.message);
            data = loadFromFile(TMP_DB);
        }
    } else data = loadFromFile(DB_FILE);
    seedDefaults();
}

async function flush() {
    if (!dirty) return;
    try { await saveToBlob(); } catch (e) {
        console.warn('[store] blob save:', e.message);
        saveToFile(TMP_DB);
    }
    dirty = false;
}

function nextId(key) { data.counters[key] = (data.counters[key] || 0) + 1; return data.counters[key]; }
function now() { return new Date().toISOString(); }

function getSettings() { return { ...data.settings }; }

function setSettings(updates) {
    if (updates.retention_percent != null) {
        data.settings.retention_percent = Math.max(5, Math.min(45, parseInt(updates.retention_percent, 10)));
    }
    if (updates.min_bet != null) data.settings.min_bet = parseInt(updates.min_bet, 10);
    if (updates.max_bet != null) data.settings.max_bet = parseInt(updates.max_bet, 10);
    persist();
    return getSettings();
}

/* Users */
function findUserByEmail(email) {
    return data.users.find((u) => u.email === email.toLowerCase()) || null;
}
function findUserById(id) { return data.users.find((u) => u.id === id) || null; }

function createUser(email, passwordHash, name, role = 'cashier') {
    const user = {
        id: nextId('users'),
        email: email.toLowerCase(),
        password_hash: passwordHash,
        name: String(name).trim(),
        role,
        float_balance: role === 'cashier' ? 0 : 0,
        active: 1,
        created_at: now(),
    };
    data.users.push(user);
    persist();
    return user;
}

function listCashiers() {
    return data.users.filter((u) => u.role === 'cashier').map(sanitizeUser);
}

function sanitizeUser(u) {
    return {
        id: u.id, email: u.email, name: u.name, role: u.role,
        float_balance: u.float_balance || 0, active: u.active, created_at: u.created_at,
    };
}

function setUserActive(id, active) {
    const u = findUserById(id);
    if (!u) return null;
    u.active = active ? 1 : 0;
    persist();
    return u;
}

function topUpCashier(cashierId, amount, adminId, note) {
    const c = findUserById(cashierId);
    if (!c || c.role !== 'cashier') throw new Error('Cajero no encontrado');
    if (amount <= 0) throw new Error('Monto inválido');
    c.float_balance = (c.float_balance || 0) + amount;
    addTransaction({
        user_id: cashierId, type: 'float_topup', amount, balance_after: c.float_balance,
        note: note || 'Recarga de caja', admin_id: adminId,
    });
    persist();
    return c.float_balance;
}

/* Machines */
function findMachineByNumber(num) {
    return data.machines.find((m) => m.number === parseInt(num, 10)) || null;
}
function findMachineById(id) { return data.machines.find((m) => m.id === id) || null; }

function listMachines() {
    return [...data.machines].sort((a, b) => a.number - b.number);
}

function createMachine(number, name) {
    const num = parseInt(number, 10);
    if (findMachineByNumber(num)) throw new Error(`Máquina #${num} ya existe`);
    const machine = {
        id: nextId('machines'),
        number: num,
        name: name || `Máquina ${num}`,
        balance: 0,
        active: 1,
        created_at: now(),
    };
    data.machines.push(machine);
    persist();
    return machine;
}

function setMachineActive(id, active) {
    const m = findMachineById(id);
    if (!m) return null;
    m.active = active ? 1 : 0;
    persist();
    return m;
}

function creditMachine(machineId, amount, opts = {}) {
    const m = findMachineById(machineId);
    if (!m) throw new Error('Máquina no encontrada');
    if (!m.active) throw new Error('Máquina inactiva');
    if (amount <= 0) throw new Error('Monto inválido');

    if (opts.cashierId) {
        const c = findUserById(opts.cashierId);
        if (!c || c.role !== 'cashier') throw new Error('Cajero inválido');
        if ((c.float_balance || 0) < amount) throw new Error('El cajero no tiene saldo suficiente en caja');
        c.float_balance -= amount;
    }

    m.balance += amount;
    addTransaction({
        user_id: opts.cashierId || null,
        machine_id: machineId,
        type: 'cash_sale',
        amount,
        balance_after: m.balance,
        cash_cents: opts.cashCents ?? amount * 100,
        payment_method: opts.paymentMethod || 'efectivo',
        note: opts.note || `Venta a máquina #${m.number}`,
        admin_id: opts.adminId || null,
    });
    persist();
    return { machine: m, balance: m.balance };
}

function adjustMachineBalance(machineId, amount, adminId, note) {
    const m = findMachineById(machineId);
    if (!m) throw new Error('Máquina no encontrada');
    m.balance = Math.max(0, m.balance + amount);
    addTransaction({
        machine_id: machineId, type: amount >= 0 ? 'admin_credit' : 'admin_debit',
        amount, balance_after: m.balance, note, admin_id: adminId,
    });
    persist();
    return m.balance;
}

function playMachine(machineId, bet, game, result) {
    const m = findMachineById(machineId);
    if (!m || !m.active) throw new Error('Máquina no disponible');
    if (m.balance < bet) throw new Error('Saldo insuficiente en la máquina');

    m.balance -= bet;
    addTransaction({ machine_id: machineId, type: 'bet', amount: -bet, balance_after: m.balance, game });

    if (result.payout > 0) {
        m.balance += result.payout;
        addTransaction({ machine_id: machineId, type: 'win', amount: result.payout, balance_after: m.balance, game });
    }

    addGameRound({ machine_id: machineId, game, bet, payout: result.payout, net: result.net, result_json: JSON.stringify(result) });
    persist();
    return { ...result, balance: m.balance, machine_number: m.number };
}

/* Transactions */
function addTransaction(row) {
    const tx = { id: nextId('transactions'), created_at: now(), ...row };
    data.transactions.push(tx);
    return tx;
}

function getTransactions(limit = 100, filter = {}) {
    let list = [...data.transactions];
    if (filter.cashierId) list = list.filter((t) => t.user_id === filter.cashierId);
    if (filter.machineId) list = list.filter((t) => t.machine_id === filter.machineId);
    if (filter.type) list = list.filter((t) => t.type === filter.type);
    return list.sort((a, b) => b.id - a.id).slice(0, limit).map(enrichTx);
}

function enrichTx(t) {
    const out = { ...t };
    if (t.user_id) {
        const u = findUserById(t.user_id);
        out.user_name = u?.name;
        out.user_email = u?.email;
    }
    if (t.machine_id) {
        const m = findMachineById(t.machine_id);
        out.machine_number = m?.number;
        out.machine_name = m?.name;
    }
    return out;
}

function addGameRound(row) {
    const round = { id: nextId('game_rounds'), created_at: now(), ...row };
    data.game_rounds.push(round);
    return round;
}

function getStats() {
    const today = new Date().toISOString().slice(0, 10);
    const txsToday = data.transactions.filter((t) => t.created_at.startsWith(today));
    const salesToday = txsToday.filter((t) => t.type === 'cash_sale');
    const cashToday = salesToday.reduce((s, t) => s + (t.cash_cents || t.amount * 100), 0);
    const betsToday = txsToday.filter((t) => t.type === 'bet').reduce((s, t) => s + Math.abs(t.amount), 0);
    const winsToday = txsToday.filter((t) => t.type === 'win').reduce((s, t) => s + t.amount, 0);
    const machineBalance = data.machines.reduce((s, m) => s + m.balance, 0);
    const cashierFloat = data.users.filter((u) => u.role === 'cashier').reduce((s, u) => s + (u.float_balance || 0), 0);

    return {
        machines: data.machines.filter((m) => m.active).length,
        machineBalance,
        cashierFloat,
        salesToday: salesToday.length,
        cashToday,
        betsToday,
        winsToday,
        houseToday: betsToday - winsToday,
        retention: data.settings.retention_percent,
        cashiers: data.users.filter((u) => u.role === 'cashier' && u.active).length,
    };
}

function ensureAdminUser() {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@winpot.local').toLowerCase();
    const desiredPassword = process.env.ADMIN_PASSWORD || 'admin123';
    let admin = findUserByEmail(adminEmail);

    if (!admin) {
        createUser(adminEmail, bcrypt.hashSync(desiredPassword, 10), 'Administrador', 'admin');
        data.settings.admin_password_seed = desiredPassword;
        persist();
        return;
    }

    admin.role = 'admin';
    admin.active = 1;

    if (data.settings.admin_password_seed !== desiredPassword) {
        admin.password_hash = bcrypt.hashSync(desiredPassword, 10);
        data.settings.admin_password_seed = desiredPassword;
        persist();
    }
}

function ensureCashierUser() {
    const demoCashier = (process.env.CASHIER_EMAIL || 'cajero@winpot.local').toLowerCase();
    const desiredPassword = process.env.CASHIER_PASSWORD || 'cajero123';
    let cashier = findUserByEmail(demoCashier);

    if (!cashier) {
        const c = createUser(demoCashier, bcrypt.hashSync(desiredPassword, 10), 'Cajero Demo', 'cashier');
        c.float_balance = 5000;
        data.settings.cashier_password_seed = desiredPassword;
        persist();
        return;
    }

    cashier.role = 'cashier';
    cashier.active = 1;
    if ((cashier.float_balance || 0) === 0 && data.transactions.length === 0) {
        cashier.float_balance = 5000;
    }

    if (data.settings.cashier_password_seed !== desiredPassword) {
        cashier.password_hash = bcrypt.hashSync(desiredPassword, 10);
        data.settings.cashier_password_seed = desiredPassword;
        persist();
    }
}

function seedDefaults() {
    if (data.machines.length === 0) {
        for (let n = 1; n <= 3; n++) createMachine(n, `Máquina ${n}`);
    }
    ensureAdminUser();
    ensureCashierUser();
}

module.exports = {
    isServerless, initLocal, reload, flush,
    getSettings, setSettings,
    findUserByEmail, findUserById, createUser, listCashiers, sanitizeUser, setUserActive, topUpCashier,
    findMachineByNumber, findMachineById, listMachines, createMachine, setMachineActive,
    creditMachine, adjustMachineBalance, playMachine,
    getTransactions, getStats,
};
