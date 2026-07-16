require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const store = require('./db/store');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const agenteRoutes = require('./routes/agente');
const cajeroRoutes = require('./routes/cajero');
const playRoutes = require('./routes/play');

const app = express();
const ROOT = path.join(__dirname, '..');
const isServerless = store.isServerless;

app.use(cors());
app.use(express.json());

if (isServerless) {
    app.use(async (req, res, next) => {
        try {
            await store.reload();
            const flushData = () => store.flush().catch((e) => console.error('[store]', e));
            res.on('finish', flushData);
            res.on('close', flushData);
            next();
        } catch (err) {
            console.error('[store] reload:', err);
            next(err);
        }
    });
} else {
    store.initLocal();
}

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, currency: 'MXN', mode: 'arcade' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agente', agenteRoutes);
app.use('/api/cajero', cajeroRoutes);
app.use('/api/play', playRoutes);

if (!isServerless) {
    const staticDirs = ['shared', 'admin', 'agente', 'cajero', 'portal', 'inicio', 'spin-game', 'comic-slot', 'rancho-lazo', 'laguna-anzuelo', 'rascadito'];
    staticDirs.forEach((dir) => app.use(`/${dir}`, express.static(path.join(ROOT, dir))));
    app.get('/', (_req, res) => res.redirect('/portal/'));
}

app.use((err, _req, res, _next) => {
    console.error('[api]', err);
    res.status(500).json({ error: 'Error del servidor' });
});

module.exports = app;
