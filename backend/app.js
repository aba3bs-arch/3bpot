require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const store = require('./db/store');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const gameRoutes = require('./routes/games');
const adminRoutes = require('./routes/admin');

const app = express();
const ROOT = path.join(__dirname, '..');
const isServerless = store.isServerless;

app.use(cors());
app.use(express.json());

if (isServerless) {
    app.use(async (req, res, next) => {
        try {
            await store.reload();
            const flushData = () => { store.flush().catch((e) => console.error('[store] flush error:', e)); };
            res.on('finish', flushData);
            res.on('close', flushData);
            next();
        } catch (err) {
            console.error('[store] reload error:', err);
            next(err);
        }
    });
} else {
    store.initLocal();
}

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        currency: process.env.CURRENCY_NAME || 'WinCoins',
        symbol: process.env.CURRENCY_SYMBOL || 'WC',
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/admin', adminRoutes);

if (!isServerless) {
    app.use('/shared', express.static(path.join(ROOT, 'shared')));
    app.use('/portal', express.static(path.join(ROOT, 'portal')));
    app.use('/admin', express.static(path.join(ROOT, 'admin')));
    app.use('/spin-game', express.static(path.join(ROOT, 'spin-game')));
    app.use('/comic-slot', express.static(path.join(ROOT, 'comic-slot')));
    app.get('/', (_req, res) => res.redirect('/portal/'));
}

app.use((err, _req, res, _next) => {
    console.error('[api error]', err);
    const message = process.env.NETLIFY ? 'Error del servidor. Reintenta en unos segundos.' : (err.message || 'Error interno del servidor');
    res.status(500).json({ error: message });
});

module.exports = app;
