(function () {
    'use strict';

    const authPanel = document.getElementById('authPanel');
    const dashboard = document.getElementById('dashboard');
    const headerUser = document.getElementById('headerUser');
    const headerBalance = document.getElementById('headerBalance');
    const headerName = document.getElementById('headerName');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authError = document.getElementById('authError');
    const authTabs = document.querySelectorAll('.auth-tab');
    const balanceDisplay = document.getElementById('balanceDisplay');
    const userName = document.getElementById('userName');
    const packagesGrid = document.getElementById('packagesGrid');
    const txList = document.getElementById('txList');
    const adminLink = document.getElementById('adminLink');
    const toast = document.getElementById('toast');

    function showToast(msg, isError) {
        toast.textContent = msg;
        toast.className = 'toast' + (isError ? ' error' : '');
        toast.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toast.hidden = true; }, 3000);
    }

    function showError(msg) {
        authError.textContent = msg;
        authError.hidden = !msg;
    }

    function switchTab(tab) {
        authTabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
        loginForm.hidden = tab !== 'login';
        registerForm.hidden = tab !== 'register';
        showError('');
    }

    authTabs.forEach((tab) => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    async function loadDashboard() {
        const user = WinPot.getUser();
        if (!user) return;

        authPanel.hidden = true;
        dashboard.hidden = false;
        headerUser.hidden = false;
        userName.textContent = user.name;
        headerName.textContent = user.name;

        if (user.role === 'admin') adminLink.hidden = false;

        try {
            const { balance } = await WinPot.getBalance();
            balanceDisplay.textContent = WinPot.formatCoins(balance);
            headerBalance.textContent = WinPot.formatCoins(balance);
        } catch {
            showToast('Error al cargar saldo', true);
        }

        try {
            const { packages } = await WinPot.getPackages();
            packagesGrid.innerHTML = packages.map((pkg) => `
                <div class="pkg-card">
                    <div class="pkg-card__name">${pkg.name}</div>
                    <div class="pkg-card__coins">${pkg.coins.toLocaleString()} WC</div>
                    <div class="pkg-card__price">$${(pkg.price_cents / 100).toFixed(2)} MXN (demo)</div>
                    <button type="button" data-id="${pkg.id}">Comprar</button>
                </div>
            `).join('');

            packagesGrid.querySelectorAll('button').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    try {
                        const data = await WinPot.purchasePackage(btn.dataset.id);
                        showToast(data.message);
                        loadDashboard();
                    } catch (err) {
                        showToast(err.message, true);
                    }
                });
            });
        } catch { /* packages optional */ }

        try {
            const { transactions } = await WinPot.getTransactions(15);
            if (transactions.length === 0) {
                txList.innerHTML = '<li class="tx-list__empty">Sin movimientos</li>';
            } else {
                const typeLabels = {
                    purchase: 'Compra',
                    admin_credit: 'Recarga admin',
                    admin_debit: 'Ajuste admin',
                    bet: 'Apuesta',
                    win: 'Premio',
                    bonus: 'Bono',
                };
                txList.innerHTML = transactions.map((tx) => `
                    <li>
                        <div>
                            <div>${typeLabels[tx.type] || tx.type}${tx.game ? ' · ' + tx.game : ''}</div>
                            <div class="tx-type">${new Date(tx.created_at + 'Z').toLocaleString('es-MX')}</div>
                        </div>
                        <span class="tx-amount ${tx.amount >= 0 ? 'pos' : 'neg'}">
                            ${tx.amount >= 0 ? '+' : ''}${tx.amount} WC
                        </span>
                    </li>
                `).join('');
            }
        } catch { /* ignore */ }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showError('');
        const fd = new FormData(loginForm);
        try {
            await WinPot.login(fd.get('email'), fd.get('password'));
            const redirect = new URLSearchParams(location.search).get('redirect');
            if (redirect) {
                window.location.href = redirect;
            } else {
                loadDashboard();
            }
        } catch (err) {
            showError(err.message);
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showError('');
        const fd = new FormData(registerForm);
        try {
            const data = await WinPot.register(fd.get('email'), fd.get('password'), fd.get('name'));
            showToast(data.message);
            loadDashboard();
        } catch (err) {
            showError(err.message);
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => WinPot.logout());
    document.getElementById('refreshBalance').addEventListener('click', loadDashboard);

    if (WinPot.isLoggedIn()) {
        loadDashboard();
    } else {
        switchTab('login');
    }
})();
