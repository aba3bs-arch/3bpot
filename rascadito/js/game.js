(() => {
  'use strict';

  const isPlayerMode = new URLSearchParams(location.search).has('player');
  const BETS = [5, 10, 20, 50, 100];

  const creditsEl = document.getElementById('credits');
  const betEl = document.getElementById('bet');
  const winEl = document.getElementById('win');
  const poolEl = document.getElementById('poolAvailable');
  const hintEl = document.getElementById('hint');
  const overlay = document.getElementById('overlay');
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const startBtn = document.getElementById('startBtn');
  const betDown = document.getElementById('betDown');
  const betUp = document.getElementById('betUp');
  const actionBtn = document.getElementById('actionBtn');
  const menuBtn = document.getElementById('menuBtn');
  const revealBtn = document.getElementById('revealBtn');
  const machineLabel = document.getElementById('machineLabel');
  const card = document.getElementById('card');
  const gridEl = document.getElementById('grid');
  const scratchCanvas = document.getElementById('scratch');
  const cardIdle = document.getElementById('cardIdle');
  const resultToast = document.getElementById('resultToast');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');

  const scratchCtx = scratchCanvas.getContext('2d');
  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let branchId = null;
  let busy = false;
  let playing = false;
  let hasCard = false;
  let revealed = false;
  let lastResult = null;
  let scratchPct = 0;
  let scratching = false;

  function mxn(n) {
    if (isPlayerMode) return PlayerAuth.formatPesos(n);
    return MachineAPI.formatPesos(n);
  }

  function bet() {
    return BETS[betIndex];
  }

  function refreshActionBtn() {
    if (!actionBtn) return;
    if (!playing) {
      actionBtn.textContent = 'JUGAR';
      actionBtn.disabled = false;
      return;
    }
    if (hasCard && !revealed) {
      actionBtn.textContent = 'RASCAR';
      actionBtn.disabled = busy;
      return;
    }
    actionBtn.textContent = 'COMPRAR';
    actionBtn.disabled = busy;
  }

  function refreshHud() {
    creditsEl.textContent = mxn(credits);
    betEl.textContent = mxn(bet());
    winEl.textContent = mxn(lastResult?.payout || 0);
    if (machineLabel) {
      machineLabel.textContent = isPlayerMode
        ? (PlayerAuth.getUser()?.name || 'Jugador')
        : (machineNumber ? '#' + machineNumber : '—');
    }
    refreshActionBtn();
  }

  function resizeScratchCanvas() {
    const rect = card.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    scratchCanvas.width = Math.floor(rect.width * dpr);
    scratchCanvas.height = Math.floor(rect.height * dpr);
    scratchCanvas.style.width = rect.width + 'px';
    scratchCanvas.style.height = rect.height + 'px';
    scratchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function paintScratchLayer() {
    resizeScratchCanvas();
    const w = scratchCanvas.clientWidth;
    const h = scratchCanvas.clientHeight;
    const grd = scratchCtx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#e8ebf2');
    grd.addColorStop(0.5, '#b8beca');
    grd.addColorStop(1, '#dfe3ea');
    scratchCtx.globalCompositeOperation = 'source-over';
    scratchCtx.fillStyle = grd;
    scratchCtx.fillRect(0, 0, w, h);
    scratchCtx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 18; i++) {
      scratchCtx.fillRect(Math.random() * w, Math.random() * h, 40, 2);
    }
    scratchCtx.font = '800 22px Outfit, sans-serif';
    scratchCtx.fillStyle = 'rgba(26,20,40,0.55)';
    scratchCtx.textAlign = 'center';
    scratchCtx.fillText('RASCA AQUÍ', w / 2, h / 2 - 8);
    scratchCtx.font = '600 14px Outfit, sans-serif';
    scratchCtx.fillText('3 iguales = premio', w / 2, h / 2 + 18);
    scratchPct = 0;
  }

  function estimateScratchProgress() {
    const dpr = window.devicePixelRatio || 1;
    const w = scratchCanvas.width;
    const h = scratchCanvas.height;
    const data = scratchCtx.getImageData(0, 0, w, h).data;
    let transparent = 0;
    const step = 16;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        if (data[i + 3] < 40) transparent += 1;
      }
    }
    const samples = Math.ceil(w / step) * Math.ceil(h / step);
    scratchPct = transparent / samples;
    return scratchPct;
  }

  function scratchAt(clientX, clientY, radius) {
    const rect = scratchCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    scratchCtx.globalCompositeOperation = 'destination-out';
    scratchCtx.beginPath();
    scratchCtx.arc(x, y, radius, 0, Math.PI * 2);
    scratchCtx.fill();
  }

  function renderGrid(cells, winLine) {
    gridEl.innerHTML = '';
    cells.forEach((cell, index) => {
      const div = document.createElement('div');
      div.className = 'cell';
      if (winLine && winLine.includes(index)) div.classList.add('win');
      div.innerHTML = `<span>${cell.emoji}</span><span class="cell-label">${cell.label}</span>`;
      gridEl.appendChild(div);
    });
  }

  function showResult(result) {
    const payout = result.payout || 0;
    resultToast.classList.remove('hidden');
    if (payout <= 0) {
      resultTitle.textContent = 'Sin premio';
      resultText.textContent = 'Sigue intentando — hay muchos reintegros';
      resultToast.style.borderColor = '#94a3b8';
    } else if (result.reintegro) {
      resultTitle.textContent = 'Reintegro';
      resultText.textContent = `${result.label} · ${mxn(payout)}`;
      resultToast.style.borderColor = '#f5c518';
    } else {
      resultTitle.textContent = '¡Premio!';
      resultText.textContent = `${result.label} · ${mxn(payout)}`;
      resultToast.style.borderColor = '#22c55e';
    }
    setTimeout(() => resultToast.classList.add('hidden'), 3200);
  }

  function revealAll() {
    if (!hasCard || revealed) return;
    revealed = true;
    scratchCanvas.classList.add('hidden');
    showResult(lastResult);
    hintEl.textContent = lastResult?.payout > 0
      ? `Ganaste ${mxn(lastResult.payout)} — compra otro rascadito`
      : 'Sin premio — compra otro rascadito';
    refreshActionBtn();
  }

  function resetCardIdle() {
    hasCard = false;
    revealed = false;
    lastResult = null;
    scratchPct = 0;
    gridEl.innerHTML = '';
    cardIdle.classList.remove('hidden');
    scratchCanvas.classList.add('hidden');
    winEl.textContent = mxn(0);
    refreshActionBtn();
  }

  function beginCard(result) {
    lastResult = result;
    hasCard = true;
    revealed = false;
    credits = result.balance;
    cardIdle.classList.add('hidden');
    renderGrid(result.cells, result.winLine);
    scratchCanvas.classList.remove('hidden');
    paintScratchLayer();
    if (poolEl && result.poolAvailableAfter != null) {
      poolEl.textContent = mxn(result.poolAvailableAfter);
    }
    winEl.textContent = mxn(result.payout || 0);
    hintEl.textContent = 'Rasca la tarjeta con el dedo o pulsa RASCAR';
    refreshHud();
  }

  async function loadPool() {
    if (isPlayerMode) return;
    branchId = MachineAPI.getBranchId();
    if (!branchId) return;
    try {
      const data = await MachineAPI.getScratchPool(branchId);
      if (poolEl) poolEl.textContent = mxn(data.available || 0);
    } catch (_) {
      if (poolEl) poolEl.textContent = '—';
    }
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
        hintEl.textContent = 'Compra un rascadito y rasca para revelar';
      } catch (err) {
        titleEl.textContent = 'Sin sesión';
        subtitleEl.textContent = err.message || 'Inicia sesión en el portal';
        overlay.classList.remove('hidden');
      }
      return;
    }

    machineNumber = MachineAPI.requireMachine();
    if (!machineNumber) return;
    branchId = MachineAPI.getBranchId();
    if (MachineAPI.wireInicioLinks) MachineAPI.wireInicioLinks();
    try {
      const data = await MachineAPI.getMachine(machineNumber);
      credits = data.balance;
      refreshHud();
      await loadPool();
      hintEl.textContent = 'Compra un rascadito y rasca para revelar';
    } catch (err) {
      titleEl.textContent = 'Sin máquina';
      subtitleEl.textContent = err.message || 'Selecciona máquina en Inicio';
      overlay.classList.remove('hidden');
    }
  }

  function startGame() {
    if (!isPlayerMode && !machineNumber) {
      loadBalance();
      return;
    }
    if (credits < bet()) {
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Pide recarga al cajero.';
      overlay.classList.remove('hidden');
      return;
    }
    playing = true;
    overlay.classList.add('hidden');
    resetCardIdle();
    hintEl.textContent = 'Pulsa COMPRAR para tu rascadito';
    refreshHud();
  }

  async function buyCard() {
    if (!playing || busy) return;
    if (hasCard && !revealed) {
      revealAll();
      return;
    }
    if (!isPlayerMode && !machineNumber) {
      hintEl.textContent = 'Selecciona máquina en Inicio';
      return;
    }
    if (credits < bet()) {
      hintEl.textContent = 'Saldo insuficiente';
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Pide recarga en sucursal.';
      return;
    }

    busy = true;
    refreshActionBtn();
    try {
      const result = isPlayerMode
        ? await PlayerAuth.playRascadito(bet())
        : await MachineAPI.playRascadito(bet());
      beginCard(result);
    } catch (err) {
      hintEl.textContent = err.message || 'Error al comprar';
    } finally {
      busy = false;
      refreshActionBtn();
    }
  }

  function handlePointerDown(e) {
    if (!hasCard || revealed) return;
    scratching = true;
    scratchAt(e.clientX, e.clientY, 22);
  }

  function handlePointerMove(e) {
    if (!scratching || !hasCard || revealed) return;
    scratchAt(e.clientX, e.clientY, 20);
    if (estimateScratchProgress() >= 0.42) revealAll();
  }

  function handlePointerUp() {
    scratching = false;
    if (hasCard && !revealed && estimateScratchProgress() >= 0.42) revealAll();
  }

  scratchCanvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    scratchCanvas.setPointerCapture(e.pointerId);
    handlePointerDown(e);
  });
  scratchCanvas.addEventListener('pointermove', handlePointerMove);
  scratchCanvas.addEventListener('pointerup', handlePointerUp);
  scratchCanvas.addEventListener('pointercancel', handlePointerUp);

  actionBtn.addEventListener('click', () => {
    if (!playing) {
      startGame();
      return;
    }
    buyCard();
  });
  startBtn.addEventListener('click', startGame);
  revealBtn.addEventListener('click', revealAll);
  betDown.addEventListener('click', () => {
    if (hasCard && !revealed) return;
    betIndex = Math.max(0, betIndex - 1);
    refreshHud();
  });
  betUp.addEventListener('click', () => {
    if (hasCard && !revealed) return;
    betIndex = Math.min(BETS.length - 1, betIndex + 1);
    refreshHud();
  });

  window.addEventListener('resize', () => {
    if (hasCard && !revealed) paintScratchLayer();
  });

  refreshHud();
  loadBalance();
})();
