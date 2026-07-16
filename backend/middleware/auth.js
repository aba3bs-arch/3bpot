const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(payload) {
    return jwt.sign(
        {
            id: payload.id,
            username: payload.username || payload.email || null,
            email: payload.username || payload.email || null,
            role: payload.role,
            name: payload.name,
            branch_id: payload.branch_id || null,
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function authRequired(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token requerido' });
    }
    try {
        req.user = jwt.verify(header.slice(7), JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

function adminRequired(req, res, next) {
    authRequired(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso de administrador requerido' });
        }
        next();
    });
}

function staffRequired(req, res, next) {
    authRequired(req, res, () => {
        if (!['admin', 'agent'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Acceso de agente o administrador requerido' });
        }
        next();
    });
}

function canMint(role) {
    return role === 'admin';
}

function branchRequired(req, res, next) {
    authRequired(req, res, () => {
        if (req.user.role !== 'branch') {
            return res.status(403).json({ error: 'Acceso de sucursal requerido' });
        }
        next();
    });
}

module.exports = { signToken, authRequired, adminRequired, staffRequired, branchRequired, canMint, JWT_SECRET };
