(() => {
  'use strict';

  const isPlayerMode = new URLSearchParams(location.search).has('player');
  const BETS = [5, 10, 20, 50, 100];

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
  const tablaEl = document.getElementById('tabla');
  const drawnEmoji = document.getElementById('drawnEmoji');
  const drawnName = document.getElementById('drawnName');
  const drawnCard = document.getElementById('drawnCard');
  const drawnCount = document.getElementById('drawnCount');
  const toast = document.getElementById('toast');
  const toastTitle = document.getElementById('toastTitle');
  const toastText = document.getElementById('toastText');

  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let busy = false;
  let playing = false;
  let lastWin = 0;
  let animating = false;

  function mxn(n) {
    if (isPlayerMode) return PlayerAuth.formatPesos(n);
    return MachineAPI.formatPesos(n);
  }

  function bet() { return BETS[betIndex]; }

  function showToast(title, text, ok) {
    toastTitle.textContent = title;
    toastText.textContent = text;
    toast.style.borderColor = ok ? '#4ade80' : ok === false ? '#f87171' : '#e8b84a';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  function refreshHud() {
    creditsEl.textContent = mxn(credits);
    betEl.textContent = mxn(bet());
    winEl.textContent = mxn(lastWin);
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
    actionBtn.textContent = animating ? 'CANTANDO…' : '¡CÁNTALAS!';
    actionBtn.disabled = busy || animating;
  }

  function renderIdleTabla() {
    tablaEl.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.innerHTML = '<span class="emoji">🎴</span><span class="name">…</span>';
      tablaEl.appendChild(cell);
    }
    drawnEmoji.textContent = '🎴';
    drawnName.textContent = '¡Cántalas!';
    drawnCount.textContent = '0';
  }

  function renderTabla(tabla, marked, winCells) {
    tablaEl.innerHTML = '';
    const winSet = new Set(winCells || []);
    tabla.forEach((card, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (marked && marked[i]) cell.classList.add('marked');
      if (winSet.has(i) && marked && marked[i]) cell.classList.add('win');
      cell.innerHTML = `<span class="emoji">${card.emoji}</span><span class="name">${card.name}</span>`;
      tablaEl.appendChild(cell);
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function animateRound(result) {
    animating = true;
    refreshActionBtn();
    renderTabla(result.tabla, Array(16).fill(false), []);
    drawnCount.textContent = '0';

    const marked = Array(16).fill(false);
    const byId = new Map(result.tabla.map((c, i) => [c.id, i]));

    for (let i = 0; i < result.drawn.length; i++) {
      const card = result.drawn[i];
      drawnEmoji.textContent = card.emoji;
      drawnName.textContent = card.name;
      drawnCount.textContent = String(i + 1);
      drawnCard.classList.remove('pulse');
      void drawnCard.offsetWidth;
      drawnCard.classList.add('pulse');

      const idx = byId.get(card.id);
      if (idx != null) {
        marked[idx] = true;
        renderTabla(result.tabla, marked, []);
      }
      await sleep(380);
    }

    renderTabla(result.tabla, result.marked, result.winCells);
    animating = false;
    refreshActionBtn();
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
        hintEl.textContent = 'Compra una tabla y ¡cántalas!';
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
      hintEl.textContent = 'Compra una tabla y ¡cántalas!';
    } catch (err) {
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin máquina';
      subtitleEl.textContent = err.message || 'Selecciona máquina';
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
      overlay.classList.remove('hidden');
      return;
    }
    playing = true;
    overlay.classList.add('hidden');
    renderIdleTabla();
    hintEl.textContent = `Pulsa ¡CÁNTALAS! (cuesta ${mxn(bet())})`;
    refreshHud();
  }

  async function playRound() {
    if (!playing || busy || animating) return;
    if (!isPlayerMode && !machineNumber) {
      hintEl.textContent = 'Selecciona máquina en Inicio';
      return;
    }
    if (credits < bet()) {
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Pide recarga en sucursal.';
      return;
    }

    busy = true;
    refreshActionBtn();
    try {
      const result = isPlayerMode
        ? await PlayerAuth.playLoteria(bet())
        : await MachineAPI.playLoteria(bet());
      credits = result.balance;
      lastWin = result.payout || 0;
      refreshHud();
      await animateRound(result);

      if (result.payout > 0) {
        showToast(result.label, `Premio ${mxn(result.payout)} · ${result.frijoles} frijoles`, true);
        hintEl.textContent = `${result.label} · ${mxn(result.payout)}`;
      } else {
        showToast('Sin premio', 'La próxima será… ¡échale!', false);
        hintEl.textContent = 'Sin premio — compra otra tabla';
      }
    } catch (err) {
      showToast('Error', err.message || 'No se pudo jugar', false);
      hintEl.textContent = err.message || 'Error';
    } finally {
      busy = false;
      refreshActionBtn();
    }
  }

  actionBtn.addEventListener('click', () => {
    if (!playing) {
      beginPlay();
      return;
    }
    playRound();
  });
  startBtn.addEventListener('click', beginPlay);
  betDown.addEventListener('click', () => {
    if (animating) return;
    betIndex = Math.max(0, betIndex - 1);
    refreshHud();
    if (playing) hintEl.textContent = `Apuesta ${mxn(bet())}`;
  });
  betUp.addEventListener('click', () => {
    if (animating) return;
    betIndex = Math.min(BETS.length - 1, betIndex + 1);
    refreshHud();
    if (playing) hintEl.textContent = `Apuesta ${mxn(bet())}`;
  });

  renderIdleTabla();
  refreshHud();
  loadBalance();
})();
