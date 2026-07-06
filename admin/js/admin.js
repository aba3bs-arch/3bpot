(function () {
    'use strict';

    const loginWrap = document.getElementById('loginWrap');
    const panel = document.getElementById('panel');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const adminName = document.getElementById('adminName');
    const viewTitle = document.getElementById('viewTitle');
    const toast = document.getElementById('toast');
    const creditModal = document.getElementById('creditModal');
    let selectedUserId = null;

    async function adminRequest(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        const token = WinPot.getToken();
        if (token) headers.Authorization = 'Bearer ' + token;

        const res = await fetch(path, { ...options, headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Error');
        return data;
    }

    function showToast(msg, err) {
        toast.textContent = msg;
        toast.className = 'toast' + (err ? ' error' : '');
        toast.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toast.hidden = true; }, 3000);
    }

    function showPanel() {
        loginWrap.hidden = true;
        panel.hidden = false;
        document.getElementById('app').classList.add('panel-active');
        const user = WinPot.getUser();
        adminName.textContent = user ? user.name : '';
        if (user && user.role !== 'admin') {
            showToast('Acceso denegado', true);
            WinPot.logout();
            return;
        }
        loadDashboard();
    }

    function switchView(view) {
        document.querySelectorAll('.nav-btn').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.view === view);
        });
        document.querySelectorAll('.view').forEach((v) => {
            v.hidden = v.id !== 'view-' + view;
        });
        const titles = { dashboard: 'Dashboard', users: 'Usuarios', transactions: 'Transacciones' };
        viewTitle.textContent = titles[view] || view;

        if (view === 'dashboard') loadDashboard();
        if (view === 'users') loadUsers();
        if (view === 'transactions') loadTransactions();
    }

    async function loadDashboard() {
        try {
            const { stats } = await adminRequest('/api/admin/stats');
            document.getElementById('statsGrid').innerHTML = `
                <div class="stat-card"><span class="stat-card__label">Usuarios</span><span class="stat-card__value">${stats.users}</span></div>
                <div class="stat-card"><span class="stat-card__label">WC en circulación</span><span class="stat-card__value">${stats.totalBalance.toLocaleString()}</span></div>
                <div class="stat-card"><span class="stat-card__label">Rondas hoy</span><span class="stat-card__value">${stats.roundsToday}</span></div>
                <div class="stat-card"><span class="stat-card__label">Apuestas hoy</span><span class="stat-card__value">${stats.betsToday.toLocaleString()} WC</span></div>
                <div class="stat-card"><span class="stat-card__label">Premios hoy</span><span class="stat-card__value">${stats.payoutsToday.toLocaleString()} WC</span></div>
                <div class="stat-card"><span class="stat-card__label">Casa hoy</span><span class="stat-card__value ${stats.houseProfitToday >= 0 ? 'pos' : 'neg'}">${stats.houseProfitToday.toLocaleString()} WC</span></div>
                <div class="stat-card"><span class="stat-card__label">Rondas totales</span><span class="stat-card__value">${stats.roundsTotal.toLocaleString()}</span></div>
            `;
        } catch (err) {
            showToast(err.message, true);
        }
    }

    async function loadUsers(q) {
        try {
            const url = q ? '/api/admin/users?q=' + encodeURIComponent(q) : '/api/admin/users';
            const { users } = await adminRequest(url);
            const tbody = document.querySelector('#usersTable tbody');
            tbody.innerHTML = users.map((u) => `
                <tr>
                    <td>${u.id}</td>
                    <td><strong>${u.name}</strong><br><small style="color:var(--muted)">${u.email}</small></td>
                    <td>${(u.balance || 0).toLocaleString()} WC</td>
                    <td><span class="badge ${u.active ? 'badge--ok' : 'badge--off'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                        <button type="button" class="btn-sm" data-action="credit" data-id="${u.id}" data-name="${u.name}" data-email="${u.email}">± WC</button>
                        <button type="button" class="btn-sm" data-action="toggle" data-id="${u.id}" data-active="${u.active}">${u.active ? 'Desactivar' : 'Activar'}</button>
                    </td>
                </tr>
            `).join('');

            tbody.querySelectorAll('[data-action="credit"]').forEach((btn) => {
                btn.addEventListener('click', () => openCreditModal(btn.dataset));
            });
            tbody.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const active = btn.dataset.active === '1' || btn.dataset.active === 'true';
                    try {
                        await adminRequest('/api/admin/users/' + btn.dataset.id + '/status', {
                            method: 'PATCH',
                            body: JSON.stringify({ active: !active }),
                        });
                        showToast(active ? 'Usuario desactivado' : 'Usuario activado');
                        loadUsers(document.getElementById('userSearch').value);
                    } catch (err) {
                        showToast(err.message, true);
                    }
                });
            });
        } catch (err) {
            showToast(err.message, true);
        }
    }

    async function loadTransactions() {
        try {
            const { transactions } = await adminRequest('/api/admin/transactions?limit=100');
            const typeLabels = {
                purchase: 'Compra', admin_credit: 'Recarga', admin_debit: 'Débito',
                bet: 'Apuesta', win: 'Premio', bonus: 'Bono',
            };
            document.querySelector('#txTable tbody').innerHTML = transactions.map((tx) => `
                <tr>
                    <td>${new Date(tx.created_at + 'Z').toLocaleString('es-MX')}</td>
                    <td>${tx.name}<br><small style="color:var(--muted)">${tx.email}</small></td>
                    <td>${typeLabels[tx.type] || tx.type}${tx.game ? ' · ' + tx.game : ''}</td>
                    <td style="color:${tx.amount >= 0 ? 'var(--green)' : 'var(--red)'}">${tx.amount >= 0 ? '+' : ''}${tx.amount}</td>
                    <td>${tx.balance_after}</td>
                    <td>${tx.note || '—'}</td>
                </tr>
            `).join('');
        } catch (err) {
            showToast(err.message, true);
        }
    }

    function openCreditModal(data) {
        selectedUserId = data.id;
        document.getElementById('creditModalUser').textContent = data.name + ' (' + data.email + ')';
        document.getElementById('creditAmount').value = 500;
        document.getElementById('creditNote').value = '';
        creditModal.hidden = false;
    }

    document.getElementById('creditCancel').addEventListener('click', () => {
        creditModal.hidden = true;
        selectedUserId = null;
    });

    document.getElementById('creditConfirm').addEventListener('click', async () => {
        const amount = parseInt(document.getElementById('creditAmount').value, 10);
        const note = document.getElementById('creditNote').value || 'Recarga administrativa';
        try {
            const data = await adminRequest('/api/admin/users/' + selectedUserId + '/credit', {
                method: 'POST',
                body: JSON.stringify({ amount, note }),
            });
            showToast(data.message);
            creditModal.hidden = true;
            loadUsers();
            loadDashboard();
        } catch (err) {
            showToast(err.message, true);
        }
    });

    document.getElementById('debitConfirm').addEventListener('click', async () => {
        const amount = parseInt(document.getElementById('creditAmount').value, 10);
        const note = document.getElementById('creditNote').value || 'Ajuste administrativo';
        try {
            const data = await adminRequest('/api/admin/users/' + selectedUserId + '/debit', {
                method: 'POST',
                body: JSON.stringify({ amount, note }),
            });
            showToast(data.message);
            creditModal.hidden = true;
            loadUsers();
            loadDashboard();
        } catch (err) {
            showToast(err.message, true);
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.hidden = true;
        const fd = new FormData(loginForm);
        try {
            await WinPot.login(fd.get('email'), fd.get('password'));
            const user = WinPot.getUser();
            if (user.role !== 'admin') {
                WinPot.clearSession();
                throw new Error('Solo administradores pueden acceder');
            }
            showPanel();
        } catch (err) {
            loginError.textContent = err.message;
            loginError.hidden = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => WinPot.logout());
    document.getElementById('searchBtn').addEventListener('click', () => {
        loadUsers(document.getElementById('userSearch').value);
    });
    document.getElementById('userSearch').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadUsers(e.target.value);
    });

    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    if (WinPot.isLoggedIn()) {
        const user = WinPot.getUser();
        if (user && user.role === 'admin') showPanel();
    }
})();
