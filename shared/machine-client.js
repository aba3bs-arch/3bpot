/**
 * Cliente para máquinas arcade — sin login, solo número de máquina.
 */
const MachineAPI = (function () {
    'use strict';

    const KEY = 'winpot_machine';

    function apiBase() {
        if (window.MACHINE_API) return window.MACHINE_API;
        return '';
    }

    function getMachineNumber() {
        const params = new URLSearchParams(location.search);
        const fromUrl = params.get('m') || params.get('machine');
        if (fromUrl) {
            localStorage.setItem(KEY, fromUrl);
            return parseInt(fromUrl, 10);
        }
        const stored = localStorage.getItem(KEY);
        return stored ? parseInt(stored, 10) : null;
    }

    function setMachineNumber(num) {
        localStorage.setItem(KEY, String(num));
    }

    async function request(path, options = {}) {
        const res = await fetch(apiBase() + path, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Error de servidor');
        return data;
    }

    async function getMachine(number) {
        return request('/api/play/machine/' + number);
    }

    async function spinWheel(bet, machineNumber) {
        return request('/api/play/spin-wheel', {
            method: 'POST',
            body: JSON.stringify({ machineNumber: machineNumber || getMachineNumber(), bet }),
        });
    }

    async function spinSlot(bet, machineNumber) {
        return request('/api/play/comic-slot', {
            method: 'POST',
            body: JSON.stringify({ machineNumber: machineNumber || getMachineNumber(), bet }),
        });
    }

    function formatPesos(n) {
        const sign = n < 0 ? '-' : '';
        return sign + '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    }

    function requireMachine() {
        const num = getMachineNumber();
        if (!num) {
            window.location.href = '/inicio/?redirect=' + encodeURIComponent(location.pathname);
            return null;
        }
        return num;
    }

    return {
        getMachineNumber, setMachineNumber, getMachine,
        spinWheel, spinSlot, formatPesos, requireMachine, apiBase,
    };
})();
