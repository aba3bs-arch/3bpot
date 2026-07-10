(function () {
    'use strict';

    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    const toast = document.getElementById('toast');

    function showToast(msg, err) {
        toast.textContent = msg;
        toast.className = 'toast' + (err ? ' error' : '');
        toast.hidden = false;
        setTimeout(() => { toast.hidden = true; }, 3500);
    }

    function api(path, opts) { return StaffAuth.request('/api/cajero' + path, opts); }

    async function refresh() {
        const data = await api('/me');
        document.getElementById('cashierName').textContent = data.user.name;
        document.getElementById('cashierBranch').textContent = data.user.branch_name
            ? `Sucursal: ${data.user.branch_name}`
            : 'Sin sucursal asignada';
        document.getElementById('floatBalance').textContent = StaffAuth.formatPesos(data.user.float_balance);

        const sel = document.getElementById('machineSelect');
        sel.innerHTML = data.machines.filter((m) => m.active).map((m) =>
            `<option value="${m.id}">#${m.number} — ${m.branch_name || ''} ${m.name} (${StaffAuth.formatPesos(m.balance)})</option>`
        ).join('');

        document.getElementById('salesList').innerHTML = data.recentSales.length
            ? data.recentSales.map((s) => `
                <div class="sale-item">
                    <span>#${s.machine_number}</span>
                    <span class="gold">${StaffAuth.formatPesos(s.amount)}</span>
                    <span class="time">${new Date(s.created_at).toLocaleString('es-MX')}</span>
                </div>`).join('')
            : '<p class="empty">Sin ventas aún</p>';
    }

    function showApp() {
        loginScreen.classList.add('is-hidden');
        app.classList.add('is-visible');
        refresh().catch((err) => showToast(err.message, true));
    }

    document.querySelectorAll('[data-amt]').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.getElementById('sellAmount').value = btn.dataset.amt;
        });
    });

    document.getElementById('sellForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('/sell', {
                method: 'POST',
                body: JSON.stringify({
                    machineId: parseInt(document.getElementById('machineSelect').value, 10),
                    amount: parseInt(document.getElementById('sellAmount').value, 10),
                }),
            });
            showToast(data.message);
            document.getElementById('sellAmount').value = '';
            refresh();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('loginError');
        errEl.hidden = true;
        const fd = new FormData(e.target);
        try {
            const data = await StaffAuth.login(fd.get('email'), fd.get('password'));
            if (data.user.role !== 'cashier') {
                StaffAuth.clearSession();
                throw new Error('Esta cuenta no es cajero. Usa el email que creaste en Admin');
            }
            showApp();
        } catch (err) {
            errEl.textContent = err.message || 'No se pudo entrar';
            errEl.hidden = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => StaffAuth.logout());

    if (StaffAuth.isLoggedIn() && StaffAuth.getUser()?.role === 'cashier') showApp();
})();
