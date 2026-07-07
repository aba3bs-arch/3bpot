/**
 * Auth para admin y cajeros.
 */
const StaffAuth = (function () {
    'use strict';

    const TOKEN_KEY = 'winpot_staff_token';
    const USER_KEY = 'winpot_staff_user';

    function apiBase() {
        if (window.MACHINE_API) return window.MACHINE_API;
        const host = location.hostname;
        if (!location.port || location.port === '3000' || host.endsWith('.netlify.app')) return '';
        return 'http://localhost:3000';
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
        if (!res.ok) throw new Error(data.error || 'Error');
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
        window.location.href = '/inicio/';
    }

    function formatPesos(n) {
        return '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    }

    return { login, logout, request, getUser, isLoggedIn, formatPesos };
})();
