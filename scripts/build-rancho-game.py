from pathlib import Path

draw = Path(r"rancho-lazo/js/_draw.js").read_text(encoding="utf-8")

head = r'''(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const creditsEl = document.getElementById("credits");
  const betEl = document.getElementById("bet");
  const winEl = document.getElementById("win");
  const hintEl = document.getElementById("hint");
  const overlay = document.getElementById("overlay");
  const titleEl = document.getElementById("title");
  const subtitleEl = document.getElementById("subtitle");
  const startBtn = document.getElementById("startBtn");
  const betDown = document.getElementById("betDown");
  const betUp = document.getElementById("betUp");
  const muteBtn = document.getElementById("muteBtn");
  const machineLabel = document.getElementById("machineLabel");
  const AudioFX = window.RanchoAudio;

  const W = canvas.width;
  const H = canvas.height;
  const BETS = [5, 10, 20, 50, 100, 200];

  function mxn(n) {
    return MachineAPI.formatPesos(n);
  }

  const ANIMAL_TYPES = [
    { kind: "pig", label: "Cerdo", mult: 0.5, speed: 100, scale: 0.78, resist: 1.5, weight: 72, coat: "#f0a8b0", dark: "#c87888", muzzle: "#e89098", pattern: "solid", horns: false, bull: false, pig: true },
    { kind: "cow", label: "Vaca", mult: 1.5, speed: 120, scale: 1, resist: 3, weight: 14, coat: "#f4f1ea", dark: "#1a1a1a", muzzle: "#e8b4b8", pattern: "spots", horns: false, bull: false, pig: false },
    { kind: "cow", label: "Vaca", mult: 1.5, speed: 135, scale: 1.02, resist: 3.2, weight: 11, coat: "#c47a3a", dark: "#8a4e22", muzzle: "#d4a090", pattern: "solid", horns: false, bull: false, pig: false },
    { kind: "bull", label: "Toro", mult: 8, speed: 195, scale: 1.22, resist: 6.5, weight: 3, coat: "#4a1c12", dark: "#2a0e08", muzzle: "#6a3a30", pattern: "solid", horns: true, bull: true, pig: false },
  ];

  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let busy = false;

  const state = {
    running: false,
    animals: [],
    lassos: [],
    pops: [],
    dust: [],
    spawnTimer: 0,
    lastTs: 0,
    shake: 0,
    horseBob: 0,
    lastWin: 0,
  };

  function bet() { return BETS[betIndex]; }

  function refreshHud() {
    creditsEl.textContent = mxn(credits);
    betEl.textContent = mxn(bet());
    winEl.textContent = mxn(state.lastWin);
    if (machineLabel) machineLabel.textContent = machineNumber ? "#" + machineNumber : "—";
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function pickType() {
    const total = ANIMAL_TYPES.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of ANIMAL_TYPES) {
      r -= t.weight;
      if (r <= 0) return t;
    }
    return ANIMAL_TYPES[0];
  }

  function typeByKind(kind) {
    if (kind === "pig") return ANIMAL_TYPES[0];
    if (kind === "bull") return ANIMAL_TYPES[3];
    return Math.random() < 0.5 ? ANIMAL_TYPES[1] : ANIMAL_TYPES[2];
  }

  function payoutOf(animal) {
    return Math.max(1, Math.round(bet() * animal.mult));
  }

  function spawnAnimal(forcedType) {
    const type = forcedType || pickType();
    const fromLeft = Math.random() < 0.5;
    const lane = Math.floor(rand(0, 3));
    const baseW = (type.pig ? 100 : 130) * type.scale;
    const baseH = (type.pig ? 70 : 90) * type.scale;
    const y = 205 + lane * 58 + rand(-6, 6);
    const speed = type.speed * rand(0.88, 1.12);
    state.animals.push({
      ...type,
      w: baseW,
      h: baseH,
      x: fromLeft ? -baseW - 20 : W + 20,
      y,
      vx: fromLeft ? speed : -speed,
      lane,
      caught: false,
      struggle: false,
      shakeAmp: 0,
      phase: rand(0, Math.PI * 2),
      breath: rand(0, Math.PI * 2),
    });
  }

  function playAnimalSound(animal) {
    if (!AudioFX) return;
    if (animal.pig) AudioFX.oink();
    else if (animal.bull) AudioFX.bellow();
    else AudioFX.moo();
  }

  function activeStruggle() {
    return state.lassos.find((l) => !l.done && l.phase === "struggle");
  }

  function spawnDust(animal, n) {
    for (let i = 0; i < n; i++) {
      state.dust.push({
        x: animal.x + animal.w / 2,
        y: animal.y + animal.h,
        vx: rand(-80, 80),
        vy: rand(-55, -10),
        life: rand(0.3, 0.85),
        size: rand(3, 8),
      });
    }
  }

  async function loadBalance() {
    machineNumber = MachineAPI.requireMachine();
    if (!machineNumber) return;
    try {
      const data = await MachineAPI.getMachine(machineNumber);
      credits = data.balance;
      refreshHud();
      hintEl.textContent = "Saldo de máquina · Toca para lanzar";
    } catch (err) {
      hintEl.textContent = err.message || "Error al cargar saldo";
      titleEl.textContent = "Sin máquina";
      subtitleEl.textContent = err.message || "Selecciona máquina en Inicio";
      overlay.classList.remove("hidden");
    }
  }

  async function throwLasso() {
    if (!state.running || busy) return;
    AudioFX && AudioFX.unlock();

    const struggle = activeStruggle();
    if (struggle) {
      tugStruggle(struggle);
      return;
    }
    if (state.lassos.some((l) => !l.done)) return;
    if (!machineNumber) {
      hintEl.textContent = "Selecciona máquina en Inicio";
      return;
    }
    if (credits < bet()) {
      hintEl.textContent = "Saldo insuficiente — pide recarga al cajero";
      overlay.classList.remove("hidden");
      titleEl.textContent = "Sin saldo";
      subtitleEl.textContent = "Pide recarga al cajero de tu sucursal.";
      startBtn.textContent = "Reintentar";
      return;
    }

    busy = true;
    const betUsed = bet();
    try {
      const result = await MachineAPI.playRanchoLazo(betUsed);
      credits = result.balance;
      state.lastWin = result.payout || 0;
      refreshHud();

      AudioFX && AudioFX.whoosh();
      const lasso = {
        x: W * 0.5,
        y: H - 70,
        ty: 285,
        progress: 0,
        phase: "throw",
        done: false,
        catchId: null,
        grip: 0,
        gripMax: 1,
        escape: 0,
        tugFlash: 0,
        ropeStretch: 0,
        betUsed,
        serverResult: result,
      };
      state.lassos.push(lasso);
      hintEl.textContent = "";

      if (result.animal && result.animal.kind) {
        const t = typeByKind(result.animal.kind);
        state.animals.push({
          ...t,
          w: (t.pig ? 100 : 130) * t.scale,
          h: (t.pig ? 70 : 90) * t.scale,
          x: W * 0.5 - 60,
          y: 260,
          vx: 40,
          lane: 1,
          caught: false,
          struggle: false,
          shakeAmp: 0,
          phase: 0,
          breath: 0,
          serverTarget: true,
        });
      }
    } catch (err) {
      hintEl.textContent = err.message || "Error al jugar";
      AudioFX && AudioFX.miss();
    } finally {
      busy = false;
    }
  }

  function startStruggle(animal, lasso) {
    animal.caught = true;
    animal.struggle = true;
    animal.shakeAmp = 0;
    lasso.catchId = animal;
    lasso.phase = "struggle";
    lasso.progress = 0;
    const sr = lasso.serverResult || {};
    if (sr.caught) {
      lasso.grip = 0.35;
      lasso.gripMax = animal.resist;
      lasso.escape = 0;
    } else {
      lasso.grip = 0.25;
      lasso.gripMax = animal.resist + 2;
      lasso.escape = 0.35;
    }
    lasso.tugFlash = 0;
    lasso.ropeStretch = 0;
    state.shake = 4;
    playAnimalSound(animal);
    hintEl.textContent = "¡Se resiste! Toca rápido para jalar";
    state.pops.push({ x: animal.x + animal.w / 2, y: animal.y - 8, text: "¡Forcejeo!", life: 0.9 });
    spawnDust(animal, 6);
  }

  function tugStruggle(lasso) {
    const animal = lasso.catchId;
    if (!animal) return;
    AudioFX && AudioFX.tug();
    const pullPower = 0.7 + (animal.bull ? 0.1 : 0) + (animal.pig ? 0.25 : 0);
    lasso.grip = Math.min(lasso.gripMax, lasso.grip + pullPower);
    lasso.tugFlash = 0.25;
    lasso.escape = Math.max(0, lasso.escape - 0.15);
    animal.shakeAmp = 1;
    animal.x += (W * 0.5 - animal.w / 2 - animal.x) * 0.1;
    animal.y += (H * 0.62 - animal.y) * 0.06;
    state.shake = Math.min(10, state.shake + 3);
    spawnDust(animal, 3);

    const sr = lasso.serverResult || {};
    if (sr.caught && lasso.grip >= lasso.gripMax * 0.85) {
      finishCatch(animal, lasso, sr);
    }
  }

  function finishCatch(animal, lasso, sr) {
    animal.struggle = false;
    lasso.phase = "pull";
    lasso.progress = 0;
    const win = sr.payout || 0;
    state.lastWin = win;
    refreshHud();
    hintEl.textContent = animal.bull ? "¡TORO! Gran premio" : `¡Premio! ${mxn(win)}`;
    state.pops.push({ x: animal.x + animal.w / 2, y: animal.y - 8, text: `+${mxn(win)}`, life: 1.1 });
    state.shake = animal.bull ? 12 : 7;
    spawnDust(animal, animal.bull ? 16 : 10);
    playAnimalSound(animal);
    if (AudioFX) {
      if (animal.bull) AudioFX.winBig();
      else AudioFX.coin();
    }
  }

  function breakFree(animal, lasso) {
    animal.caught = false;
    animal.struggle = false;
    animal.shakeAmp = 0;
    animal.vx = (animal.x + animal.w / 2 < W * 0.5 ? -1 : 1) * Math.abs(animal.vx || animal.speed) * 1.6;
    lasso.phase = "miss";
    lasso.progress = 0;
    lasso.catchId = null;
    state.lastWin = 0;
    refreshHud();
    const sr = lasso.serverResult || {};
    hintEl.textContent = sr.missed ? "Fallaste — apuesta perdida" : "¡Se escapó! Apuesta perdida";
    state.pops.push({
      x: animal.x + animal.w / 2,
      y: animal.y - 8,
      text: sr.missed ? "¡Fallaste!" : "¡Escapó!",
      life: 1,
    });
    state.shake = 7;
    spawnDust(animal, 8);
    AudioFX && (sr.missed ? AudioFX.miss() : AudioFX.escape());
  }

  function startGame() {
    AudioFX && AudioFX.unlock();
    if (!machineNumber) {
      loadBalance();
      return;
    }
    if (credits < bet()) {
      titleEl.textContent = "Sin saldo";
      subtitleEl.textContent = "Pide recarga al cajero.";
      return;
    }
    state.running = true;
    state.animals = [];
    state.lassos = [];
    state.pops = [];
    state.dust = [];
    state.spawnTimer = 0.15;
    state.lastTs = 0;
    state.shake = 0;
    state.lastWin = 0;
    refreshHud();
    overlay.classList.add("hidden");
    hintEl.textContent = `Toca para lanzar (cuesta ${mxn(bet())})`;
    spawnAnimal();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    state.horseBob += dt * 4;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnAnimal();
      state.spawnTimer = rand(0.7, 1.25);
    }

    for (const a of state.animals) {
      if (a.caught && a.struggle) {
        a.phase += dt * 18;
        a.breath += dt * 8;
        a.shakeAmp = Math.min(1, (a.shakeAmp || 0) + dt * 2);
        const away = a.x + a.w / 2 < W * 0.5 ? -1 : 1;
        a.x += away * (40 + a.resist * 12) * dt;
        continue;
      }
      if (a.caught) continue;
      a.x += a.vx * dt;
      a.phase += dt * Math.abs(a.vx) * 0.085;
      a.breath += dt * 3.2;
      if (a.shakeAmp > 0) a.shakeAmp = Math.max(0, a.shakeAmp - dt * 3);
    }
    state.animals = state.animals.filter((a) => {
      if (a.caught) return true;
      return a.vx > 0 ? a.x < W + 140 : a.x > -140;
    });

    for (const l of state.lassos) {
      if (l.done) continue;
      if (l.phase === "throw") {
        l.progress += dt * 3.2;
        const t = Math.min(1, l.progress);
        const ease = 1 - Math.pow(1 - t, 2);
        l.x = W * 0.5;
        l.y = H - 70 + (l.ty - (H - 70)) * ease;
        if (t >= 1) {
          const sr = l.serverResult || {};
          if (sr.missed) {
            l.phase = "miss";
            l.progress = 0;
            state.lastWin = 0;
            refreshHud();
            state.pops.push({ x: l.x, y: l.y, text: "¡Fallaste!", life: 0.8 });
            hintEl.textContent = "Fallaste — apuesta perdida";
            AudioFX && AudioFX.miss();
          } else {
            let target = state.animals.find((a) => a.serverTarget && !a.caught);
            if (!target && sr.animal) {
              target = state.animals.find((a) => a.kind === sr.animal.kind && !a.caught) || state.animals.find((a) => !a.caught);
            }
            if (target) startStruggle(target, l);
            else {
              l.phase = "miss";
              l.progress = 0;
              AudioFX && AudioFX.miss();
            }
          }
        }
      } else if (l.phase === "struggle") {
        const animal = l.catchId;
        if (!animal) { l.done = true; continue; }
        const sr = l.serverResult || {};
        const drain = (0.28 + animal.resist * 0.06) * dt;
        l.grip = Math.max(0, l.grip - drain);
        l.escape += dt * (sr.caught ? 0.12 : 0.45);
        if (l.tugFlash > 0) l.tugFlash -= dt;
        l.ropeStretch = Math.sin(performance.now() / 60) * (8 + animal.resist * 2);
        l.x = animal.x + animal.w / 2 + Math.sin(animal.phase) * 10;
        l.y = animal.y + animal.h * 0.35 + Math.cos(animal.phase * 1.3) * 6;

        if (sr.caught && l.grip >= lassoGripReady(l)) finishCatch(animal, l, sr);
        else if (!sr.caught && (l.grip <= 0.02 || l.escape >= 1)) breakFree(animal, l);
        else if (sr.caught && l.escape >= 1.2) finishCatch(animal, l, sr);
      } else if (l.phase === "pull") {
        l.progress += dt * 2.4;
        const animal = l.catchId;
        if (animal) {
          animal.x += (W * 0.5 - animal.w / 2 - animal.x) * Math.min(1, dt * 6);
          animal.y += (H - 40 - animal.y) * Math.min(1, dt * 5);
          l.x = animal.x + animal.w / 2;
          l.y = animal.y + animal.h * 0.3;
        }
        if (l.progress >= 1) {
          l.done = true;
          state.animals = state.animals.filter((a) => a !== animal);
        }
      } else if (l.phase === "miss") {
        l.progress += dt * 2.8;
        const t = Math.min(1, l.progress);
        l.y = (l.ty || 285) + (H - 70 - (l.ty || 285)) * t;
        if (t >= 1) l.done = true;
      }
    }
    state.lassos = state.lassos.filter((l) => !l.done);

    for (const p of state.pops) p.life -= dt;
    state.pops = state.pops.filter((p) => p.life > 0);
    for (const d of state.dust) {
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 90 * dt;
    }
    state.dust = state.dust.filter((d) => d.life > 0);
  }

  function lassoGripReady(l) {
    return l.gripMax * 0.85;
  }

'''

tail = r'''
  function draw() {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    }
    drawSky();
    drawBackground();
    const sorted = [...state.animals].sort((a, b) => a.y - b.y);
    for (const a of sorted) drawAnimal(a);
    for (const l of state.lassos) drawLasso(l);
    drawPlayer();
    drawFx();
    ctx.restore();
  }

  function loop(ts) {
    if (!state.running) {
      draw();
      return;
    }
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.033, (ts - state.lastTs) / 1000);
    state.lastTs = ts;
    update(dt);
    draw();
    if (state.running) requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    throwLasso();
  });
  startBtn.addEventListener("click", startGame);
  betDown.addEventListener("click", () => {
    betIndex = Math.max(0, betIndex - 1);
    refreshHud();
  });
  betUp.addEventListener("click", () => {
    betIndex = Math.min(BETS.length - 1, betIndex + 1);
    refreshHud();
  });
  muteBtn.addEventListener("click", () => {
    AudioFX && AudioFX.unlock();
    const next = !(AudioFX && AudioFX.isMuted());
    AudioFX && AudioFX.setMuted(next);
    muteBtn.textContent = next ? "🔇" : "🔊";
  });

  refreshHud();
  draw();
  loadBalance();
})();
'''

out = head + draw + tail
Path(r"rancho-lazo/js/game.js").write_text(out, encoding="utf-8")
print("wrote", len(out))
