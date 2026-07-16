const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data.json');
const TMP_DB = path.join('/tmp', 'winpot-data.json');
const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

function emptyData() {
    return {
        settings: { retention_percent: 15, min_bet: 5, max_bet: 500 },
        branches: [],
        machines: [],
        users: [],
        transactions: [],
        game_rounds: [],
        cable_sessions: [],
        counters: { users: 0, machines: 0, transactions: 0, game_rounds: 0, branches: 0, cable_sessions: 0 },
    };
}

let data = emptyData();
let dirty = false;

function loadFromFile(filePath) {
    if (!fs.existsSync(filePath)) return emptyData();
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!raw.settings) raw.settings = emptyData().settings;
        if (!raw.branches) raw.branches = [];
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
    if (!stored.branches) stored.branches = [];
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
        data.settings.retention_percent = Math.max(5, Math.min(70, parseInt(updates.retention_percent, 10)));
    }
    if (updates.min_bet != null) data.settings.min_bet = parseInt(updates.min_bet, 10);
    if (updates.max_bet != null) data.settings.max_bet = parseInt(updates.max_bet, 10);
    persist();
    return getSettings();
}

/* Users */
function normalizeUsername(raw) {
    return String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
}

function userLoginKey(u) {
    if (u.username) return normalizeUsername(u.username);
    if (u.email) return normalizeUsername(u.email.includes('@') ? u.email.split('@')[0] : u.email);
    return '';
}

function findUserByEmail(email) {
    const key = String(email || '').trim().toLowerCase();
    return data.users.find((u) => (u.email || '').toLowerCase() === key) || null;
}

function findUserByUsername(username) {
    const key = normalizeUsername(username);
    if (!key) return null;
    return data.users.find((u) => {
        if (userLoginKey(u) === key) return true;
        if ((u.email || '').toLowerCase() === key) return true;
        return false;
    }) || null;
}

function findUserById(id) { return data.users.find((u) => u.id === id) || null; }

function createUser(username, passwordHash, name, role = 'cashier', branchId = null, parentId = null) {
    const user = {
        id: nextId('users'),
        username: normalizeUsername(username),
        email: null,
        password_hash: passwordHash,
        name: String(name).trim(),
        role,
        branch_id: branchId || null,
        parent_id: parentId || null,
        float_balance: ['cashier', 'agent'].includes(role) ? 0 : 0,
        game_balance: role === 'user' ? 0 : 0,
        active: 1,
        created_at: now(),
    };
    data.users.push(user);
    persist();
    return user;
}

function listCashiers(branchId = null) {
    let list = data.users.filter((u) => u.role === 'cashier');
    if (branchId) list = list.filter((u) => u.branch_id === branchId);
    return list.map(sanitizeUser);
}

function listAgents() {
    return data.users.filter((u) => u.role === 'agent').map(sanitizeUser);
}

function listPlayers(filter = {}) {
    let list = data.users.filter((u) => u.role === 'user');
    if (filter.cashierId) list = list.filter((u) => u.parent_id === filter.cashierId);
    if (filter.branchId) list = list.filter((u) => u.branch_id === filter.branchId);
    return list.map(sanitizeUser);
}

function createPlayer(username, password, name, opts = {}) {
    const key = normalizeUsername(username);
    if (!key || key.length < 3) throw new Error('Usuario mínimo 3 caracteres');
    if (!/^[a-z0-9._-]{3,32}$/.test(key)) {
        throw new Error('Usuario: 3-32 caracteres (letras, números, . _ -)');
    }
    if (findUserByUsername(key)) throw new Error('Usuario ya registrado');
    const display = String(name || key).trim();
    if (!display) throw new Error('Nombre requerido');
    const pwd = String(password || '').trim();
    const finalPwd = pwd.length >= 6 ? pwd : 'jugador123';
    const user = createUser(key, bcrypt.hashSync(finalPwd, 10), display, 'user', opts.branchId || null, opts.parentId || null);
    user.game_balance = 0;
    persist();
    return { user: sanitizeUser(user), password: finalPwd };
}

function creditPlayer(userId, amount, opts = {}) {
    const u = findUserById(userId);
    if (!u || u.role !== 'user') throw new Error('Jugador no encontrado');
    if (!u.active) throw new Error('Jugador inactivo');
    if (amount <= 0) throw new Error('Monto inválido');

    if (opts.branchId) {
        const branch = findBranchById(opts.branchId);
        if (!branch) throw new Error('Sucursal no encontrada');
        if (u.branch_id && u.branch_id !== opts.branchId) {
            throw new Error('El jugador no pertenece a esta sucursal');
        }
        if ((branch.float_balance || 0) > 0) {
            if ((branch.float_balance || 0) < amount) throw new Error('Saldo insuficiente de la sucursal');
            branch.float_balance -= amount;
        }
        if (!u.branch_id) u.branch_id = opts.branchId;
    } else if (opts.agentId) {
        const agent = findUserById(opts.agentId);
        if (!agent || agent.role !== 'agent') throw new Error('Agente inválido');
        if ((agent.float_balance || 0) < amount) throw new Error('Saldo insuficiente del agente');
        agent.float_balance -= amount;
    }
    // admin: mints without deducting

    u.game_balance = (u.game_balance || 0) + amount;
    addTransaction({
        user_id: userId,
        branch_id: opts.branchId || u.branch_id || null,
        type: 'cash_sale',
        amount,
        balance_after: u.game_balance,
        cash_cents: amount * 100,
        payment_method: opts.paymentMethod || 'efectivo',
        note: opts.note || `Crédito portal a ${u.name}`,
        admin_id: opts.adminId || opts.agentId || null,
    });
    persist();
    return { user: sanitizeUser(u), balance: u.game_balance };
}

function sanitizeUser(u) {
    const branch = u.branch_id ? findBranchById(u.branch_id) : null;
    const username = userLoginKey(u);
    return {
        id: u.id,
        username,
        email: username,
        name: u.name,
        role: u.role,
        branch_id: u.branch_id || null,
        branch_name: branch?.name || null,
        parent_id: u.parent_id || null,
        float_balance: u.float_balance || 0,
        game_balance: u.game_balance || 0,
        active: u.active, created_at: u.created_at,
    };
}

function setUserActive(id, active) {
    const u = findUserById(id);
    if (!u) return null;
    u.active = active ? 1 : 0;
    persist();
    return u;
}

function updateStaffUser(id, updates = {}) {
    const u = findUserById(id);
    if (!u) throw new Error('Usuario no encontrado');
    if (u.role === 'admin') throw new Error('No se puede editar al administrador');
    if (!['agent', 'cashier'].includes(u.role)) throw new Error('Solo agentes o cajeros');

    if (updates.name != null) {
        const name = String(updates.name).trim();
        if (!name) throw new Error('Nombre requerido');
        u.name = name;
    }
    if (updates.username != null || updates.email != null) {
        const username = normalizeUsername(updates.username != null ? updates.username : updates.email);
        if (!username) throw new Error('Usuario requerido');
        if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
            throw new Error('Usuario: 3-32 caracteres (letras, números, . _ -)');
        }
        const other = findUserByUsername(username);
        if (other && other.id !== u.id) throw new Error('Usuario ya registrado');
        u.username = username;
        u.email = null;
    }
    if (updates.password) {
        const pwd = String(updates.password).trim();
        if (pwd.length < 6) throw new Error('Contraseña mínimo 6 caracteres');
        u.password_hash = bcrypt.hashSync(pwd, 10);
    }
    if (updates.active != null) u.active = updates.active ? 1 : 0;
    persist();
    return sanitizeUser(u);
}

function deleteStaffUser(id) {
    const u = findUserById(id);
    if (!u) throw new Error('Usuario no encontrado');
    if (u.role === 'admin') throw new Error('No se puede eliminar al administrador');
    if (!['agent', 'cashier'].includes(u.role)) throw new Error('Solo agentes o cajeros');

    if (u.role === 'cashier') {
        data.users.forEach((player) => {
            if (player.parent_id === u.id) player.parent_id = null;
        });
    }
    data.users = data.users.filter((x) => x.id !== u.id);
    persist();
    return true;
}

function topUpCashier(cashierId, amount, adminId, note) {
    const c = findUserById(cashierId);
    if (!c || c.role !== 'cashier') throw new Error('Cajero no encontrado');
    if (amount <= 0) throw new Error('Monto inválido');
    c.float_balance = (c.float_balance || 0) + amount;
    addTransaction({
        user_id: cashierId, type: 'float_topup', amount, balance_after: c.float_balance,
        note: note || 'Inyección admin', admin_id: adminId,
    });
    persist();
    return c.float_balance;
}

function topUpAgent(agentId, amount, adminId, note) {
    const a = findUserById(agentId);
    if (!a || a.role !== 'agent') throw new Error('Agente no encontrado');
    if (amount <= 0) throw new Error('Monto inválido');
    a.float_balance = (a.float_balance || 0) + amount;
    addTransaction({
        user_id: agentId, type: 'float_topup', amount, balance_after: a.float_balance,
        note: note || 'Inyección admin a agente', admin_id: adminId,
    });
    persist();
    return a.float_balance;
}

function transferAgentToCashier(agentId, cashierId, amount, note) {
    const a = findUserById(agentId);
    const c = findUserById(cashierId);
    if (!a || a.role !== 'agent') throw new Error('Agente no encontrado');
    if (!c || c.role !== 'cashier') throw new Error('Cajero no encontrado');
    if (amount <= 0) throw new Error('Monto inválido');
    if ((a.float_balance || 0) < amount) throw new Error('Saldo insuficiente del agente');
    a.float_balance -= amount;
    c.float_balance = (c.float_balance || 0) + amount;
    addTransaction({
        user_id: cashierId, type: 'float_transfer', amount, balance_after: c.float_balance,
        note: note || `Transferencia de agente ${a.name}`, admin_id: agentId,
    });
    persist();
    return c.float_balance;
}

/* Machines */
function findMachineByNumber(num, branchId = null) {
    const n = parseInt(num, 10);
    const matches = data.machines.filter((m) => m.number === n);
    if (branchId) return matches.find((m) => m.branch_id === branchId) || null;
    if (matches.length === 1) return matches[0];
    return matches.find((m) => m.branch_id) || matches[0] || null;
}
function findMachineById(id) { return data.machines.find((m) => m.id === id) || null; }

function listMachines(branchId = null) {
    let list = [...data.machines];
    if (branchId) list = list.filter((m) => m.branch_id === branchId);
    return list.sort((a, b) => a.number - b.number).map(enrichMachine);
}

function enrichMachine(m) {
    const branch = m.branch_id ? findBranchById(m.branch_id) : null;
    return { ...m, branch_name: branch?.name || 'Sin sucursal' };
}

function createMachine(number, name, branchId = null) {
    const num = parseInt(number, 10);
    if (!branchId) throw new Error('Selecciona una sucursal');
    if (!findBranchById(branchId)) throw new Error('Sucursal no válida');
    if (findMachineByNumber(num, branchId)) throw new Error(`Máquina #${num} ya existe en esta sucursal`);
    const branch = findBranchById(branchId);
    const machine = {
        id: nextId('machines'),
        number: num,
        name: name || `${branch.name} #${num}`,
        branch_id: branchId,
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

function updateMachine(id, updates = {}) {
    const m = findMachineById(id);
    if (!m) throw new Error('Máquina no encontrada');
    if (updates.name != null) {
        const name = String(updates.name).trim();
        if (name) m.name = name;
    }
    if (updates.number != null) {
        const num = parseInt(updates.number, 10);
        if (!num || num < 1) throw new Error('Número inválido');
        const dup = findMachineByNumber(num, m.branch_id);
        if (dup && dup.id !== m.id) throw new Error(`Máquina #${num} ya existe en esta sucursal`);
        m.number = num;
    }
    if (updates.active != null) m.active = updates.active ? 1 : 0;
    persist();
    return enrichMachine(m);
}

function deleteMachine(id) {
    const m = findMachineById(id);
    if (!m) throw new Error('Máquina no encontrada');
    data.machines = data.machines.filter((x) => x.id !== id);
    persist();
    return true;
}

function assertCashierMachineAccess(cashierId, machineId) {
    const c = findUserById(cashierId);
    if (!c || c.role !== 'cashier') throw new Error('Cajero inválido');
    if (!c.branch_id) throw new Error('Sin sucursal asignada — contacta a tu agente');
    const m = findMachineById(machineId);
    if (!m) throw new Error('Máquina no encontrada');
    if (m.branch_id !== c.branch_id) throw new Error('Esta máquina no pertenece a tu sucursal');
    if (!m.active) throw new Error('Máquina inactiva');
    return m;
}

function assertBranchMachineAccess(branchId, machineId) {
    const branch = findBranchById(branchId);
    if (!branch || !branch.active) throw new Error('Sucursal no disponible');
    const m = findMachineById(machineId);
    if (!m) throw new Error('Máquina no encontrada');
    if (m.branch_id !== branchId) throw new Error('Esta máquina no pertenece a tu sucursal');
    if (!m.active) throw new Error('Máquina inactiva');
    return m;
}

function creditMachine(machineId, amount, opts = {}) {
    const m = findMachineById(machineId);
    if (!m) throw new Error('Máquina no encontrada');
    if (!m.active) throw new Error('Máquina inactiva');
    if (amount <= 0) throw new Error('Monto inválido');

    if (opts.branchId) {
        const branch = findBranchById(opts.branchId);
        if (!branch) throw new Error('Sucursal inválida');
        assertBranchMachineAccess(opts.branchId, machineId);
        // Si hay saldo de casa (inyectado por admin/agente), se descuenta.
        // Si no, es venta en efectivo: se permite cargar la máquina igual.
        if ((branch.float_balance || 0) >= amount) {
            branch.float_balance -= amount;
        } else if ((branch.float_balance || 0) > 0 && (branch.float_balance || 0) < amount) {
            throw new Error(`Saldo de casa insuficiente ($${branch.float_balance}). Baja el monto o pide inyección al admin.`);
        }
    } else if (opts.cashierId) {
        const c = findUserById(opts.cashierId);
        if (!c || c.role !== 'cashier') throw new Error('Cajero inválido');
        if ((c.float_balance || 0) < amount) throw new Error('El cajero no tiene saldo suficiente en caja');
        assertCashierMachineAccess(opts.cashierId, machineId);
        c.float_balance -= amount;
    }

    m.balance += amount;
    addTransaction({
        user_id: opts.cashierId || null,
        branch_id: opts.branchId || m.branch_id || null,
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

function creditUser(userId, amount, opts = {}) {
    const u = findUserById(userId);
    if (!u || u.role !== 'user') throw new Error('Usuario no encontrado');
    if (!u.active) throw new Error('Usuario inactivo');
    if (amount <= 0) throw new Error('Monto inválido');

    if (opts.cashierId) {
        const c = findUserById(opts.cashierId);
        if (!c || c.role !== 'cashier') throw new Error('Cajero inválido');
        if ((c.float_balance || 0) < amount) throw new Error('Saldo insuficiente en caja');
        if (c.branch_id && u.branch_id && c.branch_id !== u.branch_id) {
            throw new Error('El usuario no pertenece a la sucursal del cajero');
        }
        c.float_balance -= amount;
    }

    u.game_balance = (u.game_balance || 0) + amount;
    addTransaction({
        user_id: userId,
        type: 'cash_sale',
        amount,
        balance_after: u.game_balance,
        cash_cents: opts.cashCents ?? amount * 100,
        payment_method: opts.paymentMethod || 'efectivo',
        note: opts.note || `Recarga a ${u.name}`,
        admin_id: opts.adminId || null,
    });
    persist();
    return { user: sanitizeUser(u), balance: u.game_balance };
}

function playUser(userId, bet, game, result) {
    const u = findUserById(userId);
    if (!u || u.role !== 'user' || !u.active) throw new Error('Usuario no disponible');
    if ((u.game_balance || 0) < bet) throw new Error('Saldo insuficiente');

    u.game_balance -= bet;
    addTransaction({ user_id: userId, type: 'bet', amount: -bet, balance_after: u.game_balance, game });

    if (result.payout > 0) {
        u.game_balance += result.payout;
        addTransaction({ user_id: userId, type: 'win', amount: result.payout, balance_after: u.game_balance, game });
    }

    addGameRound({ user_id: userId, game, bet, payout: result.payout, net: result.net, result_json: JSON.stringify(result) });
    persist();
    return { ...result, balance: u.game_balance, user_name: u.name };
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

function getScratchPrizePool(branchId = null, userId = null) {
    const retention = (data.settings.retention_percent || 15) / 100;
    let deposits = 0;
    let scratchPaid = 0;

    if (userId) {
        for (const t of data.transactions) {
            if (t.user_id === userId && t.type === 'cash_sale') deposits += t.amount || 0;
        }
        for (const g of data.game_rounds) {
            if (g.game === 'rascadito' && g.user_id === userId) scratchPaid += g.payout || 0;
        }
    } else if (branchId) {
        const machineIds = new Set(listMachines(branchId).map((m) => m.id));
        for (const t of data.transactions) {
            if (t.type !== 'cash_sale') continue;
            if (t.machine_id && machineIds.has(t.machine_id)) deposits += t.amount || 0;
            else if (t.branch_id === branchId && t.user_id && !t.machine_id) deposits += t.amount || 0;
        }
        for (const g of data.game_rounds) {
            if (g.game !== 'rascadito') continue;
            if (g.machine_id && machineIds.has(g.machine_id)) scratchPaid += g.payout || 0;
        }
    }

    const poolCap = Math.floor(deposits * (1 - retention));
    const available = Math.max(0, poolCap - scratchPaid);
    return {
        deposits,
        scratchPaid,
        poolCap,
        available,
        retentionPercent: data.settings.retention_percent || 15,
    };
}

function ensureCableSessions() {
    if (!data.cable_sessions) data.cable_sessions = [];
    if (!data.counters.cable_sessions) data.counters.cable_sessions = 0;
}

function pruneCableSessions() {
    ensureCableSessions();
    const cutoff = Date.now() - 60 * 60 * 1000;
    data.cable_sessions = data.cable_sessions.filter((s) => {
        if (s.status === 'active') return true;
        const ts = Date.parse(s.created_at || 0);
        return ts > cutoff;
    });
}

function findCableSession(id) {
    ensureCableSessions();
    return data.cable_sessions.find((s) => s.id === parseInt(id, 10)) || null;
}

function startCableSessionMachine(machineId, bet, knots) {
    const m = findMachineById(machineId);
    if (!m || !m.active) throw new Error('Máquina no disponible');
    if (m.balance < bet) throw new Error('Saldo insuficiente en la máquina');

    pruneCableSessions();
    const active = data.cable_sessions.find((s) => s.machine_id === machineId && s.status === 'active');
    if (active) throw new Error('Ya tienes un cable en progreso — termínalo primero');

    m.balance -= bet;
    addTransaction({ machine_id: machineId, type: 'bet', amount: -bet, balance_after: m.balance, game: 'desenreda-cable' });

    const session = {
        id: nextId('cable_sessions'),
        machine_id: machineId,
        user_id: null,
        bet,
        knots,
        accumulated: 0,
        wrongPulls: 0,
        status: 'active',
        created_at: now(),
    };
    data.cable_sessions.push(session);
    persist();
    return { session, balance: m.balance, machine_number: m.number };
}

function startCableSessionUser(userId, bet, knots) {
    const u = findUserById(userId);
    if (!u || u.role !== 'user' || !u.active) throw new Error('Usuario no disponible');
    if ((u.game_balance || 0) < bet) throw new Error('Saldo insuficiente');

    ensureCableSessions();
    pruneCableSessions();
    const active = data.cable_sessions.find((s) => s.user_id === userId && s.status === 'active');
    if (active) throw new Error('Ya tienes un cable en progreso — termínalo primero');

    u.game_balance -= bet;
    addTransaction({ user_id: userId, type: 'bet', amount: -bet, balance_after: u.game_balance, game: 'desenreda-cable' });

    const session = {
        id: nextId('cable_sessions'),
        machine_id: null,
        user_id: userId,
        bet,
        knots,
        accumulated: 0,
        wrongPulls: 0,
        status: 'active',
        created_at: now(),
    };
    data.cable_sessions.push(session);
    persist();
    return { session, balance: u.game_balance, user_name: u.name };
}

function finalizeCableSession(session, pullResult) {
    const payout = session.accumulated;
    const bet = session.bet;
    const game = 'desenreda-cable';
    const result = {
        payout,
        net: payout - bet,
        jackpot: pullResult.jackpot || 0,
        failed: !!pullResult.failed,
        wrongPulls: session.wrongPulls,
        knotsTotal: session.knots.length,
        knotsUntied: session.knots.filter((k) => k.untied).length,
    };

    if (session.machine_id) {
        const m = findMachineById(session.machine_id);
        if (payout > 0) {
            m.balance += payout;
            addTransaction({ machine_id: session.machine_id, type: 'win', amount: payout, balance_after: m.balance, game });
        }
        addGameRound({ machine_id: session.machine_id, game, bet, payout, net: result.net, result_json: JSON.stringify(result) });
        persist();
        return { ...result, balance: m.balance, machine_number: m.number };
    }

    const u = findUserById(session.user_id);
    if (payout > 0) {
        u.game_balance += payout;
        addTransaction({ user_id: session.user_id, type: 'win', amount: payout, balance_after: u.game_balance, game });
    }
    addGameRound({ user_id: session.user_id, game, bet, payout, net: result.net, result_json: JSON.stringify(result) });
    persist();
    return { ...result, balance: u.game_balance, user_name: u.name };
}

function pullCableSession(sessionId, end, owner) {
    const session = findCableSession(sessionId);
    if (!session || session.status !== 'active') throw new Error('Partida no encontrada o ya terminada');

    if (owner.machineId && session.machine_id !== owner.machineId) throw new Error('Partida no válida');
    if (owner.userId && session.user_id !== owner.userId) throw new Error('Partida no válida');

    const cable = require('../engines/desenreda-cable');
    const pullResult = cable.resolvePull(session, end);

    if (pullResult.finished && session.status === 'active') {
        session.status = 'done';
    }

    let finalize = null;
    if (session.status === 'done') {
        finalize = finalizeCableSession(session, pullResult);
    } else {
        persist();
    }

    const balance = finalize?.balance ?? (session.machine_id
        ? findMachineById(session.machine_id)?.balance
        : findUserById(session.user_id)?.game_balance);

    return {
        ...pullResult,
        session: cable.publicSession(session),
        accumulated: session.accumulated,
        balance,
        payout: finalize?.payout ?? session.accumulated,
        net: finalize?.net,
    };
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
    if (filter.branchId) list = list.filter((t) => t.branch_id === filter.branchId || (t.machine_id && findMachineById(t.machine_id)?.branch_id === filter.branchId));
    if (filter.machineId) list = list.filter((t) => t.machine_id === filter.machineId);
    if (filter.type) list = list.filter((t) => t.type === filter.type);
    return list.sort((a, b) => b.id - a.id).slice(0, limit).map(enrichTx);
}

function enrichTx(t) {
    const out = { ...t };
    if (t.user_id) {
        const u = findUserById(t.user_id);
        out.user_name = u?.name;
        out.user_email = u?.username || u?.email;
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
    const branchFloat = data.branches.reduce((s, b) => s + (b.float_balance || 0), 0);
    const cashierFloat = data.users.filter((u) => u.role === 'cashier').reduce((s, u) => s + (u.float_balance || 0), 0);

    return {
        machines: data.machines.filter((m) => m.active).length,
        machineBalance,
        branchFloat,
        cashierFloat,
        salesToday: salesToday.length,
        cashToday,
        betsToday,
        winsToday,
        houseToday: betsToday - winsToday,
        retention: data.settings.retention_percent,
        cashiers: data.users.filter((u) => u.role === 'cashier' && u.active).length,
        branches: data.branches.filter((b) => b.active).length,
    };
}

function ensureAdminUser() {
    const adminUser = normalizeUsername(process.env.ADMIN_USER || process.env.ADMIN_EMAIL || 'admin');
    const desiredPassword = process.env.ADMIN_PASSWORD || 'admin123';
    let admin = findUserByUsername(adminUser)
        || findUserByEmail('admin@winpot.local')
        || data.users.find((u) => u.role === 'admin')
        || null;

    if (!admin) {
        createUser(adminUser, bcrypt.hashSync(desiredPassword, 10), 'Administrador', 'admin');
        data.settings.admin_password_seed = desiredPassword;
        persist();
        return;
    }

    admin.role = 'admin';
    admin.active = 1;
    admin.username = adminUser;
    admin.email = null;

    if (data.settings.admin_password_seed !== desiredPassword
        || !admin.password_hash
        || !bcrypt.compareSync(desiredPassword, admin.password_hash)) {
        admin.password_hash = bcrypt.hashSync(desiredPassword, 10);
        data.settings.admin_password_seed = desiredPassword;
    }
    persist();
}

function ensureDefaultAgent() {
    if (findUserByUsername('agente')) return;
    createUser('agente', bcrypt.hashSync('agente123', 10), 'Agente', 'agent');
}

function ensureCashierUser() {
    /* Cajero demo desactivado — los crea admin o agente */
}

function migrateUsernames() {
    let changed = false;
    data.users.forEach((u) => {
        if (!u.username && u.email) {
            u.username = normalizeUsername(u.email.includes('@') ? u.email.split('@')[0] : u.email);
            changed = true;
        }
        if (u.username) u.username = normalizeUsername(u.username);
    });
    if (changed) persist();
}

function seedDefaults() {
    ensureCableSessions();
    seedBranches();
    ensureDefaultBranches();
    migrateUsernames();
    ensureAdminUser();
    ensureDefaultAgent();
    ensureCashierUser();
}

const DEFAULT_BRANCHES = [
    { id: 'fusion', name: 'Fusion' },
    { id: '3b2', name: '3B2' },
    { id: '3b5', name: '3B5' },
    { id: '3b6', name: '3B6' },
    { id: '3b7', name: '3B7' },
    { id: '3b9', name: '3B9' },
    { id: '3b10', name: '3B10' },
];

function listBranches() {
    return [...data.branches].sort((a, b) => a.name.localeCompare(b.name));
}

function findBranchById(id) {
    const key = String(id || '').trim().toLowerCase();
    if (!key) return null;
    return data.branches.find((b) => String(b.id).toLowerCase() === key) || null;
}

function createBranch(id, name, password) {
    const cleanId = String(id || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    if (!cleanId || !cleanName) throw new Error('ID y nombre requeridos');
    if (!/^[a-z0-9_]+$/.test(cleanId)) throw new Error('ID inválido (solo letras minúsculas, números y _)');
    if (findBranchById(cleanId)) throw new Error('Esa sucursal ya existe');
    const pwd = String(password || '').trim();
    const finalPwd = pwd.length >= 6 ? pwd : 'sucursal123';
    const branch = {
        id: cleanId,
        name: cleanName,
        active: 1,
        float_balance: 0,
        password_hash: bcrypt.hashSync(finalPwd, 10),
        password_seed: finalPwd === 'sucursal123' ? 'sucursal123' : null,
        password_custom: finalPwd === 'sucursal123' ? 0 : 1,
        games: ['spin-wheel', 'comic-slot', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'desenreda-cable'],
        created_at: now(),
    };
    data.branches.push(branch);
    ensureMachinesForBranch(cleanId, 3);
    persist();
    return { branch: sanitizeBranch(branch), password: finalPwd };
}

function sanitizeBranch(b) {
    if (!b) return null;
    return {
        id: b.id,
        name: b.name,
        role: 'branch',
        branch_id: b.id,
        branch_name: b.name,
        float_balance: b.float_balance || 0,
        active: b.active,
        games: getBranchGames(b.id),
        created_at: b.created_at,
        has_password: !!b.password_hash,
    };
}

function ensureBranchAuth(branch) {
    if (!branch) return;
    if (branch.float_balance == null) branch.float_balance = 0;
    if (branch.active == null) branch.active = 1;
    const defaultPwd = 'sucursal123';
    if (branch.password_custom) {
        if (!branch.password_hash) {
            branch.password_hash = bcrypt.hashSync(defaultPwd, 10);
            branch.password_custom = 0;
            branch.password_seed = defaultPwd;
        }
        return;
    }
    if (!branch.password_hash
        || branch.password_seed !== defaultPwd
        || !bcrypt.compareSync(defaultPwd, branch.password_hash)) {
        branch.password_hash = bcrypt.hashSync(defaultPwd, 10);
        branch.password_seed = defaultPwd;
    }
}

function setBranchPassword(branchId, password) {
    const branch = findBranchById(branchId);
    if (!branch) throw new Error('Sucursal no encontrada');
    const pwd = String(password || '').trim();
    if (pwd.length < 6) throw new Error('Contraseña mínimo 6 caracteres');
    branch.password_hash = bcrypt.hashSync(pwd, 10);
    branch.password_seed = pwd === 'sucursal123' ? 'sucursal123' : null;
    branch.password_custom = pwd === 'sucursal123' ? 0 : 1;
    persist();
    return sanitizeBranch(branch);
}

function topUpBranch(branchId, amount, adminId, note) {
    const branch = findBranchById(branchId);
    if (!branch) throw new Error('Sucursal no encontrada');
    if (amount <= 0) throw new Error('Monto inválido');
    branch.float_balance = (branch.float_balance || 0) + amount;
    addTransaction({
        branch_id: branchId, type: 'float_topup', amount, balance_after: branch.float_balance,
        note: note || 'Inyección admin a sucursal', admin_id: adminId,
    });
    persist();
    return branch.float_balance;
}

function transferAgentToBranch(agentId, branchId, amount, note) {
    const a = findUserById(agentId);
    const branch = findBranchById(branchId);
    if (!a || a.role !== 'agent') throw new Error('Agente no encontrado');
    if (!branch) throw new Error('Sucursal no encontrada');
    if (amount <= 0) throw new Error('Monto inválido');
    if ((a.float_balance || 0) < amount) throw new Error('Saldo insuficiente del agente');
    a.float_balance -= amount;
    branch.float_balance = (branch.float_balance || 0) + amount;
    addTransaction({
        branch_id: branchId, type: 'float_transfer', amount, balance_after: branch.float_balance,
        note: note || `Transferencia de agente ${a.name}`, admin_id: agentId,
    });
    persist();
    return branch.float_balance;
}

function ensureMachinesForBranch(branchId, count = 3) {
    const branch = findBranchById(branchId);
    if (!branch) throw new Error('Sucursal no encontrada');
    const existing = data.machines.filter((m) => m.branch_id === branchId);
    const nums = new Set(existing.map((m) => m.number));
    const created = [];
    for (let n = 1; n <= count; n++) {
        if (!nums.has(n)) {
            created.push(createMachine(n, `${branch.name} #${n}`, branchId));
        }
    }
    return { machines: listMachines(branchId), created: created.length };
}

function assignCashierToBranch(cashierId, branchId) {
    const c = findUserById(cashierId);
    if (!c || c.role !== 'cashier') throw new Error('Cajero no encontrado');
    const branch = findBranchById(branchId);
    if (!branch) throw new Error('Sucursal no encontrada');
    const other = data.users.find((u) => u.role === 'cashier' && u.branch_id === branchId && u.id !== cashierId && u.active);
    if (other) {
        throw new Error(`La sucursal ${branch.name} ya tiene cajero: ${other.name}`);
    }
    c.branch_id = branchId;
    persist();
    return sanitizeUser(c);
}

function unassignCashier(cashierId) {
    const c = findUserById(cashierId);
    if (!c || c.role !== 'cashier') throw new Error('Cajero no encontrado');
    c.branch_id = null;
    persist();
    return sanitizeUser(c);
}

function getBranchGames(branchId) {
    const branch = findBranchById(branchId);
    const defaults = ['spin-wheel', 'comic-slot', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'desenreda-cable'];
    if (!branch) return defaults;
    if (!Array.isArray(branch.games) || !branch.games.length) {
        branch.games = defaults;
        persist();
    }
    return [...branch.games];
}

function setBranchGames(branchId, games) {
    const branch = findBranchById(branchId);
    if (!branch) throw new Error('Sucursal no encontrada');
    const allowed = ['spin-wheel', 'comic-slot', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'desenreda-cable'];
    const list = (games || []).filter((g) => allowed.includes(g));
    if (!list.length) throw new Error('Selecciona al menos un juego');
    branch.games = list;
    persist();
    return getBranchGames(branchId);
}

function updateBranch(id, updates = {}) {
    const branch = findBranchById(id);
    if (!branch) throw new Error('Sucursal no encontrada');
    if (updates.name != null) {
        const cleanName = String(updates.name || '').trim();
        if (!cleanName) throw new Error('Nombre requerido');
        branch.name = cleanName;
    }
    if (updates.active != null) branch.active = updates.active ? 1 : 0;
    if (updates.password) setBranchPassword(id, updates.password);
    persist();
    return sanitizeBranch(branch);
}

function deleteBranch(id) {
    const branch = findBranchById(id);
    if (!branch) throw new Error('Sucursal no encontrada');
    data.users.forEach((u) => {
        if (u.branch_id === id) u.branch_id = null;
    });
    data.machines = data.machines.filter((m) => m.branch_id !== id);
    data.branches = data.branches.filter((b) => b.id !== id);
    persist();
    return true;
}

function seedBranches() {
    if (!data.branches) data.branches = [];
    if (data.branches.length > 0) return;
    ensureDefaultBranches();
}

function ensureDefaultBranches() {
    if (!data.branches) data.branches = [];
    let added = 0;
    DEFAULT_BRANCHES.forEach((b) => {
        if (!findBranchById(b.id)) {
            data.branches.push({
                id: b.id,
                name: b.name,
                active: 1,
                float_balance: 5000,
                password_hash: bcrypt.hashSync('sucursal123', 10),
                games: ['spin-wheel', 'comic-slot', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'desenreda-cable'],
                created_at: now(),
            });
            added += 1;
        }
    });
    data.branches.forEach((b) => {
        ensureBranchAuth(b);
        if (!Array.isArray(b.games) || !b.games.length) {
            b.games = ['spin-wheel', 'comic-slot', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'desenreda-cable'];
        } else if (!b.games.includes('desenreda-cable')) {
            b.games = [...b.games, 'desenreda-cable'];
        }
        ensureMachinesForBranch(b.id, 3);
    });
    if (added) persist();
    else persist();
    return added;
}

function listMachinesForCashier(cashierId) {
    const c = findUserById(cashierId);
    if (!c) return [];
    if (!c.branch_id) return [];
    return listMachines(c.branch_id).filter((m) => m.active);
}

function branchStats(branchId) {
    const branch = findBranchById(branchId);
    const machines = data.machines.filter((m) => m.branch_id === branchId);
    return {
        machines: machines.length,
        machineBalance: machines.reduce((s, m) => s + m.balance, 0),
        float_balance: branch?.float_balance || 0,
    };
}

module.exports = {
    isServerless, initLocal, reload, flush,
    getSettings, setSettings, ensureAdminUser,
    findUserByEmail, findUserByUsername, findUserById, createUser, createPlayer, creditPlayer, listCashiers, listAgents, listPlayers,
    sanitizeUser, setUserActive, updateStaffUser, deleteStaffUser,
    topUpCashier, topUpAgent, transferAgentToCashier,
    findMachineByNumber, findMachineById, listMachines, listMachinesForCashier,
    createMachine, updateMachine, deleteMachine, setMachineActive, assertCashierMachineAccess,
    creditMachine, creditUser, adjustMachineBalance, playMachine, playUser,
    getTransactions, getStats, getScratchPrizePool,
    startCableSessionMachine, startCableSessionUser, pullCableSession, findCableSession,
    listBranches, findBranchById, createBranch, updateBranch, deleteBranch, seedBranches, ensureDefaultBranches, branchStats,
    sanitizeBranch, setBranchPassword, topUpBranch, transferAgentToBranch, ensureBranchAuth, assertBranchMachineAccess,
    ensureMachinesForBranch, assignCashierToBranch, unassignCashier, getBranchGames, setBranchGames,
};
