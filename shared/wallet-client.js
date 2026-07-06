/**
 * WinPot Wallet Client — SDK compartido para juegos y portal
 */
const WinPot = (function () {
    'use strict';

    const TOKEN_KEY = 'winpot_token';
    const USER_KEY = 'winpot_user';

    function apiBase() {
        if (window.WINPOT_API) return window.WINPOT_API;
        const host = location.hostname;
        const sameOrigin = !location.port || location.port === '3000' ||
            host.endsWith('.netlify.app') || host.endsWith('.netlify.live');
        if (sameOrigin || location.pathname.startsWith('/portal') ||
            location.pathname.startsWith('/spin-game') || location.pathname.startsWith('/comic-slot') ||
            location.pathname.startsWith('/admin')) {
            return '';
        }
        return 'http://localhost:3000';
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    }

    function setSession(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function isLoggedIn() {
        return !!getToken();
    }

    async function request(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        const token = getToken();
        if (token) headers.Authorization = 'Bearer ' + token;

        const res = await fetch(apiBase() + path, { ...options, headers });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const err = new Error(data.error || 'Error de servidor');
            err.status = res.status;
            throw err;
        }
        return data;
    }

    async function register(email, password, name) {
        const data = await request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
        });
        setSession(data.token, data.user);
        return data;
    }

    async function login(email, password) {
        const data = await request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        setSession(data.token, data.user);
        return data;
    }

    function logout() {
        clearSession();
        window.location.href = '/portal/';
    }

    function requireAuth() {
        if (!isLoggedIn()) {
            window.location.href = '/portal/?redirect=' + encodeURIComponent(location.pathname);
            return false;
        }
        return true;
    }

    async function getBalance() {
        return request('/api/wallet/balance');
    }

    async function getTransactions(limit = 50) {
        return request('/api/wallet/transactions?limit=' + limit);
    }

    async function getPackages() {
        return request('/api/wallet/packages');
    }

    async function purchasePackage(packageId) {
        return request('/api/wallet/purchase/' + packageId, { method: 'POST' });
    }

    async function spinWheel(bet) {
        return request('/api/games/spin-wheel', {
            method: 'POST',
            body: JSON.stringify({ bet }),
        });
    }

    async function spinComicSlot(bet) {
        return request('/api/games/comic-slot', {
            method: 'POST',
            body: JSON.stringify({ bet }),
        });
    }

    function formatCoins(n) {
        const sign = n < 0 ? '-' : '';
        return sign + Math.abs(n).toLocaleString('es-MX') + ' WC';
    }

    return {
        apiBase,
        getToken,
        getUser,
        setSession,
        clearSession,
        isLoggedIn,
        register,
        login,
        logout,
        requireAuth,
        getBalance,
        getTransactions,
        getPackages,
        purchasePackage,
        spinWheel,
        spinComicSlot,
        formatCoins,
    };
})();

if (typeof module !== 'undefined') module.exports = WinPot;
