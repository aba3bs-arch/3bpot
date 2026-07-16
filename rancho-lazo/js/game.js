(() => {
  const isPlayerMode = new URLSearchParams(location.search).has('player');
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
    if (isPlayerMode) return PlayerAuth.formatPesos(n);
    return MachineAPI.formatPesos(n);
  }

  const ANIMAL_TYPES = [
    { kind: "pig", label: "Cerdo", mult: 0.5, speed: 100, scale: 0.95, resist: 1.5, weight: 72, coat: "#f0a8b0", dark: "#c87888", muzzle: "#e89098", pattern: "solid", horns: false, bull: false, pig: true },
    { kind: "cow", label: "Vaca", mult: 1.5, speed: 120, scale: 1.28, resist: 3, weight: 14, coat: "#fff8f0", dark: "#1a1a1a", muzzle: "#e8b4b8", pattern: "spots", horns: false, bull: false, pig: false },
    { kind: "cow", label: "Vaca", mult: 1.5, speed: 135, scale: 1.3, resist: 3.2, weight: 11, coat: "#d4893a", dark: "#6a3a18", muzzle: "#d4a090", pattern: "solid", horns: false, bull: false, pig: false },
    { kind: "bull", label: "Toro", mult: 8, speed: 195, scale: 1.45, resist: 6.5, weight: 3, coat: "#3a120a", dark: "#1a0804", muzzle: "#6a3a30", pattern: "solid", horns: true, bull: true, pig: false },
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
    playerPose: "arena",
    celebrateTimer: 0,
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
    if (isPlayerMode) {
      if (!PlayerAuth.isLoggedIn()) {
        window.location.href = '/portal/?redirect=' + encodeURIComponent(location.pathname + location.search);
        return;
      }
      if (machineLabel) machineLabel.textContent = PlayerAuth.getUser()?.name || 'Jugador';
      try {
        const data = await PlayerAuth.request('/api/auth/me');
        credits = data.user.game_balance || 0;
        refreshHud();
        hintEl.textContent = "Saldo de jugador · Toca para lanzar";
      } catch (err) {
        hintEl.textContent = err.message || "Error al cargar saldo";
        titleEl.textContent = "Sin sesión";
        subtitleEl.textContent = err.message || "Inicia sesión en el portal";
        overlay.classList.remove("hidden");
      }
      return;
    }
    machineNumber = MachineAPI.requireMachine();
    if (!machineNumber) return;
    if (MachineAPI.wireInicioLinks) MachineAPI.wireInicioLinks();
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
    if (!isPlayerMode && !machineNumber) {
      hintEl.textContent = "Selecciona máquina en Inicio";
      return;
    }
    if (credits < bet()) {
      hintEl.textContent = "Saldo insuficiente — recarga en el panel de sucursal";
      overlay.classList.remove("hidden");
      titleEl.textContent = "Sin saldo";
      subtitleEl.textContent = "Pide recarga en la sucursal (panel de caja).";
      startBtn.textContent = "Reintentar";
      return;
    }

    busy = true;
    const betUsed = bet();
    try {
      const result = isPlayerMode
        ? await PlayerAuth.playRanchoLazo(betUsed)
        : await MachineAPI.playRanchoLazo(betUsed);
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
        bornAt: performance.now(),
        snapPieces: null,
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
    hintEl.textContent = "¡Se resiste! Toca rápido — el lazo se rompe a los 5s";
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
    state.playerPose = "celebrate";
    state.celebrateTimer = 3.2;
    state.pops.push({
      x: W * 0.5,
      y: H - 210,
      text: "¡OLE!",
      life: 1.4,
      cheer: true,
    });
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

  const LASSO_TIMEOUT_MS = 5000;

  function snapLasso(lasso, reason) {
    if (lasso.phase === "snap" || lasso.done) return;
    const animal = lasso.catchId;
    const hand = getPlayerHand();
    const handX = hand.x;
    const handY = hand.y;
    const tipX = lasso.x;
    const tipY = lasso.y;
    lasso.snapPieces = [
      { x: handX, y: handY, vx: rand(-40, 40), vy: rand(-120, -40), rot: 0, vr: rand(-4, 4), life: 0.9 },
      { x: (handX + tipX) / 2, y: (handY + tipY) / 2 - 20, vx: rand(-80, 80), vy: rand(-60, 20), rot: 0, vr: rand(-6, 6), life: 1 },
      { x: tipX, y: tipY, vx: rand(-100, 100), vy: rand(-40, 60), rot: 0, vr: rand(-5, 5), life: 1.1 },
    ];
    if (animal) {
      animal.caught = false;
      animal.struggle = false;
      animal.shakeAmp = 0;
      animal.vx = (animal.x + animal.w / 2 < W * 0.5 ? -1 : 1) * Math.abs(animal.vx || animal.speed) * 1.8;
      spawnDust(animal, 10);
      state.pops.push({
        x: animal.x + animal.w / 2,
        y: animal.y - 8,
        text: "¡Se rompió!",
        life: 1.1,
      });
    } else {
      state.pops.push({ x: tipX, y: tipY, text: "¡Se rompió!", life: 1 });
    }
    lasso.phase = "snap";
    lasso.progress = 0;
    lasso.catchId = null;
    state.lastWin = 0;
    refreshHud();
    hintEl.textContent = reason || "¡El lazo se rompió! Apuesta perdida";
    state.shake = 9;
    AudioFX && AudioFX.escape();
  }

  function startGame() {
    AudioFX && AudioFX.unlock();
    if (!isPlayerMode && !machineNumber) {
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
    AudioFX && AudioFX.crowdCheer && AudioFX.crowdCheer();
    requestAnimationFrame(loop);
  }

  function update(dt) {
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

      // Lazo se rompe si no atrapa en 5 segundos
      if ((l.phase === "throw" || l.phase === "struggle") && l.bornAt && performance.now() - l.bornAt >= LASSO_TIMEOUT_MS) {
        snapLasso(l, "¡Se acabó el tiempo! El lazo se rompió");
        continue;
      }

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
      } else if (l.phase === "snap") {
        l.progress += dt;
        if (l.snapPieces) {
          for (const p of l.snapPieces) {
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 280 * dt;
            p.rot += p.vr * dt;
          }
        }
        if (l.progress >= 1.2) l.done = true;
      }
    }
    state.lassos = state.lassos.filter((l) => !l.done);

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

  function shade(hex, amount) {
    const n = hex.replace("#", "");
    const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
    const num = parseInt(full, 16);
    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 0xff) + amount;
    let b = (num & 0xff) + amount;
    return `rgb(${Math.max(0, Math.min(255, r))},${Math.max(0, Math.min(255, g))},${Math.max(0, Math.min(255, b))})`;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, "#7ec8e3");
    g.addColorStop(0.55, "#c8e8f4");
    g.addColorStop(1, "#e8f4c8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    drawCloud(120, 70, 1.1);
    drawCloud(420, 50, 0.85);
    drawCloud(720, 80, 1.0);
    ctx.fillStyle = "#f5d76e";
    ctx.beginPath();
    ctx.arc(860, 70, 36, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCloud(x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x, y, 40 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 28 * s, y + 4, 30 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 26 * s, y + 6, 28 * s, 13 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBackground() {
    ctx.fillStyle = "#6b8f4e";
    ctx.fillRect(0, H * 0.42, W, H * 0.58);
    ctx.fillStyle = "#5a7d42";
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % W;
      const y = H * 0.45 + ((i * 53) % 180);
      ctx.fillRect(x, y, 3, 8);
    }
    const fenceY = 185;
    ctx.strokeStyle = "#6b4226";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, fenceY);
    ctx.lineTo(W, fenceY);
    ctx.moveTo(0, fenceY + 28);
    ctx.lineTo(W, fenceY + 28);
    ctx.stroke();
    for (let x = 30; x < W; x += 70) {
      ctx.fillStyle = "#5c3d2e";
      ctx.fillRect(x, fenceY - 8, 10, 55);
    }
    ctx.fillStyle = "#8b3a2a";
    ctx.fillRect(60, 95, 130, 90);
    ctx.fillStyle = "#5c2a1e";
    ctx.beginPath();
    ctx.moveTo(50, 95);
    ctx.lineTo(125, 55);
    ctx.lineTo(200, 95);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3d2418";
    ctx.fillRect(105, 130, 40, 55);
    ctx.fillStyle = "#e8b84a";
    ctx.font = "bold 11px Nunito, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("RANCHO", 92, 118);
    drawSpectator(275, 152, "#e85d2c", "#f5c518", 0, "cheer");
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
    const bob = Math.sin(state.horseBob * 2.2 + phaseOff) * 4;
    const clap = Math.sin(state.horseBob * 8 + phaseOff); // aplauso rápido
    const cy = y + bob;
    const skin = "#f2c49a";
    const outline = "#2a1810";
    const yell = Math.sin(state.horseBob * 3 + phaseOff) > 0.2;

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

    // Brazos aplaudiendo / gritando (movimiento grande)
    let armL; let armR;
    if (pose === "clap" || pose === "cheer") {
      armL = -1.1 + clap * 0.55;
      armR = 1.1 - clap * 0.55;
    } else if (pose === "wave") {
      armL = -0.4;
      armR = -1.4 + Math.sin(state.horseBob * 6 + phaseOff) * 0.6;
    } else {
      armL = -0.7 + clap * 0.2;
      armR = 0.7 - clap * 0.2;
    }

    ctx.save();
    ctx.translate(x - 14, cy - 12);
    ctx.rotate(armL);
    ctx.beginPath();
    roundRect(-4, 0, 8, 22, 4);
    fillStrokePath(shirt, outline, 1.6);
    ctx.beginPath();
    ctx.arc(0, 22, 6, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.5);
    ctx.restore();

    ctx.save();
    ctx.translate(x + 14, cy - 12);
    ctx.rotate(armR);
    ctx.beginPath();
    roundRect(-4, 0, 8, 22, 4);
    fillStrokePath(shirt, outline, 1.6);
    ctx.beginPath();
    ctx.arc(0, 22, 6, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 1.5);
    ctx.restore();

    const headY = cy - 32;
    ctx.beginPath();
    ctx.arc(x, headY, 16, 0, Math.PI * 2);
    fillStrokePath(skin, outline, 2.2);

    // ojos
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

    // boca abierta gritando
    if (yell) {
      ctx.beginPath();
      ctx.ellipse(x, headY + 7, 5, 6, 0, 0, Math.PI * 2);
      fillStrokePath("#5a2018", outline, 1.5);
      ctx.fillStyle = "#f5c518";
      ctx.beginPath();
      ctx.ellipse(x, headY + 9, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#c45c40";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(x, headY + 5, 6, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.ellipse(x, headY - 12, 24, 6, 0, 0, Math.PI * 2);
    fillStrokePath("#3d2a1a", outline, 2);
    ctx.beginPath();
    roundRect(x - 11, headY - 30, 22, 18, 4);
    fillStrokePath("#5c3d28", outline, 2);
    ctx.fillStyle = accent;
    ctx.fillRect(x - 11, headY - 16, 22, 3.5);
  }

  function drawAnimal(a) {
    if (a.pig) drawPig(a);
    else drawCow(a);
  }

  function drawPig(a) {
    const facing = a.vx >= 0 ? 1 : -1;
    const s = a.scale * 1.1;
    const bob = Math.sin(a.phase * 2) * 2.5;
    const thrash = a.struggle ? Math.sin(a.phase * 3) * 8 : 0;
    const fl = Math.sin(a.phase) * 10;
    const bl = Math.sin(a.phase + Math.PI) * 10;

    ctx.save();
    ctx.translate(a.x + a.w / 2 + thrash, a.y + a.h * 0.55 + bob);
    ctx.scale(facing, 1);

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(0, 28 * s, 36 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.fillStyle = shade(a.coat, -25);
    for (const [lx, sw] of [[-18, bl], [12, fl], [-8, fl], [22, bl]]) {
      ctx.save();
      ctx.translate(lx * s, 4 * s);
      ctx.rotate(sw * 0.04);
      roundRect(-3 * s, 0, 6 * s, 22 * s, 2 * s);
      ctx.fill();
      ctx.fillStyle = "#1a1208";
      roundRect(-3.5 * s, 20 * s, 7 * s, 4 * s, 1.5 * s);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = shade(a.coat, -25);
    }

    const bodyGrad = ctx.createLinearGradient(0, -20 * s, 0, 18 * s);
    bodyGrad.addColorStop(0, shade(a.coat, 20));
    bodyGrad.addColorStop(1, shade(a.coat, -20));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 34 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.fillStyle = a.coat;
    ctx.beginPath();
    ctx.ellipse(32 * s, -2 * s, 14 * s, 12 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // snout
    ctx.fillStyle = a.muzzle;
    ctx.beginPath();
    ctx.ellipse(44 * s, 2 * s, 8 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(a.muzzle, -40);
    ctx.beginPath();
    ctx.arc(46 * s, 0, 1.8 * s, 0, Math.PI * 2);
    ctx.arc(46 * s, 4 * s, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
    // ear
    ctx.fillStyle = shade(a.coat, -10);
    ctx.beginPath();
    ctx.moveTo(24 * s, -12 * s);
    ctx.lineTo(18 * s, -22 * s);
    ctx.lineTo(30 * s, -16 * s);
    ctx.closePath();
    ctx.fill();
    // eye
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(34 * s, -4 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    // curly tail
    ctx.strokeStyle = shade(a.coat, -30);
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.arc(-34 * s, -4 * s, 6 * s, 0, Math.PI * 1.5);
    ctx.stroke();

    ctx.restore();
    drawBadge(a, bob);
  }

  function drawCow(a) {
    const facing = a.vx >= 0 ? 1 : -1;
    const s = a.scale * 1.15;
    const bob = Math.sin(a.phase * 2) * 2.8;
    const lean = Math.sin(a.phase) * 0.04;
    const breath = Math.sin(a.breath) * 1.5;
    const thrash = a.struggle ? Math.sin(a.phase * 3) * 10 * (a.shakeAmp || 1) : 0;
    const thrashRot = a.struggle ? Math.sin(a.phase * 2.5) * 0.12 : 0;
    const legSwing = 14;
    const fl = Math.sin(a.phase) * legSwing;
    const bl = Math.sin(a.phase + Math.PI) * legSwing;
    const flLift = Math.max(0, Math.sin(a.phase)) * 7;
    const blLift = Math.max(0, Math.sin(a.phase + Math.PI)) * 7;
    const fr = Math.sin(a.phase + Math.PI) * legSwing * 0.9;
    const br = Math.sin(a.phase) * legSwing * 0.9;
    const frLift = Math.max(0, Math.sin(a.phase + Math.PI)) * 6;
    const brLift = Math.max(0, Math.sin(a.phase)) * 6;

    ctx.save();
    ctx.translate(a.x + a.w / 2 + thrash, a.y + a.h * 0.55 + bob);
    ctx.scale(facing, 1);
    ctx.rotate(lean + thrashRot);

    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 38 * s, 48 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    const coat = a.coat;
    const dark = a.dark;
    const by = breath * 0.2;

    drawCowLeg(-30 * s, 6 * s + by, bl, blLift, shade(dark, -15), s, true);
    drawCowLeg(22 * s, 8 * s + by, fr, frLift, shade(dark, -15), s, true);

    const bodyGrad = ctx.createLinearGradient(-40 * s, -30 * s, 40 * s, 25 * s);
    bodyGrad.addColorStop(0, shade(coat, 22));
    bodyGrad.addColorStop(0.4, coat);
    bodyGrad.addColorStop(1, shade(coat, -28));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-48 * s, by);
    ctx.bezierCurveTo(-52 * s, -28 * s + by, -20 * s, -34 * s + by, 8 * s, -30 * s + by);
    ctx.bezierCurveTo(28 * s, -28 * s + by, 40 * s, -18 * s + by, 44 * s, -4 * s + by);
    ctx.bezierCurveTo(48 * s, 10 * s + by, 36 * s, 22 * s + by, 18 * s, 24 * s + by);
    ctx.bezierCurveTo(0, 28 * s + by, -30 * s, 26 * s + by, -46 * s, 14 * s + by);
    ctx.bezierCurveTo(-52 * s, 8 * s + by, -50 * s, 4 * s + by, -48 * s, by);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2a1810";
    ctx.lineWidth = 2.4 * s;
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.beginPath();
    ctx.ellipse(-4 * s, 12 * s + by, 28 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    if (a.pattern === "spots") {
      ctx.fillStyle = dark;
      drawSpot(-22 * s, -8 * s + by, 16 * s, 13 * s, -0.2);
      drawSpot(6 * s, 2 * s + by, 14 * s, 12 * s, 0.15);
      drawSpot(-6 * s, -20 * s + by, 10 * s, 9 * s, 0.05);
      drawSpot(24 * s, -6 * s + by, 9 * s, 11 * s, -0.1);
    }

    drawCowLeg(-18 * s, 8 * s + by, br, brLift, shade(coat, -35), s, false);
    drawCowLeg(32 * s, 10 * s + by, fl, flLift, shade(coat, -35), s, false);

    if (!a.bull) {
      ctx.fillStyle = "#e8a8b0";
      ctx.beginPath();
      ctx.ellipse(-2 * s, 22 * s + by, 11 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (a.bull) {
      ctx.fillStyle = shade(coat, -15);
      ctx.beginPath();
      ctx.ellipse(18 * s, -26 * s + by, 18 * s, 14 * s, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(36 * s, -8 * s + by);
    ctx.quadraticCurveTo(48 * s, -18 * s + by, 52 * s, -6 * s + by);
    ctx.quadraticCurveTo(50 * s, 8 * s + by, 38 * s, 10 * s + by);
    ctx.closePath();
    ctx.fill();

    const hx = 58 * s;
    const hy = -10 * s + by;
    const headCoat = a.pattern === "face" ? "#f7f2ea" : coat;
    ctx.fillStyle = headCoat;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 18 * s, 15 * s, 0.12, 0, Math.PI * 2);
    ctx.fill();

    if (a.pattern === "spots") {
      ctx.fillStyle = dark;
      drawSpot(hx - 4 * s, hy - 4 * s, 10 * s, 9 * s, 0);
    }

    ctx.fillStyle = shade(headCoat, -8);
    ctx.beginPath();
    ctx.ellipse(hx - 10 * s, hy - 12 * s, 7 * s, 4.5 * s, -0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = a.muzzle;
    ctx.beginPath();
    ctx.ellipse(hx + 14 * s, hy + 7 * s, 12 * s, 8 * s, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(a.muzzle, -45);
    ctx.beginPath();
    ctx.ellipse(hx + 18 * s, hy + 5 * s, 2.5 * s, 1.8 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + 18 * s, hy + 9.5 * s, 2.5 * s, 1.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(hx + 2 * s, hy - 2 * s, 3.2 * s, 3.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1008";
    ctx.beginPath();
    ctx.ellipse(hx + 2.5 * s, hy - 1.5 * s, 2 * s, 2.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    if (a.horns) {
      ctx.strokeStyle = "#efe4c8";
      ctx.lineWidth = 3.5 * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hx - 6 * s, hy - 12 * s);
      ctx.quadraticCurveTo(hx - 18 * s, hy - 32 * s, hx - 4 * s, hy - 26 * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx + 6 * s, hy - 14 * s);
      ctx.quadraticCurveTo(hx + 20 * s, hy - 34 * s, hx + 12 * s, hy - 22 * s);
      ctx.stroke();
    }

    const tw = Math.sin(a.phase * 1.6 + 0.5) * 14 * s;
    ctx.strokeStyle = shade(dark, 10);
    ctx.lineWidth = 3.5 * s;
    ctx.beginPath();
    ctx.moveTo(-46 * s, -10 * s + by);
    ctx.quadraticCurveTo(-62 * s + tw * 0.4, 0 + by, -54 * s + tw, 20 * s + by);
    ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-54 * s + tw, 16 * s + by);
    ctx.lineTo(-60 * s + tw, 30 * s + by);
    ctx.lineTo(-48 * s + tw, 28 * s + by);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    drawBadge(a, bob);
  }

  function drawBadge(a, bob) {
    const bx = a.x + a.w / 2;
    const badgeY = a.y - 4 + bob;
    const pay = payoutOf(a);
    ctx.fillStyle = "rgba(42,26,14,0.9)";
    roundRect(bx - 22, badgeY - 12, 44, 22, 6);
    ctx.fill();
    ctx.fillStyle = a.bull ? "#ff6b4a" : a.pig ? "#f0a0b0" : "#e8b84a";
    ctx.font = "800 13px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`×${a.mult}`, bx, badgeY - 1);
  }

  function drawSpot(x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCowLeg(x, hipY, swing, lift, color, s, far) {
    ctx.save();
    ctx.translate(x, hipY);
    const ang = swing * 0.038;
    ctx.rotate(ang);
    ctx.globalAlpha = far ? 0.85 : 1;
    ctx.fillStyle = color;
    roundRect(-5 * s, -3 * s - lift * 0.3, 10 * s, 20 * s, 4 * s);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 16 * s - lift * 0.2, 4.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(0, 16 * s - lift * 0.2);
    ctx.rotate(-ang * 0.45);
    roundRect(-4 * s, 0, 8 * s, 18 * s, 3 * s);
    ctx.fill();
    ctx.fillStyle = "#1a1208";
    roundRect(-5.5 * s, 16 * s, 11 * s, 6 * s, 2 * s);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawLasso(l) {
    if (l.phase === "snap") {
      drawSnappedRope(l);
      return;
    }

    const hand = getPlayerHand();
    const handX = hand.x;
    const handY = hand.y;
    const stretch = l.ropeStretch || 0;
    const tense = l.phase === "struggle";
    const flash = (l.tugFlash || 0) > 0;

    // aviso de tiempo restante
    if ((l.phase === "throw" || l.phase === "struggle") && l.bornAt) {
      const left = Math.max(0, LASSO_TIMEOUT_MS - (performance.now() - l.bornAt));
      if (left < 2000) {
        const secs = (left / 1000).toFixed(1);
        ctx.fillStyle = left < 1000 ? "#ff4a3a" : "#ffb020";
        ctx.font = "800 16px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(secs + "s", W * 0.5, H - 130);
      }
    }

    ctx.strokeStyle = flash ? "#ffe08a" : tense ? "#b8860b" : "#d4a017";
    ctx.lineWidth = tense ? 4.5 : 3;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    const midX = (handX + l.x) / 2 - 20 + stretch;
    const midY = (handY + l.y) / 2 - 40 - (tense ? Math.abs(stretch) : 0);
    ctx.quadraticCurveTo(midX, midY, l.x, l.y);
    ctx.stroke();

    if (tense) {
      ctx.strokeStyle = "rgba(255,200,80,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(handX, handY);
      ctx.quadraticCurveTo(midX + 4, midY - 6, l.x, l.y);
      ctx.stroke();
    }

    ctx.strokeStyle = flash ? "#fff3c0" : "#c9922a";
    ctx.lineWidth = tense ? 5 : 4;
    ctx.beginPath();
    ctx.ellipse(l.x, l.y, tense ? 32 : 28, tense ? 16 : 14, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (tense && l.gripMax) drawStruggleBar(l);
  }

  function drawSnappedRope(l) {
    if (!l.snapPieces) return;
    for (const p of l.snapPieces) {
      if (p.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.strokeStyle = "#c9922a";
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.quadraticCurveTo(0, -6, 14, 2);
      ctx.stroke();
      // punta deshilachada
      ctx.strokeStyle = "#a87820";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(18, -4);
      ctx.moveTo(12, 2);
      ctx.lineTo(17, 6);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawStruggleBar(l) {
    const animal = l.catchId;
    if (!animal) return;
    const bx = animal.x + animal.w / 2;
    const by = animal.y - 28;
    const bw = 70;
    const bh = 10;
    const gripPct = Math.max(0, Math.min(1, l.grip / l.gripMax));
    const escapePct = Math.max(0, Math.min(1, l.escape));

    ctx.fillStyle = "rgba(20,10,0,0.75)";
    roundRect(bx - bw / 2 - 2, by - 2, bw + 4, bh + 4, 4);
    ctx.fill();
    ctx.fillStyle = "#5a2018";
    roundRect(bx - bw / 2, by, bw, bh, 3);
    ctx.fill();
    ctx.fillStyle = gripPct > 0.7 ? "#6dbf3a" : gripPct > 0.35 ? "#e8b84a" : "#d45a3a";
    roundRect(bx - bw / 2, by, bw * gripPct, bh, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255,80,60,0.85)";
    ctx.fillRect(bx - bw / 2 + bw * (1 - escapePct) - 2, by - 3, 3, bh + 6);
    ctx.fillStyle = "#f7ecd8";
    ctx.font = "800 11px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("¡JALA!", bx, by - 4);
  }

  function getPlayerHand() {
    const bob = Math.sin(state.horseBob) * 2.5;
    if (state.playerPose === "celebrate") {
      const waveLift = Math.sin(state.horseBob * 7) * 14;
      return { x: W * 0.5 - 40, y: H - 168 + bob - waveLift };
    }
    // Mano del lazo hacia el corral (arriba)
    return { x: W * 0.5 + 8, y: H - 168 + bob };
  }

  /** Vaquero de espaldas al público, mirando al corral/vacas. En celebra se gira y saluda. */
  function drawCowboyFacingCows(opts) {
    const celebrate = !!(opts && opts.celebrate);
    const bob = Math.sin(state.horseBob * (celebrate ? 3 : 2.1)) * (celebrate ? 5 : 2.8);
    const armSway = Math.sin(state.horseBob * 2.2) * 0.18;
    const wave = Math.sin(state.horseBob * 8) * 0.65;
    const cx = W * 0.5;
    const cy = H - 6 + bob;
    const outline = "#2a1810";
    const skin = "#f2c49a";

    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 48, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    if (celebrate) {
      // Frente al público, ovacionando
      ctx.beginPath();
      roundRect(-18, -36, 14, 28, 5);
      fillStrokePath("#3d2a1a", outline, 2);
      ctx.beginPath();
      roundRect(4, -36, 14, 28, 5);
      fillStrokePath("#3d2a1a", outline, 2);
      ctx.beginPath();
      roundRect(-20, -16, 18, 10, 4);
      fillStrokePath("#1a1008", outline, 1.8);
      ctx.beginPath();
      roundRect(2, -16, 18, 10, 4);
      fillStrokePath("#1a1008", outline, 1.8);

      ctx.beginPath();
      ctx.ellipse(0, -52, 28, 30, 0, 0, Math.PI * 2);
      fillStrokePath("#ff7a3a", outline, 2.4);
      ctx.fillStyle = "#5c3d28";
      ctx.fillRect(-24, -38, 48, 8);
      ctx.fillStyle = "#f5c518";
      ctx.fillRect(-7, -39, 14, 10);

      // Brazos arriba saludando
      ctx.save();
      ctx.translate(-26, -68);
      ctx.rotate(-1.55 + wave);
      ctx.beginPath();
      roundRect(-6, -34, 13, 36, 6);
      fillStrokePath("#ff7a3a", outline, 2);
      ctx.beginPath();
      ctx.arc(1, -36, 9, 0, Math.PI * 2);
      fillStrokePath(skin, outline, 1.8);
      ctx.restore();

      ctx.save();
      ctx.translate(26, -68);
      ctx.rotate(1.55 - wave);
      ctx.beginPath();
      roundRect(-7, -34, 13, 36, 6);
      fillStrokePath("#ff7a3a", outline, 2);
      ctx.beginPath();
      ctx.arc(0, -36, 9, 0, Math.PI * 2);
      fillStrokePath(skin, outline, 1.8);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, -92, 24, 0, Math.PI * 2);
      fillStrokePath(skin, outline, 2.4);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(-8, -94, 7.5, 8.5, 0, 0, Math.PI * 2);
      ctx.ellipse(8, -94, 7.5, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1008";
      ctx.beginPath();
      ctx.arc(-6, -93, 3.4, 0, Math.PI * 2);
      ctx.arc(10, -93, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c45c40";
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(0, -84, 9, 0.2, Math.PI - 0.2);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, -108, 44, 11, 0, 0, Math.PI * 2);
      fillStrokePath("#3d2a1a", outline, 2.4);
      ctx.beginPath();
      roundRect(-18, -136, 36, 32, 7);
      fillStrokePath("#5c3d28", outline, 2.2);
      ctx.fillStyle = "#f5c518";
      ctx.fillRect(-18, -112, 36, 5);

      ctx.fillStyle = "#f5c518";
      ctx.font = "900 18px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("¡OLE!", 0, -148);
      ctx.fillText("👏", -42, -120);
      ctx.fillText("👏", 42, -120);
    } else {
      // De espaldas, mirando al corral (arriba)
      ctx.beginPath();
      roundRect(-16, -34, 13, 26, 5);
      fillStrokePath("#2e1f14", outline, 2);
      ctx.beginPath();
      roundRect(3, -34, 13, 26, 5);
      fillStrokePath("#2e1f14", outline, 2);
      ctx.beginPath();
      roundRect(-18, -16, 17, 10, 4);
      fillStrokePath("#14100a", outline, 1.8);
      ctx.beginPath();
      roundRect(1, -16, 17, 10, 4);
      fillStrokePath("#14100a", outline, 1.8);

      // torso de espalda
      ctx.beginPath();
      ctx.ellipse(0, -54, 27, 29, 0, 0, Math.PI * 2);
      fillStrokePath("#e86a2e", outline, 2.4);
      // pliegues espalda
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -78);
      ctx.quadraticCurveTo(-2, -54, 0, -30);
      ctx.stroke();
      ctx.fillStyle = "#5c3d28";
      ctx.fillRect(-24, -40, 48, 8);
      ctx.fillStyle = "#f5c518";
      ctx.fillRect(-6, -41, 12, 10);

      // brazo izquierdo (lazo) levantado hacia vacas
      ctx.save();
      ctx.translate(-24, -70);
      ctx.rotate(-0.95 + armSway);
      ctx.beginPath();
      roundRect(-7, -8, 13, 34, 6);
      fillStrokePath("#e86a2e", outline, 2);
      ctx.beginPath();
      ctx.arc(0, -10, 8, 0, Math.PI * 2);
      fillStrokePath(skin, outline, 1.8);
      // lazo
      if (!state.lassos.length) {
        ctx.strokeStyle = "#d4a017";
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.ellipse(2, -28, 16, 10, -0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(2, -28, 9, 5.5, -0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // brazo derecho
      ctx.save();
      ctx.translate(24, -66);
      ctx.rotate(0.55 - armSway * 0.5);
      ctx.beginPath();
      roundRect(-6, 0, 12, 28, 6);
      fillStrokePath("#e86a2e", outline, 2);
      ctx.beginPath();
      ctx.arc(0, 28, 7, 0, Math.PI * 2);
      fillStrokePath(skin, outline, 1.8);
      ctx.restore();

      // cabeza vista de 3/4 desde atrás (mirando arriba/corral)
      ctx.beginPath();
      ctx.arc(2, -96, 22, 0, Math.PI * 2);
      fillStrokePath(skin, outline, 2.4);
      // oreja
      ctx.beginPath();
      ctx.ellipse(20, -96, 5, 8, 0.2, 0, Math.PI * 2);
      fillStrokePath(skin, outline, 1.5);
      // perfil: un ojo mirando al corral
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(10, -98, 5.5, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#1a1008";
      ctx.beginPath();
      ctx.arc(12, -97, 2.8, 0, Math.PI * 2);
      ctx.fill();

      // sombrero
      ctx.beginPath();
      ctx.ellipse(0, -112, 40, 10, 0, 0, Math.PI * 2);
      fillStrokePath("#3d2a1a", outline, 2.4);
      ctx.beginPath();
      roundRect(-16, -138, 32, 28, 6);
      fillStrokePath("#5c3d28", outline, 2.2);
      ctx.fillStyle = "#f5c518";
      ctx.fillRect(-16, -116, 32, 5);
    }

    ctx.restore();
  }

  function drawPlayer() {
    drawCowboyFacingCows({ celebrate: state.playerPose === "celebrate" });
  }

  function drawFx() {
    for (const d of state.dust) {
      ctx.globalAlpha = Math.max(0, d.life);
      ctx.fillStyle = "#c4a574";
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const p of state.pops) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      if (p.cheer) {
        ctx.fillStyle = "#f5c518";
        ctx.font = "900 18px Nunito, sans-serif";
        ctx.strokeStyle = "#2a1810";
        ctx.lineWidth = 3;
        const ty = p.y - (1 - p.life) * 24;
        ctx.strokeText(p.text, p.x, ty);
        ctx.fillText(p.text, p.x, ty);
      } else {
        ctx.fillStyle = p.text.startsWith("+") ? "#2d6a1e" : "#8b1e1e";
        ctx.font = "800 22px Nunito, sans-serif";
        ctx.fillText(p.text, p.x, p.y - (1 - p.life) * 30);
      }
      ctx.globalAlpha = 1;
    }
  }


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

  let cheerTimer = 0;
  const CHEERS = ["¡OLE!", "¡YA!", "¡BRAVO!", "¡VAMOS!", "¡ÉCHALE!"];

  function loop(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.033, (ts - state.lastTs) / 1000);
    state.lastTs = ts;

    // Siempre anima vaquero + público (aunque no esté jugando)
    state.horseBob += dt * (state.running ? 4.5 : 3.2);
    if (state.celebrateTimer > 0) {
      state.celebrateTimer -= dt;
      if (state.celebrateTimer <= 0) state.playerPose = "arena";
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);

    cheerTimer -= dt;
    if (cheerTimer <= 0) {
      cheerTimer = rand(1.4, 2.8);
      const sx = rand(260, 400);
      state.pops.push({
        x: sx,
        y: 120,
        text: CHEERS[Math.floor(Math.random() * CHEERS.length)],
        life: 1.1,
        cheer: true,
      });
      if (Math.random() < 0.45) {
        state.pops.push({
          x: rand(680, 740),
          y: 125,
          text: CHEERS[Math.floor(Math.random() * CHEERS.length)],
          life: 1,
          cheer: true,
        });
      }
      if (state.running && AudioFX && AudioFX.crowdCheer && Math.random() < 0.35) {
        AudioFX.crowdCheer();
      }
    }

    for (const p of state.pops) p.life -= dt;
    state.pops = state.pops.filter((p) => p.life > 0);

    if (state.running) update(dt);
    draw();
    requestAnimationFrame(loop);
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
  requestAnimationFrame(loop);
  loadBalance();
})();
