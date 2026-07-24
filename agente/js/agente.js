(function () {
    'use strict';

    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    const toast = document.getElementById('toast');
    const editModal = document.getElementById('editModal');

    let branchesCache = [];
    let machinesCache = [];

    const GAME_LABELS = { 'spin-wheel': 'Ruleta', 'comic-slot': 'Slot', 'crystal-wins': 'Crystal Wins', 'rancho-lazo': 'Rancho', 'laguna-anzuelo': 'Laguna' };
    const ALL_GAMES = ['spin-wheel', 'comic-slot', 'crystal-wins', 'rancho-lazo', 'laguna-anzuelo'];

    function showToast(msg, err, ms) {
        toast.textContent = msg;
        toast.className = 'toast' + (err ? ' error' : '');
        toast.hidden = false;
        setTimeout(() => { toast.hidden = true; }, ms || 4000);
    }
    function api(path, opts) { return StaffAuth.request('/api/agente' + path, opts); }
    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }
    function statusBadge(active) {
        return active ? '<span class="badge ok">Activo</span>' : '<span class="badge off">Inactivo</span>';
    }
    function actionBtns(type, id, extra) {
        return `${extra || ''}
            <button type="button" class="btn-xs" data-edit="${type}" data-id="${id}">Editar</button>
            <button type="button" class="btn-xs btn-xs--danger" data-del="${type}" data-id="${id}">Eliminar</button>`;
    }
    function branchOptionsOnly(selected) {
        return branchesCache.map((b) =>
            `<option value="${esc(b.id)}" ${selected === b.id ? 'selected' : ''}>${esc(b.name)}</option>`
        ).join('');
    }

    async function updateBalance() {
        const me = await StaffAuth.request('/api/auth/me');
        StaffAuth.setSession(localStorage.getItem('winpot_staff_token'), me.user);
        document.getElementById('agentBalance').textContent =
            'Tu saldo: ' + StaffAuth.formatPesos(me.user.float_balance || 0);
        return me.user;
    }

    function showApp() {
        loginScreen.classList.add('is-hidden');
        app.classList.add('is-visible');
        reloadAll();
    }

    document.querySelectorAll('.nav').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab').forEach((t) => { t.hidden = true; });
            document.getElementById('tab-' + btn.dataset.tab).hidden = false;
            if (btn.dataset.tab === 'jugadores') loadPlayers();
        });
    });

    async function loadPlayers() {
        const table = document.querySelector('#playersTable tbody');
        if (!table) return;
        const { players } = await api('/players');
        table.innerHTML = players.map((p) => `
            <tr>
                <td><strong>${esc(p.name)}</strong></td>
                <td>${esc(p.username)}</td>
                <td class="gold">${StaffAuth.formatPesos(p.game_balance)}</td>
                <td><button type="button" class="btn-xs btn--gold" data-credit-player="${p.id}">Acreditar</button></td>
            </tr>`).join('') || '<tr><td colspan="4">Sin jugadores</td></tr>';
        table.querySelectorAll('[data-credit-player]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const amt = prompt('Monto (sale de tu saldo):', '50');
                if (!amt) return;
                try {
                    await api('/players/' + btn.dataset.creditPlayer + '/credit', {
                        method: 'POST',
                        body: JSON.stringify({ amount: parseInt(amt, 10) }),
                    });
                    showToast('Crédito agregado');
                    loadPlayers();
                    updateBalance();
                } catch (err) { showToast(err.message, true); }
            });
        });
    }

    const createPlayerForm = document.getElementById('createPlayerForm');
    if (createPlayerForm) {
        createPlayerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const data = await api('/players', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: document.getElementById('playerName').value,
                        username: document.getElementById('playerUser').value,
                        password: document.getElementById('playerPass').value || undefined,
                        credit: parseInt(document.getElementById('playerCredit').value, 10) || 0,
                    }),
                });
                showToast(`${data.message} · ${data.username} / ${data.password}`, false, 8000);
                e.target.reset();
                document.getElementById('playerCredit').value = '50';
                loadPlayers();
                updateBalance();
            } catch (err) { showToast(err.message, true); }
        });
    }

    async function reloadAll() {
        await Promise.all([loadBranches(), loadMachines(), loadMoneyStats()]);
        await updateBalance();
    }

    function wireTableActions(root) {
        root.querySelectorAll('[data-copy]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(btn.dataset.copy);
                    showToast('Enlace copiado');
                } catch { showToast(btn.dataset.copy, false, 8000); }
            });
        });
        root.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.addEventListener('click', () => openEditModal(btn.dataset.edit, btn.dataset.id));
        });
        root.querySelectorAll('[data-del]').forEach((btn) => {
            btn.addEventListener('click', () => confirmDelete(btn.dataset.del, btn.dataset.id));
        });
        root.querySelectorAll('[data-float-branch]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const amt = prompt('Monto a transferir (desde tu saldo):', '500');
                if (!amt) return;
                try {
                    await api('/branches/' + btn.dataset.floatBranch + '/float', {
                        method: 'POST',
                        body: JSON.stringify({ amount: parseInt(amt, 10) }),
                    });
                    showToast('Saldo transferido');
                    reloadAll();
                } catch (err) { showToast(err.message, true); }
            });
        });
    }

    async function loadBranches() {
        const { branches } = await api('/branches');
        branchesCache = branches;
        document.getElementById('machineBranch').innerHTML =
            '<option value="">Sucursal</option>' + branchOptionsOnly();
        document.getElementById('floatBranchSel').innerHTML =
            '<option value="">Sucursal</option>' +
            branches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)} (${StaffAuth.formatPesos(b.float_balance)})</option>`).join('');

        const tbody = document.querySelector('#branchesTable tbody');
        tbody.innerHTML = branches.map((b) => {
            const games = (b.games || []).map((g) => GAME_LABELS[g] || g).join(', ');
            const link = `${location.origin}/inicio/?branch=${encodeURIComponent(b.id)}&m=1`;
            return `<tr>
                <td><strong>${esc(b.name)}</strong><br><small>${esc(b.id)}</small></td>
                <td class="gold">${StaffAuth.formatPesos(b.float_balance)}</td>
                <td>${b.stats?.machines || 0}</td>
                <td>${esc(games)}</td>
                <td><button type="button" class="btn-xs" data-copy="${esc(link)}">Copiar</button></td>
                <td class="actions">${actionBtns('branch', b.id,
                    `<button class="btn-xs btn--gold" data-float-branch="${esc(b.id)}">Transferir</button>`
                )}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="6">Sin sucursales</td></tr>';
        wireTableActions(tbody);
    }

    async function loadMachines() {
        const { machines } = await api('/machines');
        machinesCache = machines;
        const tbody = document.querySelector('#machinesTable tbody');
        tbody.innerHTML = machines.map((m) => `
            <tr>
                <td><strong>#${m.number}</strong></td>
                <td>${esc(m.name)}</td>
                <td>${esc(m.branch_name)}</td>
                <td class="gold">${StaffAuth.formatPesos(m.balance)}</td>
                <td>${statusBadge(m.active)}</td>
                <td class="actions">${actionBtns('machine', m.id)}</td>
            </tr>`).join('') || '<tr><td colspan="6">Sin máquinas</td></tr>';
        wireTableActions(tbody);
    }

    async function loadMoneyStats() {
        const { stats, my_float } = await api('/stats');
        document.getElementById('moneyStats').innerHTML = `
            <div class="stat"><span class="stat__label">Tu saldo</span><span class="stat__val gold">${StaffAuth.formatPesos(my_float)}</span></div>
            <div class="stat"><span class="stat__label">En sucursales</span><span class="stat__val">${StaffAuth.formatPesos(stats.branchFloat || 0)}</span></div>
            <div class="stat"><span class="stat__label">En máquinas</span><span class="stat__val">${StaffAuth.formatPesos(stats.machineBalance)}</span></div>`;
    }

    function openEditModal(type, id) {
        document.getElementById('editType').value = type;
        document.getElementById('editId').value = id;
        document.getElementById('editPassWrap').hidden = type !== 'branch';
        document.getElementById('editNumberWrap').hidden = type !== 'machine';
        document.getElementById('editGamesWrap').hidden = type !== 'branch';
        document.getElementById('editActiveWrap').hidden = false;

        if (type === 'branch') {
            const b = branchesCache.find((x) => x.id === id);
            if (!b) return;
            document.getElementById('editModalTitle').textContent = 'Editar sucursal';
            document.getElementById('editName').value = b.name;
            document.getElementById('editPass').value = '';
            document.getElementById('editActive').checked = !!b.active;
            document.getElementById('editGames').innerHTML = ALL_GAMES.map((g) => `
                <label class="checkbox-inline">
                    <input type="checkbox" name="branchGame" value="${g}" ${(b.games || []).includes(g) ? 'checked' : ''}>
                    ${GAME_LABELS[g]}
                </label>`).join('');
        } else if (type === 'machine') {
            const m = machinesCache.find((x) => String(x.id) === String(id));
            if (!m) return;
            document.getElementById('editModalTitle').textContent = 'Editar máquina';
            document.getElementById('editName').value = m.name;
            document.getElementById('editNumber').value = m.number;
            document.getElementById('editActive').checked = !!m.active;
        }
        editModal.classList.add('is-open');
    }

    async function confirmDelete(type, id) {
        const labels = { branch: 'sucursal', machine: 'máquina' };
        const paths = { branch: '/branches/', machine: '/machines/' };
        if (!confirm(`¿Eliminar ${labels[type]}?`)) return;
        try {
            await api(paths[type] + id, { method: 'DELETE' });
            showToast(`${labels[type]} eliminado`);
            reloadAll();
        } catch (err) { showToast(err.message, true); }
    }

    document.getElementById('editForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('editType').value;
        const id = document.getElementById('editId').value;
        const body = {
            name: document.getElementById('editName').value,
            active: document.getElementById('editActive').checked,
        };
        if (type === 'branch') {
            const pwd = document.getElementById('editPass').value.trim();
            if (pwd) body.password = pwd;
            body.games = [...document.querySelectorAll('#editGames input:checked')].map((el) => el.value);
        } else if (type === 'machine') {
            body.number = parseInt(document.getElementById('editNumber').value, 10);
        }
        const paths = { branch: '/branches/', machine: '/machines/' };
        try {
            await api(paths[type] + id, { method: 'PATCH', body: JSON.stringify(body) });
            editModal.classList.remove('is-open');
            showToast('Guardado');
            reloadAll();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('editCancel').addEventListener('click', () => editModal.classList.remove('is-open'));

    document.getElementById('createBranchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('/branches', {
                method: 'POST',
                body: JSON.stringify({
                    id: document.getElementById('branchId').value,
                    name: document.getElementById('branchName').value,
                    password: document.getElementById('branchPass').value || undefined,
                }),
            });
            showToast(data.message, false, 8000);
            e.target.reset();
            reloadAll();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('seedBranches').addEventListener('click', async () => {
        try {
            const data = await api('/branches/seed', { method: 'POST' });
            showToast(data.message, false, 8000);
            reloadAll();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('createMachineForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('/machines', {
                method: 'POST',
                body: JSON.stringify({
                    branch_id: document.getElementById('machineBranch').value,
                    number: parseInt(document.getElementById('machineNum').value, 10),
                    name: document.getElementById('machineName').value || undefined,
                }),
            });
            showToast(data.message);
            e.target.reset();
            reloadAll();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('floatBranchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('/branches/' + document.getElementById('floatBranchSel').value + '/float', {
                method: 'POST',
                body: JSON.stringify({ amount: parseInt(document.getElementById('floatBranchAmt').value, 10) }),
            });
            showToast('Saldo transferido');
            reloadAll();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('loginError');
        errEl.hidden = true;
        const fd = new FormData(e.target);
        try {
            const data = await StaffAuth.login(fd.get('username'), fd.get('password'));
            if (data.user.role !== 'agent') {
                StaffAuth.clearSession();
                throw new Error('Esta cuenta no es agente');
            }
            showApp();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => StaffAuth.logout());
    if (StaffAuth.isLoggedIn() && StaffAuth.getUser()?.role === 'agent') showApp();
})();
