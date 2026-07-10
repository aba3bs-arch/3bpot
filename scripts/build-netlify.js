const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const dir of ['inicio', 'admin', 'cajero', 'spin-game', 'comic-slot', 'rancho-lazo', 'shared']) {
    copyDir(path.join(ROOT, dir), path.join(DIST, dir));
}

fs.writeFileSync(
    path.join(DIST, 'index.html'),
    '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/inicio/"><title>3B Pot</title></head><body></body></html>'
);

console.log('Build completado -> dist/');
