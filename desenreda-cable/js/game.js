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
  const winEl = document.getElementById('win');
  const hintEl = document.getElementById('hint');
  const overlay = document.getElementById('overlay');
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const startBtn = document.getElementById('startBtn');
  const betDown = document.getElementById('betDown');
  const betUp = document.getElementById('betUp');
  const actionBtn = document.getElementById('actionBtn');
  const menuBtn = document.getElementById('menuBtn');
  const machineLabel = document.getElementById('machineLabel');
  const pullActions = document.getElementById('pullActions');
  const pullLeft = document.getElementById('pullLeft');
  const pullRight = document.getElementById('pullRight');
  const toast = document.getElementById('toast');
  const toastTitle = document.getElementById('toastTitle');
  const toastText = document.getElementById('toastText');

  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let busy = false;
  let playing = false;
  let sessionId = null;
  let session = null;
  let animPhase = 0;
  let shake = 0;
  let flashKnotId = null;

  function mxn(n) {
    if (isPlayerMode) return PlayerAuth.formatPesos(n);
    return MachineAPI.formatPesos(n);
  }

  function bet() { return BETS[betIndex]; }

  function showToast(title, text, ok) {
    toastTitle.textContent = title;
    toastText.textContent = text;
    toast.style.borderColor = ok ? '#4ade80' : ok === false ? '#f87171' : '#22d3ee';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2800);
  }

  function refreshHud() {
    creditsEl.textContent = mxn(credits);
    betEl.textContent = mxn(bet());
    winEl.textContent = mxn(session?.accumulated || 0);
    if (machineLabel) {
      machineLabel.textContent = isPlayerMode
        ? (PlayerAuth.getUser()?.name || 'Jugador')
        : (machineNumber ? '#' + machineNumber : '—');
    }
    refreshActionBtn();
  }

  function refreshActionBtn() {
    if (!actionBtn) return;
    if (!playing) {
      actionBtn.textContent = 'JUGAR';
      actionBtn.disabled = false;
      return;
    }
    if (!sessionId) {
      actionBtn.textContent = 'COMENZAR';
      actionBtn.disabled = busy;
      return;
    }
    actionBtn.textContent = 'NUEVO CABLE';
    actionBtn.disabled = busy;
  }

  function cablePoint(t, phase) {
    const x = 70 + t * (W - 140);
    const y = H * 0.52 + Math.sin(t * Math.PI * 3 + phase) * 36 + Math.sin(t * 8 + phase * 2) * 8;
    return { x, y };
  }

  function drawCable() {
    ctx.clearRect(0, 0, W, H);

    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1e293b');
    grd.addColorStop(1, '#0f172a');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(0, H * 0.2 + i * 28);
      ctx.lineTo(W, H * 0.25 + i * 28);
      ctx.stroke();
    }

    if (!session?.knots?.length) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.font = '600 18px IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pulsa COMENZAR para generar el cable', W / 2, H / 2);
      return;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const p = cablePoint(t, animPhase);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 6;
    ctx.stroke();

    const left = cablePoint(0, animPhase);
    const right = cablePoint(1, animPhase);
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(left.x - 18, left.y, 10, 0, Math.PI * 2);
    ctx.arc(right.x + 18, right.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 11px IBM Plex Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('IZQ', left.x - 18, left.y + 28);
    ctx.fillText('DER', right.x + 18, right.y + 28);

    for (const k of session.knots) {
      const p = cablePoint(k.t, animPhase);
      const active = k.id === session.activeKnotId;
      const r = active ? 22 + Math.sin(animPhase * 4) * 2 : 18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = k.untied ? 'rgba(74, 222, 128, 0.25)' : 'rgba(0,0,0,0.35)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = k.untied ? '#166534' : (k.color || '#facc15');
      ctx.fill();
      if (active) {
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (flashKnotId === k.id) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = k.untied ? '#bbf7d0' : '#0f172a';
      ctx.font = `800 ${active ? 13 : 11}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(k.untied ? '✓' : '⛓', p.x, p.y + 4);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 10px IBM Plex Sans, sans-serif';
      ctx.fillText(k.untied ? 'Listo' : k.label, p.x, p.y + r + 14);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(mxn(Math.floor(bet() * k.prizeMult)), p.x, p.y + r + 26);
    }

    if (shake > 0) {
      ctx.fillStyle = `rgba(248, 113, 113, ${Math.min(0.25, shake)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop(ts) {
    animPhase = ts * 0.001;
    if (shake > 0) shake -= 0.02;
    drawCable();
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

  function resetSession() {
    sessionId = null;
    session = null;
    pullActions.classList.add('hidden');
    hintEl.textContent = 'Pulsa COMENZAR para un nuevo cable';
    refreshHud();
  }

  function applySession(data) {
    sessionId = data.sessionId;
    session = {
      knots: data.knots,
      activeKnotId: data.activeKnotId,
      accumulated: data.accumulated || 0,
      remaining: data.remaining,
    };
    credits = data.balance ?? credits;
    pullActions.classList.remove('hidden');
    hintEl.textContent = '¿Hacia qué lado tiras? Elige izquierda o derecha';
    refreshHud();
  }

  async function startCable() {
    if (!playing || busy) return;
    if (!isPlayerMode && !machineNumber) return;
    if (credits < bet()) {
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Pide recarga al cajero.';
      return;
    }

    busy = true;
    refreshActionBtn();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.startDesenredaCable(bet())
        : await MachineAPI.startDesenredaCable(bet());
      applySession(data);
      showToast('Cable listo', `${data.knots.length} nudos · apuesta ${mxn(bet())}`, null);
    } catch (err) {
      showToast('Error', err.message || 'No se pudo iniciar', false);
    } finally {
      busy = false;
      refreshActionBtn();
    }
  }

  async function pull(end) {
    if (!sessionId || busy) return;
    busy = true;
    pullLeft.disabled = true;
    pullRight.disabled = true;
    try {
      const data = isPlayerMode
        ? await PlayerAuth.pullDesenredaCable(sessionId, end)
        : await MachineAPI.pullDesenredaCable(sessionId, end);

      credits = data.balance ?? credits;
      session = {
        knots: data.session.knots,
        activeKnotId: data.session.activeKnotId,
        accumulated: data.accumulated,
        remaining: data.session.remaining,
      };

      if (data.untiedKnot) flashKnotId = data.untiedKnot.id;
      setTimeout(() => { flashKnotId = null; }, 500);

      if (data.success) {
        showToast('¡Bien!', data.message, true);
      } else {
        shake = 1;
        showToast('Ups', data.message, false);
      }

      refreshHud();

      if (data.finished) {
        sessionId = null;
        pullActions.classList.add('hidden');
        if (data.jackpot > 0) {
          showToast('¡JACKPOT!', `Total ${mxn(data.payout)}`, true);
        } else if (data.failed) {
          hintEl.textContent = `Terminado · conservaste ${mxn(data.payout || data.accumulated)}`;
        } else {
          hintEl.textContent = `¡Cable limpio! Ganaste ${mxn(data.payout)}`;
        }
        session = session.knots ? session : null;
        refreshActionBtn();
      }
    } catch (err) {
      showToast('Error', err.message || 'Jalón inválido', false);
    } finally {
      busy = false;
      pullLeft.disabled = false;
      pullRight.disabled = false;
      refreshActionBtn();
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
    resetSession();
    hintEl.textContent = 'Pulsa COMENZAR para pagar y generar el cable';
    refreshHud();
  }

  actionBtn.addEventListener('click', () => {
    if (!playing) {
      beginPlay();
      return;
    }
    if (!sessionId) startCable();
    else {
      resetSession();
      startCable();
    }
  });

  startBtn.addEventListener('click', beginPlay);
  pullLeft.addEventListener('click', () => pull('left'));
  pullRight.addEventListener('click', () => pull('right'));

  betDown.addEventListener('click', () => {
    if (sessionId) return;
    betIndex = Math.max(0, betIndex - 1);
    refreshHud();
  });
  betUp.addEventListener('click', () => {
    if (sessionId) return;
    betIndex = Math.min(BETS.length - 1, betIndex + 1);
    refreshHud();
  });

  requestAnimationFrame(loop);
  refreshHud();
  loadBalance();
})();
