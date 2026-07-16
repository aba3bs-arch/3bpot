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
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    if (!user.active) return res.status(403).json({ error: 'Cuenta desactivada' });

    const staffRoles = ['admin', 'agent'];
    if (!staffRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Usa el panel de sucursal' });
    }

    res.json({ token: signToken(user), user: store.sanitizeUser(user) });
});

/* Login de sucursal: id + contraseña (el panel de caja opera como sucursal) */
router.post('/login-branch', (req, res) => {
    store.ensureDefaultBranches();
    const branchId = String(req.body.branch_id || req.body.id || '').trim().toLowerCase();
    const password = req.body.password;
    if (!branchId || !password) return res.status(400).json({ error: 'Sucursal y contraseña requeridos' });

    const branch = store.findBranchById(branchId);
    if (!branch) {
        return res.status(401).json({ error: 'Sucursal no encontrada. Usa: fusion, 3b2, 3b5…' });
    }
    if (!branch.active) return res.status(403).json({ error: 'Sucursal desactivada' });

    store.ensureBranchAuth(branch);
    if (!branch.password_hash || !bcrypt.compareSync(password, branch.password_hash)) {
        return res.status(401).json({ error: 'Contraseña incorrecta. Por defecto: sucursal123' });
    }

    const session = store.sanitizeBranch(branch);
    res.json({
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
});

router.post('/login-player', (req, res) => {
    const username = String(req.body.username || req.body.email || '').trim();
    const password = req.body.password;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    const user = store.findUserByUsername(username);
    if (!user || user.role !== 'user' || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
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
    const user = store.findUserById(req.user.id);
    if (!user || !user.active) return res.status(403).json({ error: 'Cuenta no disponible' });
    res.json({ user: store.sanitizeUser(user) });
});

module.exports = router;
