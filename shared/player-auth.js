/**
 * Auth para jugadores (portal).
 */
const PlayerAuth = (function () {
    'use strict';

    const TOKEN_KEY = 'winpot_player_token';
    const USER_KEY = 'winpot_player_user';

    function apiBase() {
        if (window.PLAYER_API) return window.PLAYER_API;
        return '';
    }

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
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

    function isLoggedIn() { return !!getToken(); }

    async function request(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        const token = getToken();
        if (token) headers.Authorization = 'Bearer ' + token;
        const res = await fetch(apiBase() + path, { ...options, headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Error de conexión');
        return data;
    }

    async function login(username, password) {
        const data = await request('/api/auth/login-player', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        setSession(data.token, data.user);
        return data;
    }

    function logout() {
        clearSession();
        window.location.href = '/portal/';
    }

    function formatPesos(n) {
        return '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    }

    async function playSpinWheel(bet) {
        return request('/api/play/user/spin-wheel', { method: 'POST', body: JSON.stringify({ bet }) });
    }

    async function playComicSlot(bet) {
        return request('/api/play/user/comic-slot', { method: 'POST', body: JSON.stringify({ bet }) });
    }

    async function playRanchoLazo(bet) {
        return request('/api/play/user/rancho-lazo', { method: 'POST', body: JSON.stringify({ bet }) });
    }

    async function playLagunaAnzuelo(bet) {
        return request('/api/play/user/laguna-anzuelo', { method: 'POST', body: JSON.stringify({ bet }) });
    }

    async function playRascadito(bet) {
        return request('/api/play/user/rascadito', { method: 'POST', body: JSON.stringify({ bet }) });
    }

    return {
        login, logout, request, getUser, isLoggedIn, clearSession, formatPesos,
        playSpinWheel, playComicSlot, playRanchoLazo, playLagunaAnzuelo, playRascadito,
    };
})();
