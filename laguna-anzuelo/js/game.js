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
  const AudioFX = window.LagunaAudio;

  const W = canvas.width;
  const H = canvas.height;
  const BETS = [5, 10, 20, 50, 100, 200];

  function mxn(n) {
    if (isPlayerMode) return PlayerAuth.formatPesos(n);
    return MachineAPI.formatPesos(n);
  }

  /**
   * Definiciones visuales de peces. El resultado real (qué pez pica, si hay
   * piraña o si fallas el lance) siempre lo decide el servidor — aquí solo
   * se elige el "disfraz" del pez que coincide con el resultado.
   */
  const FISH_VISUALS = {
    f025: { label: "$0.25", mult: 0.3, scale: 0.55, resist: 1.2, speed: 70, weight: 34, body: "#38bdf8", fin: "#0ea5e9", belly: "#bae6fd", accent: "#0369a1" },
    f050: { label: "$0.50", mult: 0.6, scale: 0.68, resist: 1.8, speed: 85, weight: 24, body: "#4ade80", fin: "#22c55e", belly: "#bbf7d0", accent: "#15803d" },
    f1: { label: "$1.00", mult: 1.2, scale: 0.82, resist: 2.6, speed: 100, weight: 18, body: "#facc15", fin: "#eab308", belly: "#fef9c3", accent: "#a16207" },
    f3: { label: "$3.00", mult: 3, scale: 1.05, resist: 3.8, speed: 120, weight: 10, body: "#fb923c", fin: "#f97316", belly: "#ffedd5", accent: "#c2410c" },
    f5: { label: "$5.00", mult: 5, scale: 1.22, resist: 5.2, speed: 140, weight: 6, body: "#f472b6", fin: "#ec4899", belly: "#fce7f3", accent: "#be185d" },
    f10: { label: "$10.00", mult: 10, scale: 1.45, resist: 7, speed: 160, weight: 3, body: "#a78bfa", fin: "#8b5cf6", belly: "#ede9fe", accent: "#6d28d9", jewel: true },
    piranha: { label: "Piraña", mult: null, scale: 0.95, resist: 0, speed: 175, weight: 12, body: "#334155", fin: "#1e293b", belly: "#64748b", accent: "#ef4444", piranha: true },
  };
  const AMBIENT_IDS = Object.keys(FISH_VISUALS);

  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let busy = false;

  const state = {
    running: false,
    fish: [],
    hooks: [],
    pops: [],
    bubbles: [],
    spawnTimer: 0,
    lastTs: 0,
    shake: 0,
    lastWin: 0,
    wavePhase: 0,
    bubbleSfxTimer: 0,
  };

  function bet() { return BETS[betIndex]; }

  function refreshHud() {
    creditsEl.textContent = mxn(credits);
    betEl.textContent = mxn(bet());
    winEl.textContent = mxn(state.lastWin);
    if (machineLabel) machineLabel.textContent = machineNumber ? "#" + machineNumber : "—";
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function pickAmbientId() {
    const total = AMBIENT_IDS.reduce((s, id) => s + FISH_VISUALS[id].weight, 0);
    let r = Math.random() * total;
    for (const id of AMBIENT_IDS) {
      r -= FISH_VISUALS[id].weight;
      if (r <= 0) return id;
    }
    return AMBIENT_IDS[0];
  }

  function spawnFish(fishId, opts) {
    const id = fishId || pickAmbientId();
    const type = FISH_VISUALS[id];
    const forced = !!opts;
    const fromLeft = forced ? (opts.fromLeft ?? true) : Math.random() < 0.5;
    const lane = forced ? 2 : Math.floor(rand(0, 4));
    const baseW = 70 * type.scale;
    const baseH = 38 * type.scale;
    const y = forced ? 210 : 175 + lane * 70 + rand(-8, 8);
    const speed = type.speed * rand(0.88, 1.15);
    const fish = {
      ...type,
      fishId: id,
      w: baseW,
      h: baseH,
      x: fromLeft ? -baseW - 30 : W + 30,
      y,
      vx: fromLeft ? speed : -speed,
      lane,
      caught: false,
      struggle: false,
      shakeAmp: 0,
      phase: rand(0, Math.PI * 2),
      breath: rand(0, Math.PI * 2),
      serverTarget: forced,
    };
    state.fish.push(fish);
    return fish;
  }

  function spawnBubble(x, y, rise = true) {
    state.bubbles.push({
      x: x + rand(-10, 10),
      y: y + rand(-6, 6),
      r: rand(2, 7),
      vy: rise ? rand(-35, -18) : rand(-10, -4),
      vx: rand(-12, 12),
      life: rand(1.2, 2.8),
      wobble: rand(0, Math.PI * 2),
    });
  }

  function activeStruggle() {
    return state.hooks.find((h) => !h.done && h.phase === "struggle");
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

  async function castHook() {
    if (!state.running || busy) return;
    AudioFX && AudioFX.unlock();

    const struggle = activeStruggle();
    if (struggle) {
      tugStruggle(struggle);
      return;
    }
    if (state.hooks.some((h) => !h.done)) return;
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
        ? await PlayerAuth.playLagunaAnzuelo(betUsed)
        : await MachineAPI.playLagunaAnzuelo(betUsed);
      credits = result.balance;
      state.lastWin = result.payout || 0;
      refreshHud();

      AudioFX && AudioFX.cast();
      const hook = {
        x: W * 0.5,
        y: 48,
        ty: 280,
        progress: 0,
        phase: "throw",
        done: false,
        catchId: null,
        grip: 0,
        gripMax: 1,
        tugFlash: 0,
        ropeStretch: 0,
        strugglePhase: 0,
        betUsed,
        serverResult: result,
      };
      state.hooks.push(hook);
      hintEl.textContent = "";

      if (result.fish && result.fish.fishId) {
        spawnFish(result.fish.fishId, { fromLeft: Math.random() < 0.5 });
      } else if (result.piranha) {
        spawnFish('piranha', { fromLeft: Math.random() < 0.5 });
      }
    } catch (err) {
      hintEl.textContent = err.message || "Error al jugar";
      AudioFX && AudioFX.miss();
    } finally {
      busy = false;
    }
  }

  function startStruggle(fish, hook) {
    fish.caught = true;
    fish.struggle = true;
    fish.shakeAmp = 0;
    hook.catchId = fish;
    hook.phase = "struggle";
    hook.progress = 0;
    hook.strugglePhase = 0;
    hook.grip = 0.3;
    hook.gripMax = Math.max(1, fish.resist || 1);
    hook.tugFlash = 0;
    hook.ropeStretch = 0;
    state.shake = 3;
    AudioFX && AudioFX.bite();
    hintEl.textContent = "¡Mordió! Toca rápido para jalar";
    state.pops.push({ x: fish.x + fish.w / 2, y: fish.y - 10, text: "¡Forcejeo!", life: 0.9 });
    for (let i = 0; i < 6; i++) spawnBubble(fish.x + fish.w / 2, fish.y);
  }

  function tugStruggle(hook) {
    const fish = hook.catchId;
    if (!fish) return;
    AudioFX && AudioFX.tug();
    hook.grip = Math.min(hook.gripMax, hook.grip + 0.55 + (fish.resist || 1) * 0.03);
    hook.tugFlash = 0.25;
    fish.shakeAmp = 1;
    const targetX = W * 0.5 - fish.w / 2;
    fish.x += (targetX - fish.x) * 0.1;
    fish.y += (H * 0.55 - fish.y) * 0.06;
    state.shake = Math.min(10, state.shake + 2);
    spawnBubble(fish.x + fish.w / 2, fish.y, true);
    if (hook.grip >= hook.gripMax) finishCatch(fish, hook);
  }

  const STRUGGLE_AUTO_MS = 2600;

  function finishCatch(fish, hook) {
    fish.struggle = false;
    hook.phase = "pull";
    hook.progress = 0;
    const win = hook.serverResult.payout || 0;
    state.lastWin = win;
    refreshHud();
    hintEl.textContent = win >= bet() * 3 ? "¡Gran captura!" : `¡Premio! ${mxn(win)}`;
    state.pops.push({ x: fish.x + fish.w / 2, y: fish.y - 10, text: `+${mxn(win)}`, life: 1.15 });
    state.shake = win >= bet() * 3 ? 11 : 6;
    for (let i = 0; i < (win >= bet() * 3 ? 14 : 8); i++) {
      spawnBubble(fish.x + fish.w / 2, fish.y);
    }
    if (AudioFX) {
      if (win >= bet() * 3) AudioFX.winBig();
      else AudioFX.coin();
      AudioFX.splash();
    }
  }

  function snapLine(fish, hook) {
    hook.phase = "snap";
    hook.progress = 0;
    hook.catchId = null;
    state.lastWin = 0;
    refreshHud();
    hintEl.textContent = "¡Piraña! Rompió la cuerda — lance perdido";
    const cx = fish ? fish.x + fish.w / 2 : hook.x;
    const cy = fish ? fish.y - 10 : hook.y;
    state.pops.push({ x: cx, y: cy, text: "¡PIRAÑA!", life: 1.15 });
    state.shake = 10;
    if (fish) fish.vx = (fish.vx || fish.speed) * 1.8;
    AudioFX && AudioFX.snap();
    for (let i = 0; i < 10; i++) spawnBubble(hook.x, hook.y);
  }

  function missCast(hook) {
    hook.phase = "miss";
    hook.progress = 0;
    state.lastWin = 0;
    refreshHud();
    state.pops.push({ x: hook.x, y: hook.y, text: "¡Fallaste!", life: 0.8 });
    hintEl.textContent = "Fallaste — lance perdido";
    AudioFX && AudioFX.miss();
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
    state.fish = [];
    state.hooks = [];
    state.pops = [];
    state.bubbles = [];
    state.spawnTimer = 0.12;
    state.lastTs = 0;
    state.shake = 0;
    state.lastWin = 0;
    state.wavePhase = 0;
    refreshHud();
    overlay.classList.add("hidden");
    hintEl.textContent = `Toca para lanzar (cuesta ${mxn(bet())})`;
    for (let i = 0; i < 18; i++) {
      spawnBubble(rand(40, W - 40), rand(H * 0.35, H - 40));
    }
    spawnFish();
    spawnFish();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    state.wavePhase += dt * 1.4;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 28);

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnFish();
      state.spawnTimer = rand(0.55, 1.05);
    }

    state.bubbleSfxTimer -= dt;
    if (state.bubbleSfxTimer <= 0 && Math.random() < 0.35) {
      AudioFX && AudioFX.bubble();
      state.bubbleSfxTimer = rand(1.4, 3.2);
    }
    if (Math.random() < dt * 2.2) {
      spawnBubble(rand(20, W - 20), H - rand(10, 40));
    }

    for (const f of state.fish) {
      if (f.caught && f.struggle) {
        f.phase += dt * 16;
        f.breath += dt * 9;
        f.shakeAmp = Math.min(1, (f.shakeAmp || 0) + dt * 2);
        const away = f.x + f.w / 2 < W * 0.5 ? -1 : 1;
        f.x += away * (35 + (f.resist || 1) * 10) * dt;
        continue;
      }
      if (f.caught) continue;
      f.x += f.vx * dt;
      f.y += Math.sin(f.phase) * 12 * dt;
      f.phase += dt * Math.abs(f.vx) * 0.09;
      f.breath += dt * 3.5;
      if (f.shakeAmp > 0) f.shakeAmp = Math.max(0, f.shakeAmp - dt * 3);
    }
    state.fish = state.fish.filter((f) => {
      if (f.caught) return true;
      return f.vx > 0 ? f.x < W + 160 : f.x > -160;
    });

    for (const h of state.hooks) {
      if (h.done) continue;
      if (h.phase === "throw") {
        h.progress += dt * 2.8;
        const t = Math.min(1, h.progress);
        const ease = 1 - Math.pow(1 - t, 2);
        h.x = W * 0.5 + Math.sin(t * Math.PI) * 8;
        h.y = 48 + (h.ty - 48) * ease;
        if (t >= 1) {
          const sr = h.serverResult;
          if (sr.missed) {
            missCast(h);
          } else if (sr.piranha) {
            const target = state.fish.find((f) => f.serverTarget && f.piranha && !f.caught);
            snapLine(target || null, h);
          } else {
            const target = state.fish.find((f) => f.serverTarget && f.fishId === sr.fish?.fishId && !f.caught)
              || state.fish.find((f) => f.serverTarget && !f.caught);
            if (target) startStruggle(target, h);
            else missCast(h);
          }
        }
      } else if (h.phase === "struggle") {
        const fish = h.catchId;
        if (!fish) { h.done = true; continue; }
        h.strugglePhase += dt;
        if (h.tugFlash > 0) h.tugFlash -= dt;
        h.ropeStretch = Math.sin(performance.now() / 55) * (7 + (fish.resist || 1) * 1.8);
        h.x = fish.x + fish.w / 2 + Math.sin(fish.phase) * 8;
        h.y = fish.y + fish.h * 0.35 + Math.cos(fish.phase * 1.2) * 5;
        // El resultado ya está decidido por el servidor: el forcejeo es
        // visual, siempre termina en captura (con tap o por tiempo).
        if (h.grip >= h.gripMax || h.strugglePhase >= STRUGGLE_AUTO_MS / 1000) {
          finishCatch(fish, h);
        }
      } else if (h.phase === "pull") {
        h.progress += dt * 2.2;
        const fish = h.catchId;
        if (fish) {
          fish.x += (W * 0.5 - fish.w / 2 - fish.x) * Math.min(1, dt * 5.5);
          fish.y += (70 - fish.y) * Math.min(1, dt * 4.5);
          h.x = fish.x + fish.w / 2;
          h.y = fish.y + fish.h * 0.35;
        }
        if (h.progress >= 1) {
          h.done = true;
          state.fish = state.fish.filter((f) => f !== fish);
        }
      } else if (h.phase === "miss" || h.phase === "snap") {
        h.progress += dt * 2.6;
        const t = Math.min(1, h.progress);
        h.y = (h.ty || 300) + (48 - (h.ty || 300)) * t * (h.phase === "snap" ? 0.35 : 1);
        if (h.phase === "snap") h.x += Math.sin(t * 20) * 2;
        if (t >= 1) h.done = true;
      }
    }
    state.hooks = state.hooks.filter((h) => !h.done);

    for (const p of state.pops) p.life -= dt;
    state.pops = state.pops.filter((p) => p.life > 0);

    for (const b of state.bubbles) {
      b.life -= dt;
      b.wobble += dt * 4;
      b.x += Math.sin(b.wobble) * 18 * dt + b.vx * dt;
      b.y += b.vy * dt;
      b.r *= 1 + dt * 0.08;
    }
    state.bubbles = state.bubbles.filter((b) => b.life > 0 && b.y > 40);
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

  function drawWater() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1488a8");
    g.addColorStop(0.35, "#0d6b84");
    g.addColorStop(0.7, "#0a5570");
    g.addColorStop(1, "#063a52");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 5; i++) {
      const x = 80 + i * 190 + Math.sin(state.wavePhase + i) * 20;
      const shaft = ctx.createLinearGradient(x, 40, x + 40, H);
      shaft.addColorStop(0, "rgba(180, 240, 255, 0.14)");
      shaft.addColorStop(1, "rgba(180, 240, 255, 0)");
      ctx.fillStyle = shaft;
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x + 70, 40);
      ctx.lineTo(x + 140, H);
      ctx.lineTo(x - 40, H);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "rgba(180, 240, 255, 0.18)";
    ctx.beginPath();
    ctx.moveTo(0, 55);
    for (let x = 0; x <= W; x += 12) {
      const y = 52 + Math.sin(x * 0.02 + state.wavePhase * 2) * 5
        + Math.sin(x * 0.05 + state.wavePhase) * 2.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    const floor = ctx.createLinearGradient(0, H - 70, 0, H);
    floor.addColorStop(0, "rgba(194, 160, 96, 0)");
    floor.addColorStop(0.35, "rgba(180, 140, 70, 0.35)");
    floor.addColorStop(1, "rgba(120, 90, 45, 0.7)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, H - 80, W, 80);

    for (let i = 0; i < 10; i++) {
      const bx = 40 + i * 95;
      const sway = Math.sin(state.wavePhase * 1.5 + i) * 10;
      ctx.strokeStyle = i % 2 ? "rgba(34, 140, 100, 0.55)" : "rgba(20, 110, 80, 0.5)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx, H);
      ctx.quadraticCurveTo(bx + sway, H - 40, bx + sway * 0.4, H - 85 - (i % 3) * 10);
      ctx.stroke();
    }
  }

  function drawBubbles() {
    for (const b of state.bubbles) {
      const a = Math.min(0.55, b.life * 0.35);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(220, 250, 255, ${a})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = `rgba(200, 240, 255, ${a * 0.25})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.7})`;
      ctx.fill();
    }
  }

  function drawFishBody(f) {
    const dir = f.vx >= 0 ? 1 : -1;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2 + Math.sin(f.breath) * 2;
    const shake = (f.shakeAmp || 0) * Math.sin(f.phase * 3) * 4;

    ctx.save();
    ctx.translate(cx + shake, cy);
    ctx.scale(dir, 1);
    ctx.rotate(Math.sin(f.phase) * 0.08);

    if (f.piranha) {
      ctx.fillStyle = f.body;
      ctx.beginPath();
      ctx.ellipse(0, 0, f.w * 0.42, f.h * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = f.belly;
      ctx.beginPath();
      ctx.ellipse(2, 6, f.w * 0.28, f.h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(f.body, -20);
      ctx.beginPath();
      ctx.moveTo(f.w * 0.2, 2);
      ctx.lineTo(f.w * 0.48, 10);
      ctx.lineTo(f.w * 0.2, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f8fafc";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(f.w * 0.22 + i * 5, 4);
        ctx.lineTo(f.w * 0.25 + i * 5, 11);
        ctx.lineTo(f.w * 0.28 + i * 5, 4);
        ctx.fill();
      }
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(f.w * 0.12, -6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(f.w * 0.13, -6, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = f.fin;
      ctx.beginPath();
      ctx.moveTo(-8, -f.h * 0.45);
      ctx.lineTo(10, -f.h * 0.85);
      ctx.lineTo(18, -f.h * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-f.w * 0.4, 0);
      ctx.lineTo(-f.w * 0.7, -14);
      ctx.lineTo(-f.w * 0.55, 0);
      ctx.lineTo(-f.w * 0.7, 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = f.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-f.w * 0.15, -2);
      ctx.lineTo(f.w * 0.18, -2);
      ctx.stroke();
    } else {
      const bodyGrad = ctx.createLinearGradient(-f.w * 0.4, -f.h * 0.4, f.w * 0.4, f.h * 0.4);
      bodyGrad.addColorStop(0, shade(f.body, 30));
      bodyGrad.addColorStop(0.45, f.body);
      bodyGrad.addColorStop(1, shade(f.body, -25));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, f.w * 0.42, f.h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = f.belly;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(4, 7, f.w * 0.28, f.h * 0.22, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(i * 8, Math.sin(i + f.phase) * 2, 5, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }

      ctx.fillStyle = f.fin;
      ctx.beginPath();
      ctx.moveTo(-6, -f.h * 0.35);
      ctx.quadraticCurveTo(4, -f.h * 0.95, 16, -f.h * 0.3);
      ctx.quadraticCurveTo(4, -f.h * 0.5, -6, -f.h * 0.35);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(2, 6, 10, 5, 0.5, 0, Math.PI * 2);
      ctx.fill();

      const tw = Math.sin(f.phase * 2) * 4;
      ctx.beginPath();
      ctx.moveTo(-f.w * 0.38, 0);
      ctx.lineTo(-f.w * 0.72, -16 + tw);
      ctx.lineTo(-f.w * 0.55, 0);
      ctx.lineTo(-f.w * 0.72, 16 - tw);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(f.w * 0.18, -4, 5.5 * Math.min(1.2, f.scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(f.w * 0.2, -4, 2.6 * Math.min(1.2, f.scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(f.w * 0.21, -5, 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(4, 40, 50, 0.55)";
      roundRect(-18, -f.h * 0.55 - 14, 36, 14, 4);
      ctx.fill();
      ctx.fillStyle = f.jewel ? "#f0c75a" : "#e8fbf8";
      ctx.font = `bold ${11 + f.scale * 2}px Outfit, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(f.label, 0, -f.h * 0.55 - 7);

      if (f.jewel) {
        ctx.fillStyle = "rgba(250, 204, 21, 0.55)";
        ctx.beginPath();
        ctx.arc(f.w * 0.05, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawHook(h) {
    const topX = W * 0.5;
    const topY = 36;
    const stretch = h.ropeStretch || 0;

    ctx.save();
    if (h.phase === "snap") {
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = "rgba(248, 113, 113, 0.85)";
    } else {
      ctx.strokeStyle = h.tugFlash > 0 ? "#fde68a" : "rgba(226, 232, 240, 0.85)";
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo((topX + h.x) / 2 + stretch, (topY + h.y) / 2, h.x, h.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(topX, topY + 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(topX, topY + 3, 6, Math.PI, 0);
    ctx.fill();

    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(h.x, h.y + 6, 7, -0.2, Math.PI * 1.1);
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(h.x, h.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    if (h.phase === "struggle") {
      const pct = Math.min(1, h.strugglePhase / (STRUGGLE_AUTO_MS / 1000));
      ctx.fillStyle = "rgba(4, 40, 50, 0.65)";
      roundRect(h.x - 34, h.y - 36, 68, 10, 4);
      ctx.fill();
      ctx.fillStyle = pct > 0.7 ? "#4ade80" : pct > 0.35 ? "#facc15" : "#f87171";
      roundRect(h.x - 32, h.y - 34, 64 * Math.max(pct, h.grip / h.gripMax), 6, 3);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPops() {
    for (const p of state.pops) {
      const a = Math.min(1, p.life * 1.4);
      ctx.globalAlpha = a;
      ctx.font = "bold 20px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#f0c75a";
      ctx.strokeStyle = "rgba(4,40,50,0.55)";
      ctx.lineWidth = 3;
      ctx.strokeText(p.text, p.x, p.y - (1 - p.life) * 28);
      ctx.fillText(p.text, p.x, p.y - (1 - p.life) * 28);
      ctx.globalAlpha = 1;
    }
  }

  function drawBoat() {
    const x = W * 0.5;
    const y = 28 + Math.sin(state.wavePhase * 1.2) * 2;
    ctx.fillStyle = "#8b5a2b";
    ctx.beginPath();
    ctx.moveTo(x - 48, y + 18);
    ctx.quadraticCurveTo(x, y + 34, x + 48, y + 18);
    ctx.lineTo(x + 40, y + 8);
    ctx.lineTo(x - 40, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a97142";
    ctx.fillRect(x - 10, y - 18, 8, 28);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 16);
    ctx.lineTo(x + 28, y - 4);
    ctx.lineTo(x - 2, y + 4);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawWater();
    drawBoat();
    const ordered = [...state.fish].sort((a, b) => a.y - b.y);
    for (const f of ordered) drawFishBody(f);
    for (const h of state.hooks) drawHook(h);
    drawBubbles();
    drawPops();
    ctx.restore();
  }

  function loop(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.033, (ts - state.lastTs) / 1000);
    state.lastTs = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    castHook();
  });

  startBtn.addEventListener("click", startGame);

  betDown.addEventListener("click", () => {
    betIndex = Math.max(0, betIndex - 1);
    refreshHud();
    if (state.running) hintEl.textContent = `Lance: ${mxn(bet())}`;
  });

  betUp.addEventListener("click", () => {
    betIndex = Math.min(BETS.length - 1, betIndex + 1);
    refreshHud();
    if (state.running) hintEl.textContent = `Lance: ${mxn(bet())}`;
  });

  muteBtn.addEventListener("click", () => {
    if (!AudioFX) return;
    AudioFX.unlock();
    const next = !AudioFX.isMuted();
    AudioFX.setMuted(next);
    muteBtn.textContent = next ? "🔇" : "🔊";
  });

  refreshHud();
  drawWater();
  drawBoat();
  drawBubbles();
  loadBalance();
})();
