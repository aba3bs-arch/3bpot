(() => {
  'use strict';

  const isPlayerMode = new URLSearchParams(location.search).has('player');
  const BETS = [1, 2, 5, 10, 15, 20];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const els = {
    credits: document.getElementById('credits'),
    bet: document.getElementById('bet'),
    level: document.getElementById('level'),
    prize: document.getElementById('prize'),
    won: document.getElementById('won'),
    hint: document.getElementById('hint'),
    machineLabel: document.getElementById('machineLabel'),
    zoneTimer: document.getElementById('zoneTimer'),
    aliveCount: document.getElementById('aliveCount'),
    killCount: document.getElementById('killCount'),
    hpFill: document.getElementById('hpFill'),
    hpText: document.getElementById('hpText'),
    ammoText: document.getElementById('ammoText'),
    overlay: document.getElementById('overlay'),
    title: document.getElementById('title'),
    subtitle: document.getElementById('subtitle'),
    startBtn: document.getElementById('startBtn'),
    actionBtn: document.getElementById('actionBtn'),
    restartBtn: document.getElementById('restartBtn'),
    menuBtn: document.getElementById('menuBtn'),
    betDown: document.getElementById('betDown'),
    betUp: document.getElementById('betUp'),
    fireBtn: document.getElementById('fireBtn'),
    joystick: document.getElementById('joystick'),
    joyKnob: document.getElementById('joyKnob'),
    toast: document.getElementById('toast'),
    toastTitle: document.getElementById('toastTitle'),
    toastText: document.getElementById('toastText'),
    compass: document.getElementById('compass'),
  };

  const imgHero = new Image();
  const imgRivalA = new Image();
  const imgRivalB = new Image();
  imgHero.src = 'assets/hero.png';
  imgRivalA.src = 'assets/rival-a.png';
  imgRivalB.src = 'assets/rival-b.png';

  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let busy = false;
  let playing = false;
  let session = null;
  let missionEnded = false;

  const keys = Object.create(null);
  const input = { x: 0, y: 0, firing: false };
  let joyActive = false;

  const world = {
    running: false,
    mapSize: 900,
    player: null,
    enemies: [],
    bullets: [],
    particles: [],
    buildings: [],
    barrels: [],
    kills: 0,
    ammo: 30,
    reserve: 120,
    reloadT: 0,
    zoneR: 420,
    zoneTarget: 420,
    zoneT: 0,
    zoneMax: 45,
    camX: 0,
    camY: 0,
    startedAt: 0,
    aimAssist: 0.25,
    enemyDmg: 8,
    shake: 0,
  };

  function mxn(n) {
    return isPlayerMode ? PlayerAuth.formatPesos(n) : MachineAPI.formatPesos(n);
  }
  function bet() { return BETS[betIndex]; }

  function showToast(title, text, ok) {
    els.toastTitle.textContent = title;
    els.toastText.textContent = text;
    els.toast.style.borderColor = ok ? '#b8f000' : ok === false ? '#ff4d4d' : '#4de2ff';
    els.toast.classList.remove('hidden');
    setTimeout(() => els.toast.classList.add('hidden'), 2800);
  }

  function refreshHud() {
    els.credits.textContent = mxn(credits);
    els.bet.textContent = mxn(bet());
    els.level.textContent = session ? String(session.level) : '—';
    els.prize.textContent = mxn(session?.prize || 0);
    els.won.textContent = mxn(session?.totalWon || 0);
    if (els.machineLabel) {
      els.machineLabel.textContent = isPlayerMode
        ? (PlayerAuth.getUser()?.name || 'Jugador')
        : (machineNumber ? '#' + machineNumber : '—');
    }
    els.restartBtn.disabled = !session || busy;

    if (world.player) {
      const pct = Math.max(0, (world.player.hp / world.player.maxHp) * 100);
      els.hpFill.style.width = pct + '%';
      els.hpText.textContent = Math.ceil(world.player.hp) + '/' + world.player.maxHp;
    } else {
      els.hpFill.style.width = '100%';
      els.hpText.textContent = '—';
    }

    els.ammoText.textContent = world.ammo + '/' + world.reserve;
    els.killCount.textContent = String(world.kills);
    const alive = 1 + world.enemies.filter((e) => e.hp > 0).length;
    els.aliveCount.textContent = world.running ? String(alive) : '0';

    const left = Math.max(0, Math.ceil(world.zoneMax - world.zoneT));
    els.zoneTimer.textContent = world.running
      ? String(left).padStart(2, '0') + 's'
      : '—';

    refreshActionBtn();
  }

  function refreshActionBtn() {
    if (!playing) {
      els.actionBtn.textContent = 'JUGAR';
      els.actionBtn.disabled = false;
      return;
    }
    if (!session) {
      els.actionBtn.textContent = 'MISIÓN 1';
      els.actionBtn.disabled = busy;
      return;
    }
    if (session.status === 'level_complete') {
      els.actionBtn.textContent = 'SIGUIENTE';
      els.actionBtn.disabled = busy || world.running;
      return;
    }
    if (session.status === 'failed') {
      els.actionBtn.textContent = 'REINTENTAR';
      els.actionBtn.disabled = busy || world.running;
      return;
    }
    if (world.running) {
      els.actionBtn.textContent = 'EN MISIÓN';
      els.actionBtn.disabled = true;
      return;
    }
    els.actionBtn.textContent = 'MISIÓN 1';
    els.actionBtn.disabled = busy;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function buildMap(size) {
    world.buildings = [];
    world.barrels = [];
    const rooms = [
      { x: 120, y: 100, w: 160, h: 120 },
      { x: 520, y: 80, w: 200, h: 140 },
      { x: 100, y: 520, w: 180, h: 150 },
      { x: 580, y: 500, w: 170, h: 130 },
      { x: 360, y: 300, w: 140, h: 110 },
    ];
    rooms.forEach((r) => {
      const s = size / 900;
      world.buildings.push({
        x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s,
      });
    });
    for (let i = 0; i < 8; i++) {
      world.barrels.push({
        x: rand(80, size - 80),
        y: rand(80, size - 80),
        r: 14,
        hp: 30,
      });
    }
  }

  function circleRect(cx, cy, cr, rect) {
    const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < cr * cr;
  }

  function blocked(x, y, r) {
    for (const b of world.buildings) {
      if (circleRect(x, y, r, b)) return true;
    }
    return false;
  }

  function spawnMission(data) {
    world.mapSize = data.mapSize || 900;
    world.aimAssist = data.aimAssist || 0.2;
    world.enemyDmg = data.enemyDmg || 8;
    world.zoneMax = data.zoneSeconds || 45;
    world.zoneT = 0;
    world.zoneR = world.mapSize * 0.48;
    world.zoneTarget = world.mapSize * 0.22;
    world.kills = 0;
    world.ammo = 30;
    world.reserve = 120;
    world.reloadT = 0;
    world.bullets = [];
    world.particles = [];
    world.shake = 0;
    world.startedAt = performance.now();
    missionEnded = false;
    buildMap(world.mapSize);

    world.player = {
      x: world.mapSize * 0.5,
      y: world.mapSize * 0.55,
      r: 16,
      hp: data.playerHp,
      maxHp: data.playerMaxHp,
      angle: -Math.PI / 2,
      speed: 165,
      shootCd: 0,
    };

    world.enemies = [];
    const n = data.enemies || 4;
    for (let i = 0; i < n; i++) {
      let x; let y; let tries = 0;
      do {
        x = rand(60, world.mapSize - 60);
        y = rand(60, world.mapSize - 60);
        tries += 1;
      } while ((Math.hypot(x - world.player.x, y - world.player.y) < 180 || blocked(x, y, 16)) && tries < 40);

      world.enemies.push({
        x, y, r: 15,
        hp: data.enemyHp,
        maxHp: data.enemyHp,
        angle: rand(0, Math.PI * 2),
        speed: 70 + data.level * 3.5,
        shootCd: rand(0.4, 1.2),
        face: i % 2 === 0 ? imgRivalA : imgRivalB,
        strafe: Math.random() < 0.5 ? 1 : -1,
      });
    }

    world.running = true;
    els.hint.textContent = `Nivel ${data.level}: elimina ${n} rivales · premio ${mxn(data.prize)}`;
  }

  function nearestEnemy(from) {
    let best = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function fireBullet(owner, ally, dmg, speed) {
    const spread = ally ? 0.04 : 0.08;
    const ang = owner.angle + rand(-spread, spread);
    world.bullets.push({
      x: owner.x + Math.cos(ang) * 20,
      y: owner.y + Math.sin(ang) * 20,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ally,
      dmg,
      life: 1.1,
      r: 3,
    });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, 160);
      world.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.55),
        color,
      });
    }
  }

  async function endMission(survived) {
    if (missionEnded || !session) return;
    missionEnded = true;
    world.running = false;
    busy = true;
    refreshHud();

    const elapsed = (performance.now() - world.startedAt) / 1000;
    try {
      const payload = {
        kills: world.kills,
        survived: !!survived && world.player && world.player.hp > 0,
        playerHp: Math.max(0, Math.ceil(world.player?.hp || 0)),
        elapsed,
      };
      const data = isPlayerMode
        ? await PlayerAuth.completeZonaLibre(session.sessionId, payload)
        : await MachineAPI.completeZonaLibre(session.sessionId, payload);

      credits = data.balance ?? credits;
      if (data.session) {
        session = {
          sessionId: data.session.sessionId,
          level: data.session.level,
          prize: data.session.prize,
          status: data.session.status,
          totalWon: data.session.totalWon || 0,
          enemies: data.session.enemies,
          playerHp: data.session.playerHp,
          playerMaxHp: data.session.playerMaxHp,
          enemyHp: data.session.enemyHp,
          enemyDmg: data.session.enemyDmg,
          zoneSeconds: data.session.zoneSeconds,
          aimAssist: data.session.aimAssist,
          mapSize: data.session.mapSize,
          killsRequired: data.session.killsRequired,
        };
      }

      if (data.won) {
        showToast(data.awarded > 0 ? '¡ZONA LIMPIA!' : 'Victoria', data.message, true);
        els.hint.textContent = data.awarded > 0
          ? `Premio cobrado. Pulsa SIGUIENTE (cuesta ${mxn(bet())}).`
          : 'Listo para el siguiente nivel.';
      } else {
        showToast('Eliminado', data.message, false);
        els.hint.textContent = 'REINTENTAR cobra otra apuesta · REINICIAR vuelve al nivel 1.';
      }
    } catch (err) {
      showToast('Error', err.message || 'No se pudo cerrar la misión', false);
      if (session) session.status = 'failed';
    } finally {
      busy = false;
      refreshHud();
    }
  }

  function update(dt) {
    if (!world.running || !world.player) return;

    const p = world.player;
    let mx = input.x;
    let my = input.y;
    if (keys.w || keys.arrowup) my -= 1;
    if (keys.s || keys.arrowdown) my += 1;
    if (keys.a || keys.arrowleft) mx -= 1;
    if (keys.d || keys.arrowright) mx += 1;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }

    let nx = p.x + mx * p.speed * dt;
    let ny = p.y + my * p.speed * dt;
    nx = Math.max(p.r, Math.min(world.mapSize - p.r, nx));
    ny = Math.max(p.r, Math.min(world.mapSize - p.r, ny));
    if (!blocked(nx, p.y, p.r)) p.x = nx;
    if (!blocked(p.x, ny, p.r)) p.y = ny;

    const target = nearestEnemy(p);
    if (target) {
      const desired = Math.atan2(target.y - p.y, target.x - p.x);
      let diff = desired - p.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.angle += diff * Math.min(1, 10 * dt * (0.35 + world.aimAssist));
    } else if (mag > 0.1) {
      p.angle = Math.atan2(my, mx);
    }

    if (world.reloadT > 0) {
      world.reloadT -= dt;
      if (world.reloadT <= 0) {
        const need = 30 - world.ammo;
        const take = Math.min(need, world.reserve);
        world.ammo += take;
        world.reserve -= take;
      }
    }

    p.shootCd = Math.max(0, p.shootCd - dt);
    const wantFire = input.firing || keys[' '] || keys.enter;
    if (wantFire && p.shootCd <= 0 && world.reloadT <= 0) {
      if (world.ammo > 0) {
        world.ammo -= 1;
        p.shootCd = 0.14;
        fireBullet(p, true, 18, 520);
        burst(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18, '#ffe08a', 3);
        if (world.ammo === 0 && world.reserve > 0) world.reloadT = 1.1;
      } else if (world.reserve > 0) {
        world.reloadT = 1.1;
      }
    }

    // enemies
    for (const e of world.enemies) {
      if (e.hp <= 0) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      e.angle = Math.atan2(dy, dx);

      let move = 0;
      if (dist > 170) move = 1;
      else if (dist < 110) move = -0.7;
      const sx = -dy / dist * e.strafe * 0.55;
      const sy = dx / dist * e.strafe * 0.55;
      let ex = e.x + (dx / dist * move + sx) * e.speed * dt;
      let ey = e.y + (dy / dist * move + sy) * e.speed * dt;
      ex = Math.max(e.r, Math.min(world.mapSize - e.r, ex));
      ey = Math.max(e.r, Math.min(world.mapSize - e.r, ey));
      if (!blocked(ex, e.y, e.r)) e.x = ex;
      if (!blocked(e.x, ey, e.r)) e.y = ey;

      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 340) {
        e.shootCd = rand(0.55, 1.05);
        fireBullet(e, false, world.enemyDmg, 380);
      }
    }

    // bullets
    for (const b of world.bullets) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (blocked(b.x, b.y, b.r)) {
        b.life = 0;
        burst(b.x, b.y, '#ccc', 4);
        continue;
      }

      for (const barrel of world.barrels) {
        if (barrel.hp <= 0) continue;
        if (Math.hypot(barrel.x - b.x, barrel.y - b.y) < barrel.r + b.r) {
          barrel.hp -= b.dmg;
          b.life = 0;
          if (barrel.hp <= 0) {
            burst(barrel.x, barrel.y, '#ff8a1e', 18);
            world.shake = 0.35;
            // splash damage
            const victims = [world.player, ...world.enemies];
            for (const v of victims) {
              if (!v || v.hp <= 0) continue;
              if (Math.hypot(v.x - barrel.x, v.y - barrel.y) < 70) {
                v.hp -= 28;
              }
            }
          }
          break;
        }
      }

      if (b.ally) {
        for (const e of world.enemies) {
          if (e.hp <= 0) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
            e.hp -= b.dmg;
            b.life = 0;
            burst(b.x, b.y, '#b8f000', 6);
            if (e.hp <= 0) {
              world.kills += 1;
              burst(e.x, e.y, '#ff4d4d', 14);
            }
            break;
          }
        }
      } else if (world.player && world.player.hp > 0) {
        if (Math.hypot(world.player.x - b.x, world.player.y - b.y) < world.player.r + b.r) {
          world.player.hp -= b.dmg;
          b.life = 0;
          world.shake = 0.4;
          burst(b.x, b.y, '#ff4d4d', 6);
        }
      }
    }
    world.bullets = world.bullets.filter((b) => b.life > 0);

    for (const pt of world.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
    }
    world.particles = world.particles.filter((pt) => pt.life > 0);

    // zone
    world.zoneT += dt;
    const zProg = Math.min(1, world.zoneT / world.zoneMax);
    world.zoneR = world.zoneR * 0 + (world.mapSize * 0.48 * (1 - zProg) + world.zoneTarget * zProg);
    const cx = world.mapSize / 2;
    const cy = world.mapSize / 2;
    if (Math.hypot(p.x - cx, p.y - cy) > world.zoneR) {
      p.hp -= 12 * dt;
    }

    world.camX = p.x - W / 2;
    world.camY = p.y - H / 2;
    world.camX = Math.max(0, Math.min(world.mapSize - W, world.camX));
    world.camY = Math.max(0, Math.min(world.mapSize - H, world.camY));
    if (world.shake > 0) world.shake -= dt;

    // win / lose
    if (p.hp <= 0) {
      p.hp = 0;
      endMission(false);
      return;
    }
    if (world.enemies.every((e) => e.hp <= 0)) {
      endMission(true);
    }

    const heading = ((p.angle * 180) / Math.PI + 360) % 360;
    const dirs = ['E', 'SE', 'S', 'SO', 'O', 'NO', 'N', 'NE'];
    const di = Math.round(heading / 45) % 8;
    els.compass.textContent = dirs[(di + 6) % 8] + ' · ' + dirs[(di + 7) % 8] + ' · ' + dirs[di];

    refreshHud();
  }

  function drawPortrait(img, x, y, r, angle) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#4a5a3a';
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // facing marker
    ctx.strokeStyle = '#b8f000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * (r + 2), y + Math.sin(angle) * (r + 2));
    ctx.lineTo(x + Math.cos(angle) * (r + 14), y + Math.sin(angle) * (r + 14));
    ctx.stroke();
  }

  function draw() {
    ctx.save();
    if (world.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }

    // ground
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#4f6b3d');
    g.addColorStop(1, '#3a522e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.translate(-world.camX, -world.camY);

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= world.mapSize; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, world.mapSize);
      ctx.moveTo(0, i); ctx.lineTo(world.mapSize, i);
      ctx.stroke();
    }

    // zone ring
    const zx = world.mapSize / 2;
    const zy = world.mapSize / 2;
    ctx.fillStyle = 'rgba(20, 40, 80, 0.28)';
    ctx.beginPath();
    ctx.rect(0, 0, world.mapSize, world.mapSize);
    ctx.arc(zx, zy, world.zoneR, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(77, 226, 255, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(zx, zy, world.zoneR, 0, Math.PI * 2);
    ctx.stroke();

    // buildings
    for (const b of world.buildings) {
      ctx.fillStyle = '#dfe7ea';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#2f6f9e';
      for (let wy = b.y + 14; wy < b.y + b.h - 10; wy += 28) {
        for (let wx = b.x + 14; wx < b.x + b.w - 10; wx += 28) {
          ctx.fillRect(wx, wy, 14, 12);
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }

    // barrels
    for (const barrel of world.barrels) {
      if (barrel.hp <= 0) continue;
      ctx.fillStyle = '#d62828';
      ctx.beginPath();
      ctx.arc(barrel.x, barrel.y, barrel.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffcc00';
      ctx.font = '700 10px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', barrel.x, barrel.y + 4);
    }

    for (const b of world.bullets) {
      ctx.fillStyle = b.ally ? '#b8f000' : '#ff8a1e';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pt of world.particles) {
      ctx.globalAlpha = Math.max(0, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, 3, 3);
      ctx.globalAlpha = 1;
    }

    for (const e of world.enemies) {
      if (e.hp <= 0) continue;
      drawPortrait(e.face, e.x, e.y, e.r + 2, e.angle);
      ctx.fillStyle = '#1a1010';
      ctx.fillRect(e.x - 16, e.y - e.r - 12, 32, 5);
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(e.x - 16, e.y - e.r - 12, 32 * (e.hp / e.maxHp), 5);
    }

    if (world.player) {
      drawPortrait(imgHero, world.player.x, world.player.y, world.player.r + 3, world.player.angle);
    }

    ctx.restore();

    if (!world.running && !session) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#b8f000';
      ctx.font = '800 26px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ESPERANDO MISIÓN', W / 2, H / 2);
    }
  }

  let lastTs = 0;
  function loop(ts) {
    const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  async function loadBalance() {
    if (isPlayerMode) {
      if (els.menuBtn) {
        els.menuBtn.href = '/portal/';
        els.menuBtn.textContent = '← Portal';
      }
      if (!PlayerAuth.isLoggedIn()) {
        window.location.href = '/portal/?redirect=' + encodeURIComponent(location.pathname + location.search);
        return;
      }
      try {
        const data = await PlayerAuth.request('/api/auth/me');
        credits = data.user.game_balance || 0;
        refreshHud();
      } catch (err) {
        els.overlay.classList.remove('hidden');
        els.title.textContent = 'Sin sesión';
        els.subtitle.textContent = err.message || 'Inicia sesión';
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
    } catch (err) {
      els.overlay.classList.remove('hidden');
      els.title.textContent = 'Sin máquina';
      els.subtitle.textContent = err.message || 'Selecciona máquina';
    }
  }

  function applySessionMeta(data) {
    session = {
      sessionId: data.sessionId,
      level: data.level,
      prize: data.prize,
      status: data.status,
      totalWon: data.totalWon || 0,
      enemies: data.enemies,
      playerHp: data.playerHp,
      playerMaxHp: data.playerMaxHp,
      enemyHp: data.enemyHp,
      enemyDmg: data.enemyDmg,
      zoneSeconds: data.zoneSeconds,
      aimAssist: data.aimAssist,
      mapSize: data.mapSize,
      killsRequired: data.killsRequired,
    };
    credits = data.balance ?? credits;
  }

  async function startMission(restart) {
    if (!playing || busy || world.running) return;
    if (!isPlayerMode && !machineNumber) return;

    if (credits < bet()) {
      if (restart && session) {
        try {
          busy = true;
          if (isPlayerMode) await PlayerAuth.startZonaLibre(bet(), true);
          else await MachineAPI.startZonaLibre(bet(), true);
        } catch (_) { /* abandon */ }
        finally { busy = false; }
        session = null;
        refreshHud();
        els.overlay.classList.remove('hidden');
        els.title.textContent = 'Sin saldo';
        els.subtitle.textContent = 'Crédito agotado. Recarga para volver al nivel 1.';
        return;
      }
      els.overlay.classList.remove('hidden');
      els.title.textContent = 'Sin saldo';
      els.subtitle.textContent = 'Necesitas más crédito para la siguiente misión.';
      return;
    }

    busy = true;
    refreshHud();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.startZonaLibre(bet(), restart)
        : await MachineAPI.startZonaLibre(bet(), restart);
      applySessionMeta(data);
      spawnMission(data);
      showToast(restart ? 'Nueva partida' : `Nivel ${data.level}`, data.message, true);
    } catch (err) {
      showToast('Error', err.message || 'No se pudo iniciar', false);
      if (restart) session = null;
    } finally {
      busy = false;
      refreshHud();
    }
  }

  async function retryMission() {
    if (!session || busy || world.running) return;
    if (credits < bet()) {
      els.overlay.classList.remove('hidden');
      els.title.textContent = 'Sin saldo';
      els.subtitle.textContent = 'Recarga para reintentar.';
      return;
    }
    busy = true;
    refreshHud();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.retryZonaLibre(session.sessionId)
        : await MachineAPI.retryZonaLibre(session.sessionId);
      applySessionMeta(data);
      spawnMission(data);
      showToast('Reintento', data.message, null);
    } catch (err) {
      showToast('Error', err.message || 'No se pudo reintentar', false);
    } finally {
      busy = false;
      refreshHud();
    }
  }

  function beginPlay() {
    if (!isPlayerMode && !machineNumber) { loadBalance(); return; }
    if (credits < bet()) {
      els.title.textContent = 'Sin saldo';
      els.subtitle.textContent = 'Pide recarga al cajero.';
      return;
    }
    playing = true;
    els.overlay.classList.add('hidden');
    session = null;
    els.hint.textContent = 'Pulsa MISIÓN 1 para pagar y entrar a la zona.';
    refreshHud();
  }

  // input
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('mousedown', () => { input.firing = true; });
  window.addEventListener('mouseup', () => { input.firing = false; });
  els.fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); input.firing = true; }, { passive: false });
  els.fireBtn.addEventListener('touchend', () => { input.firing = false; });
  els.fireBtn.addEventListener('mousedown', (e) => { e.preventDefault(); input.firing = true; });

  function setJoyFromEvent(clientX, clientY) {
    const rect = els.joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.35;
    const m = Math.hypot(dx, dy) || 1;
    if (m > max) { dx = dx / m * max; dy = dy / m * max; }
    input.x = dx / max;
    input.y = dy / max;
    els.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  els.joystick.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joyActive = true;
    const t = e.changedTouches[0];
    setJoyFromEvent(t.clientX, t.clientY);
  }, { passive: false });
  els.joystick.addEventListener('touchmove', (e) => {
    if (!joyActive) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    setJoyFromEvent(t.clientX, t.clientY);
  }, { passive: false });
  const endJoy = () => {
    joyActive = false;
    input.x = 0; input.y = 0;
    els.joyKnob.style.transform = 'translate(0,0)';
  };
  els.joystick.addEventListener('touchend', endJoy);
  els.joystick.addEventListener('touchcancel', endJoy);

  els.actionBtn.addEventListener('click', () => {
    if (!playing) { beginPlay(); return; }
    if (!session) { startMission(false); return; }
    if (session.status === 'level_complete') { startMission(false); return; }
    if (session.status === 'failed') { retryMission(); }
  });

  els.restartBtn.addEventListener('click', async () => {
    if (!playing || busy || world.running) return;
    if (!confirm('¿Reiniciar? Volverás al nivel 1.')) return;
    await startMission(true);
  });

  els.startBtn.addEventListener('click', beginPlay);
  els.betDown.addEventListener('click', () => {
    if (world.running) return;
    betIndex = Math.max(0, betIndex - 1);
    refreshHud();
  });
  els.betUp.addEventListener('click', () => {
    if (world.running) return;
    betIndex = Math.min(BETS.length - 1, betIndex + 1);
    refreshHud();
  });

  refreshHud();
  requestAnimationFrame(loop);
  loadBalance();
})();
