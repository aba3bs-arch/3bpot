(() => {
  'use strict';

  const isPlayerMode = new URLSearchParams(location.search).has('player');
  const BETS = [1, 2, 5, 10, 15, 20];

  const creditsEl = document.getElementById('credits');
  const betEl = document.getElementById('bet');
  const levelEl = document.getElementById('level');
  const prizeEl = document.getElementById('prize');
  const wonEl = document.getElementById('won');
  const movesEl = document.getElementById('moves');
  const moveLimitEl = document.getElementById('moveLimit');
  const sizeLabel = document.getElementById('sizeLabel');
  const hintEl = document.getElementById('hint');
  const boardEl = document.getElementById('board');
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
  const toast = document.getElementById('toast');
  const toastTitle = document.getElementById('toastTitle');
  const toastText = document.getElementById('toastText');

  let credits = 0;
  let betIndex = 0;
  let machineNumber = null;
  let busy = false;
  let playing = false;
  let session = null;

  function mxn(n) {
    if (isPlayerMode) return PlayerAuth.formatPesos(n);
    return MachineAPI.formatPesos(n);
  }

  function bet() { return BETS[betIndex]; }

  function showToast(title, text, ok) {
    toastTitle.textContent = title;
    toastText.textContent = text;
    toast.style.borderColor = ok ? '#6bcb77' : ok === false ? '#e85d4c' : '#2ec4b6';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2800);
  }

  function refreshHud() {
    creditsEl.textContent = mxn(credits);
    betEl.textContent = mxn(bet());
    levelEl.textContent = session ? String(session.level) : '—';
    prizeEl.textContent = mxn(session?.prize || 0);
    wonEl.textContent = mxn(session?.totalWon || 0);
    movesEl.textContent = String(session?.moves || 0);
    moveLimitEl.textContent = String(session?.moveLimit || 0);
    sizeLabel.textContent = session ? `${session.size}×${session.size}` : '—';
    if (machineLabel) {
      machineLabel.textContent = isPlayerMode
        ? (PlayerAuth.getUser()?.name || 'Jugador')
        : (machineNumber ? '#' + machineNumber : '—');
    }
    restartBtn.disabled = !session || busy;
    refreshActionBtn();
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
      actionBtn.textContent = 'REINTENTAR';
      actionBtn.disabled = busy;
      return;
    }
    actionBtn.textContent = 'EN JUEGO';
    actionBtn.disabled = true;
  }

  function solvedTarget(i, size) {
    const last = size * size - 1;
    if (i === last) return 0;
    return i + 1;
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    if (!session?.board?.length) {
      boardEl.style.gridTemplateColumns = 'repeat(3, 1fr)';
      for (let i = 0; i < 9; i++) {
        const d = document.createElement('div');
        d.className = 'tile empty';
        boardEl.appendChild(d);
      }
      return;
    }

    const size = session.size;
    boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    const canMove = session.status === 'playing' && !busy;

    session.board.forEach((val, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile' + (val === 0 ? ' empty' : '');
      if (val !== 0 && val === solvedTarget(idx, size)) btn.classList.add('correct');
      btn.textContent = val === 0 ? '' : String(val);
      btn.disabled = !canMove || val === 0;
      if (val !== 0 && canMove) {
        btn.addEventListener('click', () => moveTile(idx));
      }
      boardEl.appendChild(btn);
    });
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
      size: data.size,
      board: data.board,
      prize: data.prize,
      prizeMult: data.prizeMult,
      moves: data.moves,
      moveLimit: data.moveLimit,
      status: data.status,
      totalWon: data.totalWon || 0,
      prizePaid: data.prizePaid,
    };
    credits = data.balance ?? credits;
    renderBoard();
    refreshHud();
  }

  async function startLevel(restart) {
    if (!playing || busy) return;
    if (!isPlayerMode && !machineNumber) return;
    if (credits < bet()) {
      if (restart && session) {
        try {
          busy = true;
          if (isPlayerMode) await PlayerAuth.startRompecabezas(bet(), true);
          else await MachineAPI.startRompecabezas(bet(), true);
        } catch (_) {
          /* abandonó en servidor o falló cobro: limpiar local */
        } finally {
          busy = false;
        }
        session = null;
        renderBoard();
        refreshHud();
        hintEl.textContent = 'Partida reiniciada al nivel 1. Necesitas crédito para jugar.';
        overlay.classList.remove('hidden');
        titleEl.textContent = 'Sin saldo';
        subtitleEl.textContent = 'Tu crédito se agotó. Pide recarga al cajero para empezar de nuevo.';
        showToast('Reiniciado', 'Volviste al nivel 1', null);
        return;
      }
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Tu crédito se agotó. Pide recarga al cajero para seguir subiendo de nivel.';
      return;
    }

    busy = true;
    refreshActionBtn();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.startRompecabezas(bet(), restart)
        : await MachineAPI.startRompecabezas(bet(), restart);
      applySession(data);
      showToast(
        restart ? 'Partida nueva' : `Nivel ${data.level}`,
        data.message || `Premio ${mxn(data.prize)} · cobrado ${mxn(bet())}`,
        true
      );
      hintEl.textContent = 'Toca una ficha junto al hueco para moverla. Ordena 1…N.';
    } catch (err) {
      showToast('Error', err.message || 'No se pudo iniciar', false);
      if (restart) {
        session = null;
        renderBoard();
        hintEl.textContent = 'Partida reiniciada. Pulsa NIVEL 1 cuando tengas saldo.';
      }
      if ((err.message || '').includes('insuficiente')) {
        overlay.classList.remove('hidden');
        titleEl.textContent = 'Sin saldo';
        subtitleEl.textContent = 'Necesitas más crédito para jugar el siguiente nivel.';
      }
    } finally {
      busy = false;
      refreshHud();
      renderBoard();
    }
  }

  async function retryLevel() {
    if (!session || busy) return;
    if (credits < bet()) {
      overlay.classList.remove('hidden');
      titleEl.textContent = 'Sin saldo';
      subtitleEl.textContent = 'Pide recarga al cajero para reintentar.';
      return;
    }
    busy = true;
    refreshActionBtn();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.retryRompecabezas(session.sessionId)
        : await MachineAPI.retryRompecabezas(session.sessionId);
      applySession(data);
      showToast('Reintento', data.message || 'Nivel regenerado', null);
      hintEl.textContent = 'Nuevo tablero del mismo nivel. El premio solo se paga una vez.';
    } catch (err) {
      showToast('Error', err.message || 'No se pudo reintentar', false);
    } finally {
      busy = false;
      refreshHud();
      renderBoard();
    }
  }

  async function moveTile(tileIndex) {
    if (!session || session.status !== 'playing' || busy) return;
    busy = true;
    renderBoard();
    try {
      const data = isPlayerMode
        ? await PlayerAuth.moveRompecabezas(session.sessionId, tileIndex)
        : await MachineAPI.moveRompecabezas(session.sessionId, tileIndex);

      credits = data.balance ?? credits;
      if (data.session) {
        session = {
          sessionId: data.session.sessionId,
          level: data.session.level,
          size: data.session.size,
          board: data.session.board,
          prize: data.session.prize,
          prizeMult: data.session.prizeMult,
          moves: data.session.moves,
          moveLimit: data.session.moveLimit,
          status: data.session.status,
          totalWon: data.session.totalWon || 0,
          prizePaid: data.session.prizePaid,
        };
      }

      if (data.solved) {
        showToast(
          data.awarded > 0 ? '¡Premio!' : 'Resuelto',
          data.message,
          true
        );
        hintEl.textContent = data.awarded > 0
          ? `Premio cobrado. Pulsa SIGUIENTE (cuesta ${mxn(bet())}) para el nivel ${session.level + 1}.`
          : 'Premio ya cobrado en esta partida. Puedes seguir al siguiente nivel.';
      } else if (data.failed) {
        showToast('Fallaste', data.message, false);
        hintEl.textContent = 'Sin movimientos. REINTENTAR cobra otra apuesta o REINICIAR vuelve al nivel 1.';
      }

      refreshHud();
      renderBoard();
    } catch (err) {
      showToast('Error', err.message || 'Movimiento inválido', false);
    } finally {
      busy = false;
      refreshHud();
      renderBoard();
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
    renderBoard();
    hintEl.textContent = 'Pulsa NIVEL 1 para pagar y empezar. Reiniciar = volver al inicio.';
    refreshHud();
  }

  actionBtn.addEventListener('click', () => {
    if (!playing) {
      beginPlay();
      return;
    }
    if (!session) {
      startLevel(false);
      return;
    }
    if (session.status === 'level_complete') {
      startLevel(false);
      return;
    }
    if (session.status === 'failed') {
      retryLevel();
    }
  });

  restartBtn.addEventListener('click', async () => {
    if (!playing || busy) return;
    const ok = confirm('¿Reiniciar? Volverás al nivel 1 y perderás el progreso de esta partida.');
    if (!ok) return;
    await startLevel(true);
  });

  startBtn.addEventListener('click', beginPlay);

  betDown.addEventListener('click', () => {
    if (session && session.status === 'playing') return;
    betIndex = Math.max(0, betIndex - 1);
    refreshHud();
  });
  betUp.addEventListener('click', () => {
    if (session && session.status === 'playing') return;
    betIndex = Math.min(BETS.length - 1, betIndex + 1);
    refreshHud();
  });

  renderBoard();
  refreshHud();
  loadBalance();
})();
