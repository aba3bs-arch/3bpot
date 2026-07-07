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
    console.log(`3B Pot API en http://localhost:${PORT}`);
    if (ip) console.log(`Celular (misma WiFi): http://${ip}:${PORT}/inicio/`);
    console.log(`Inicio:  http://localhost:${PORT}/inicio/`);
    console.log(`Cajero:  http://localhost:${PORT}/cajero/`);
    console.log(`Admin:   http://localhost:${PORT}/admin/`);
    console.log(`Admin:   ${process.env.ADMIN_EMAIL || 'admin@winpot.local'} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    console.log(`Cajero:  ${process.env.CASHIER_EMAIL || 'cajero@winpot.local'} / ${process.env.CASHIER_PASSWORD || 'cajero123'}`);
});
