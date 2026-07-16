const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'rancho-lazo', 'js', 'game.js');
let s = fs.readFileSync(file, 'utf8');

const specMarkers = [
  '    drawSpectator(280, 155,',
  '    drawSpectator(275, 152,',
];
let specCall = -1;
for (const m of specMarkers) {
  const i = s.indexOf(m);
  if (i >= 0) { specCall = i; break; }
}
const animalFn = s.indexOf('  function drawAnimal(a) {', specCall);
if (specCall < 0 || animalFn < 0) {
  console.error('spectator block not found', specCall, animalFn);
  process.exit(1);
}

const spectatorBlock = `    drawSpectator(275, 152, "#e85d2c", "#f5c518", 0, "cheer");
    drawSpectator(328, 156, "#3a7bd5", "#fff", 1.1, "clap");
    drawSpectator(382, 150, "#8b4513", "#e8b84a", 2.2, "wave");
    drawSpectator(705, 154, "#4a9e4a", "#ff6b6b", 0.6, "cheer");
  }

  function fillStrokePath(fill, stroke, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke || "#2a1810";
    ctx.lineWidth = lw == null ? 2.2 : lw;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function drawSpectator(x, y, shirt, accent, phaseOff, pose) {
    const bob = Math.sin(state.horseBob * 1.5 + phaseOff) * 2.2;
    const wave = Math.sin(state.horseBob * 2.4 + phaseOff);
    const cy = y + bob;
    const skin = "#f2c49a";
    const outline = "#2a1810";

    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(x, y + 24, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    roundRect(x - 12, cy + 14, 10, 12, 3);
    fillStrokePath("#3d2a1a", outline, 1.8);
    ctx.beginPath();
    roundRect(x + 2, cy + 14, 10, 12, 3);
    fillStrokePath("#3d2a1a", outline, 1.8);

    ctx.beginPath();
    roundRect(x - 11, cy + 2, 9, 16, 3);
    fillStrokePath("#4a3424", outline, 1.6);
    ctx.beginPath();
    roundRect(x + 2, cy + 2, 9, 16, 3);
    fillStrokePath("#4a3424", outline, 1.6);

    ctx.beginPath();
    ctx.ellipse(x, cy - 8, 16, 18, 0, 0, Math.PI * 2);
    fillStrokePath(shirt, outline, 2);
    ctx.beginPath();
    ctx.moveTo(x - 5, cy - 20);
    ctx.lineTo(x + 5, cy - 20);
    ctx.lineTo(x + 4, cy + 2);
    ctx.lineTo(x - 4, cy + 2);
    ctx.closePath();
    fillStrokePath("#f7ecd8", outline, 1.4);

    const armL = pose === "clap" ? -0.2 + wave * 0.25 : -0.55 + wave * 0.15;
    const armR = pose === "wave" ? -1.1 + wave * 0.35 : 0.45 - wave * 0.15;
    ctx.save();
    ctx.translate(x - 14, cy - 12);
    ctx.rotate(armL);
    ctx.beginPath();
    roundRect(-4, 0, 8, 20, 4);
    fillStrokePath(shirt, outline, 1.6);
    ctx.beginPath();
    ctx.arc(0, 20, 5.5, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.5);
    ctx.restore();

    ctx.save();
    ctx.translate(x + 14, cy - 12);
    ctx.rotate(armR);
    ctx.beginPath();
    roundRect(-4, 0, 8, 20, 4);
    fillStrokePath(shirt, outline, 1.6);
    ctx.beginPath();
    ctx.arc(0, 20, 5.5, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.5);
    ctx.restore();

    const headY = cy - 32;
    ctx.beginPath();
    ctx.arc(x, headY, 16, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 2.2);
    ctx.beginPath();
    ctx.ellipse(x - 15, headY + 1, 4, 5.5, -0.2, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.4);
    ctx.beginPath();
    ctx.ellipse(x + 15, headY + 1, 4, 5.5, 0.2, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.4);

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(x - 5.5, headY - 2, 5, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 5.5, headY - 2, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#1a1008";
    ctx.beginPath();
    ctx.arc(x - 4, headY - 1, 2.4, 0, Math.PI * 2);
    ctx.arc(x + 7, headY - 1, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - 5, headY - 2.5, 1, 0, Math.PI * 2);
    ctx.arc(x + 6, headY - 2.5, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, headY - 10);
    ctx.quadraticCurveTo(x - 5, headY - 12, x - 1, headY - 10);
    ctx.moveTo(x + 1, headY - 10);
    ctx.quadraticCurveTo(x + 5, headY - 12, x + 10, headY - 10);
    ctx.stroke();
    ctx.strokeStyle = "#c45c40";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, headY + 5, 6, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,110,90,0.35)";
    ctx.beginPath();
    ctx.ellipse(x - 11, headY + 4, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 11, headY + 4, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(x, headY - 12, 24, 6, 0, 0, Math.PI * 2);
    fillStrokePath("#3d2a1a", outline, 2);
    ctx.beginPath();
    roundRect(x - 11, headY - 30, 22, 18, 4);
    fillStrokePath("#5c3d28", outline, 2);
    ctx.fillStyle = accent;
    ctx.fillRect(x - 11, headY - 16, 22, 3.5);
  }

`;

s = s.slice(0, specCall) + spectatorBlock + s.slice(animalFn);

const playerStart = s.indexOf('  function drawPlayer() {');
const playerEnd = s.indexOf('  function drawFx() {', playerStart);
if (playerStart < 0 || playerEnd < 0) {
  console.error('player block not found');
  process.exit(1);
}

const playerBlock = `  function drawPlayer() {
    // CARTOON_V3: vaquero caricatura + solo cabeza del caballo
    const bob = Math.sin(state.horseBob) * 2.4;
    const cx = W * 0.5;
    const cy = H - 4 + bob;
    const lean = Math.sin(state.horseBob * 0.7) * 0.03;
    const outline = "#2a1810";
    const skin = "#f2c49a";

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(lean);

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(-8, 6, 58, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // —— Solo cabeza del caballo ——
    const hx = -48;
    const hy = -26;

    ctx.beginPath();
    ctx.moveTo(hx + 22, hy + 6);
    ctx.quadraticCurveTo(hx + 34, hy + 28, hx + 14, hy + 48);
    ctx.lineTo(hx - 20, hy + 48);
    ctx.quadraticCurveTo(hx - 26, hy + 18, hx - 8, hy + 4);
    ctx.closePath();
    fillStrokePath("#6b4226", outline, 2.2);

    ctx.beginPath();
    ctx.ellipse(hx, hy, 34, 28, -0.1, 0, Math.PI * 2);
    fillStrokePath("#8b5a2b", outline, 2.4);

    // crin
    for (let i = 0; i < 5; i++) {
      const ox = hx - 10 + i * 9;
      ctx.beginPath();
      ctx.moveTo(ox, hy - 22);
      ctx.quadraticCurveTo(ox + 3, hy - 44, ox + 12, hy - 24);
      ctx.quadraticCurveTo(ox + 4, hy - 16, ox, hy - 22);
      ctx.closePath();
      fillStrokePath("#1a1008", outline, 1.4);
    }

    // orejas
    ctx.beginPath();
    ctx.moveTo(hx - 18, hy - 18);
    ctx.lineTo(hx - 26, hy - 44);
    ctx.lineTo(hx - 6, hy - 22);
    ctx.closePath();
    fillStrokePath("#5a351c", outline, 1.8);
    ctx.beginPath();
    ctx.moveTo(hx + 6, hy - 20);
    ctx.lineTo(hx + 14, hy - 46);
    ctx.lineTo(hx + 18, hy - 18);
    ctx.closePath();
    fillStrokePath("#5a351c", outline, 1.8);

    // hocico
    ctx.beginPath();
    ctx.ellipse(hx - 28, hy + 8, 18, 13, -0.12, 0, Math.PI * 2);
    fillStrokePath("#f0c8b0", outline, 2);
    ctx.fillStyle = "#1a1008";
    ctx.beginPath();
    ctx.ellipse(hx - 38, hy + 4, 3.2, 2.4, 0, 0, Math.PI * 2);
    ctx.ellipse(hx - 38, hy + 12, 3.2, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c45c40";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(hx - 30, hy + 14, 6, 0.1, Math.PI - 0.1);
    ctx.stroke();

    // ojo caballo
    ctx.beginPath();
    ctx.ellipse(hx - 2, hy - 6, 9, 10, 0, 0, Math.PI * 2);
    fillStrokePath("#fff", outline, 2);
    ctx.fillStyle = "#1a1008";
    ctx.beginPath();
    ctx.arc(hx, hy - 5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(hx - 2, hy - 7, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - 12, hy - 18);
    ctx.lineTo(hx + 8, hy - 16);
    ctx.stroke();

    // —— Vaquero caricatura ——
    const rx = 26;
    const ry = -78;

    // piernas montado
    ctx.beginPath();
    roundRect(rx - 20, ry + 38, 15, 30, 6);
    fillStrokePath("#3d2a1a", outline, 2);
    ctx.beginPath();
    roundRect(rx + 6, ry + 38, 15, 30, 6);
    fillStrokePath("#3d2a1a", outline, 2);
    ctx.beginPath();
    roundRect(rx - 22, ry + 60, 19, 11, 4);
    fillStrokePath("#1a1008", outline, 1.8);
    ctx.beginPath();
    roundRect(rx + 4, ry + 60, 19, 11, 4);
    fillStrokePath("#1a1008", outline, 1.8);

    // torso
    ctx.beginPath();
    ctx.ellipse(rx, ry + 22, 24, 26, 0, 0, Math.PI * 2);
    fillStrokePath("#ff7a3a", outline, 2.4);
    // chaleco
    ctx.beginPath();
    ctx.moveTo(rx - 18, ry + 4);
    ctx.lineTo(rx - 6, ry + 4);
    ctx.lineTo(rx - 4, ry + 42);
    ctx.lineTo(rx - 20, ry + 38);
    ctx.closePath();
    fillStrokePath("#c44518", outline, 1.6);
    ctx.beginPath();
    ctx.moveTo(rx + 18, ry + 4);
    ctx.lineTo(rx + 6, ry + 4);
    ctx.lineTo(rx + 4, ry + 42);
    ctx.lineTo(rx + 20, ry + 38);
    ctx.closePath();
    fillStrokePath("#c44518", outline, 1.6);

    // pañuelo
    ctx.beginPath();
    ctx.moveTo(rx - 12, ry + 2);
    ctx.lineTo(rx + 12, ry + 2);
    ctx.lineTo(rx, ry + 18);
    ctx.closePath();
    fillStrokePath("#3a7bd5", outline, 1.8);
    ctx.beginPath();
    ctx.arc(rx, ry + 26, 5.5, 0, Math.PI * 2);
    fillStrokePath("#f5c518", outline, 1.5);

    // brazos
    ctx.beginPath();
    roundRect(rx - 34, ry + 10, 14, 28, 7);
    fillStrokePath("#ff7a3a", outline, 2);
    ctx.beginPath();
    roundRect(rx + 20, ry + 8, 14, 28, 7);
    fillStrokePath("#ff7a3a", outline, 2);
    ctx.beginPath();
    ctx.arc(rx - 27, ry + 38, 8, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.8);
    ctx.beginPath();
    ctx.arc(rx + 27, ry + 36, 8, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.8);

    // cabeza
    ctx.beginPath();
    ctx.arc(rx, ry - 16, 22, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 2.4);
    ctx.beginPath();
    ctx.ellipse(rx - 21, ry - 14, 5, 7, -0.2, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.5);
    ctx.beginPath();
    ctx.ellipse(rx + 21, ry - 14, 5, 7, 0.2, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.5);

    // ojos
    ctx.beginPath();
    ctx.ellipse(rx - 8, ry - 18, 7, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(rx + 8, ry - 18, 7, 8, 0, 0, Math.PI * 2);
    fillStrokePath("#fff", outline, 1.8);
    ctx.fillStyle = "#1a1008";
    ctx.beginPath();
    ctx.arc(rx - 6, ry - 17, 3.4, 0, Math.PI * 2);
    ctx.arc(rx + 10, ry - 17, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(rx - 8, ry - 19, 1.4, 0, Math.PI * 2);
    ctx.arc(rx + 8, ry - 19, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // cejas
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx - 15, ry - 28);
    ctx.quadraticCurveTo(rx - 8, ry - 31, rx - 1, ry - 28);
    ctx.moveTo(rx + 1, ry - 28);
    ctx.quadraticCurveTo(rx + 8, ry - 31, rx + 15, ry - 28);
    ctx.stroke();

    // bigote
    ctx.beginPath();
    ctx.ellipse(rx - 7, ry - 4, 8, 3.5, -0.2, 0, Math.PI * 2);
    ctx.ellipse(rx + 7, ry - 4, 8, 3.5, 0.2, 0, Math.PI * 2);
    fillStrokePath("#5c3d28", outline, 1.4);
    ctx.strokeStyle = "#c45c40";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(rx, ry + 2, 7, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,110,90,0.4)";
    ctx.beginPath();
    ctx.ellipse(rx - 15, ry - 6, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.ellipse(rx + 15, ry - 6, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // sombrero enorme
    ctx.beginPath();
    ctx.ellipse(rx, ry - 30, 40, 9, 0, 0, Math.PI * 2);
    fillStrokePath("#3d2a1a", outline, 2.4);
    ctx.beginPath();
    roundRect(rx - 16, ry - 56, 32, 28, 7);
    fillStrokePath("#5c3d28", outline, 2.2);
    ctx.beginPath();
    ctx.ellipse(rx - 32, ry - 30, 12, 5, -0.25, 0, Math.PI * 2);
    fillStrokePath("#2a1810", outline, 1.5);
    ctx.beginPath();
    ctx.ellipse(rx + 32, ry - 30, 12, 5, 0.25, 0, Math.PI * 2);
    fillStrokePath("#2a1810", outline, 1.5);
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(rx - 16, ry - 34, 32, 5);
    ctx.beginPath();
    roundRect(rx - 5, ry - 36, 10, 8, 2);
    fillStrokePath("#fff3c0", outline, 1.2);

    if (!state.lassos.length) {
      ctx.strokeStyle = "#d4a017";
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.ellipse(rx + 30, ry - 4, 20, 12, 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(rx + 30, ry - 4, 11, 6.5, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

`;

s = s.slice(0, playerStart) + playerBlock + s.slice(playerEnd);

fs.writeFileSync(file, s);
console.log('Patched cartoon cowboy + spectators ->', file);
console.log('Has CARTOON_V3:', s.includes('CARTOON_V3'));
