(function () {
    'use strict';

    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    const toast = document.getElementById('toast');
    const floatModal = document.getElementById('floatModal');
    let floatCashierId = null;

    function openFloatModal(id, name) {
        floatCashierId = id;
        document.getElementById('floatCashierName').textContent = name;
        document.getElementById('floatAmount').value = 1000;
        floatModal.classList.add('is-open');
    }

    function closeFloatModal() {
        floatModal.classList.remove('is-open');
        floatCashierId = null;
    }

    const txLabels = {
        cash_sale: 'Venta efectivo', float_topup: 'Recarga cajero',
        bet: 'Apuesta', win: 'Premio', admin_credit: 'Depósito', admin_debit: 'Retiro',
    };

    function splitDateTime(iso) {
        if (!iso) return { date: '—', time: '—' };
        const d = new Date(iso);
        return {
            date: d.toLocaleDateString('es-MX'),
            time: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
    }

    function creditStatus(m) {
        if (!m.active) return { label: 'Inactiva', cls: 'credit-off' };
        if (m.balance > 0) return { label: StaffAuth.formatPesos(m.balance), cls: 'credit-ok' };
        return { label: 'Sin crédito', cls: 'credit-empty' };
    }

    function renderMovementRow(t) {
        const dt = splitDateTime(t.created_at);
        const isPlus = t.amount > 0;
        const isMinus = t.amount < 0;
        const estado = t.balance_after != null
            ? StaffAuth.formatPesos(t.balance_after)
            : (txLabels[t.type] || t.type);
        return `
            <tr>
                <td>${t.id}</td>
                <td>${t.machine_number ? '#' + t.machine_number : '—'}</td>
                <td class="${t.balance_after > 0 ? 'credit-ok' : 'credit-empty'}">${estado}</td>
                <td class="gold">${StaffAuth.formatPesos(Math.abs(t.amount))}</td>
                <td class="col-action">${isPlus ? '<span class="sign-plus">+</span>' : '<span class="sign-none">·</span>'}</td>
                <td class="col-action">${isMinus ? '<span class="sign-minus">−</span>' : '<span class="sign-none">·</span>'}</td>
                <td>${dt.date}</td>
                <td>${dt.time}</td>
            </tr>`;
    }

    function lastTxByMachine(transactions) {
        const map = {};
        transactions.forEach((t) => {
            if (t.machine_id && !map[t.machine_id]) map[t.machine_id] = t;
        });
        return map;
    }

    function showToast(msg, err) {
        toast.textContent = msg;
        toast.className = 'toast' + (err ? ' error' : '');
        toast.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toast.hidden = true; }, 3000);
    }

    function api(path, opts) { return StaffAuth.request('/api/admin' + path, opts); }

    function showApp() {
        loginScreen.classList.add('is-hidden');
        app.classList.add('is-visible');
        loadStats();
        loadSettings();
    }

    document.querySelectorAll('.nav').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab').forEach((t) => t.hidden = true);
            document.getElementById('tab-' + btn.dataset.tab).hidden = false;
            if (btn.dataset.tab === 'maquinas') loadMachines();
            if (btn.dataset.tab === 'cajeros') loadCashiers();
            if (btn.dataset.tab === 'ventas') { loadSellMachines(); loadTransactions(); }
        });
    });

    async function loadStats() {
        const { stats } = await api('/stats');
        document.getElementById('statsGrid').innerHTML = `
            <div class="stat"><span class="stat__label">Efectivo vendido hoy</span><span class="stat__val gold">${StaffAuth.formatPesos(stats.cashToday / 100)}</span></div>
            <div class="stat"><span class="stat__label">Ventas hoy</span><span class="stat__val">${stats.salesToday}</span></div>
            <div class="stat"><span class="stat__label">Saldo en máquinas</span><span class="stat__val">${StaffAuth.formatPesos(stats.machineBalance)}</span></div>
            <div class="stat"><span class="stat__label">Saldo en cajeros</span><span class="stat__val">${StaffAuth.formatPesos(stats.cashierFloat)}</span></div>
            <div class="stat"><span class="stat__label">Ganancia casa hoy</span><span class="stat__val green">${StaffAuth.formatPesos(stats.houseToday)}</span></div>
            <div class="stat"><span class="stat__label">Retención actual</span><span class="stat__val">${stats.retention}%</span></div>
            <div class="stat"><span class="stat__label">Máquinas activas</span><span class="stat__val">${stats.machines}</span></div>
            <div class="stat"><span class="stat__label">Cajeros</span><span class="stat__val">${stats.cashiers}</span></div>`;
    }

    async function loadSettings() {
        const { settings } = await api('/settings');
        document.getElementById('retentionSlider').value = settings.retention_percent;
        document.getElementById('retentionVal').textContent = settings.retention_percent + '%';
    }

    document.getElementById('retentionSlider').addEventListener('input', (e) => {
        document.getElementById('retentionVal').textContent = e.target.value + '%';
    });

    document.getElementById('saveRetention').addEventListener('click', async () => {
        const retention_percent = parseInt(document.getElementById('retentionSlider').value, 10);
        await api('/settings', { method: 'PATCH', body: JSON.stringify({ retention_percent }) });
        showToast('Retención guardada: ' + retention_percent + '%');
        loadStats();
    });

    async function loadMachines() {
        const [{ machines }, { transactions }] = await Promise.all([
            api('/machines'),
            api('/transactions?limit=200'),
        ]);
        const lastTx = lastTxByMachine(transactions);
        const machineTxs = transactions.filter((t) => t.machine_id);

        document.querySelector('#machinesTable tbody').innerHTML = machines.map((m) => {
            const status = creditStatus(m);
            const tx = lastTx[m.id];
            const dt = splitDateTime(tx?.created_at);
            return `
            <tr data-machine-id="${m.id}">
                <td>${m.id}</td>
                <td><strong>#${m.number}</strong><br><span class="muted-xs">${m.name}</span></td>
                <td class="${status.cls}">${status.label}</td>
                <td>
                    <input type="number" class="deposit-input" min="1" step="1" value="100" placeholder="100">
                </td>
                <td class="col-action">
                    <button type="button" class="btn-icon btn-icon--plus" data-action="add" title="Agregar crédito">+</button>
                </td>
                <td class="col-action">
                    <button type="button" class="btn-icon btn-icon--minus" data-action="sub" title="Retirar crédito" ${m.balance <= 0 ? 'disabled' : ''}>−</button>
                </td>
                <td>${dt.date}</td>
                <td>${dt.time}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="8">Sin máquinas registradas</td></tr>';

        document.querySelector('#movementsTable tbody').innerHTML = machineTxs.length
            ? machineTxs.map(renderMovementRow).join('')
            : '<tr><td colspan="8">Sin movimientos aún</td></tr>';
    }

    document.getElementById('machinesTable').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;
        const row = btn.closest('[data-machine-id]');
        if (!row) return;
        const machineId = row.dataset.machineId;
        const input = row.querySelector('.deposit-input');
        const amount = parseInt(input?.value, 10);
        if (!amount || amount <= 0) return showToast('Ingresa una cantidad válida', true);
        const signed = btn.dataset.action === 'sub' ? -amount : amount;
        try {
            await api('/machines/' + machineId + '/adjust', {
                method: 'POST',
                body: JSON.stringify({ amount: signed }),
            });
            showToast(btn.dataset.action === 'sub' ? 'Crédito retirado' : 'Crédito agregado');
            loadMachines();
            loadStats();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('addMachineBtn').addEventListener('click', async () => {
        const number = document.getElementById('newMachineNum').value;
        const name = document.getElementById('newMachineName').value;
        if (!number) return showToast('Ingresa número de máquina', true);
        try {
            await api('/machines', { method: 'POST', body: JSON.stringify({ number, name }) });
            showToast('Máquina agregada');
            document.getElementById('newMachineNum').value = '';
            loadMachines();
        } catch (e) { showToast(e.message, true); }
    });

    async function loadCashiers() {
        const { cashiers } = await api('/cashiers');
        document.querySelector('#cashiersTable tbody').innerHTML = cashiers.map((c) => `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.email}</td>
                <td class="gold">${StaffAuth.formatPesos(c.float_balance)}</td>
                <td><button class="btn-xs btn--gold" data-float="${c.id}" data-name="${c.name}">Recargar caja</button></td>
            </tr>`).join('');

        document.querySelectorAll('[data-float]').forEach((b) => {
            b.addEventListener('click', () => openFloatModal(b.dataset.float, b.dataset.name));
        });
    }

    floatModal.addEventListener('click', (e) => {
        if (e.target === floatModal) closeFloatModal();
    });

    document.getElementById('floatCancel').addEventListener('click', closeFloatModal);
    document.getElementById('floatConfirm').addEventListener('click', async () => {
        const amount = parseInt(document.getElementById('floatAmount').value, 10);
        if (!amount || amount <= 0) return showToast('Ingresa un monto válido', true);
        try {
            await api('/cashiers/' + floatCashierId + '/float', { method: 'POST', body: JSON.stringify({ amount }) });
            closeFloatModal();
            showToast(StaffAuth.formatPesos(amount) + ' agregados al cajero');
            loadCashiers();
            loadStats();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('createCashierForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('/cashiers', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('cashierName').value,
                    email: document.getElementById('cashierEmail').value,
                    password: document.getElementById('cashierPass').value || undefined,
                }),
            });
            showToast(data.message + (data.tempPassword ? ' · Pass: ' + data.tempPassword : ''));
            e.target.reset();
            loadCashiers();
        } catch (err) { showToast(err.message, true); }
    });

    async function loadSellMachines() {
        const { machines } = await api('/machines');
        document.getElementById('sellMachine').innerHTML = machines.filter((m) => m.active)
            .map((m) => `<option value="${m.id}">#${m.number} — ${m.name} (${StaffAuth.formatPesos(m.balance)})</option>`).join('');
    }

    document.getElementById('adminSellForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('/sell', {
                method: 'POST',
                body: JSON.stringify({
                    machineId: parseInt(document.getElementById('sellMachine').value, 10),
                    amount: parseInt(document.getElementById('sellAmount').value, 10),
                }),
            });
            showToast(data.message);
            loadStats();
            loadSellMachines();
        } catch (err) { showToast(err.message, true); }
    });

    async function loadTransactions() {
        const { transactions } = await api('/transactions?limit=50');
        const machineTxs = transactions.filter((t) => t.machine_id);
        document.querySelector('#txTable tbody').innerHTML = machineTxs.length
            ? machineTxs.map(renderMovementRow).join('')
            : '<tr><td colspan="8">Sin transacciones</td></tr>';
    }

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('loginError');
        errEl.hidden = true;
        const fd = new FormData(e.target);
        try {
            const data = await StaffAuth.login(fd.get('email'), fd.get('password'));
            if (data.user.role !== 'admin') {
                StaffAuth.clearSession();
                throw new Error('Esta cuenta no es administrador. Usa admin@winpot.local');
            }
            showApp();
        } catch (err) {
            errEl.textContent = err.message || 'No se pudo entrar';
            errEl.hidden = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => StaffAuth.logout());

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeFloatModal();
    });

    if (StaffAuth.isLoggedIn() && StaffAuth.getUser()?.role === 'admin') showApp();
})();
