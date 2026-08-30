const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data.json');
const TMP_DB = path.join('/tmp', 'winpot-data.json');
const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

function emptyData() {
    return {
        settings: { retention_percent: 15, min_bet: 1, max_bet: 500 },
        branches: [],
        machines: [],
        users: [],
        transactions: [],
        game_rounds: [],
        puzzle_sessions: [],
        fight_sessions: [],
        zone_sessions: [],
        counters: {
            users: 0, machines: 0, transactions: 0, game_rounds: 0, branches: 0,
            puzzle_sessions: 0, fight_sessions: 0, zone_sessions: 0}};
}

let data = emptyData();
let dirty = false;
/** True after a successful blob/file read this process — safe to overwrite blob. */
let blobSynced = false;
/** ETag from last blob read — compare-and-swap writes. */
let blobEtag = null;
/** Last blob read/write error message (for /api/admin/persist diagnostics). */
let lastBlobError = null;
/** True when we know the DB had real content (users/branches/balances). */
let loadedExistingDb = false;
/** Serialize reload/flush on the same warm instance to reduce lost updates. */
let storeLock = Promise.resolve();

function withStoreLock(fn) {
    const run = storeLock.then(fn, fn);
    storeLock = run.then(() => undefined, () => undefined);
    return run;
}

function entityTime(e) {
    if (!e || typeof e !== 'object') return 0;
    return Date.parse(e.updated_at || e.created_at || '') || 0;
}

function touch(entity) {
    if (entity && typeof entity === 'object') entity.updated_at = new Date().toISOString();
    return entity;
}

function ensureDeletedMap(db = data) {
    if (!db.deleted || typeof db.deleted !== 'object') {
        db.deleted = { users: {}, machines: {}, branches: {} };
    }
    if (!db.deleted.users) db.deleted.users = {};
    if (!db.deleted.machines) db.deleted.machines = {};
    if (!db.deleted.branches) db.deleted.branches = {};
    return db.deleted;
}

function markDeleted(kind, id) {
    ensureDeletedMap()[kind][String(id)] = new Date().toISOString();
}

function pickNewer(a, b) {
    if (!a) return b;
    if (!b) return a;
    const ta = entityTime(a);
    const tb = entityTime(b);
    if (tb > ta) return b;
    if (ta > tb) return a;
    return b; // same time: prefer local (in-flight)
}

function normalizeDb(raw) {
    if (!raw || typeof raw !== 'object') return emptyData();
    if (!raw.settings) raw.settings = emptyData().settings;
    if (!raw.branches) raw.branches = [];
    if (!raw.machines) raw.machines = [];
    if (!raw.users) raw.users = [];
    if (!raw.transactions) raw.transactions = [];
    if (!raw.game_rounds) raw.game_rounds = [];
    if (!raw.counters) raw.counters = emptyData().counters;
    ensureDeletedMap(raw);
    return raw;
}

function dbHasRealData(db) {
    if (!db) return false;
    if (Array.isArray(db.transactions) && db.transactions.length > 0) return true;
    if (Array.isArray(db.game_rounds) && db.game_rounds.length > 0) return true;
    if (Array.isArray(db.machines) && db.machines.some((m) => (m.balance || 0) !== 0)) return true;
    if (Array.isArray(db.users) && db.users.some((u) => (u.game_balance || 0) > 0 || (u.float_balance || 0) > 0)) return true;
    if (Array.isArray(db.branches) && db.branches.some((b) => (b.float_balance || 0) > 0 && (b.float_balance || 0) !== 5000)) return true;
    if (Array.isArray(db.machines) && db.machines.length > 0) return true;
    if (Array.isArray(db.users) && db.users.some((u) => u.role === 'cashier' || u.role === 'agent')) return true;
    if (Array.isArray(db.users) && db.users.length > 1) return true;
    if (Array.isArray(db.branches) && db.branches.length > 0) return true;
    return false;
}

function loadFromFile(filePath) {
    if (!fs.existsSync(filePath)) return emptyData();
    try {
        return normalizeDb(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
        return emptyData();
    }
}

function getBlobStore() {
    const { getStore } = require('@netlify/blobs');
    // Avoid consistency:'strong' — needs uncachedEdgeURL and fails under serverless-http
    // even after connectLambda(event), which breaks sucursal/cajero creates.
    try {
        return getStore('winpot-db');
    } catch (e) {
        const msg = (e && e.message) || 'Blobs no configurado';
        lastBlobError = msg;
        throw new Error(
            'Netlify Blobs no disponible (' + msg + '). ' +
            'Si usas serverless-http, llama connectLambda(event) en la function.'
        );
    }
}

async function loadFromBlobMeta() {
    const blobStore = getBlobStore();
    try {
        const result = await blobStore.getWithMetadata('data', { type: 'json' });
        if (!result || result.data == null) return { db: null, etag: null };
        return { db: normalizeDb(result.data), etag: result.etag || null };
    } catch (_) {
        const stored = await blobStore.get('data', { type: 'json' });
        if (!stored) return { db: null, etag: null };
        return { db: normalizeDb(stored), etag: null };
    }
}

async function loadFromBlob() {
    const { db } = await loadFromBlobMeta();
    return db;
}

async function saveToBlobCas(dbToSave, etag) {
    const blobStore = getBlobStore();
    const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    try {
        const result = await blobStore.setJSON('data', dbToSave, opts);
        if (result && typeof result === 'object' && 'modified' in result) return result;
        return { modified: true, etag: (result && result.etag) || null };
    } catch (e) {
        const msg = String((e && e.message) || e);
        if (/412|precondition|not match|already exists|conflict/i.test(msg)) {
            return { modified: false, error: msg };
        }
        // Older @netlify/blobs without conditional writes — plain overwrite after merge
        if (/onlyIf|unknown|unsupported|invalid option/i.test(msg)) {
            await blobStore.setJSON('data', dbToSave);
            return { modified: true };
        }
        throw e;
    }
}

async function saveToBlobUnconditional(dbToSave) {
    const blobStore = getBlobStore();
    const result = await blobStore.setJSON('data', dbToSave);
    return { modified: true, etag: (result && result.etag) || null };
}

function mergeDeletedMaps(baseDel, locDel) {
    const out = { users: {}, machines: {}, branches: {} };
    for (const kind of ['users', 'machines', 'branches']) {
        const a = (baseDel && baseDel[kind]) || {};
        const b = (locDel && locDel[kind]) || {};
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            const ta = Date.parse(a[k] || '') || 0;
            const tb = Date.parse(b[k] || '') || 0;
            out[kind][k] = ta >= tb ? (a[k] || b[k]) : (b[k] || a[k]);
        }
    }
    return out;
}

function applyTombstones(db) {
    const del = ensureDeletedMap(db);
    db.users = (db.users || []).filter((u) => {
        const tDel = Date.parse((del.users || {})[String(u.id)] || '') || 0;
        return !tDel || entityTime(u) > tDel;
    });
    db.machines = (db.machines || []).filter((m) => {
        const tDel = Date.parse((del.machines || {})[String(m.id)] || '') || 0;
        return !tDel || entityTime(m) > tDel;
    });
    db.branches = (db.branches || []).filter((b) => {
        const tDel = Date.parse((del.branches || {})[String(b.id).toLowerCase()] || '') || 0;
        return !tDel || entityTime(b) > tDel;
    });
    return db;
}

/** Merge remote (base) with local. Prefer newer updated_at — never wipe fresher cashiers/balances. */
function mergeDatabases(base, local) {
    const out = normalizeDb(JSON.parse(JSON.stringify(base || emptyData())));
    const loc = normalizeDb(local || emptyData());

    out.deleted = mergeDeletedMaps(out.deleted, loc.deleted);

    const userById = new Map((out.users || []).map((u) => [u.id, u]));
    const userByKey = new Map();
    for (const u of userById.values()) {
        const k = (u.username || u.email || '').toString().trim().toLowerCase().replace(/\s+/g, '');
        if (k) userByKey.set(k, u);
    }
    for (const u of loc.users || []) {
        const k = (u.username || u.email || '').toString().trim().toLowerCase().replace(/\s+/g, '');
        if (k && userByKey.has(k) && userByKey.get(k).id !== u.id) {
            const other = userByKey.get(k);
            const winner = pickNewer(other, u);
            if (winner === u) {
                userById.delete(other.id);
                userById.set(u.id, u);
                userByKey.set(k, u);
            }
            continue;
        }
        const winner = pickNewer(userById.get(u.id), u);
        userById.set(u.id, winner);
        if (k) userByKey.set(k, winner);
    }
    out.users = [...userById.values()];

    const branchById = new Map((out.branches || []).map((b) => [String(b.id).toLowerCase(), b]));
    for (const b of loc.branches || []) {
        const key = String(b.id).toLowerCase();
        branchById.set(key, pickNewer(branchById.get(key), b));
    }
    out.branches = [...branchById.values()];

    const machineById = new Map((out.machines || []).map((m) => [m.id, m]));
    for (const m of loc.machines || []) {
        machineById.set(m.id, pickNewer(machineById.get(m.id), m));
    }
    out.machines = [...machineById.values()];

    out.counters = { ...(out.counters || {}) };
    for (const [k, v] of Object.entries(loc.counters || {})) {
        out.counters[k] = Math.max(out.counters[k] || 0, v || 0);
    }

    out.settings = { ...(out.settings || {}), ...(loc.settings || {}) };
    out.migrations = { ...(out.migrations || {}), ...(loc.migrations || {}) };

    const txIds = new Set((out.transactions || []).map((t) => t.id));
    for (const t of loc.transactions || []) {
        if (!txIds.has(t.id)) {
            out.transactions.push(t);
            txIds.add(t.id);
        }
    }
    if (out.transactions.length > 5000) {
        out.transactions = out.transactions.slice(-5000);
    }

    const roundIds = new Set((out.game_rounds || []).map((r) => r.id));
    for (const r of loc.game_rounds || []) {
        if (!roundIds.has(r.id)) {
            out.game_rounds.push(r);
            roundIds.add(r.id);
        }
    }
    if (out.game_rounds.length > 5000) {
        out.game_rounds = out.game_rounds.slice(-5000);
    }

    for (const key of ['puzzle_sessions', 'fight_sessions', 'runner_sessions', 'zone_sessions']) {
        const baseList = Array.isArray(out[key]) ? out[key] : [];
        const locList = Array.isArray(loc[key]) ? loc[key] : [];
        const byId = new Map(baseList.map((sess) => [sess.id, sess]));
        for (const sess of locList) byId.set(sess.id, pickNewer(byId.get(sess.id), sess));
        out[key] = [...byId.values()];
    }

    return applyTombstones(out);
}

function persist() {
    if (isServerless) dirty = true;
    else saveToFile(DB_FILE);
}

/** Deep clone of in-memory DB for transactional rollback after failed blob flush. */
function snapshotData() {
    return {
        data: JSON.parse(JSON.stringify(data)),
        dirty,
        blobSynced,
        blobEtag,
        loadedExistingDb,
        lastBlobError,
    };
}

function restoreSnapshot(snap) {
    if (!snap || !snap.data) return;
    data = snap.data;
    dirty = !!snap.dirty;
    blobSynced = !!snap.blobSynced;
    blobEtag = snap.blobEtag || null;
    loadedExistingDb = !!snap.loadedExistingDb;
    lastBlobError = snap.lastBlobError || null;
}

function saveToFile(fp) { fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8'); }

function initLocal() {
    data = loadFromFile(DB_FILE);
    loadedExistingDb = dbHasRealData(data);
    blobSynced = true;
    seedDefaults();
}

function isWriteLocked() {
    return false;
}

function hasLoadedExistingDb() {
    return loadedExistingDb;
}

function memoryLooksPopulated() {
    return dbHasRealData(data)
        || (Array.isArray(data.users) && data.users.length > 0)
        || (Array.isArray(data.branches) && data.branches.length > 0);
}

async function reload() {
    return withStoreLock(async () => {
        if (dirty) {
            await flushUnlocked();
        }

        const previous = data;

        if (isServerless) {
            try {
                const { db: stored, etag } = await loadFromBlobMeta();
                if (stored) {
                    data = applyTombstones(stored);
                    blobEtag = etag;
                    loadedExistingDb = dbHasRealData(stored) || memoryLooksPopulated();
                    blobSynced = true;
                } else if (memoryLooksPopulated()) {
                    loadedExistingDb = true;
                    blobSynced = false;
                    blobEtag = null;
                    console.warn('[store] blob empty — keeping in-memory DB');
                } else {
                    data = emptyData();
                    blobEtag = null;
                    loadedExistingDb = false;
                    blobSynced = true;
                    console.warn('[store] blob empty — first boot (sin demo automática)');
                }
            } catch (e) {
                lastBlobError = e.message || String(e);
                console.error('[store] blob load failed:', e.message);
                const tmp = loadFromFile(TMP_DB);
                if (dbHasRealData(tmp) || (tmp.users && tmp.users.length) || (tmp.branches && tmp.branches.length)) {
                    data = tmp;
                    loadedExistingDb = true;
                    blobSynced = false;
                    console.warn('[store] using /tmp snapshot after blob error');
                } else if (previous && (dbHasRealData(previous) || (previous.users && previous.users.length) || (previous.branches && previous.branches.length))) {
                    data = previous;
                    loadedExistingDb = true;
                    blobSynced = false;
                    console.warn('[store] blob failed — keeping previous in-memory DB');
                } else {
                    data = emptyData();
                    loadedExistingDb = false;
                    blobSynced = false;
                    console.warn('[store] blob failed — empty memory; writes go to /tmp until blob recovers');
                }
            }
        } else {
            data = loadFromFile(DB_FILE);
            loadedExistingDb = dbHasRealData(data) || data.users.length > 0 || data.branches.length > 0;
            blobSynced = true;
        }
        seedDefaults();
    });
}

async function flushUnlocked() {
    if (!dirty) return { ok: true, synced: true, skipped: true };

    try {
        if (isServerless) {
            const localCopy = data;
            let lastErr = null;
            for (let attempt = 0; attempt < 12; attempt++) {
                try {
                    const { db: existing, etag } = await loadFromBlobMeta();
                    let merged = existing
                        ? mergeDatabases(existing, localCopy)
                        : normalizeDb(JSON.parse(JSON.stringify(localCopy)));
                    merged = applyTombstones(merged);
                    syncCountersFromData(merged);

                    const result = await saveToBlobCas(merged, existing ? etag : null);
                    if (result.modified) {
                        data = merged;
                        blobEtag = result.etag || etag;
                        blobSynced = true;
                        loadedExistingDb = true;
                        lastBlobError = null;
                        try { saveToFile(TMP_DB); } catch (_) { /* ignore */ }
                        dirty = false;
                        return { ok: true, synced: true };
                    }
                    // Blob key exists but we had no etag / onlyIfNew lost the race — force write once merged
                    if (!existing || !etag) {
                        const forced = await saveToBlobUnconditional(merged);
                        data = merged;
                        blobEtag = forced.etag || null;
                        blobSynced = true;
                        loadedExistingDb = true;
                        lastBlobError = null;
                        try { saveToFile(TMP_DB); } catch (_) { /* ignore */ }
                        dirty = false;
                        return { ok: true, synced: true, forced: true };
                    }
                    await new Promise((r) => setTimeout(r, 15 + attempt * 25));
                } catch (e) {
                    lastErr = e;
                    lastBlobError = e.message || String(e);
                    console.warn('[store] blob CAS attempt failed:', e.message);
                    await new Promise((r) => setTimeout(r, 20 + attempt * 30));
                }
            }
            // Last resort: unconditional overwrite so creates are not lost when Blobs is available
            try {
                const { db: existing } = await loadFromBlobMeta();
                let merged = existing
                    ? mergeDatabases(existing, localCopy)
                    : normalizeDb(JSON.parse(JSON.stringify(localCopy)));
                merged = applyTombstones(merged);
                syncCountersFromData(merged);
                const forced = await saveToBlobUnconditional(merged);
                data = merged;
                blobEtag = forced.etag || null;
                blobSynced = true;
                loadedExistingDb = true;
                lastBlobError = null;
                try { saveToFile(TMP_DB); } catch (_) { /* ignore */ }
                dirty = false;
                console.warn('[store] blob saved via unconditional fallback');
                return { ok: true, synced: true, forced: true };
            } catch (e) {
                lastErr = e;
                lastBlobError = e.message || String(e);
            }
            const msg = (lastErr && lastErr.message) || 'CAS conflict after retries';
            console.error('[store] blob CAS exhausted — create NOT durable:', msg);
            try { saveToFile(TMP_DB); } catch (_) { /* ignore */ }
            return { ok: false, synced: false, error: msg };
        }

        saveToFile(DB_FILE);
        try { saveToFile(TMP_DB); } catch (_) { /* ignore tmp errors */ }
        loadedExistingDb = true;
        blobSynced = true;
        dirty = false;
        return { ok: true, synced: true };
    } catch (e) {
        lastBlobError = e.message || String(e);
        console.warn('[store] flush failed:', e.message);
        try { saveToFile(TMP_DB); } catch (e2) {
            console.error('[store] tmp save failed:', e2.message);
        }
        return { ok: false, synced: false, error: e.message };
    }
}

async function flush() {
    return withStoreLock(() => flushUnlocked());
}

/** Flush and throw if the write did not land (so APIs don't claim success). */
async function flushOrThrow() {
    const result = await flush();
    if (result && result.ok === false) {
        const err = new Error('No se pudo guardar. Reintenta en unos segundos.');
        err.code = 'PERSIST_FAILED';
        err.status = 503;
        throw err;
    }
    return result;
}

function syncCountersFromData(db = data) {
    if (!db.counters) db.counters = emptyData().counters;
    const maxNum = (arr, pick) => (arr || []).reduce((m, x) => {
        const n = Number(pick(x));
        return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    db.counters.users = Math.max(db.counters.users || 0, maxNum(db.users, (u) => u.id));
    db.counters.machines = Math.max(db.counters.machines || 0, maxNum(db.machines, (m) => m.id));
    db.counters.transactions = Math.max(db.counters.transactions || 0, maxNum(db.transactions, (t) => t.id));
    db.counters.game_rounds = Math.max(db.counters.game_rounds || 0, maxNum(db.game_rounds, (r) => r.id));
    for (const key of ['puzzle_sessions', 'fight_sessions', 'runner_sessions', 'zone_sessions']) {
        db.counters[key] = Math.max(db.counters[key] || 0, maxNum(db[key], (s) => s.id));
    }
}

function nextId(key) {
    syncCountersFromData(data);
    const prev = data.counters[key] || 0;
    let n = prev + 1;
    // Serverless: jump with time+noise so concurrent Lambdas rarely share the same id
    if (isServerless) {
        const stamped = (Date.now() % 1e11) * 100 + Math.floor(Math.random() * 100);
        n = Math.max(n, stamped);
    }
    data.counters[key] = n;
    return n;
}

function getPersistStatus() {
    return {
        serverless: isServerless,
        dirty,
        blobSynced,
        loadedExistingDb,
        lastBlobError,
        counts: {
            users: (data.users || []).length,
            agents: (data.users || []).filter((u) => u.role === 'agent').length,
            cashiers: (data.users || []).filter((u) => u.role === 'cashier').length,
            branches: (data.branches || []).length,
            machines: (data.machines || []).length,
        },
    };
}
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
        updated_at: now()};
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
    touch(u);
    if (opts.branchId) touch(findBranchById(opts.branchId));
    if (opts.agentId) touch(findUserById(opts.agentId));
    addTransaction({
        user_id: userId,
        branch_id: opts.branchId || u.branch_id || null,
        type: 'cash_sale',
        amount,
        balance_after: u.game_balance,
        cash_cents: amount * 100,
        payment_method: opts.paymentMethod || 'efectivo',
        note: opts.note || `Crédito portal a ${u.name}`,
        admin_id: opts.adminId || opts.agentId || null});
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
        active: u.active, created_at: u.created_at};
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
    touch(u);
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
    markDeleted('users', u.id);
    data.users = data.users.filter((x) => x.id !== u.id);
    persist();
    return true;
}

function topUpCashier(cashierId, amount, adminId, note) {
    const c = findUserById(cashierId);
    if (!c || c.role !== 'cashier') throw new Error('Cajero no encontrado');
    if (amount <= 0) throw new Error('Monto inválido');
    c.float_balance = (c.float_balance || 0) + amount;
    touch(c);
    addTransaction({
        user_id: cashierId, type: 'float_topup', amount, balance_after: c.float_balance,
        note: note || 'Inyección admin', admin_id: adminId});
    persist();
    return c.float_balance;
}

function topUpAgent(agentId, amount, adminId, note) {
    const a = findUserById(agentId);
    if (!a || a.role !== 'agent') throw new Error('Agente no encontrado');
    if (amount <= 0) throw new Error('Monto inválido');
    a.float_balance = (a.float_balance || 0) + amount;
    touch(a);
    addTransaction({
        user_id: agentId, type: 'float_topup', amount, balance_after: a.float_balance,
        note: note || 'Inyección admin a agente', admin_id: adminId});
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
        note: note || `Transferencia de agente ${a.name}`, admin_id: agentId});
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
        updated_at: now()};
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
    markDeleted('machines', id);
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
    touch(m);
    if (opts.branchId) touch(findBranchById(opts.branchId));
    if (opts.cashierId) touch(findUserById(opts.cashierId));
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
        admin_id: opts.adminId || null});
    persist();
    return { machine: m, balance: m.balance };
}

function adjustMachineBalance(machineId, amount, adminId, note) {
    const m = findMachineById(machineId);
    if (!m) throw new Error('Máquina no encontrada');
    m.balance = Math.max(0, m.balance + amount);
    addTransaction({
        machine_id: machineId, type: amount >= 0 ? 'admin_credit' : 'admin_debit',
        amount, balance_after: m.balance, note, admin_id: adminId});
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
    touch(u);
    if (opts.cashierId) touch(findUserById(opts.cashierId));
    addTransaction({
        user_id: userId,
        type: 'cash_sale',
        amount,
        balance_after: u.game_balance,
        cash_cents: opts.cashCents ?? amount * 100,
        payment_method: opts.paymentMethod || 'efectivo',
        note: opts.note || `Recarga a ${u.name}`,
        admin_id: opts.adminId || null});
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
    touch(u);
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
    touch(m);
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
        retentionPercent: data.settings.retention_percent || 15};
}

/* Rompecabezas — niveles infinitos */
function ensurePuzzleSessions() {
    if (!data.puzzle_sessions) data.puzzle_sessions = [];
    if (!data.counters.puzzle_sessions) data.counters.puzzle_sessions = 0;
}

function prunePuzzleSessions() {
    ensurePuzzleSessions();
    const cutoff = Date.now() - 1000 * 60 * 60 * 6;
    data.puzzle_sessions = data.puzzle_sessions.filter((s) => {
        if (s.status === 'playing' || s.status === 'level_complete') return true;
        return new Date(s.created_at).getTime() > cutoff;
    });
}

function findPuzzleSession(id) {
    ensurePuzzleSessions();
    return data.puzzle_sessions.find((s) => s.id === parseInt(id, 10)) || null;
}

function findActivePuzzleSession({ machineId, userId }) {
    ensurePuzzleSessions();
    return data.puzzle_sessions.find((s) => {
        if (machineId && s.machine_id === machineId && (s.status === 'playing' || s.status === 'level_complete')) return true;
        if (userId && s.user_id === userId && (s.status === 'playing' || s.status === 'level_complete')) return true;
        return false;
    }) || null;
}

function creditPuzzlePrize(session, amount) {
    if (amount <= 0) return getPuzzleOwnerBalance(session);
    if (session.machine_id) {
        const m = findMachineById(session.machine_id);
        m.balance += amount;
        addTransaction({
            machine_id: session.machine_id, type: 'win', amount,
            balance_after: m.balance, game: 'rompecabezas'});
        return m.balance;
    }
    const u = findUserById(session.user_id);
    u.game_balance += amount;
    addTransaction({
        user_id: session.user_id, type: 'win', amount,
        balance_after: u.game_balance, game: 'rompecabezas'});
    return u.game_balance;
}

function chargePuzzleBet(sessionOwner, bet) {
    if (sessionOwner.machineId) {
        const m = findMachineById(sessionOwner.machineId);
        if (!m || !m.active) throw new Error('Máquina no disponible');
        if (m.balance < bet) throw new Error('Saldo insuficiente en la máquina');
        m.balance -= bet;
        addTransaction({
            machine_id: sessionOwner.machineId, type: 'bet', amount: -bet,
            balance_after: m.balance, game: 'rompecabezas'});
        return { balance: m.balance, machine_number: m.number };
    }
    const u = findUserById(sessionOwner.userId);
    if (!u || u.role !== 'user' || !u.active) throw new Error('Usuario no disponible');
    if ((u.game_balance || 0) < bet) throw new Error('Saldo insuficiente');
    u.game_balance -= bet;
    addTransaction({
        user_id: sessionOwner.userId, type: 'bet', amount: -bet,
        balance_after: u.game_balance, game: 'rompecabezas'});
    return { balance: u.game_balance, user_name: u.name };
}

function getPuzzleOwnerBalance(session) {
    if (session.machine_id) return findMachineById(session.machine_id)?.balance ?? 0;
    return findUserById(session.user_id)?.game_balance ?? 0;
}

function startPuzzleSession(owner, bet, retentionPercent, { restart = false } = {}) {
    const puzzle = require('../engines/rompecabezas');
    if (!puzzle.BETS.includes(bet)) throw new Error('Apuesta inválida');

    ensurePuzzleSessions();
    prunePuzzleSessions();

    let session = findActivePuzzleSession(owner);

    if (restart && session) {
        session.status = 'abandoned';
        addGameRound({
            machine_id: session.machine_id || null,
            user_id: session.user_id || null,
            game: 'rompecabezas',
            bet: session.bet,
            payout: session.totalWon || 0,
            net: (session.totalWon || 0) - (session.betsPaid || session.bet),
            result_json: JSON.stringify({
                abandoned: true,
                levelReached: session.level,
                totalWon: session.totalWon || 0})});
        persist();
        session = null;
    }

    if (session && session.status === 'playing') {
        throw new Error('Ya tienes un nivel en progreso — termínalo o reinicia');
    }

    let level = 1;
    let claimedLevels = [];
    let totalWon = 0;
    let betsPaid = 0;

    if (session && session.status === 'level_complete') {
        level = session.level + 1;
        claimedLevels = [...(session.claimedLevels || [])];
        totalWon = session.totalWon || 0;
        betsPaid = session.betsPaid || session.bet;
        session.status = 'continued';
    }

    const charged = chargePuzzleBet(owner, bet);
    betsPaid += bet;

    const levelData = puzzle.createLevel(level, bet, retentionPercent);
    const newSession = {
        id: nextId('puzzle_sessions'),
        machine_id: owner.machineId || null,
        user_id: owner.userId || null,
        bet,
        betsPaid,
        level: levelData.level,
        size: levelData.size,
        board: levelData.board,
        prize: levelData.prize,
        prizeMult: levelData.prizeMult,
        moves: 0,
        moveLimit: levelData.moveLimit,
        prizePaid: false,
        claimedLevels,
        totalWon,
        status: 'playing',
        created_at: now()};
    data.puzzle_sessions.push(newSession);
    persist();

    return {
        ...puzzle.publicLevel(newSession),
        balance: charged.balance,
        machine_number: charged.machine_number,
        user_name: charged.user_name,
        message: level === 1
            ? `Nivel 1 · premio ${levelData.prize}`
            : `Nivel ${level} · premio ${levelData.prize}`};
}

function movePuzzleSession(sessionId, tileIndex, owner) {
    const puzzle = require('../engines/rompecabezas');
    const session = findPuzzleSession(sessionId);
    if (!session || (session.status !== 'playing' && session.status !== 'failed')) {
        throw new Error('Partida no encontrada o ya terminada');
    }
    if (owner.machineId && session.machine_id !== owner.machineId) throw new Error('Partida no válida');
    if (owner.userId && session.user_id !== owner.userId) throw new Error('Partida no válida');
    if (session.status === 'failed') throw new Error('Nivel fallido — reinicia o paga para reintentar');

    const result = puzzle.applyMove(session, tileIndex);
    let balance = getPuzzleOwnerBalance(session);

    if (result.awarded > 0) {
        balance = creditPuzzlePrize(session, result.awarded);
        addGameRound({
            machine_id: session.machine_id || null,
            user_id: session.user_id || null,
            game: 'rompecabezas',
            bet: session.bet,
            payout: result.awarded,
            net: result.awarded - session.bet,
            result_json: JSON.stringify({
                level: session.level,
                prize: result.awarded,
                moves: session.moves})});
    } else if (result.failed) {
        addGameRound({
            machine_id: session.machine_id || null,
            user_id: session.user_id || null,
            game: 'rompecabezas',
            bet: session.bet,
            payout: 0,
            net: -session.bet,
            result_json: JSON.stringify({ level: session.level, failed: true, moves: session.moves })});
    }

    persist();
    return {
        ...result,
        session: puzzle.publicLevel(session),
        balance};
}

function retryPuzzleLevel(sessionId, owner, retentionPercent) {
    const puzzle = require('../engines/rompecabezas');
    const session = findPuzzleSession(sessionId);
    if (!session) throw new Error('Partida no encontrada');
    if (owner.machineId && session.machine_id !== owner.machineId) throw new Error('Partida no válida');
    if (owner.userId && session.user_id !== owner.userId) throw new Error('Partida no válida');
    if (session.status !== 'failed') throw new Error('Solo puedes reintentar un nivel fallido');

    const charged = chargePuzzleBet(owner, session.bet);
    session.betsPaid = (session.betsPaid || session.bet) + session.bet;
    const levelData = puzzle.createLevel(session.level, session.bet, retentionPercent);
    session.board = levelData.board;
    session.prize = levelData.prize;
    session.prizeMult = levelData.prizeMult;
    session.moves = 0;
    session.moveLimit = levelData.moveLimit;
    session.prizePaid = (session.claimedLevels || []).includes(session.level);
    session.status = 'playing';
    persist();

    return {
        ...puzzle.publicLevel(session),
        balance: charged.balance,
        machine_number: charged.machine_number,
        user_name: charged.user_name,
        message: `Reintento nivel ${session.level} · cobrado $${session.bet}`};
}

/* Calle Pelea — combates por niveles */
function ensureFightSessions() {
    if (!data.fight_sessions) data.fight_sessions = [];
    if (!data.counters.fight_sessions) data.counters.fight_sessions = 0;
}

function pruneFightSessions() {
    ensureFightSessions();
    const cutoff = Date.now() - 1000 * 60 * 60 * 6;
    data.fight_sessions = data.fight_sessions.filter((s) => {
        if (s.status === 'fighting' || s.status === 'level_complete') return true;
        return new Date(s.created_at).getTime() > cutoff;
    });
}

function findFightSession(id) {
    ensureFightSessions();
    return data.fight_sessions.find((s) => s.id === parseInt(id, 10)) || null;
}

function findActiveFightSession({ machineId, userId }) {
    ensureFightSessions();
    return data.fight_sessions.find((s) => {
        if (machineId && s.machine_id === machineId && (s.status === 'fighting' || s.status === 'level_complete')) return true;
        if (userId && s.user_id === userId && (s.status === 'fighting' || s.status === 'level_complete')) return true;
        return false;
    }) || null;
}

function creditFightPrize(session, amount) {
    if (amount <= 0) return getFightOwnerBalance(session);
    if (session.machine_id) {
        const m = findMachineById(session.machine_id);
        m.balance += amount;
        addTransaction({
            machine_id: session.machine_id, type: 'win', amount,
            balance_after: m.balance, game: 'calle-pelea'});
        return m.balance;
    }
    const u = findUserById(session.user_id);
    u.game_balance += amount;
    addTransaction({
        user_id: session.user_id, type: 'win', amount,
        balance_after: u.game_balance, game: 'calle-pelea'});
    return u.game_balance;
}

function chargeFightBet(owner, bet) {
    if (owner.machineId) {
        const m = findMachineById(owner.machineId);
        if (!m || !m.active) throw new Error('Máquina no disponible');
        if (m.balance < bet) throw new Error('Saldo insuficiente en la máquina');
        m.balance -= bet;
        addTransaction({
            machine_id: owner.machineId, type: 'bet', amount: -bet,
            balance_after: m.balance, game: 'calle-pelea'});
        return { balance: m.balance, machine_number: m.number };
    }
    const u = findUserById(owner.userId);
    if (!u || u.role !== 'user' || !u.active) throw new Error('Usuario no disponible');
    if ((u.game_balance || 0) < bet) throw new Error('Saldo insuficiente');
    u.game_balance -= bet;
    addTransaction({
        user_id: owner.userId, type: 'bet', amount: -bet,
        balance_after: u.game_balance, game: 'calle-pelea'});
    return { balance: u.game_balance, user_name: u.name };
}

function getFightOwnerBalance(session) {
    if (session.machine_id) return findMachineById(session.machine_id)?.balance ?? 0;
    return findUserById(session.user_id)?.game_balance ?? 0;
}

function startFightSession(owner, bet, retentionPercent, { restart = false } = {}) {
    const fight = require('../engines/calle-pelea');
    if (!fight.BETS.includes(bet)) throw new Error('Apuesta inválida');

    ensureFightSessions();
    pruneFightSessions();

    let session = findActiveFightSession(owner);

    if (restart && session) {
        session.status = 'abandoned';
        addGameRound({
            machine_id: session.machine_id || null,
            user_id: session.user_id || null,
            game: 'calle-pelea',
            bet: session.bet,
            payout: session.totalWon || 0,
            net: (session.totalWon || 0) - (session.betsPaid || session.bet),
            result_json: JSON.stringify({
                abandoned: true,
                levelReached: session.level,
                totalWon: session.totalWon || 0})});
        persist();
        session = null;
    }

    // Resume in-progress fight after refresh / lost client state (no extra charge)
    if (session && session.status === 'fighting') {
        const balance = getFightOwnerBalance(session);
        const m = session.machine_id ? findMachineById(session.machine_id) : null;
        const u = session.user_id ? findUserById(session.user_id) : null;
        return {
            ...fight.publicFight(session),
            balance,
            machine_number: m?.number,
            user_name: u?.name,
            resumed: true,
            message: `Continúa nivel ${session.level} · vs ${session.rival?.name || 'rival'}`};
    }

    let level = 1;
    let claimedLevels = [];
    let totalWon = 0;
    let betsPaid = 0;

    if (session && session.status === 'level_complete') {
        level = session.level + 1;
        claimedLevels = [...(session.claimedLevels || [])];
        totalWon = session.totalWon || 0;
        betsPaid = session.betsPaid || session.bet;
        session.status = 'continued';
    }

    const charged = chargeFightBet(owner, bet);
    betsPaid += bet;

    const fightData = fight.createFight(level, bet, retentionPercent);
    const newSession = {
        id: nextId('fight_sessions'),
        machine_id: owner.machineId || null,
        user_id: owner.userId || null,
        bet,
        betsPaid,
        ...fightData,
        playerHistory: [],
        claimedLevels,
        totalWon,
        status: 'fighting',
        created_at: now()};
    data.fight_sessions.push(newSession);
    persist();

    return {
        ...fight.publicFight(newSession),
        balance: charged.balance,
        machine_number: charged.machine_number,
        user_name: charged.user_name,
        message: `Nivel ${level} · vs ${fightData.rival.name} · premio $${fightData.prize}`};
}

function actionFightSession(sessionId, playerAction, owner) {
    const fight = require('../engines/calle-pelea');
    const session = findFightSession(sessionId);
    if (!session || session.status !== 'fighting') {
        throw new Error('Pelea no encontrada o ya terminada');
    }
    if (owner.machineId && session.machine_id !== owner.machineId) throw new Error('Partida no válida');
    if (owner.userId && session.user_id !== owner.userId) throw new Error('Partida no válida');

    const result = fight.resolveRound(session, playerAction);
    let balance = getFightOwnerBalance(session);

    if (result.awarded > 0) {
        balance = creditFightPrize(session, result.awarded);
        addGameRound({
            machine_id: session.machine_id || null,
            user_id: session.user_id || null,
            game: 'calle-pelea',
            bet: session.bet,
            payout: result.awarded,
            net: result.awarded - session.bet,
            result_json: JSON.stringify({
                level: session.level,
                prize: result.awarded,
                rival: session.rival?.name,
                rounds: session.round})});
    } else if (result.finished && !result.won) {
        addGameRound({
            machine_id: session.machine_id || null,
            user_id: session.user_id || null,
            game: 'calle-pelea',
            bet: session.bet,
            payout: 0,
            net: -session.bet,
            result_json: JSON.stringify({ level: session.level, failed: true, rounds: session.round })});
    }

    persist();
    return {
        ...result,
        session: fight.publicFight(session),
        balance};
}

function retryFightLevel(sessionId, owner, retentionPercent) {
    const fight = require('../engines/calle-pelea');
    const session = findFightSession(sessionId);
    if (!session) throw new Error('Partida no encontrada');
    if (owner.machineId && session.machine_id !== owner.machineId) throw new Error('Partida no válida');
    if (owner.userId && session.user_id !== owner.userId) throw new Error('Partida no válida');
    if (session.status !== 'failed') throw new Error('Solo puedes reintentar una derrota');

    const charged = chargeFightBet(owner, session.bet);
    session.betsPaid = (session.betsPaid || session.bet) + session.bet;
    const fightData = fight.createFight(session.level, session.bet, retentionPercent);
    Object.assign(session, {
        prize: fightData.prize,
        prizeMult: fightData.prizeMult,
        rival: fightData.rival,
        playerHp: fightData.playerHp,
        playerMaxHp: fightData.playerMaxHp,
        enemyHp: fightData.enemyHp,
        enemyMaxHp: fightData.enemyMaxHp,
        enemyDmg: fightData.enemyDmg,
        playerPunch: fightData.playerPunch,
        playerKick: fightData.playerKick,
        round: 0,
        maxRounds: fightData.maxRounds,
        prizePaid: (session.claimedLevels || []).includes(session.level),
        playerHistory: [],
        log: [],
        status: 'fighting'});
    persist();

    return {
        ...fight.publicFight(session),
        balance: charged.balance,
        machine_number: charged.machine_number,
        user_name: charged.user_name,
        message: `Revanche nivel ${session.level} · cobrado $${session.bet}`};
}

/* Calle Runner sessions */
function ensureRunnerSessions() {
    if (!data.runner_sessions) data.runner_sessions = [];
    if (!data.counters.runner_sessions) data.counters.runner_sessions = 0;
}

function pruneRunnerSessions() {
    ensureRunnerSessions();
    const cutoff = Date.now() - 1000 * 60 * 60 * 6;
    data.runner_sessions = data.runner_sessions.filter((s) => {
        if (s.status === 'running' || s.status === 'level_complete') return true;
        return new Date(s.created_at).getTime() > cutoff;
    });
}

function findRunnerSession(id) {
    ensureRunnerSessions();
    return data.runner_sessions.find((s) => s.id === parseInt(id, 10)) || null;
}

function findActiveRunnerSession({ machineId, userId }) {
    ensureRunnerSessions();
    return data.runner_sessions.find((s) => {
        if (machineId && s.machine_id === machineId && (s.status === 'running' || s.status === 'level_complete')) return true;
        if (userId && s.user_id === userId && (s.status === 'running' || s.status === 'level_complete')) return true;
        return false;
    }) || null;
}

function getRunnerOwnerBalance(session) {
    if (session.machine_id) return findMachineById(session.machine_id)?.balance ?? 0;
    return findUserById(session.user_id)?.game_balance ?? 0;
}

function chargeRunnerBet(owner, bet) {
    if (owner.machineId) {
        const m = findMachineById(owner.machineId);
        if (!m || !m.active) throw new Error('Máquina no disponible');
        if (m.balance < bet) throw new Error('Saldo insuficiente en la máquina');
        m.balance -= bet;
        addTransaction({
            machine_id: owner.machineId, type: 'bet', amount: -bet,
            balance_after: m.balance, game: 'calle-runner'});
        return { balance: m.balance, machine_number: m.number };
    }
    const u = findUserById(owner.userId);
    if (!u || u.role !== 'user' || !u.active) throw new Error('Usuario no disponible');
    if ((u.game_balance || 0) < bet) throw new Error('Saldo insuficiente');
    u.game_balance -= bet;
    addTransaction({
        user_id: owner.userId, type: 'bet', amount: -bet,
        balance_after: u.game_balance, game: 'calle-runner'});
    return { balance: u.game_balance, user_name: u.name };
}

function creditRunnerPrize(session, amount) {
    if (amount <= 0) return getRunnerOwnerBalance(session);
    if (session.machine_id) {
        const m = findMachineById(session.machine_id);
        m.balance += amount;
        addTransaction({
            machine_id: session.machine_id, type: 'win', amount,
            balance_after: m.balance, game: 'calle-runner'});
        return m.balance;
    }
    const u = findUserById(session.user_id);
    u.game_balance += amount;
    addTransaction({
        user_id: session.user_id, type: 'win', amount,
        balance_after: u.game_balance, game: 'calle-runner'});
    return u.game_balance;
}

/** Devuelve la apuesta del intento actual (p. ej. al cerrar/reiniciar una carrera a medias). */
function refundRunnerBet(session, amount) {
    if (amount <= 0) return getRunnerOwnerBalance(session);
    if (session.machine_id) {
        const m = findMachineById(session.machine_id);
        if (!m) return 0;
        m.balance += amount;
        addTransaction({
            machine_id: session.machine_id, type: 'refund', amount,
            balance_after: m.balance, game: 'calle-runner'});
        return m.balance;
    }
    const u = findUserById(session.user_id);
    if (!u) return 0;
    u.game_balance = (u.game_balance || 0) + amount;
    addTransaction({
        user_id: session.user_id, type: 'refund', amount,
        balance_after: u.game_balance, game: 'calle-runner'});
    return u.game_balance;
}

function abandonRunnerSession(session, { refundAttempt = true } = {}) {
    let refunded = 0;
    // Si la carrera seguía en curso, el intento no se jugó hasta el final: se devuelve la apuesta.
    if (refundAttempt && session.status === 'running') {
        refunded = session.bet || 0;
        refundRunnerBet(session, refunded);
        session.betsPaid = Math.max(0, (session.betsPaid || session.bet) - refunded);
    }
    session.status = 'abandoned';
    addGameRound({
        machine_id: session.machine_id || null,
        user_id: session.user_id || null,
        game: 'calle-runner',
        bet: session.bet,
        payout: (session.totalWon || 0) + refunded,
        net: (session.totalWon || 0) + refunded - (session.betsPaid || 0) - refunded,
        result_json: JSON.stringify({
            abandoned: true,
            refunded,
            levelReached: session.level,
            totalWon: session.totalWon || 0})});
    return refunded;
}

/** Consulta sin cobrar: carrera activa para retomar al reabrir la página. */
function getActiveRunnerSession(owner) {
    const runner = require('../engines/calle-runner');
    ensureRunnerSessions();
    pruneRunnerSessions();
    const session = findActiveRunnerSession(owner);
    if (!session) {
        return {
            active: false,
            balance: owner.machineId
                ? (findMachineById(owner.machineId)?.balance ?? 0)
                : (findUserById(owner.userId)?.game_balance ?? 0),
        };
    }
    return {
        active: true,
        resumed: session.status === 'running',
        levelComplete: session.status === 'level_complete',
        ...runner.publicRun(session),
        balance: getRunnerOwnerBalance(session),
        machine_number: session.machine_id ? findMachineById(session.machine_id)?.number : undefined,
        user_name: session.user_id ? findUserById(session.user_id)?.name : undefined,
        message: session.status === 'running'
            ? `Carrera en curso · nivel ${session.level} (ya cobrada)`
            : `Nivel ${session.level} completado · listo para el siguiente`,
    };
}

function startRunnerSession(owner, bet, retentionPercent, { restart = false } = {}) {
    const runner = require('../engines/calle-runner');
    if (!runner.BETS.includes(bet)) throw new Error('Apuesta inválida');

    ensureRunnerSessions();
    pruneRunnerSessions();

    let session = findActiveRunnerSession(owner);

    if (restart && session) {
        abandonRunnerSession(session, { refundAttempt: session.status === 'running' });
        persist();
        session = null;
    }

    // Carrera en curso (refresh del cliente): se retoma sin cobrar de nuevo
    if (session && session.status === 'running') {
        return {
            ...runner.publicRun(session),
            balance: getRunnerOwnerBalance(session),
            machine_number: session.machine_id ? findMachineById(session.machine_id)?.number : undefined,
            user_name: session.user_id ? findUserById(session.user_id)?.name : undefined,
            resumed: true,
            message: `Continúa nivel ${session.level}`};
    }

    let level = 1;
    let claimedLevels = [];
    let totalWon = 0;
    let betsPaid = 0;

    if (session && session.status === 'level_complete') {
        level = session.level + 1;
        claimedLevels = [...(session.claimedLevels || [])];
        totalWon = session.totalWon || 0;
        betsPaid = session.betsPaid || session.bet;
        session.status = 'continued';
    }

    const charged = chargeRunnerBet(owner, bet);
    betsPaid += bet;

    const runData = runner.createRun(level, bet, retentionPercent);
    const newSession = {
        id: nextId('runner_sessions'),
        machine_id: owner.machineId || null,
        user_id: owner.userId || null,
        bet,
        betsPaid,
        ...runData,
        distance: 0,
        coins: 0,
        prizePaid: false,
        claimedLevels,
        totalWon,
        status: 'running',
        created_at: now()};
    data.runner_sessions.push(newSession);
    persist();

    return {
        ...runner.publicRun(newSession),
        balance: charged.balance,
        machine_number: charged.machine_number,
        user_name: charged.user_name,
        message: `Nivel ${level} · ${runData.goal} m · premio $${runData.prize}`};
}

function finishRunnerSession(sessionId, report, owner) {
    const runner = require('../engines/calle-runner');
    const session = findRunnerSession(sessionId);
    if (!session || session.status !== 'running') {
        throw new Error('Carrera no encontrada o ya terminada');
    }
    if (owner.machineId && session.machine_id !== owner.machineId) throw new Error('Partida no válida');
    if (owner.userId && session.user_id !== owner.userId) throw new Error('Partida no válida');

    const result = runner.settleRun(session, report);
    let balance = getRunnerOwnerBalance(session);

    if (result.awarded > 0) {
        balance = creditRunnerPrize(session, result.awarded);
    }

    addGameRound({
        machine_id: session.machine_id || null,
        user_id: session.user_id || null,
        game: 'calle-runner',
        bet: session.bet,
        payout: result.awarded,
        net: result.awarded - session.bet,
        result_json: JSON.stringify({
            level: session.level,
            completed: result.completed,
            distance: result.distance,
            coins: result.coins,
            coinBonus: result.coinBonus})});

    persist();
    return {
        ...result,
        session: runner.publicRun(session),
        balance};
}

function retryRunnerLevel(sessionId, owner, retentionPercent) {
    const runner = require('../engines/calle-runner');
    const session = findRunnerSession(sessionId);
    if (!session) throw new Error('Partida no encontrada');
    if (owner.machineId && session.machine_id !== owner.machineId) throw new Error('Partida no válida');
    if (owner.userId && session.user_id !== owner.userId) throw new Error('Partida no válida');
    if (session.status !== 'failed') throw new Error('Solo puedes reintentar una carrera perdida');

    const charged = chargeRunnerBet(owner, session.bet);
    session.betsPaid = (session.betsPaid || session.bet) + session.bet;
    const runData = runner.createRun(session.level, session.bet, retentionPercent);
    Object.assign(session, runData, {
        distance: 0,
        coins: 0,
        prizePaid: (session.claimedLevels || []).includes(session.level),
        status: 'running'});
    persist();

    return {
        ...runner.publicRun(session),
        balance: charged.balance,
        machine_number: charged.machine_number,
        user_name: charged.user_name,
        message: `Reintento nivel ${session.level} · cobrado $${session.bet}`};
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
        branches: data.branches.filter((b) => b.active).length};
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

    let changed = false;
    if (admin.role !== 'admin') { admin.role = 'admin'; changed = true; }
    if (!admin.active) { admin.active = 1; changed = true; }
    if (admin.username !== adminUser) { admin.username = adminUser; changed = true; }
    if (admin.email != null) { admin.email = null; changed = true; }

    // Fast path: seed already matches desired password — skip bcrypt on every request
    if (!admin.password_hash) {
        admin.password_hash = bcrypt.hashSync(desiredPassword, 10);
        data.settings.admin_password_seed = desiredPassword;
        changed = true;
    } else if (data.settings.admin_password_seed !== desiredPassword) {
        admin.password_hash = bcrypt.hashSync(desiredPassword, 10);
        data.settings.admin_password_seed = desiredPassword;
        changed = true;
    }
    if (changed) persist();
}

function ensureDefaultAgent() {
    // Solo con demo explícito — en producción el admin crea agentes
    if (process.env.ENABLE_DEMO_SEED !== '1') return;
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

/** Juegos nuevos que deben aparecer en sucursales ya existentes (una sola vez). */
const GAME_ROLLOUTS = { games_calle_runner: 'calle-runner' };

function migrateNewGames() {
    if (!data.migrations) data.migrations = {};
    let changed = false;
    for (const flag of Object.keys(GAME_ROLLOUTS)) {
        if (data.migrations[flag]) continue;
        const gameId = GAME_ROLLOUTS[flag];
        (data.branches || []).forEach((b) => {
            if (!Array.isArray(b.games) || !b.games.length) return;
            if (b.games.includes(gameId)) return;
            b.games.push(gameId);
        });
        data.migrations[flag] = now();
        changed = true;
    }
    if (changed) persist();
}

function seedDefaults() {
    ensurePuzzleSessions();
    ensureFightSessions();
    ensureRunnerSessions();
    migrateNewGames();
    migrateUsernames();
    syncCountersFromData(data);
    // Admin mínimo para que el panel no quede inaccesible
    ensureAdminUser();
    // Demo (Fusion/agente/sucursal123) SOLO si ENABLE_DEMO_SEED=1
    if (process.env.ENABLE_DEMO_SEED === '1') {
        seedBranches();
        ensureDefaultBranches();
        ensureDefaultAgent();
        ensureCashierUser();
    }
    // Allow $1 bets (Ruleta chips 1/5/10…) — migrate old default of 5
    if (data.settings && data.settings.min_bet === 5) {
        data.settings.min_bet = 1;
        persist();
    }
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

// Precomputed bcrypt (cost 8) for "sucursal123" — avoids hashing 7 branches on every cold seed
const DEFAULT_BRANCH_PASSWORD_HASH = '$2a$08$y89krd72bscuG2M0YXBpoO.cfbgpFRubEuOddC9o7DF4XELfeXSQK';

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
    if (findBranchById(cleanId)) {
        const err = new Error('Esa sucursal ya existe');
        err.status = 409;
        err.code = 'BRANCH_EXISTS';
        throw err;
    }
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
        games: ['spin-wheel', 'comic-slot', 'crystal-wins', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'loteria', 'rompecabezas', 'calle-pelea', 'calle-runner'],
        created_at: now(),
        updated_at: now()};
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
        has_password: !!b.password_hash};
}

function ensureBranchAuth(branch) {
    if (!branch) return;
    if (branch.float_balance == null) branch.float_balance = 0;
    if (branch.active == null) branch.active = 1;
    const defaultPwd = 'sucursal123';

    // Custom password: never rehash on every request (was timing out /cajero API on Netlify)
    if (branch.password_custom) {
        if (!branch.password_hash) {
            branch.password_hash = bcrypt.hashSync(defaultPwd, 10);
            branch.password_custom = 0;
            branch.password_seed = defaultPwd;
        }
        return;
    }

    // Fast path — already on default seed
    if (branch.password_hash && branch.password_seed === defaultPwd) return;

    if (!branch.password_hash) {
        branch.password_hash = bcrypt.hashSync(defaultPwd, 10);
        branch.password_seed = defaultPwd;
        return;
    }

    // Legacy rows without seed: stamp default without bcrypt (avoids 7× compare per API call)
    if (!branch.password_seed) {
        branch.password_seed = defaultPwd;
        return;
    }

    // Seed says default but drifted — only then repair once
    if (branch.password_seed === defaultPwd) return;
    branch.password_custom = 1;
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
    touch(branch);
    addTransaction({
        branch_id: branchId, type: 'float_topup', amount, balance_after: branch.float_balance,
        note: note || 'Inyección admin a sucursal', admin_id: adminId});
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
        note: note || `Transferencia de agente ${a.name}`, admin_id: agentId});
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
    const defaults = ['spin-wheel', 'comic-slot', 'crystal-wins', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'loteria', 'rompecabezas', 'calle-pelea', 'calle-runner'];
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
    const allowed = ['spin-wheel', 'comic-slot', 'crystal-wins', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'loteria', 'rompecabezas', 'calle-pelea', 'calle-runner'];
    const list = (games || []).filter((g) => allowed.includes(g));
    if (!list.length) throw new Error('Selecciona al menos un juego');
    branch.games = list;
    persist();
    return getBranchGames(branchId);
}

function getGamesCatalog() {
    const labels = {
        'spin-wheel': 'Ruleta',
        'comic-slot': 'Comic Slot',
        'crystal-wins': 'Crystal Wins',
        'rancho-lazo': 'Rancho Lazo',
        'laguna-anzuelo': 'Laguna Anzuelo',
        'rascadito': 'Rascadito',
        'loteria': 'Lotería',
        'rompecabezas': 'Rompecabezas',
        'calle-pelea': 'Calle Pelea',
        'calle-runner': 'Calle Runner'};
    const ids = Object.keys(labels);
    return ids.map((id) => ({
        id,
        name: labels[id],
        branches: listBranches()
            .filter((b) => getBranchGames(b.id).includes(id))
            .map((b) => ({ id: b.id, name: b.name }))}));
}

function removeGameEverywhere(gameId, branchId = null) {
    const allowed = ['spin-wheel', 'comic-slot', 'crystal-wins', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'loteria', 'rompecabezas', 'calle-pelea', 'calle-runner'];
    if (!allowed.includes(gameId)) throw new Error('Juego no válido');

    const targets = branchId
        ? [findBranchById(branchId)].filter(Boolean)
        : listBranches();
    if (!targets.length) throw new Error('Sucursal no encontrada');

    let updated = 0;
    let skipped = 0;
    for (const branch of targets) {
        const games = getBranchGames(branch.id);
        if (!games.includes(gameId)) continue;
        if (games.length <= 1) {
            skipped += 1;
            continue;
        }
        branch.games = games.filter((g) => g !== gameId);
        updated += 1;
    }
    if (!updated && skipped) {
        throw new Error('No se puede quitar: alguna sucursal quedaría sin juegos');
    }
    if (!updated) throw new Error('Ese juego no está activo en las sucursales indicadas');
    persist();
    return {
        updated,
        skipped,
        catalog: getGamesCatalog(),
        message: branchId
            ? `Juego quitado de la sucursal`
            : `Juego quitado de ${updated} sucursal(es)` + (skipped ? ` · ${skipped} omitida(s)` : '')};
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
    touch(branch);
    persist();
    return sanitizeBranch(branch);
}

function deleteBranch(id) {
    const branch = findBranchById(id);
    if (!branch) throw new Error('Sucursal no encontrada');
    data.users.forEach((u) => {
        if (u.branch_id === id) u.branch_id = null;
    });
    const removedMachines = data.machines.filter((m) => m.branch_id === id);
    removedMachines.forEach((m) => markDeleted('machines', m.id));
    markDeleted('branches', id);
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
    let mutated = false;
    const catalog = ['spin-wheel', 'comic-slot', 'crystal-wins', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'loteria', 'rompecabezas', 'calle-pelea', 'calle-runner'];
    DEFAULT_BRANCHES.forEach((b) => {
        if (!findBranchById(b.id)) {
            data.branches.push({
                id: b.id,
                name: b.name,
                active: 1,
                float_balance: 5000,
                password_hash: DEFAULT_BRANCH_PASSWORD_HASH,
                password_seed: 'sucursal123',
                password_custom: 0,
                games: catalog.slice(),
                created_at: now()});
            ensureMachinesForBranch(b.id, 3);
            mutated = true;
        }
    });
    // No reescribir juegos/máquinas de sucursales existentes en cada request
    if (mutated) persist();
    return mutated ? 1 : 0;
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
        float_balance: branch?.float_balance || 0};
}

module.exports = {
    isServerless, initLocal, reload, flush, flushOrThrow, getPersistStatus, isWriteLocked, hasLoadedExistingDb,
    persist, snapshotData, restoreSnapshot,
    getSettings, setSettings, ensureAdminUser,
    findUserByEmail, findUserByUsername, findUserById, createUser, createPlayer, creditPlayer, listCashiers, listAgents, listPlayers,
    sanitizeUser, setUserActive, updateStaffUser, deleteStaffUser,
    topUpCashier, topUpAgent, transferAgentToCashier,
    findMachineByNumber, findMachineById, listMachines, listMachinesForCashier,
    createMachine, updateMachine, deleteMachine, setMachineActive, assertCashierMachineAccess,
    creditMachine, creditUser, adjustMachineBalance, playMachine, playUser,
    getTransactions, getStats, getScratchPrizePool,
    startPuzzleSession, movePuzzleSession, retryPuzzleLevel, findPuzzleSession,
    startFightSession, actionFightSession, retryFightLevel, findFightSession,
    startRunnerSession, finishRunnerSession, retryRunnerLevel, findRunnerSession, getActiveRunnerSession,
    listBranches, findBranchById, createBranch, updateBranch, deleteBranch, seedBranches, ensureDefaultBranches, branchStats,
    sanitizeBranch, setBranchPassword, topUpBranch, transferAgentToBranch, ensureBranchAuth, assertBranchMachineAccess,
    ensureMachinesForBranch, assignCashierToBranch, unassignCashier, getBranchGames, setBranchGames,
    getGamesCatalog, removeGameEverywhere};
