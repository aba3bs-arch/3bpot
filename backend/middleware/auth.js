const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
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
        const payload = jwt.verify(header.slice(7), JWT_SECRET);
        req.user = payload;
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

module.exports = { signToken, authRequired, adminRequired, JWT_SECRET };
