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
    let packagesCache = [];

    const typeLabels = {
        purchase: 'Compra online',
        cash_sale: 'Venta efectivo',
        admin_credit: 'Recarga admin',
        admin_debit: 'Débito',
        bet: 'Apuesta',
        win: 'Premio',
        bonus: 'Bono',
    };

    function formatMoney(cents) {
        return '$' + (cents / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

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
        showToast._t = setTimeout(() => { toast.hidden = true; }, 3500);
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
        const titles = {
            dashboard: 'Dashboard',
            sell: 'Vender WinCoins',
            packages: 'Paquetes de venta',
            users: 'Usuarios',
            transactions: 'Transacciones',
        };
        viewTitle.textContent = titles[view] || view;

        if (view === 'dashboard') loadDashboard();
        if (view === 'sell') loadSellView();
        if (view === 'packages') loadPackagesAdmin();
        if (view === 'users') loadUsers();
        if (view === 'transactions') loadTransactions();
    }

    async function loadDashboard() {
        try {
            const { stats } = await adminRequest('/api/admin/stats');
            document.getElementById('statsGrid').innerHTML = `
                <div class="stat-card stat-card--gold"><span class="stat-card__label">Ventas efectivo hoy</span><span class="stat-card__value">${formatMoney(stats.cashRevenueToday)}</span></div>
                <div class="stat-card stat-card--gold"><span class="stat-card__label">WC vendidos hoy</span><span class="stat-card__value">${stats.wcSoldToday.toLocaleString()} WC</span></div>
                <div class="stat-card"><span class="stat-card__label">Ventas efectivo total</span><span class="stat-card__value">${formatMoney(stats.totalCashRevenue)}</span></div>
                <div class="stat-card"><span class="stat-card__label">WC emitidos (ventas)</span><span class="stat-card__value">${stats.totalWcSold.toLocaleString()} WC</span></div>
                <div class="stat-card"><span class="stat-card__label">WC en circulación</span><span class="stat-card__value">${stats.totalBalance.toLocaleString()} WC</span></div>
                <div class="stat-card"><span class="stat-card__label">Clientes</span><span class="stat-card__value">${stats.users}</span></div>
                <div class="stat-card"><span class="stat-card__label">Casa hoy (juegos)</span><span class="stat-card__value ${stats.houseProfitToday >= 0 ? 'pos' : 'neg'}">${stats.houseProfitToday.toLocaleString()} WC</span></div>
                <div class="stat-card"><span class="stat-card__label">Rondas hoy</span><span class="stat-card__value">${stats.roundsToday}</span></div>
            `;
        } catch (err) {
            showToast(err.message, true);
        }
    }

    async function loadUsersForSelect() {
        const { users } = await adminRequest('/api/admin/users');
        const select = document.getElementById('sellUserId');
        const current = select.value;
        select.innerHTML = '<option value="">— Selecciona cliente —</option>' +
            users.filter((u) => u.role !== 'admin').map((u) =>
                `<option value="${u.id}">${u.name} (${u.email}) · ${u.balance} WC</option>`
            ).join('');
        if (current) select.value = current;
        return users;
    }

    async function loadPackagesForSelect() {
        const { packages } = await adminRequest('/api/admin/packages');
        packagesCache = packages;
        const select = document.getElementById('sellPackage');
        select.innerHTML = '<option value="">— Personalizado —</option>' +
            packages.filter((p) => p.active).map((p) =>
                `<option value="${p.id}">${p.name} — ${p.coins} WC · ${formatMoney(p.price_cents)}</option>`
            ).join('');
        return packages;
    }

    function applyPackageToForm() {
        const pkgId = document.getElementById('sellPackage').value;
        if (!pkgId) return;
        const pkg = packagesCache.find((p) => String(p.id) === pkgId);
        if (!pkg) return;
        document.getElementById('sellCoins').value = pkg.coins;
        document.getElementById('sellCash').value = (pkg.price_cents / 100).toFixed(2);
    }

    async function loadSellView() {
        try {
            await Promise.all([loadUsersForSelect(), loadPackagesForSelect()]);
            const { sales } = await adminRequest('/api/admin/cash-sales?limit=20');
            const tbody = document.querySelector('#salesTable tbody');
            if (sales.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">Sin ventas registradas</td></tr>';
            } else {
                tbody.innerHTML = sales.map((s) => `
                    <tr>
                        <td>${new Date(s.created_at).toLocaleString('es-MX')}</td>
                        <td><strong>${s.name}</strong><br><small style="color:var(--muted)">${s.email}</small></td>
                        <td style="color:var(--green)">+${s.coins} WC</td>
                        <td style="color:var(--gold)">${formatMoney(s.cash_cents || 0)}</td>
                        <td>${s.payment_method || 'efectivo'}</td>
                    </tr>
                `).join('');
            }
        } catch (err) {
            showToast(err.message, true);
        }
    }

    async function loadPackagesAdmin() {
        try {
            const { packages } = await adminRequest('/api/admin/packages');
            packagesCache = packages;
            document.getElementById('packagesAdmin').innerHTML = packages.map((p) => `
                <div class="pkg-admin-card" data-id="${p.id}">
                    <label>Nombre<input type="text" class="pkg-name" value="${p.name}"></label>
                    <label>WinCoins<input type="number" class="pkg-coins" min="1" value="${p.coins}"></label>
                    <label>Precio ($ MXN)<input type="number" class="pkg-price" min="0" step="0.01" value="${(p.price_cents / 100).toFixed(2)}"></label>
                    <label class="pkg-active-label"><input type="checkbox" class="pkg-active" ${p.active ? 'checked' : ''}> Activo</label>
                    <button type="button" class="btn btn-sm-save">Guardar</button>
                </div>
            `).join('');

            document.querySelectorAll('.pkg-admin-card').forEach((card) => {
                card.querySelector('.btn-sm-save').addEventListener('click', async () => {
                    const id = card.dataset.id;
                    const priceVal = parseFloat(card.querySelector('.pkg-price').value);
                    try {
                        await adminRequest('/api/admin/packages/' + id, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                name: card.querySelector('.pkg-name').value,
                                coins: parseInt(card.querySelector('.pkg-coins').value, 10),
                                price_cents: Math.round(priceVal * 100),
                                active: card.querySelector('.pkg-active').checked,
                            }),
                        });
                        showToast('Paquete guardado');
                        loadPackagesForSelect();
                    } catch (err) {
                        showToast(err.message, true);
                    }
                });
            });
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
                        <button type="button" class="btn-sm" data-action="sell" data-id="${u.id}">Vender</button>
                        <button type="button" class="btn-sm" data-action="credit" data-id="${u.id}" data-name="${u.name}" data-email="${u.email}">± WC</button>
                        <button type="button" class="btn-sm" data-action="toggle" data-id="${u.id}" data-active="${u.active}">${u.active ? 'Desactivar' : 'Activar'}</button>
                    </td>
                </tr>
            `).join('');

            tbody.querySelectorAll('[data-action="sell"]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    switchView('sell');
                    document.getElementById('sellUserId').value = btn.dataset.id;
                });
            });
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
            document.querySelector('#txTable tbody').innerHTML = transactions.map((tx) => `
                <tr>
                    <td>${new Date(tx.created_at).toLocaleString('es-MX')}</td>
                    <td>${tx.name}<br><small style="color:var(--muted)">${tx.email}</small></td>
                    <td>${typeLabels[tx.type] || tx.type}${tx.game ? ' · ' + tx.game : ''}</td>
                    <td style="color:${tx.amount >= 0 ? 'var(--green)' : 'var(--red)'}">${tx.amount >= 0 ? '+' : ''}${tx.amount} WC</td>
                    <td style="color:var(--gold)">${tx.cash_cents ? formatMoney(tx.cash_cents) : '—'}</td>
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

    document.getElementById('sellPackage').addEventListener('change', applyPackageToForm);

    document.getElementById('sellForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const cashVal = parseFloat(document.getElementById('sellCash').value);
        const body = {
            userId: parseInt(document.getElementById('sellUserId').value, 10),
            coins: parseInt(document.getElementById('sellCoins').value, 10),
            cashCents: Math.round(cashVal * 100),
            paymentMethod: document.getElementById('sellPayment').value,
            note: document.getElementById('sellNote').value,
        };
        const pkgId = document.getElementById('sellPackage').value;
        if (pkgId) body.packageId = parseInt(pkgId, 10);

        try {
            const data = await adminRequest('/api/admin/sell-coins', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            showToast(data.message);
            document.getElementById('sellNote').value = '';
            loadSellView();
            loadDashboard();
        } catch (err) {
            showToast(err.message, true);
        }
    });

    document.getElementById('createUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await adminRequest('/api/admin/users', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('newUserName').value,
                    email: document.getElementById('newUserEmail').value,
                    password: document.getElementById('newUserPassword').value || undefined,
                }),
            });
            let msg = data.message + ': ' + data.user.email;
            if (data.tempPassword) msg += ' · Contraseña: ' + data.tempPassword;
            showToast(msg);
            document.getElementById('createUserForm').reset();
            await loadUsersForSelect();
            document.getElementById('sellUserId').value = data.user.id;
        } catch (err) {
            showToast(err.message, true);
        }
    });

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
