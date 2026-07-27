const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
    store.ensureAdminUser();
    const username = String(req.body.username || req.body.email || '').trim();
    const password = req.body.password;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    const user = store.findUserByUsername(username);
    if (!user) {
        return res.status(401).json({ error: 'Usuario no encontrado. Revisa el usuario o créalo de nuevo en Admin.' });
    }
    if (!user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    if (!user.active) return res.status(403).json({ error: 'Cuenta desactivada' });

    const staffRoles = ['admin', 'agent', 'cashier'];
    if (!staffRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Usa el portal de jugadores' });
    }
    if (user.role === 'cashier' && !user.branch_id) {
        return res.status(403).json({ error: 'Cajero sin sucursal asignada — pídele al admin que le asigne una' });
    }

    res.json({ token: signToken(user), user: store.sanitizeUser(user) });
});

/* Login de sucursal: id + contraseña (el panel de caja opera como sucursal) */
router.post('/login-branch', (req, res) => {
    const loginId = String(req.body.branch_id || req.body.id || req.body.username || '').trim().toLowerCase();
    const password = req.body.password;
    if (!loginId || !password) return res.status(400).json({ error: 'Usuario/sucursal y contraseña requeridos' });

    // 1) Sucursal creada por admin/agente
    const branch = store.findBranchById(loginId);
    if (branch && branch.active) {
        store.ensureBranchAuth(branch);
        if (branch.password_hash && bcrypt.compareSync(password, branch.password_hash)) {
            const session = store.sanitizeBranch(branch);
            return res.json({
                token: signToken({
                    id: branch.id,
                    role: 'branch',
                    name: branch.name,
                    username: branch.id,
                    email: branch.id,
                    branch_id: branch.id,
                }),
                user: session,
                branch: session,
            });
        }
        // Wrong password for branch — still try cashier with same login id below
    }

    // 2) Cajero creado por admin (usuario + clave)
    const user = store.findUserByUsername(loginId);
    if (user && user.role === 'cashier') {
        if (!user.active) return res.status(403).json({ error: 'Cajero desactivado' });
        if (!user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        if (!user.branch_id) {
            return res.status(403).json({ error: 'Cajero sin sucursal asignada' });
        }
        const b = store.findBranchById(user.branch_id);
        if (!b || !b.active) return res.status(403).json({ error: 'Sucursal del cajero no disponible' });
        const session = {
            ...store.sanitizeUser(user),
            role: 'cashier',
            branch_id: user.branch_id,
            branch_name: b.name,
        };
        return res.json({
            token: signToken(user),
            user: session,
            branch: store.sanitizeBranch(b),
        });
    }

    if (branch) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    return res.status(401).json({
        error: 'Sucursal o cajero no encontrado. Créalos en Admin y usa el ID/usuario exacto.',
    });
});

router.post('/login-player', (req, res) => {
    const username = String(req.body.username || req.body.email || '').trim();
    const password = req.body.password;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    const user = store.findUserByUsername(username);
    if (!user) {
        return res.status(401).json({ error: 'Jugador no encontrado. Debe crearlo el cajero o la sucursal.' });
    }
    if (user.role !== 'user') {
        return res.status(403).json({ error: 'Esta cuenta no es de jugador. Usa /admin/, /agente/ o /cajero/.' });
    }
    if (!user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    if (!user.active) return res.status(403).json({ error: 'Cuenta desactivada' });

    res.json({ token: signToken(user), user: store.sanitizeUser(user) });
});

router.get('/me', authRequired, (req, res) => {
    if (req.user.role === 'branch') {
        const branch = store.findBranchById(req.user.branch_id || req.user.id);
        if (!branch || !branch.active) return res.status(403).json({ error: 'Sucursal no disponible' });
        return res.json({ user: store.sanitizeBranch(branch), branch: store.sanitizeBranch(branch) });
    }
    if (req.user.role === 'cashier') {
        const user = store.findUserById(req.user.id);
        if (!user || !user.active) return res.status(403).json({ error: 'Cuenta no disponible' });
        const branch = user.branch_id ? store.findBranchById(user.branch_id) : null;
        if (!branch || !branch.active) return res.status(403).json({ error: 'Sucursal no disponible' });
        return res.json({
            user: store.sanitizeUser(user),
            branch: store.sanitizeBranch(branch),
        });
    }
    const user = store.findUserById(req.user.id);
    if (!user || !user.active) return res.status(403).json({ error: 'Cuenta no disponible' });
    res.json({ user: store.sanitizeUser(user) });
});

module.exports = router;
