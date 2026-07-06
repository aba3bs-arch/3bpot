require('dotenv').config();
const app = require('./app');
const os = require('os');

const PORT = process.env.PORT || 3000;

function getLocalIp() {
    for (const nets of Object.values(os.networkInterfaces())) {
        for (const net of nets) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return null;
}

app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIp();
    console.log(`WinPot API en http://localhost:${PORT}`);
    if (ip) console.log(`Celular (misma WiFi): http://${ip}:${PORT}/portal/`);
    console.log(`Portal:  http://localhost:${PORT}/portal/`);
    console.log(`Admin:   http://localhost:${PORT}/admin/`);
    console.log(`Admin:   ${process.env.ADMIN_EMAIL || 'admin@winpot.local'} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
});
