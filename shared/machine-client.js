/**
 * Cliente para máquinas arcade — sucursal + número de máquina.
 */
const MachineAPI = (function () {
    'use strict';

    const KEY = 'winpot_machine';
    const BRANCH_KEY = 'winpot_branch';

    function apiBase() {
        if (window.MACHINE_API) return window.MACHINE_API;
        return '';
    }

    function getBranchId() {
        const params = new URLSearchParams(location.search);
        const fromUrl = params.get('branch') || params.get('branch_id');
        if (fromUrl) {
            localStorage.setItem(BRANCH_KEY, fromUrl);
            return fromUrl;
        }
        return localStorage.getItem(BRANCH_KEY) || null;
    }

    function setBranchId(branchId) {
        localStorage.setItem(BRANCH_KEY, String(branchId));
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

    async function getMachine(number, branchId) {
        const branch = branchId || getBranchId();
        if (!branch) throw new Error('Selecciona una sucursal');
        return request('/api/play/machine/' + number + '?branch=' + encodeURIComponent(branch));
    }

    async function spinWheel(bet, machineNumber, branchId) {
        return request('/api/play/spin-wheel', {
            method: 'POST',
            body: JSON.stringify({
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
                bet,
            }),
        });
    }

    async function spinSlot(bet, machineNumber, branchId) {
        return request('/api/play/comic-slot', {
            method: 'POST',
            body: JSON.stringify({
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
                bet,
            }),
        });
    }

    async function playRanchoLazo(bet, machineNumber, branchId) {
        return request('/api/play/rancho-lazo', {
            method: 'POST',
            body: JSON.stringify({
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
                bet,
            }),
        });
    }

    function formatPesos(n) {
        const sign = n < 0 ? '-' : '';
        return sign + '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    }

    function requireMachine() {
        const num = getMachineNumber();
        const branch = getBranchId();
        if (!num || !branch) {
            window.location.href = '/inicio/?redirect=' + encodeURIComponent(location.pathname);
            return null;
        }
        return num;
    }

    return {
        getMachineNumber, setMachineNumber, getBranchId, setBranchId, getMachine,
        spinWheel, spinSlot, playRanchoLazo, formatPesos, requireMachine, apiBase,
    };
})();
