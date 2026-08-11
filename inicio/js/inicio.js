(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const branchFromUrl = params.get('branch') || params.get('branch_id');
  const machineFromUrl = params.get('m') || params.get('machine');

  if (branchFromUrl) MachineAPI.setBranchId(branchFromUrl);
  if (machineFromUrl) MachineAPI.setMachineNumber(machineFromUrl);

  const setupCard = document.getElementById('setupCard');
  const statusCard = document.getElementById('statusCard');
  const gamesSection = document.getElementById('gamesSection');
  const setupError = document.getElementById('setupError');
  const machinePickWrap = document.getElementById('machinePickWrap');
  const machineSelect = document.getElementById('machineSelect');
  const unlinkBtn = document.getElementById('unlinkBtn');
  const installBtn = document.getElementById('installBtn');
  const unlinkModal = document.getElementById('unlinkModal');

  let pendingBranch = null;
  let deferredInstall = null;

    const gameMeta = {
    'spin-wheel': { href: '/spin-game/', name: 'Ruleta', tag: 'Mesa', mark: 'R', theme: 'ruleta' },
    'comic-slot': { href: '/comic-slot/', name: 'Comic Slot', tag: 'Slots', mark: 'CS', theme: 'comic' },
    'crystal-wins': { href: '/crystal-wins/', name: 'Crystal Wins', tag: 'Slots', mark: 'CW', theme: 'crystal' },
    'rancho-lazo': { href: '/rancho-lazo/', name: 'Rancho Lazo', tag: 'Acción', mark: 'RL', theme: 'rancho' },
    'laguna-anzuelo': { href: '/laguna-anzuelo/', name: 'Laguna Anzuelo', tag: 'Acción', mark: 'LA', theme: 'laguna' },
    'rascadito': { href: '/rascadito/', name: 'Rascadito', tag: 'Instantáneo', mark: '★', theme: 'rasca' },
    'loteria': { href: '/loteria/', name: 'Lotería', tag: 'Clásico', mark: 'L', theme: 'loteria' },
    'rompecabezas': { href: '/rompecabezas/', name: 'Rompecabezas', tag: 'Skill', mark: 'RP', theme: 'puzzle' },
    'calle-pelea': { href: '/calle-pelea/', name: 'Calle Pelea', tag: 'Skill', mark: 'CP', theme: 'pelea' },
    'calle-runner': { href: '/calle-runner/', name: 'Calle Runner', tag: 'Skill', mark: 'CR', theme: 'runner' },
  };

  function showError(el, msg) {
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  function showSetup() {
    setupCard.hidden = false;
    statusCard.hidden = true;
    gamesSection.hidden = true;
    unlinkBtn.hidden = true;
    document.getElementById('heroText').textContent = 'Vincular terminal a una sucursal';
    machinePickWrap.hidden = true;
    pendingBranch = null;
  }

  async function showGames(num, branch) {
    const data = await MachineAPI.getMachine(num, branch);
    MachineAPI.bindTerminal(branch, num);

    // Limpia query de la barra para que no se vea como selector de máquina
    if (location.search) {
      history.replaceState({}, '', '/inicio/');
    }

    setupCard.hidden = true;
    statusCard.hidden = false;
    gamesSection.hidden = false;
    unlinkBtn.hidden = false;

    document.getElementById('machineTitle').textContent = (data.name || 'Máquina') + ' #' + num;
    document.getElementById('heroText').textContent = 'Elige un juego';
    document.getElementById('balanceInfo').className = 'balance';
    document.getElementById('balanceInfo').textContent =
      'Sucursal ' + branch + ' · Saldo: ' + MachineAPI.formatPesos(data.balance);

    const q = '?m=' + num + '&branch=' + encodeURIComponent(branch);
    const games = data.games || Object.keys(gameMeta);
    document.getElementById('gameGrid').innerHTML = games.map((g) => {
      const m = gameMeta[g];
      if (!m) return '';
      return `<a href="${m.href}${q}" class="game-card game-card--${m.theme}">` +
        `<span class="game-card__art" aria-hidden="true"><span class="game-card__mark">${m.mark}</span></span>` +
        `<span class="game-card__body"><span class="game-card__tag">${m.tag}</span><span class="name">${m.name}</span></span></a>`;
    }).join('');
  }

  document.getElementById('linkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(setupError, '');
    const branchId = document.getElementById('branchIdInput').value.trim().toLowerCase();
    const password = document.getElementById('branchPassInput').value;
    try {
      await MachineAPI.loginBranch(branchId, password);
      pendingBranch = branchId;
      const { machines } = await MachineAPI.listMachines(branchId);
      const active = (machines || []).filter((m) => m.active !== 0);
      if (!active.length) {
        showError(setupError, 'Esta sucursal no tiene máquinas activas. Créalas en Admin o Caja.');
        return;
      }
      machineSelect.innerHTML = active.map((m) =>
        `<option value="${m.number}">#${m.number} — ${m.name || 'Terminal'} (${MachineAPI.formatPesos(m.balance)})</option>`
      ).join('');
      machinePickWrap.hidden = false;
      document.getElementById('linkStepBtn').textContent = 'Verificar de nuevo';
    } catch (err) {
      showError(setupError, err.message || 'No se pudo vincular');
      machinePickWrap.hidden = true;
    }
  });

  document.getElementById('confirmLinkBtn').addEventListener('click', async () => {
    showError(setupError, '');
    if (!pendingBranch) return;
    const num = parseInt(machineSelect.value, 10);
    try {
      await showGames(num, pendingBranch);
    } catch (err) {
      showError(setupError, err.message || 'Error al abrir juegos');
    }
  });

  unlinkBtn.addEventListener('click', () => {
    document.getElementById('unlinkPass').value = '';
    showError(document.getElementById('unlinkError'), '');
    unlinkModal.hidden = false;
  });

  document.getElementById('unlinkCancel').addEventListener('click', () => {
    unlinkModal.hidden = true;
  });

  document.getElementById('unlinkConfirm').addEventListener('click', async () => {
    const errEl = document.getElementById('unlinkError');
    showError(errEl, '');
    const branch = MachineAPI.getBranchId();
    const password = document.getElementById('unlinkPass').value;
    try {
      await MachineAPI.loginBranch(branch, password);
      MachineAPI.clearBinding();
      unlinkModal.hidden = true;
      showSetup();
    } catch (err) {
      showError(errEl, err.message || 'Contraseña incorrecta');
    }
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    installBtn.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/inicio/sw.js').catch(() => {});
  }

  const branchId = MachineAPI.getBranchId();
  const machineNum = MachineAPI.getMachineNumber();

  if (branchId && machineNum) {
    showGames(machineNum, branchId).catch(() => showSetup());
  } else {
    showSetup();
  }
})();
