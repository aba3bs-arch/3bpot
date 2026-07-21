(() => {
  'use strict';

  const isPlayerMode = new URLSearchParams(location.search).has('player');
  const BETS = [1, 2, 5, 10, 15, 20];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const creditsEl = document.getElementById('credits');
  const betEl = document.getElementById('bet');
  const levelEl = document.getElementById('level');
  const prizeEl = document.getElementById('prize');
  const wonEl = document.getElementById('won');
  const hintEl = document.getElementById('hint');
  const playerBar = document.getElementById('playerBar');
  const enemyBar = document.getElementById('enemyBar');
  const playerHp = document.getElementById('playerHp');
  const enemyHp = document.getElementById('enemyHp');
  const rivalName = document.getElementById('rivalName');
  const roundNum = document.getElementById('roundNum');
  const overlay = document.getElementById('overlay');
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const startBtn = document.getElementById('startBtn');
  const betDown = document.getElementById('betDown');
  const betUp = document.getElementById('betUp');
  const actionBtn = document.getElementById('actionBtn');
  const restartBtn = document.getElementById('restartBtn');
  const menuBtn = document.getElementById('menuBtn');
  const machineLabel = document.getElementById('machineLabel');
  const btnPunch = document.getElementById('btnPunch');
  const btnKick = document.getElementById('btnKick');
  const btnBlock = document.getElementById('btnBlock');
  const toast = document.getElementById('toast');
  const toastTitle = document.getElementById('toastTitle');
  const toastText = document.getElementById('toastText');

  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let busy = false;
  let playing = false;
  let session = null;
  let anim = {
    t: 0,
    playerPose: 'idle',
    enemyPose: 'idle',
    playerX: 0,
    enemyX: 0,
    flash: 0,
    lastNote: '',
  };

  function mxn(n) {
    if (isPlayerMode) return PlayerAuth.formatPesos(n);
    return MachineAPI.formatPesos(n);
  }

  function bet() { return BETS[betIndex]; }

  function showToast(title, text, ok) {
    toastTitle.textContent = title;
    toastText.textContent = text;
    toast.style.borderColor = ok ? '#6bcb77' : ok === false ? '#e23b2e' : '#ffcc33';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2800);
  }

  function setFightButtons(enabled) {
    btnPunch.disabled = !enabled;
    btnKick.disabled = !enabled;
    btnBlock.disabled = !enabled;
  }

  function refreshHud() {
    creditsEl.textContent = mxn(credits);
    betEl.textContent = mxn(bet());
    levelEl.textContent = session ? String(session.level) : '—';
    prizeEl.textContent = mxn(session?.prize || 0);
    wonEl.textContent = mxn(session?.totalWon || 0);
    roundNum.textContent = String(session?.round || 0);

    if (session) {
      const pPct = Math.max(0, (session.playerHp / session.playerMaxHp) * 100);
      const ePct = Math.max(0, (session.enemyHp / session.enemyMaxHp) * 100);
      playerBar.style.width = pPct + '%';
      enemyBar.style.width = ePct + '%';
      playerHp.textContent = `${session.playerHp}/${session.playerMaxHp}`;
      enemyHp.textContent = `${session.enemyHp}/${session.enemyMaxHp}`;
      rivalName.textContent = (session.rival?.name || 'RIVAL').toUpperCase();
    } else {
      playerBar.style.width = '100%';
      enemyBar.style.width = '100%';
      playerHp.textContent = '—';
      enemyHp.textContent = '—';
      rivalName.textContent = 'RIVAL';
    }

    if (machineLabel) {
      machineLabel.textContent = isPlayerMode
        ? (PlayerAuth.getUser()?.name || 'Jugador')
        : (machineNumber ? '#' + machineNumber : '—');
    }

    restartBtn.disabled = !session || busy;
    refreshActionBtn();
    setFightButtons(!!session && session.status === 'fighting' && !busy);
  }

  function refreshActionBtn() {
    if (!playing) {
      actionBtn.textContent = 'JUGAR';
      actionBtn.disabled = false;
      return;
    }
    if (!session) {
      actionBtn.textContent = 'NIVEL 1';
      actionBtn.disabled = busy;
      return;
    }
    if (session.status === 'level_complete') {
      actionBtn.textContent = 'SIGUIENTE';
      actionBtn.disabled = busy;
      return;
    }
    if (session.status === 'failed') {
      actionBtn.textContent = 'REVANCHA';
      actionBtn.disabled = busy;
      return;
    }
    actionBtn.textContent = 'EN PELEA';
    actionBtn.disabled = true;
  }

  const imgYou = new Image();
  const imgRival = new Image();
  imgYou.src = 'assets/you.png';
  imgRival.src = 'assets/rival.png';

  function drawPortrait(img, x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#e8b896';
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawFighter(x, y, facing, color, pose, img, scale) {
    const s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing * s, s);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 48, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    const punch = pose === 'punch';
    const kick = pose === 'kick';
    const block = pose === 'block';
    const hit = pose === 'hit';

    const bodyX = hit ? -10 : punch ? 14 : kick ? 8 : 0;
    const armY = punch ? -22 : block ? -10 : -6;
    const armLen = punch ? 62 : block ? 30 : 40;
    const legKick = kick ? 62 : 0;

    // pants / legs with shading
    const legGrad = ctx.createLinearGradient(0, 0, 0, 60);
    legGrad.addColorStop(0, '#2a2118');
    legGrad.addColorStop(1, '#1a140f');
    ctx.strokeStyle = legGrad;
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bodyX - 10, 0);
    ctx.lineTo(bodyX - 16, 58);
    ctx.moveTo(bodyX + 10, 0);
    ctx.lineTo(bodyX + 12 + legKick, kick ? 24 : 58);
    ctx.stroke();

    // torso tank
    const torso = ctx.createLinearGradient(bodyX - 28, -90, bodyX + 28, 0);
    torso.addColorStop(0, color);
    torso.addColorStop(1, '#1a120c');
    ctx.fillStyle = torso;
    roundRect(ctx, bodyX - 28, -88, 56, 90, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(bodyX - 8, -70, 10, 50);

    // arms
    ctx.strokeStyle = '#d4a078';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(bodyX - 22, -70);
    ctx.lineTo(bodyX - 34, armY - 8);
    ctx.moveTo(bodyX + 22, -70);
    ctx.lineTo(bodyX + (block ? 10 : armLen), armY);
    ctx.stroke();

    ctx.fillStyle = '#e8b896';
    ctx.beginPath();
    ctx.arc(bodyX - 34, armY - 8, 11, 0, Math.PI * 2);
    ctx.arc(bodyX + (block ? 10 : armLen), armY, punch ? 13 : 11, 0, Math.PI * 2);
    ctx.fill();

    // realistic head portrait
    drawPortrait(img, bodyX, -118, 36);

    // impact FX
    if (punch || kick) {
      ctx.fillStyle = 'rgba(255, 204, 51, 0.35)';
      ctx.beginPath();
      ctx.arc(bodyX + armLen + 10, armY, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawScene() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#5aa6d8');
    sky.addColorStop(0.5, '#8ec8ea');
    sky.addColorStop(0.5, '#5f7348');
    sky.addColorStop(1, '#3a4a2c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // buildings depth
    ctx.fillStyle = '#7b8694';
    ctx.fillRect(W * 0.58, 30, 180, 210);
    ctx.fillStyle = '#6a7584';
    ctx.fillRect(W * 0.42, 70, 120, 170);
    ctx.fillStyle = '#3d6f9a';
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.fillRect(W * 0.58 + 20 + col * 38, 50 + row * 34, 22, 18);
      }
    }

    // trees
    ctx.fillStyle = '#2f6b3a';
    for (let i = 0; i < 7; i++) {
      const tx = 30 + i * 55;
      ctx.beginPath();
      ctx.moveTo(tx, 220);
      ctx.lineTo(tx + 26, 155);
      ctx.lineTo(tx + 52, 220);
      ctx.fill();
    }

    // animated crowd
    for (let i = 0; i < 30; i++) {
      const cx = 16 + (i % 15) * 28 + Math.sin(anim.t + i) * 2;
      const cy = 200 + Math.floor(i / 15) * 20 + Math.sin(anim.t * 3 + i) * 3;
      ctx.fillStyle = i % 3 === 0 ? '#c0392b' : i % 3 === 1 ? '#2980b9' : '#f39c12';
      ctx.fillRect(cx, cy, 14, 18);
      ctx.fillStyle = '#e8b896';
      ctx.beginPath();
      ctx.arc(cx + 7, cy - 4, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#524a40';
    ctx.fillRect(0, 255, W, H - 255);
    ctx.fillStyle = '#3a342c';
    ctx.fillRect(0, 255, W, 10);

    const bob = Math.sin(anim.t * 4) * 2;
    const rivalColor = session?.rival?.color || '#c45c26';

    drawFighter(230 + anim.playerX, 285 + bob, 1, '#4a90d9', anim.playerPose, imgYou, 1.2);
    drawFighter(730 + anim.enemyX, 285 + bob, -1, rivalColor, anim.enemyPose, imgRival, 1.2);

    if (anim.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${anim.flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (!session) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, W, H);
      if (imgYou.complete) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2 - 70, H / 2 - 20, 48, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(imgYou, W / 2 - 118, H / 2 - 68, 96, 96);
        ctx.restore();
      }
      if (imgRival.complete) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2 + 70, H / 2 - 20, 48, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(imgRival, W / 2 + 22, H / 2 - 68, 96, 96);
        ctx.restore();
      }
      ctx.fillStyle = '#ffcc33';
      ctx.font = '700 26px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('¡PREPÁRATE!', W / 2, H / 2 + 60);
    } else if (anim.lastNote) {
      ctx.fillStyle = '#fff';
      ctx.font = '700 18px IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(anim.lastNote, W / 2, 36);
    }
  }

  function loop(ts) {
    anim.t = ts * 0.001;
    if (anim.flash > 0) anim.flash -= 0.05;
    if (anim.playerX) anim.playerX *= 0.85;
    if (anim.enemyX) anim.enemyX *= 0.85;
    drawScene();
    requestAnimationFrame(loop);
  }

  async function loadBalance() {
    if (isPlayerMode) {
      if (menuBtn) {
        menuBtn.href = '/portal/';
        menuBtn.textContent = '← Portal';
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
        overlay.classList.remove('hidden');
        titleEl.textContent = 'Sin sesión';
        subtitleEl.textContent = err.message || 'Inicia sesión';
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
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin máquina';
      subtitleEl.textContent = err.message || 'Selecciona máquina';
    }
  }

  function applySession(data) {
    session = {
      sessionId: data.sessionId,
      level: data.level,
      prize: data.prize,
      rival: data.rival,
      playerHp: data.playerHp,
      playerMaxHp: data.playerMaxHp,
      enemyHp: data.enemyHp,
      enemyMaxHp: data.enemyMaxHp,
      round: data.round,
      maxRounds: data.maxRounds,
      status: data.status,
      totalWon: data.totalWon || 0,
    };
    credits = data.balance ?? credits;
    anim.playerPose = 'idle';
    anim.enemyPose = 'idle';
    anim.lastNote = data.message || '';
    refreshHud();
  }

  async function startFight(restart) {
    if (!playing || busy) return;
    if (!isPlayerMode && !machineNumber) return;

    if (credits < bet()) {
      if (restart && session) {
        try {
          busy = true;
          if (isPlayerMode) await PlayerAuth.startCallePelea(bet(), true);
          else await MachineAPI.startCallePelea(bet(), true);
        } catch (_) { /* abandoned */ }
        finally { busy = false; }
        session = null;
        refreshHud();
        overlay.classList.remove('hidden');
        titleEl.textContent = 'Sin saldo';
        subtitleEl.textContent = 'Crédito agotado. Pide recarga al cajero para volver al nivel 1.';
        showToast('Reiniciado', 'Volviste al nivel 1', null);
        return;
      }
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Necesitas más crédito para pelear el siguiente nivel.';
      return;
    }

    busy = true;
    refreshHud();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.startCallePelea(bet(), restart)
        : await MachineAPI.startCallePelea(bet(), restart);
      applySession(data);
      showToast(restart ? 'Nueva partida' : `Nivel ${data.level}`, data.message, true);
      hintEl.textContent = `vs ${data.rival.name} · elige GOLPE, PATADA o BLOQUEO`;
    } catch (err) {
      showToast('Error', err.message || 'No se pudo iniciar', false);
      if (restart) session = null;
      if ((err.message || '').includes('insuficiente')) {
        overlay.classList.remove('hidden');
        titleEl.textContent = 'Sin saldo';
        subtitleEl.textContent = 'Pide recarga al cajero.';
      }
    } finally {
      busy = false;
      refreshHud();
    }
  }

  async function retryFight() {
    if (!session || busy) return;
    if (credits < bet()) {
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Pide recarga para la revancha.';
      return;
    }
    busy = true;
    refreshHud();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.retryCallePelea(session.sessionId)
        : await MachineAPI.retryCallePelea(session.sessionId);
      applySession(data);
      showToast('Revancha', data.message, null);
    } catch (err) {
      showToast('Error', err.message || 'No se pudo reintentar', false);
    } finally {
      busy = false;
      refreshHud();
    }
  }

  async function doAction(action) {
    if (!session || session.status !== 'fighting' || busy) return;
    busy = true;
    refreshHud();

    anim.playerPose = action === 'block' ? 'block' : action;
    anim.playerX = action === 'block' ? -6 : 28;

    try {
      const data = isPlayerMode
        ? await PlayerAuth.actionCallePelea(session.sessionId, action)
        : await MachineAPI.actionCallePelea(session.sessionId, action);

      credits = data.balance ?? credits;
      if (data.session) {
        session = {
          sessionId: data.session.sessionId,
          level: data.session.level,
          prize: data.session.prize,
          rival: data.session.rival,
          playerHp: data.session.playerHp,
          playerMaxHp: data.session.playerMaxHp,
          enemyHp: data.session.enemyHp,
          enemyMaxHp: data.session.enemyMaxHp,
          round: data.session.round,
          maxRounds: data.session.maxRounds,
          status: data.session.status,
          totalWon: data.session.totalWon || 0,
        };
      }

      const entry = data.entry;
      if (entry) {
        anim.enemyPose = entry.enemyAction === 'block' ? 'block' : entry.enemyAction;
        anim.enemyX = entry.enemyAction === 'block' ? 6 : -28;
        anim.lastNote = entry.note;
        if (entry.playerDmg > 0) {
          anim.playerPose = 'hit';
          anim.flash = 1;
        }
        if (entry.enemyDmg > 0) anim.flash = Math.max(anim.flash, 0.7);
      }

      setTimeout(() => {
        if (session?.status === 'fighting') {
          anim.playerPose = 'idle';
          anim.enemyPose = 'idle';
        }
      }, 420);

      if (data.finished) {
        if (data.won) {
          anim.enemyPose = 'hit';
          anim.playerPose = 'punch';
          showToast(data.awarded > 0 ? '¡KO!' : 'Victoria', data.message, true);
          hintEl.textContent = data.awarded > 0
            ? `Premio cobrado. Pulsa SIGUIENTE (cuesta ${mxn(bet())}) para el nivel ${session.level + 1}.`
            : 'Puedes seguir al siguiente nivel.';
        } else {
          anim.playerPose = 'hit';
          showToast('Derrota', data.message, false);
          hintEl.textContent = 'REVANCHA cobra otra apuesta · REINICIAR vuelve al nivel 1.';
        }
      } else {
        hintEl.textContent = data.message || 'Siguiente movimiento…';
      }

      refreshHud();
    } catch (err) {
      showToast('Error', err.message || 'Acción inválida', false);
      anim.playerPose = 'idle';
      anim.enemyPose = 'idle';
    } finally {
      busy = false;
      refreshHud();
    }
  }

  function beginPlay() {
    if (!isPlayerMode && !machineNumber) {
      loadBalance();
      return;
    }
    if (credits < bet()) {
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Pide recarga al cajero.';
      return;
    }
    playing = true;
    overlay.classList.add('hidden');
    session = null;
    hintEl.textContent = 'Pulsa NIVEL 1 para pagar y pelear. Reiniciar = volver al inicio.';
    refreshHud();
  }

  actionBtn.addEventListener('click', () => {
    if (!playing) { beginPlay(); return; }
    if (!session) { startFight(false); return; }
    if (session.status === 'level_complete') { startFight(false); return; }
    if (session.status === 'failed') { retryFight(); }
  });

  restartBtn.addEventListener('click', async () => {
    if (!playing || busy) return;
    if (!confirm('¿Reiniciar? Volverás al nivel 1 y perderás el progreso.')) return;
    await startFight(true);
  });

  startBtn.addEventListener('click', beginPlay);
  btnPunch.addEventListener('click', () => doAction('punch'));
  btnKick.addEventListener('click', () => doAction('kick'));
  btnBlock.addEventListener('click', () => doAction('block'));

  betDown.addEventListener('click', () => {
    if (session && session.status === 'fighting') return;
    betIndex = Math.max(0, betIndex - 1);
    refreshHud();
  });
  betUp.addEventListener('click', () => {
    if (session && session.status === 'fighting') return;
    betIndex = Math.min(BETS.length - 1, betIndex + 1);
    refreshHud();
  });

  refreshHud();
  requestAnimationFrame(loop);
  loadBalance();
})();
