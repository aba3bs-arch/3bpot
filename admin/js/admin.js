(function () {
    'use strict';

    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    const toast = document.getElementById('toast');
    const floatModal = document.getElementById('floatModal');
    const editModal = document.getElementById('editModal');

    let floatAgentId = null;
    let branchesCache = [];
    let agentsCache = [];

    const GAME_LABELS = { 'spin-wheel': 'Ruleta', 'comic-slot': 'Slot', 'rancho-lazo': 'Rancho', 'laguna-anzuelo': 'Laguna Anzuelo', 'rascadito': 'Rascadito', 'desenreda-cable': 'Desenreda Cable' };
    const ALL_GAMES = ['spin-wheel', 'comic-slot', 'rancho-lazo', 'laguna-anzuelo', 'rascadito', 'desenreda-cable'];

    function showToast(msg, err, ms) {
        toast.textContent = msg;
        toast.className = 'toast' + (err ? ' error' : '');
        toast.hidden = false;
        setTimeout(() => { toast.hidden = true; }, ms || 4000);
    }
    function api(path, opts) { return StaffAuth.request('/api/admin' + path, opts); }
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
            if (btn.dataset.tab === 'juegos') loadSettings();
            if (btn.dataset.tab === 'terminales') loadTerminales();
            if (btn.dataset.tab === 'jugadores') loadPlayers();
        });
    });

    async function reloadAll() {
        await Promise.all([loadAgents(), loadBranches(), loadMoneyStats(), loadPlayers()]);
    }

    async function loadPlayers() {
        const table = document.querySelector('#playersTable tbody');
        if (!table) return;
        const { players } = await api('/players');
        table.innerHTML = players.map((p) => `
            <tr>
                <td><strong>${esc(p.name)}</strong></td>
                <td>${esc(p.username)}</td>
                <td class="gold">${StaffAuth.formatPesos(p.game_balance)}</td>
                <td class="actions">
                    <button type="button" class="btn-xs btn--gold" data-credit-player="${p.id}">Acreditar</button>
                </td>
            </tr>`).join('') || '<tr><td colspan="4">Sin jugadores</td></tr>';
        table.querySelectorAll('[data-credit-player]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const amt = prompt('Monto a acreditar:', '100');
                if (!amt) return;
                try {
                    await api('/players/' + btn.dataset.creditPlayer + '/credit', {
                        method: 'POST',
                        body: JSON.stringify({ amount: parseInt(amt, 10) }),
                    });
                    showToast('Crédito agregado');
                    loadPlayers();
                } catch (err) { showToast(err.message, true); }
            });
        });
    }

    function wireTableActions(root) {
        root.querySelectorAll('[data-float]').forEach((b) => {
            b.addEventListener('click', () => {
                floatAgentId = b.dataset.float;
                document.getElementById('floatAgentName').textContent = b.dataset.name;
                floatModal.classList.add('is-open');
            });
        });
        root.querySelectorAll('[data-float-branch]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const amt = prompt('Monto a inyectar a la sucursal:', '1000');
                if (!amt) return;
                try {
                    await api('/branches/' + btn.dataset.floatBranch + '/float', {
                        method: 'POST',
                        body: JSON.stringify({ amount: parseInt(amt, 10) }),
                    });
                    showToast('Moneda inyectada');
                    reloadAll();
                } catch (err) { showToast(err.message, true); }
            });
        });
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
    }

    async function loadAgents() {
        const { agents } = await api('/agents');
        agentsCache = agents;
        const tbody = document.querySelector('#agentsTable tbody');
        tbody.innerHTML = agents.map((a) => `
            <tr>
                <td><strong>${esc(a.name)}</strong></td>
                <td>${esc(a.username || a.email)}</td>
                <td class="gold">${StaffAuth.formatPesos(a.float_balance)}</td>
                <td>${statusBadge(a.active)}</td>
                <td class="actions">${actionBtns('agent', a.id,
                    `<button class="btn-xs btn--gold" data-float="${a.id}" data-name="${esc(a.name)}">Inyectar</button>`
                )}</td>
            </tr>`).join('') || '<tr><td colspan="5">Sin agentes</td></tr>';
        document.getElementById('floatAgentSel').innerHTML =
            '<option value="">Agente</option>' +
            agents.map((a) => `<option value="${a.id}">${esc(a.name)} (${StaffAuth.formatPesos(a.float_balance)})</option>`).join('');
        wireTableActions(tbody);
    }

    async function loadBranches() {
        const { branches } = await api('/branches');
        branchesCache = branches;
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
                    `<button class="btn-xs btn--gold" data-float-branch="${esc(b.id)}">Inyectar</button>`
                )}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="6">Sin sucursales</td></tr>';
        wireTableActions(tbody);
    }

    async function loadMoneyStats() {
        const { stats, agents, branches } = await api('/stats');
        const agentFloat = agentsCache.reduce((s, a) => s + (a.float_balance || 0), 0);
        const branchFloat = branchesCache.reduce((s, b) => s + (b.float_balance || 0), 0);
        document.getElementById('moneyStats').innerHTML = `
            <div class="stat"><span class="stat__label">En agentes</span><span class="stat__val gold">${StaffAuth.formatPesos(agentFloat)}</span></div>
            <div class="stat"><span class="stat__label">En sucursales</span><span class="stat__val gold">${StaffAuth.formatPesos(branchFloat)}</span></div>
            <div class="stat"><span class="stat__label">En máquinas</span><span class="stat__val">${StaffAuth.formatPesos(stats.machineBalance)}</span></div>
            <div class="stat"><span class="stat__label">Casa hoy</span><span class="stat__val green">${StaffAuth.formatPesos(stats.houseToday)}</span></div>
            <div class="stat"><span class="stat__label">Sucursales</span><span class="stat__val">${branches}</span></div>
            <div class="stat"><span class="stat__label">Agentes</span><span class="stat__val">${agents}</span></div>`;
    }

    let terminalsCache = [];

    function terminalUrl(branchId, number) {
        return `${location.origin}/inicio/?branch=${encodeURIComponent(branchId)}&m=${encodeURIComponent(number)}`;
    }

    function fillTerminalBranchSelect() {
        const sel = document.getElementById('termBranchSel');
        const prev = sel.value;
        sel.innerHTML = branchesCache.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')
            || '<option value="">Sin sucursales</option>';
        if (prev && branchesCache.some((b) => b.id === prev)) sel.value = prev;
        suggestTerminalNumber();
    }

    function suggestTerminalNumber() {
        const sel = document.getElementById('termBranchSel');
        const branchId = sel.value;
        const used = terminalsCache
            .filter((m) => m.branch_id === branchId)
            .map((m) => m.number);
        const next = used.length ? Math.max(...used) + 1 : 1;
        document.getElementById('termNumber').value = next;
        const branch = branchesCache.find((b) => b.id === branchId);
        const hintEl = document.getElementById('termHint');
        if (branch) {
            hintEl.textContent = `${used.length} terminal(es) ya registrada(s) en ${branch.name} · saldo de sucursal: ${StaffAuth.formatPesos(branch.float_balance)}`;
        } else {
            hintEl.textContent = '';
        }
    }

    async function loadTerminales() {
        if (!branchesCache.length) await loadBranches();
        fillTerminalBranchSelect();
        const { machines } = await api('/machines');
        terminalsCache = machines;
        suggestTerminalNumber();
        const tbody = document.querySelector('#terminalsTable tbody');
        tbody.innerHTML = machines.map((m) => `
            <tr>
                <td>${esc(m.branch_name || m.branch_id || '—')}</td>
                <td><strong>#${m.number}</strong></td>
                <td>${esc(m.name)}</td>
                <td class="gold">${StaffAuth.formatPesos(m.balance)}</td>
                <td>${statusBadge(m.active)}</td>
                <td><button type="button" class="btn-xs" data-copy="${esc(terminalUrl(m.branch_id, m.number))}">Copiar</button></td>
                <td class="actions">
                    <button type="button" class="btn-xs" data-toggle-term="${m.id}" data-active="${m.active ? 0 : 1}">${m.active ? 'Desactivar' : 'Activar'}</button>
                    <button type="button" class="btn-xs btn-xs--danger" data-del-term="${m.id}">Eliminar</button>
                </td>
            </tr>`).join('') || '<tr><td colspan="7">Sin terminales registradas</td></tr>';
        wireTableActions(tbody);
        tbody.querySelectorAll('[data-toggle-term]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await api('/machines/' + btn.dataset.toggleTerm, {
                        method: 'PATCH',
                        body: JSON.stringify({ active: Number(btn.dataset.active) }),
                    });
                    showToast('Terminal actualizada');
                    loadTerminales();
                } catch (err) { showToast(err.message, true); }
            });
        });
        tbody.querySelectorAll('[data-del-term]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!confirm('¿Eliminar esta terminal?')) return;
                try {
                    await api('/machines/' + btn.dataset.delTerm, { method: 'DELETE' });
                    showToast('Terminal eliminada');
                    loadTerminales();
                } catch (err) { showToast(err.message, true); }
            });
        });
    }

    document.getElementById('termBranchSel').addEventListener('change', suggestTerminalNumber);

    document.getElementById('createTerminalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const branchId = document.getElementById('termBranchSel').value;
        if (!branchId) { showToast('Selecciona una sucursal', true); return; }
        try {
            const data = await api('/machines', {
                method: 'POST',
                body: JSON.stringify({
                    branch_id: branchId,
                    number: parseInt(document.getElementById('termNumber').value, 10),
                    name: document.getElementById('termName').value || undefined,
                }),
            });
            showToast(data.message, false, 6000);
            document.getElementById('termName').value = '';
            loadTerminales();
        } catch (err) { showToast(err.message, true); }
    });

    async function loadSettings() {
        const { settings } = await api('/settings');
        const r = settings.retention_percent || 15;
        document.getElementById('retentionSlider').value = r;
        document.getElementById('retentionVal').textContent = r;
        document.getElementById('rtpVal').textContent = 100 - r;
        document.getElementById('minBet').value = settings.min_bet || 5;
        document.getElementById('maxBet').value = settings.max_bet || 500;
    }

    function openEditModal(type, id) {
        document.getElementById('editType').value = type;
        document.getElementById('editId').value = id;
        document.getElementById('editEmailWrap').hidden = type === 'branch';
        document.getElementById('editGamesWrap').hidden = type !== 'branch';
        document.getElementById('editActiveWrap').hidden = false;
        document.getElementById('editPassWrap').hidden = false;

        if (type === 'agent') {
            const a = agentsCache.find((x) => String(x.id) === String(id));
            if (!a) return;
            document.getElementById('editModalTitle').textContent = 'Editar agente';
            document.getElementById('editName').value = a.name;
            document.getElementById('editUsername').value = a.username || a.email || '';
            document.getElementById('editPass').value = '';
            document.getElementById('editActive').checked = !!a.active;
        } else if (type === 'branch') {
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
        }
        editModal.classList.add('is-open');
    }

    async function confirmDelete(type, id) {
        const labels = { agent: 'agente', branch: 'sucursal' };
        const paths = { agent: '/agents/', branch: '/branches/' };
        if (!confirm(`¿Eliminar ${labels[type]}?`)) return;
        try {
            await api(paths[type] + id, { method: 'DELETE' });
            showToast(`${labels[type]} eliminado`);
            reloadAll();
        } catch (err) { showToast(err.message, true); }
    }

    document.getElementById('retentionSlider').addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        document.getElementById('retentionVal').textContent = v;
        document.getElementById('rtpVal').textContent = 100 - v;
    });

    document.getElementById('saveSettings').addEventListener('click', async () => {
        try {
            await api('/settings', {
                method: 'PATCH',
                body: JSON.stringify({
                    retention_percent: parseInt(document.getElementById('retentionSlider').value, 10),
                    min_bet: parseInt(document.getElementById('minBet').value, 10),
                    max_bet: parseInt(document.getElementById('maxBet').value, 10),
                }),
            });
            showToast('Configuración guardada');
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('editForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('editType').value;
        const id = document.getElementById('editId').value;
        const body = {
            name: document.getElementById('editName').value,
            active: document.getElementById('editActive').checked,
        };
        const pwd = document.getElementById('editPass').value.trim();
        if (pwd) body.password = pwd;
        if (type === 'agent') body.username = document.getElementById('editUsername').value;
        if (type === 'branch') {
            body.games = [...document.querySelectorAll('#editGames input:checked')].map((el) => el.value);
        }
        try {
            const path = type === 'branch' ? '/branches/' + id : '/agents/' + id;
            await api(path, { method: 'PATCH', body: JSON.stringify(body) });
            editModal.classList.remove('is-open');
            showToast('Guardado');
            reloadAll();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('editCancel').addEventListener('click', () => editModal.classList.remove('is-open'));

    document.getElementById('createAgentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('/agents', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('agentName').value,
                    username: document.getElementById('agentUser').value,
                    password: document.getElementById('agentPass').value || undefined,
                }),
            });
            showToast(`${data.message} · ${data.username} / ${data.password}`, false, 8000);
            e.target.reset();
            loadAgents();
        } catch (err) { showToast(err.message, true); }
    });

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
                document.getElementById('playerCredit').value = '100';
                loadPlayers();
            } catch (err) { showToast(err.message, true); }
        });
    }

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
            showToast(`${data.message}`, false, 8000);
            e.target.reset();
            loadBranches();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('seedBranches').addEventListener('click', async () => {
        try {
            const data = await api('/branches/seed', { method: 'POST' });
            showToast(data.message, false, 8000);
            loadBranches();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('floatAgentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('/agents/' + document.getElementById('floatAgentSel').value + '/float', {
                method: 'POST',
                body: JSON.stringify({ amount: parseInt(document.getElementById('floatAgentAmtDirect').value, 10) }),
            });
            showToast('Moneda inyectada al agente');
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
            showToast('Moneda inyectada a la sucursal');
            reloadAll();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('floatCancel').addEventListener('click', () => floatModal.classList.remove('is-open'));
    document.getElementById('floatConfirm').addEventListener('click', async () => {
        try {
            await api('/agents/' + floatAgentId + '/float', {
                method: 'POST',
                body: JSON.stringify({ amount: parseInt(document.getElementById('floatAgentAmt').value, 10) }),
            });
            floatModal.classList.remove('is-open');
            showToast('Saldo inyectado al agente');
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
            if (data.user.role !== 'admin') {
                StaffAuth.clearSession();
                throw new Error('Esta cuenta no es administrador');
            }
            showApp();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => StaffAuth.logout());
    if (StaffAuth.isLoggedIn() && StaffAuth.getUser()?.role === 'admin') showApp();
})();
