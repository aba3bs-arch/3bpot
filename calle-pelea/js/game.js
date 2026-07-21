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

  function drawFighter(x, y, facing, color, hair, pose, scale) {
    const s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing * s, s);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 38, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    const punch = pose === 'punch';
    const kick = pose === 'kick';
    const block = pose === 'block';
    const hit = pose === 'hit';

    const bodyX = hit ? -8 : punch ? 10 : kick ? 6 : 0;
    const armY = punch ? -18 : block ? -8 : -4;
    const armLen = punch ? 52 : block ? 28 : 34;
    const legKick = kick ? 55 : 0;

    // legs
    ctx.strokeStyle = '#2c1810';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bodyX - 8, 0);
    ctx.lineTo(bodyX - 14, 50);
    ctx.moveTo(bodyX + 8, 0);
    ctx.lineTo(bodyX + 10 + legKick, kick ? 20 : 50);
    ctx.stroke();

    // torso
    ctx.fillStyle = color;
    ctx.fillRect(bodyX - 22, -70, 44, 72);
    // abs highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bodyX - 10, -50, 12, 40);

    // arms
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(bodyX - 18, -55);
    ctx.lineTo(bodyX - 30, armY - 10);
    ctx.moveTo(bodyX + 18, -55);
    ctx.lineTo(bodyX + (block ? 8 : armLen), armY);
    ctx.stroke();

    // fists
    ctx.fillStyle = '#f0c8a8';
    ctx.beginPath();
    ctx.arc(bodyX - 30, armY - 10, 9, 0, Math.PI * 2);
    ctx.arc(bodyX + (block ? 8 : armLen), armY, punch ? 11 : 9, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.fillStyle = '#e8b896';
    ctx.beginPath();
    ctx.arc(bodyX, -92, 22, 0, Math.PI * 2);
    ctx.fill();

    // hair
    ctx.fillStyle = hair || '#1a1208';
    ctx.beginPath();
    ctx.moveTo(bodyX - 20, -98);
    ctx.quadraticCurveTo(bodyX, -120, bodyX + 22, -95);
    ctx.lineTo(bodyX + 16, -88);
    ctx.quadraticCurveTo(bodyX, -100, bodyX - 16, -88);
    ctx.fill();

    // eye
    ctx.fillStyle = '#111';
    ctx.fillRect(bodyX + 4, -96, 6, 4);

    ctx.restore();
  }

  function drawScene() {
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#6ec1f0');
    sky.addColorStop(0.55, '#9fd4f5');
    sky.addColorStop(0.55, '#6a7a4a');
    sky.addColorStop(1, '#3d4a2e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // building
    ctx.fillStyle = '#8a93a0';
    ctx.fillRect(W * 0.55, 40, 160, 200);
    ctx.fillStyle = '#6f7886';
    ctx.fillRect(W * 0.55 + 20, 55, 30, 22);
    ctx.fillRect(W * 0.55 + 60, 55, 30, 22);
    ctx.fillRect(W * 0.55 + 100, 55, 30, 22);
    ctx.fillRect(W * 0.55 + 20, 95, 30, 22);
    ctx.fillRect(W * 0.55 + 60, 95, 30, 22);
    ctx.fillRect(W * 0.55 + 100, 95, 30, 22);

    // trees
    ctx.fillStyle = '#2f6b3a';
    for (let i = 0; i < 6; i++) {
      const tx = 40 + i * 70;
      ctx.beginPath();
      ctx.moveTo(tx, 210);
      ctx.lineTo(tx + 28, 150);
      ctx.lineTo(tx + 56, 210);
      ctx.fill();
    }

    // crowd blobs
    for (let i = 0; i < 28; i++) {
      const cx = 20 + (i % 14) * 30 + (Math.sin(anim.t + i) * 2);
      const cy = 195 + Math.floor(i / 14) * 22 + Math.sin(anim.t * 3 + i) * 3;
      ctx.fillStyle = i % 3 === 0 ? '#c0392b' : i % 3 === 1 ? '#2980b9' : '#f39c12';
      ctx.fillRect(cx, cy, 16, 20);
      ctx.fillStyle = '#e8b896';
      ctx.fillRect(cx + 3, cy - 10, 10, 10);
    }

    // street
    ctx.fillStyle = '#5a5348';
    ctx.fillRect(0, 250, W, H - 250);
    ctx.fillStyle = '#3f3a33';
    ctx.fillRect(0, 250, W, 8);

    const bob = Math.sin(anim.t * 4) * 2;
    const pBase = 280 + bob + anim.playerX;
    const eBase = 280 + bob + anim.enemyX;
    const rivalColor = session?.rival?.color || '#c45c26';
    const rivalHair = session?.rival?.hair || '#1a1208';

    drawFighter(220 + anim.playerX, pBase, 1, '#4a90d9', '#f5d76e', anim.playerPose, 1.15);
    drawFighter(740 + anim.enemyX, eBase, -1, rivalColor, rivalHair, anim.enemyPose, 1.15);

    if (anim.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${anim.flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (!session) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffcc33';
      ctx.font = '700 28px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('¡PREPÁRATE!', W / 2, H / 2);
    } else if (anim.lastNote) {
      ctx.fillStyle = '#fff';
      ctx.font = '700 18px IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(anim.lastNote, W / 2, 40);
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
