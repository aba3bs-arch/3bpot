const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'rancho-lazo', 'js', 'game.js');
let s = fs.readFileSync(file, 'utf8');

const start = s.indexOf('  function drawPlayer() {');
const end = s.indexOf('  function drawFx() {', start);
if (start < 0 || end < 0) {
  console.error('drawPlayer not found');
  process.exit(1);
}

const player = `  function drawPlayer() {
    // CARTOON_V4: vaquero de frente al corral, caballo solo cabeza mirando a la derecha (escenario)
    const bob = Math.sin(state.horseBob) * 3.2;
    const nod = Math.sin(state.horseBob * 1.6) * 0.05;
    const ear = Math.sin(state.horseBob * 5) * 0.12;
    const armSway = Math.sin(state.horseBob * 2.2) * 0.18;
    const cx = W * 0.5;
    const cy = H - 2 + bob;
    const outline = "#2a1810";
    const skin = "#f2c49a";

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(nod);

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(0, 6, 56, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // —— Cabeza del caballo a la IZQUIERDA, mirando a la DERECHA (hacia el corral) ——
    const hx = -44;
    const hy = -24;

    // cuello
    ctx.beginPath();
    ctx.moveTo(hx - 10, hy + 8);
    ctx.quadraticCurveTo(hx - 18, hy + 30, hx - 4, hy + 46);
    ctx.lineTo(hx + 18, hy + 46);
    ctx.quadraticCurveTo(hx + 16, hy + 18, hx + 8, hy + 6);
    ctx.closePath();
    fillStrokePath("#6b4226", outline, 2.2);

    // cabeza
    ctx.beginPath();
    ctx.ellipse(hx, hy, 34, 28, 0.08, 0, Math.PI * 2);
    fillStrokePath("#8b5a2b", outline, 2.4);

    // crin
    for (let i = 0; i < 5; i++) {
      const ox = hx - 14 + i * 9;
      ctx.beginPath();
      ctx.moveTo(ox, hy - 20);
      ctx.quadraticCurveTo(ox - 2, hy - 42, ox + 10, hy - 22);
      ctx.quadraticCurveTo(ox + 2, hy - 14, ox, hy - 20);
      ctx.closePath();
      fillStrokePath("#1a1008", outline, 1.3);
    }

    // orejas (animadas)
    ctx.save();
    ctx.translate(hx - 8, hy - 18);
    ctx.rotate(-0.25 + ear);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-6, -22);
    ctx.lineTo(10, -4);
    ctx.closePath();
    fillStrokePath("#5a351c", outline, 1.6);
    ctx.restore();
    ctx.save();
    ctx.translate(hx + 10, hy - 20);
    ctx.rotate(0.2 - ear);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(8, -24);
    ctx.lineTo(12, -2);
    ctx.closePath();
    fillStrokePath("#5a351c", outline, 1.6);
    ctx.restore();

    // hocico a la DERECHA
    ctx.beginPath();
    ctx.ellipse(hx + 28, hy + 6, 18, 13, 0.1, 0, Math.PI * 2);
    fillStrokePath("#f0c8b0", outline, 2);
    ctx.fillStyle = "#1a1008";
    ctx.beginPath();
    ctx.ellipse(hx + 38, hy + 2, 3.2, 2.4, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + 38, hy + 10, 3.2, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c45c40";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(hx + 30, hy + 12, 6, 0.1, Math.PI - 0.1);
    ctx.stroke();

    // ojo
    ctx.beginPath();
    ctx.ellipse(hx + 4, hy - 6, 9, 10, 0, 0, Math.PI * 2);
    fillStrokePath("#fff", outline, 2);
    ctx.fillStyle = "#1a1008";
    ctx.beginPath();
    ctx.arc(hx + 6, hy - 5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(hx + 4, hy - 7, 1.8, 0, Math.PI * 2);
    ctx.fill();
    // parpadeo ocasional
    if (Math.sin(state.horseBob * 0.7) > 0.92) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx - 4, hy - 6);
      ctx.lineTo(hx + 12, hy - 6);
      ctx.stroke();
    }

    // —— Vaquero ——
    const rx = 22;
    const ry = -76 + Math.sin(state.horseBob * 2) * 1.5;

    ctx.beginPath();
    roundRect(rx - 18, ry + 38, 14, 28, 6);
    fillStrokePath("#3d2a1a", outline, 2);
    ctx.beginPath();
    roundRect(rx + 6, ry + 38, 14, 28, 6);
    fillStrokePath("#3d2a1a", outline, 2);
    ctx.beginPath();
    roundRect(rx - 20, ry + 58, 18, 10, 4);
    fillStrokePath("#1a1008", outline, 1.8);
    ctx.beginPath();
    roundRect(rx + 4, ry + 58, 18, 10, 4);
    fillStrokePath("#1a1008", outline, 1.8);

    ctx.beginPath();
    ctx.ellipse(rx, ry + 22, 24, 26, 0, 0, Math.PI * 2);
    fillStrokePath("#ff7a3a", outline, 2.4);
    ctx.beginPath();
    ctx.moveTo(rx - 12, ry + 2);
    ctx.lineTo(rx + 12, ry + 2);
    ctx.lineTo(rx, ry + 18);
    ctx.closePath();
    fillStrokePath("#3a7bd5", outline, 1.8);

    // brazo derecho (lanza lazo) con sway
    ctx.save();
    ctx.translate(rx + 20, ry + 10);
    ctx.rotate(0.35 + armSway);
    ctx.beginPath();
    roundRect(-4, 0, 12, 26, 6);
    fillStrokePath("#ff7a3a", outline, 2);
    ctx.beginPath();
    ctx.arc(2, 26, 7, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.8);
    ctx.restore();

    ctx.save();
    ctx.translate(rx - 20, ry + 12);
    ctx.rotate(-0.35 - armSway * 0.5);
    ctx.beginPath();
    roundRect(-8, 0, 12, 24, 6);
    fillStrokePath("#ff7a3a", outline, 2);
    ctx.beginPath();
    ctx.arc(-2, 24, 7, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.8);
    ctx.restore();

    // cabeza
    ctx.beginPath();
    ctx.arc(rx, ry - 16, 22, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 2.4);

    ctx.beginPath();
    ctx.ellipse(rx - 8, ry - 18, 7, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(rx + 8, ry - 18, 7, 8, 0, 0, Math.PI * 2);
    fillStrokePath("#fff", outline, 1.8);
    ctx.fillStyle = "#1a1008";
    ctx.beginPath();
    ctx.arc(rx - 6, ry - 17, 3.4, 0, Math.PI * 2);
    ctx.arc(rx + 10, ry - 17, 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(rx - 7, ry - 4, 8, 3.5, -0.2, 0, Math.PI * 2);
    ctx.ellipse(rx + 7, ry - 4, 8, 3.5, 0.2, 0, Math.PI * 2);
    fillStrokePath("#5c3d28", outline, 1.4);
    ctx.strokeStyle = "#c45c40";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(rx, ry + 2, 7, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // sombrero
    ctx.beginPath();
    ctx.ellipse(rx, ry - 30, 40, 9, 0, 0, Math.PI * 2);
    fillStrokePath("#3d2a1a", outline, 2.4);
    ctx.beginPath();
    roundRect(rx - 16, ry - 56, 32, 28, 7);
    fillStrokePath("#5c3d28", outline, 2.2);
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(rx - 16, ry - 34, 32, 5);

    if (!state.lassos.length) {
      ctx.strokeStyle = "#d4a017";
      ctx.lineWidth = 3.8;
      const lx = rx + 28 + Math.sin(state.horseBob * 3) * 3;
      const ly = ry - 2;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 20, 12, 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(lx, ly, 11, 6.5, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

`;

s = s.slice(0, start) + player + s.slice(end);

s = s.replace(
  '  refreshHud();\n  draw();\n  loadBalance();\n})();',
  '  refreshHud();\n  loadBalance();\n  requestAnimationFrame(loop);\n})();'
);

if (!s.includes('requestAnimationFrame(loop)')) {
  s = s.replace(
    '  refreshHud();\r\n  draw();\r\n  loadBalance();\r\n})();',
    '  refreshHud();\r\n  loadBalance();\r\n  requestAnimationFrame(loop);\r\n})();'
  );
}

fs.writeFileSync(file, s);
console.log('drawPlayer V4 + idle loop:', s.includes('CARTOON_V4'), s.includes('requestAnimationFrame(loop)'));
