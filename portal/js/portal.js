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

    async function refresh() {
        const data = await PlayerAuth.request('/api/auth/me');
        document.getElementById('playerName').textContent = data.user.name || data.user.username;
        document.getElementById('playerBalance').textContent = PlayerAuth.formatPesos(data.user.game_balance || 0);
    }

    function showApp() {
        loginScreen.style.display = 'none';
        app.hidden = false;
        refresh().catch((err) => showToast(err.message, true));
    }

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('loginError');
        errEl.hidden = true;
        const fd = new FormData(e.target);
        try {
            await PlayerAuth.login(fd.get('username'), fd.get('password'));
            const params = new URLSearchParams(location.search);
            const redirect = params.get('redirect');
            if (redirect) {
                window.location.href = redirect;
                return;
            }
            showApp();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => PlayerAuth.logout());

    if (PlayerAuth.isLoggedIn()) showApp();
})();
