(function () {
    'use strict';

    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    const toast = document.getElementById('toast');
    let floatCashierId = null;

    const txLabels = {
        cash_sale: 'Venta efectivo', float_topup: 'Recarga cajero',
        bet: 'Apuesta', win: 'Premio', admin_credit: 'Ajuste +', admin_debit: 'Ajuste -',
    };

    function showToast(msg, err) {
        toast.textContent = msg;
        toast.className = 'toast' + (err ? ' error' : '');
        toast.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toast.hidden = true; }, 3000);
    }

    function api(path, opts) { return StaffAuth.request('/api/admin' + path, opts); }

    function showApp() {
        loginScreen.hidden = true;
        app.hidden = false;
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
        const { machines } = await api('/machines');
        document.querySelector('#machinesTable tbody').innerHTML = machines.map((m) => `
            <tr>
                <td><strong>#${m.number}</strong></td>
                <td>${m.name}</td>
                <td class="gold">${StaffAuth.formatPesos(m.balance)}</td>
                <td><span class="badge ${m.active ? 'ok' : 'off'}">${m.active ? 'Activa' : 'Apagada'}</span></td>
                <td>
                    <button class="btn-xs" data-adj="${m.id}">±$</button>
                    <button class="btn-xs" data-toggle="${m.id}" data-active="${m.active}">${m.active ? 'Apagar' : 'Prender'}</button>
                </td>
            </tr>`).join('');

        document.querySelectorAll('[data-adj]').forEach((b) => {
            b.addEventListener('click', async () => {
                const amt = parseInt(prompt('Monto en pesos (+ cargar, - quitar):', '100'), 10);
                if (!amt) return;
                await api('/machines/' + b.dataset.adj + '/adjust', { method: 'POST', body: JSON.stringify({ amount: amt }) });
                showToast('Saldo actualizado');
                loadMachines();
            });
        });
        document.querySelectorAll('[data-toggle]').forEach((b) => {
            b.addEventListener('click', async () => {
                const active = b.dataset.active === '1' || b.dataset.active === 'true';
                await api('/machines/' + b.dataset.toggle + '/status', { method: 'PATCH', body: JSON.stringify({ active: !active }) });
                loadMachines();
            });
        });
    }

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
            b.addEventListener('click', () => {
                floatCashierId = b.dataset.float;
                document.getElementById('floatCashierName').textContent = b.dataset.name;
                document.getElementById('floatModal').hidden = false;
            });
        });
    }

    document.getElementById('floatCancel').addEventListener('click', () => { document.getElementById('floatModal').hidden = true; });
    document.getElementById('floatConfirm').addEventListener('click', async () => {
        const amount = parseInt(document.getElementById('floatAmount').value, 10);
        await api('/cashiers/' + floatCashierId + '/float', { method: 'POST', body: JSON.stringify({ amount }) });
        document.getElementById('floatModal').hidden = true;
        showToast(StaffAuth.formatPesos(amount) + ' agregados al cajero');
        loadCashiers();
        loadStats();
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
        document.querySelector('#txTable tbody').innerHTML = transactions.map((t) => `
            <tr>
                <td>${new Date(t.created_at).toLocaleString('es-MX')}</td>
                <td>${txLabels[t.type] || t.type}</td>
                <td>${t.machine_number ? '#' + t.machine_number : '—'}</td>
                <td>${t.user_name || '—'}</td>
                <td class="gold">${StaffAuth.formatPesos(t.amount)}</td>
            </tr>`).join('');
    }

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            const data = await StaffAuth.login(fd.get('email'), fd.get('password'));
            if (data.user.role !== 'admin') { StaffAuth.logout(); throw new Error('Solo administradores'); }
            showApp();
        } catch (err) {
            document.getElementById('loginError').textContent = err.message;
            document.getElementById('loginError').hidden = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => StaffAuth.logout());

    if (StaffAuth.isLoggedIn() && StaffAuth.getUser()?.role === 'admin') showApp();
})();
