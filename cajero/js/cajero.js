(function () {
    'use strict';

    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    const toast = document.getElementById('toast');
    let machinesCache = [];

    function showToast(msg, err, ms) {
        toast.textContent = msg;
        toast.className = 'toast' + (err ? ' error' : '');
        toast.hidden = false;
        setTimeout(() => { toast.hidden = true; }, ms || 3500);
    }

    function api(path, opts) { return StaffAuth.request('/api/cajero' + path, opts); }

    function machineUrl(number) {
        return location.origin + '/inicio/?branch=' + encodeURIComponent(window.__branchId) +
            '&m=' + encodeURIComponent(number);
    }

    async function copyText(text, okMsg) {
        try {
            await navigator.clipboard.writeText(text);
            showToast(okMsg || 'Enlace copiado');
        } catch {
            showToast(text, false, 8000);
        }
    }

    document.querySelectorAll('.tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.panel').forEach((p) => { p.hidden = true; });
            document.getElementById('panel-' + btn.dataset.tab).hidden = false;
        });
    });

    async function refresh() {
        const data = await api('/me');
        document.getElementById('branchName').textContent = data.branch.name;
        document.getElementById('branchIdLabel').textContent = 'ID: ' + data.branch.id;
        document.getElementById('floatBalance').textContent = StaffAuth.formatPesos(data.branch.float_balance);
        window.__branchId = data.branch.id;
        const warn = document.getElementById('floatWarn');
        if (warn) {
            if ((data.branch.float_balance || 0) <= 0) {
                warn.hidden = false;
                warn.textContent = 'Sin saldo de casa: al cargar se registra venta en efectivo.';
            } else {
                warn.hidden = true;
            }
        }

        machinesCache = data.machines || [];
        document.getElementById('machineSelect').innerHTML = machinesCache.filter((m) => m.active).map((m) =>
            `<option value="${m.id}" data-num="${m.number}">#${m.number} — ${m.name} (${StaffAuth.formatPesos(m.balance)})</option>`
        ).join('') || '<option value="">Sin máquinas</option>';

        document.getElementById('machinesList').innerHTML = machinesCache.length
            ? machinesCache.map((m) => `
                <div class="sale-item">
                    <span><strong>#${m.number}</strong> ${m.name}</span>
                    <span class="gold">${StaffAuth.formatPesos(m.balance)}</span>
                    <button type="button" class="btn-logout" data-copy-m="${m.number}" style="border-color:var(--gold);color:var(--gold)">Copiar enlace</button>
                    <button type="button" class="btn-logout" data-toggle="${m.id}" data-active="${m.active ? 0 : 1}">${m.active ? 'Desactivar' : 'Activar'}</button>
                    <button type="button" class="btn-logout" data-del-m="${m.id}">Eliminar</button>
                </div>`).join('')
            : '<p class="empty">Sin máquinas — créalas arriba</p>';

        document.querySelectorAll('[data-copy-m]').forEach((btn) => {
            btn.addEventListener('click', () => copyText(machineUrl(btn.dataset.copyM), 'Enlace máquina #' + btn.dataset.copyM + ' copiado'));
        });
        document.querySelectorAll('[data-toggle]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await api('/machines/' + btn.dataset.toggle, {
                        method: 'PATCH',
                        body: JSON.stringify({ active: Number(btn.dataset.active) }),
                    });
                    showToast('Máquina actualizada');
                    refresh();
                } catch (err) { showToast(err.message, true); }
            });
        });
        document.querySelectorAll('[data-del-m]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!confirm('¿Eliminar máquina?')) return;
                try {
                    await api('/machines/' + btn.dataset.delM, { method: 'DELETE' });
                    showToast('Máquina eliminada');
                    refresh();
                } catch (err) { showToast(err.message, true); }
            });
        });

        document.getElementById('salesList').innerHTML = data.recentSales.length
            ? data.recentSales.map((s) => `
                <div class="sale-item">
                    <span>#${s.machine_number || '—'}</span>
                    <span class="gold">${StaffAuth.formatPesos(s.amount)}</span>
                    <span class="time">${new Date(s.created_at).toLocaleString('es-MX')}</span>
                </div>`).join('')
            : '<p class="empty">Sin recargas aún</p>';

        loadPlayers();
    }

    async function loadPlayers() {
        const box = document.getElementById('playersList');
        if (!box) return;
        try {
            const { players } = await api('/players');
            box.innerHTML = players.length
                ? players.map((p) => `
                    <div class="sale-item">
                        <span><strong>${p.name}</strong> · ${p.username}</span>
                        <span class="gold">${StaffAuth.formatPesos(p.game_balance)}</span>
                        <button type="button" class="btn-logout" data-credit-p="${p.id}" style="border-color:var(--gold);color:var(--gold)">Acreditar</button>
                    </div>`).join('')
                : '<p class="empty">Sin jugadores aún</p>';
            box.querySelectorAll('[data-credit-p]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const amt = prompt('Monto a acreditar:', '50');
                    if (!amt) return;
                    try {
                        await api('/players/' + btn.dataset.creditP + '/credit', {
                            method: 'POST',
                            body: JSON.stringify({ amount: parseInt(amt, 10) }),
                        });
                        showToast('Crédito agregado');
                        refresh();
                    } catch (err) { showToast(err.message, true); }
                });
            });
        } catch (err) {
            box.innerHTML = '<p class="empty">' + err.message + '</p>';
        }
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
                refresh();
            } catch (err) { showToast(err.message, true); }
        });
    }

    function showApp() {
        loginScreen.classList.add('is-hidden');
        app.classList.add('is-visible');
        refresh().catch((err) => {
            showToast(err.message, true);
            if (/token|sesión|autoriz|401|403/i.test(err.message)) {
                StaffAuth.clearSession();
                loginScreen.classList.remove('is-hidden');
                app.classList.remove('is-visible');
            }
        });
    }

    document.querySelectorAll('[data-amt]').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.getElementById('sellAmount').value = btn.dataset.amt;
        });
    });

    document.getElementById('sellForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const sel = document.getElementById('machineSelect');
        const opt = sel.selectedOptions[0];
        const machineNum = opt && opt.dataset.num ? parseInt(opt.dataset.num, 10) : null;
        try {
            const data = await api('/sell', {
                method: 'POST',
                body: JSON.stringify({
                    machineId: parseInt(sel.value, 10),
                    amount: parseInt(document.getElementById('sellAmount').value, 10),
                }),
            });
            const num = data.machine?.number || machineNum;
            const url = machineUrl(num);
            const box = document.getElementById('lastLinkBox');
            box.hidden = false;
            box.innerHTML = `Crédito en <strong>máquina #${num}</strong>. Enlace del jugador:<br><code>${url}</code>
                <button type="button" class="btn-sell" id="copyLastLink" style="margin-top:10px">Copiar enlace de esta máquina</button>`;
            document.getElementById('copyLastLink').addEventListener('click', () => copyText(url, 'Enlace máquina #' + num + ' copiado'));
            await copyText(url, data.message + ' · Enlace copiado');
            document.getElementById('sellAmount').value = '';
            refresh();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('createMachineForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('/machines', {
                method: 'POST',
                body: JSON.stringify({
                    number: parseInt(document.getElementById('newMachineNum').value, 10),
                    name: document.getElementById('newMachineName').value || undefined,
                }),
            });
            showToast(data.message);
            e.target.reset();
            refresh();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('loginError');
        errEl.hidden = true;
        const fd = new FormData(e.target);
        try {
            const data = await StaffAuth.loginBranch(fd.get('branch_id'), fd.get('password'));
            if ((data.user && data.user.role === 'branch') || (data.branch && data.branch.role === 'branch')) {
                showApp();
            } else {
                StaffAuth.clearSession();
                throw new Error('Esta cuenta no es una sucursal');
            }
        } catch (err) {
            errEl.textContent = err.message || 'No se pudo entrar';
            errEl.hidden = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => StaffAuth.logout());

    const copyBtn = document.getElementById('copyTerminalBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const sel = document.getElementById('machineSelect');
            const opt = sel && sel.selectedOptions[0];
            if (!window.__branchId || !opt || !opt.dataset.num) {
                showToast('Selecciona una máquina primero', true);
                return;
            }
            copyText(machineUrl(opt.dataset.num), 'Enlace máquina #' + opt.dataset.num + ' copiado');
        });
    }

    if (StaffAuth.isLoggedIn() && StaffAuth.getUser()?.role === 'branch') showApp();
})();
