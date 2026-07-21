/**
 * Cliente para máquinas arcade — un portal por sucursal (?branch=), número de máquina local.
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

    function inicioUrl() {
        const branch = getBranchId();
        const num = getMachineNumber();
        if (!branch) return '/inicio/';
        let url = '/inicio/?branch=' + encodeURIComponent(branch);
        if (num) url += '&m=' + encodeURIComponent(num);
        return url;
    }

    function machinePortalUrl(branchId, machineNumber) {
        const branch = branchId || getBranchId();
        const num = machineNumber || getMachineNumber();
        if (!branch || !num) return inicioUrl();
        return '/inicio/?branch=' + encodeURIComponent(branch) + '&m=' + encodeURIComponent(num);
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

    async function getPortal(branchId) {
        const branch = branchId || getBranchId();
        if (!branch) throw new Error('Enlace de sucursal requerido');
        return request('/api/play/portal?branch=' + encodeURIComponent(branch));
    }

    async function getMachine(number, branchId) {
        const branch = branchId || getBranchId();
        if (!branch) throw new Error('Enlace de sucursal requerido');
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

    async function playLagunaAnzuelo(bet, machineNumber, branchId) {
        return request('/api/play/laguna-anzuelo', {
            method: 'POST',
            body: JSON.stringify({
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
                bet,
            }),
        });
    }

    async function playRascadito(bet, machineNumber, branchId) {
        return request('/api/play/rascadito', {
            method: 'POST',
            body: JSON.stringify({
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
                bet,
            }),
        });
    }

    async function getScratchPool(branchId) {
        const id = branchId || getBranchId();
        return request('/api/play/rascadito/pool?branch=' + encodeURIComponent(id));
    }

    async function startDesenredaCable(bet, machineNumber, branchId) {
        return request('/api/play/desenreda-cable/start', {
            method: 'POST',
            body: JSON.stringify({
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
                bet,
            }),
        });
    }

    async function pullDesenredaCable(sessionId, end, machineNumber, branchId) {
        return request('/api/play/desenreda-cable/pull', {
            method: 'POST',
            body: JSON.stringify({
                sessionId,
                end,
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
            }),
        });
    }

    async function playLoteria(bet, machineNumber, branchId) {
        return request('/api/play/loteria', {
            method: 'POST',
            body: JSON.stringify({
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
                bet,
            }),
        });
    }

    async function startRompecabezas(bet, restart, machineNumber, branchId) {
        return request('/api/play/rompecabezas/start', {
            method: 'POST',
            body: JSON.stringify({
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
                bet,
                restart: !!restart,
            }),
        });
    }

    async function moveRompecabezas(sessionId, tileIndex, machineNumber, branchId) {
        return request('/api/play/rompecabezas/move', {
            method: 'POST',
            body: JSON.stringify({
                sessionId,
                tileIndex,
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
            }),
        });
    }

    async function retryRompecabezas(sessionId, machineNumber, branchId) {
        return request('/api/play/rompecabezas/retry', {
            method: 'POST',
            body: JSON.stringify({
                sessionId,
                machineNumber: machineNumber || getMachineNumber(),
                branch_id: branchId || getBranchId(),
            }),
        });
    }

    function clearBinding() {
        localStorage.removeItem(KEY);
        localStorage.removeItem(BRANCH_KEY);
    }

    function isLinked() {
        return !!(getBranchId() && getMachineNumber());
    }

    function bindTerminal(branchId, machineNumber) {
        setBranchId(branchId);
        setMachineNumber(machineNumber);
    }

    async function loginBranch(branchId, password) {
        return request('/api/auth/login-branch', {
            method: 'POST',
            body: JSON.stringify({
                branch_id: String(branchId || '').trim().toLowerCase(),
                password,
            }),
        });
    }

    async function listMachines(branchId) {
        const branch = branchId || getBranchId();
        if (!branch) throw new Error('Sucursal requerida');
        return request('/api/play/machines?branch=' + encodeURIComponent(branch));
    }

    function formatPesos(n) {
        const sign = n < 0 ? '-' : '';
        return sign + '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    }

    function requireMachine() {
        const num = getMachineNumber();
        const branch = getBranchId();
        if (!branch) {
            window.location.href = '/inicio/';
            return null;
        }
        if (!num) {
            window.location.href = inicioUrl();
            return null;
        }
        return num;
    }

    function wireInicioLinks() {
        document.querySelectorAll('[data-inicio-link]').forEach((el) => {
            el.href = inicioUrl();
        });
    }

    return {
        getMachineNumber, setMachineNumber, getBranchId, setBranchId, inicioUrl, machinePortalUrl,
        clearBinding, isLinked, bindTerminal, loginBranch, listMachines,
        getPortal, getMachine, spinWheel, spinSlot, playRanchoLazo, playLagunaAnzuelo, playRascadito, getScratchPool,
        startDesenredaCable, pullDesenredaCable, playLoteria,
        startRompecabezas, moveRompecabezas, retryRompecabezas,
        formatPesos, requireMachine, wireInicioLinks, apiBase,
    };
})();
