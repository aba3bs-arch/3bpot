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
    'spin-wheel': { href: '/spin-game/', icon: '🎡', name: 'Ruleta' },
    'comic-slot': { href: '/comic-slot/', icon: '🎰', name: 'Comic Slot' },
    'rancho-lazo': { href: '/rancho-lazo/', icon: '🤠', name: 'Rancho Lazo' },
    'laguna-anzuelo': { href: '/laguna-anzuelo/', icon: '🎣', name: 'Laguna Anzuelo' },
    'rascadito': { href: '/rascadito/', icon: '🎫', name: 'Rascadito' },
    'desenreda-cable': { href: '/desenreda-cable/', icon: '🔌', name: 'Desenreda Cable' },
    'loteria': { href: '/loteria/', icon: '🎴', name: 'Lotería' },
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
      return `<a href="${m.href}${q}" class="game-card"><span class="icon">${m.icon}</span><span class="name">${m.name}</span></a>`;
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
