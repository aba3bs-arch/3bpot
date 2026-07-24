(function () {
    'use strict';

    const isPlayerMode = new URLSearchParams(location.search).has('player');

    const MIN_BET = 5;
    const MAX_BET = 500;
    const BET_STEP = 5;
    const ROWS = 3;
    const COLS = 3;
    const CELL_H_FALLBACK = 110;

    const SYMBOLS = [
        { id: 'cherry', emoji: '🍒', name: 'Cereza', mult: 2, weight: 24 },
        { id: 'lemon', emoji: '🍋', name: 'Limón', mult: 3, weight: 20 },
        { id: 'orange', emoji: '🍊', name: 'Naranja', mult: 4, weight: 18 },
        { id: 'plum', emoji: '🍇', name: 'Ciruela', mult: 6, weight: 14 },
        { id: 'seven', emoji: '777', name: 'Siete', mult: 15, weight: 8, seven: true },
        { id: 'wild', emoji: '💎', name: 'Cristal', mult: 0, weight: 6, wild: true },
    ];

    const PAYLINES = [
        { name: 'Arriba', cells: [[0, 0], [0, 1], [0, 2]] },
        { name: 'Centro', cells: [[1, 0], [1, 1], [1, 2]] },
        { name: 'Abajo', cells: [[2, 0], [2, 1], [2, 2]] },
        { name: 'Diag \\', cells: [[0, 0], [1, 1], [2, 2]] },
        { name: 'Diag /', cells: [[0, 2], [1, 1], [2, 0]] },
    ];

    const totalWeight = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);

    let balance = 0;
    let machineNumber = null;
    let minBet = MIN_BET;
    let maxBet = MAX_BET;
    let currentBet = 10;
    let lastWin = 0;
    let isSpinning = false;
    let autoPlay = false;
    let turbo = false;
    let autoTimer = null;
    let grid = [];

    const els = {
        spinBtn: document.getElementById('spinBtn'),
        autoBtn: document.getElementById('autoBtn'),
        turboBtn: document.getElementById('turboBtn'),
        turboLabel: document.getElementById('turboLabel'),
        balance: document.getElementById('balance'),
        machineNum: document.getElementById('machineNum'),
        betDisplay: document.getElementById('betDisplay'),
        winDisplay: document.getElementById('winDisplay'),
        betMinus: document.getElementById('betMinus'),
        betPlus: document.getElementById('betPlus'),
        reels: document.getElementById('reels'),
        hint: document.getElementById('hint'),
        toast: document.getElementById('toast'),
        toastMsg: document.getElementById('toastMsg'),
        modal: document.getElementById('modal'),
        modalTitle: document.getElementById('modalTitle'),
        modalAmount: document.getElementById('modalAmount'),
        modalClose: document.getElementById('modalClose'),
        winFlash: document.getElementById('winFlash'),
        backLink: document.getElementById('backLink'),
        plines: [...document.querySelectorAll('.pline')],
        winMeter: document.querySelector('.meter--win'),
    };

    function formatMoney(n) {
        if (isPlayerMode) return PlayerAuth.formatPesos(n);
        return MachineAPI.formatPesos(n);
    }

    function cellSize() {
        const reel = els.reels.querySelector('.reel');
        return reel ? reel.clientHeight / ROWS : CELL_H_FALLBACK;
    }

    function clampBet(val) {
        return Math.max(minBet, Math.min(maxBet, Math.min(val, balance || maxBet)));
    }

    function setBet(val) {
        currentBet = clampBet(val);
        els.betDisplay.textContent = String(currentBet);
    }

    function setWin(amount) {
        lastWin = amount;
        els.winDisplay.textContent = String(amount);
        if (amount > 0) {
            els.winMeter.classList.remove('is-hit');
            void els.winMeter.offsetWidth;
            els.winMeter.classList.add('is-hit');
        }
    }

    function updateBalanceUI() {
        els.balance.textContent = formatMoney(balance);
    }

    function showToast(msg, type) {
        els.toastMsg.textContent = msg;
        els.toast.className = 'toast' + (type ? ' is-' + type : '');
        els.toast.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { els.toast.hidden = true; }, 2800);
    }

    function pickSymbol() {
        let roll = Math.random() * totalWeight;
        for (const sym of SYMBOLS) {
            roll -= sym.weight;
            if (roll <= 0) return sym;
        }
        return SYMBOLS[SYMBOLS.length - 1];
    }

    function generateGrid() {
        const g = [];
        for (let r = 0; r < ROWS; r++) {
            g[r] = [];
            for (let c = 0; c < COLS; c++) g[r][c] = pickSymbol();
        }
        return g;
    }

    function symHtml(sym) {
        if (sym.seven || sym.id === 'seven') {
            return `<span class="sym sym--seven">777</span>`;
        }
        return `<span class="sym">${sym.emoji}</span>`;
    }

    function renderReels(g, animate) {
        const reelEls = els.reels.querySelectorAll('.reel');
        const h = cellSize();

        reelEls.forEach((reelEl, col) => {
            const strip = reelEl.querySelector('.reel__strip');
            const symbols = [g[0][col], g[1][col], g[2][col]];

            if (!animate) {
                strip.innerHTML = symbols.map((s) => `<div class="reel__cell">${symHtml(s)}</div>`).join('');
                strip.style.transition = 'none';
                strip.style.transform = 'translateY(0)';
                reelEl.classList.remove('is-spinning', 'is-win');
                return;
            }

            const blurCount = turbo ? 8 : 16;
            const extra = [];
            for (let i = 0; i < blurCount; i++) extra.push(pickSymbol());
            const all = [...extra, ...symbols];
            strip.innerHTML = all.map((s) => `<div class="reel__cell">${symHtml(s)}</div>`).join('');
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
            reelEl.classList.add('is-spinning');
            reelEl.classList.remove('is-win');
            reelEl.dataset.targetOffset = String((all.length - ROWS) * h);
        });
    }

    function spinReels(g) {
        return new Promise((resolve) => {
            renderReels(g, true);
            const reelEls = els.reels.querySelectorAll('.reel');
            let stopped = 0;
            const baseDelay = turbo ? 120 : 450;
            const stagger = turbo ? 100 : 320;
            const duration = turbo ? 0.28 : 0.55;

            reelEls.forEach((reelEl, col) => {
                const strip = reelEl.querySelector('.reel__strip');
                setTimeout(() => {
                    const target = parseInt(reelEl.dataset.targetOffset, 10);
                    strip.style.transition = `transform ${duration}s cubic-bezier(0.15, 0.85, 0.25, 1)`;
                    strip.style.transform = `translateY(-${target}px)`;
                    reelEl.classList.remove('is-spinning');
                    setTimeout(() => {
                        stopped++;
                        if (stopped === COLS) resolve();
                    }, duration * 1000 + 30);
                }, baseDelay + col * stagger);
            });
        });
    }

    function clearPaylines() {
        els.plines.forEach((el) => el.classList.remove('is-win'));
        els.reels.querySelectorAll('.reel').forEach((r) => r.classList.remove('is-win'));
        els.winFlash.hidden = true;
    }

    function highlightWins(wins) {
        clearPaylines();
        if (!wins || !wins.length) return;

        wins.forEach((w) => {
            const el = els.plines[w.lineIndex];
            if (el) el.classList.add('is-win');
        });
        els.reels.querySelectorAll('.reel').forEach((r) => r.classList.add('is-win'));
        els.winFlash.hidden = false;
        setTimeout(() => { els.winFlash.hidden = true; }, 800);
    }

    function setHint(msg, isWin) {
        els.hint.textContent = msg;
        els.hint.classList.toggle('is-win', !!isWin);
    }

    async function loadBalance() {
        if (isPlayerMode) {
            if (!PlayerAuth.isLoggedIn()) {
                window.location.href = '/portal/?redirect=' + encodeURIComponent(location.pathname + location.search);
                return;
            }
            els.machineNum.textContent = PlayerAuth.getUser()?.name || 'Jugador';
            els.backLink.href = '/portal/';
            try {
                const data = await PlayerAuth.request('/api/auth/me');
                balance = data.user.game_balance || 0;
                minBet = MIN_BET;
                maxBet = MAX_BET;
                updateBalanceUI();
                setBet(currentBet);
            } catch (err) {
                showToast(err.message || 'Error al cargar saldo', 'lose');
            }
            return;
        }

        machineNumber = MachineAPI.requireMachine();
        if (!machineNumber) return;
        els.machineNum.textContent = '#' + machineNumber;
        els.backLink.href = MachineAPI.inicioUrl();
        try {
            const data = await MachineAPI.getMachine(machineNumber);
            balance = data.balance;
            minBet = data.minBet || MIN_BET;
            maxBet = data.maxBet || MAX_BET;
            updateBalanceUI();
            setBet(currentBet);
        } catch (err) {
            showToast(err.message || 'Error al cargar saldo', 'lose');
        }
    }

    function stopAuto() {
        autoPlay = false;
        els.autoBtn.classList.remove('is-on');
        if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
        }
    }

    function scheduleAuto() {
        if (!autoPlay || isSpinning) return;
        autoTimer = setTimeout(() => {
            if (autoPlay) spin();
        }, turbo ? 350 : 700);
    }

    async function spin() {
        if (isSpinning) return;

        const bet = currentBet;
        if (bet < minBet || bet > maxBet) {
            showToast('Apuesta entre ' + formatMoney(minBet) + ' y ' + formatMoney(maxBet), 'lose');
            stopAuto();
            return;
        }
        if (bet > balance) {
            showToast('Saldo insuficiente', 'lose');
            stopAuto();
            return;
        }

        isSpinning = true;
        els.spinBtn.disabled = true;
        els.spinBtn.classList.add('is-spinning');
        clearPaylines();
        setWin(0);
        setHint('Girando...', false);

        try {
            const apiResult = isPlayerMode
                ? await PlayerAuth.playCrystalWins(bet)
                : await MachineAPI.spinCrystalWins(bet, machineNumber);

            grid = apiResult.grid;
            await spinReels(grid);

            const wins = apiResult.wins || [];
            const payout = apiResult.payout || 0;
            balance = apiResult.balance;
            const net = apiResult.net;

            updateBalanceUI();
            setWin(payout);
            highlightWins(wins);

            if (wins.length > 0 && payout > 0) {
                const names = wins.map((w) => w.lineName).join(', ');
                setHint('¡' + names + '! +' + formatMoney(payout), true);
                showToast('+' + formatMoney(payout), 'win');
                if (wins.some((w) => w.mult >= 15)) {
                    showModal('¡CRYSTAL JACKPOT!', formatMoney(payout));
                }
            } else {
                setHint('Sin premio — prueba otra vez', false);
                showToast(formatMoney(net), 'lose');
            }

            if (balance <= 0) stopAuto();
        } catch (err) {
            showToast(err.message || 'Error al girar', 'lose');
            stopAuto();
            setHint('3 iguales en línea horizontal o diagonal = premio', false);
        }

        isSpinning = false;
        els.spinBtn.disabled = false;
        els.spinBtn.classList.remove('is-spinning');
        scheduleAuto();
    }

    function showModal(title, amount) {
        els.modalTitle.textContent = title;
        els.modalAmount.textContent = amount;
        els.modal.hidden = false;
        stopAuto();
    }

    els.spinBtn.addEventListener('click', () => {
        if (autoPlay) stopAuto();
        spin();
    });

    els.autoBtn.addEventListener('click', () => {
        if (autoPlay) {
            stopAuto();
            return;
        }
        autoPlay = true;
        els.autoBtn.classList.add('is-on');
        if (!isSpinning) spin();
    });

    els.turboBtn.addEventListener('click', () => {
        turbo = !turbo;
        els.turboBtn.classList.toggle('is-on', turbo);
        els.turboLabel.textContent = turbo ? 'ON' : 'OFF';
    });

    els.betMinus.addEventListener('click', () => {
        if (isSpinning) return;
        setBet(currentBet - BET_STEP);
    });

    els.betPlus.addEventListener('click', () => {
        if (isSpinning) return;
        setBet(currentBet + BET_STEP);
    });

    els.modalClose.addEventListener('click', () => {
        els.modal.hidden = true;
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && els.modal.hidden) {
            e.preventDefault();
            if (!isSpinning) spin();
        }
    });

    if (isPlayerMode) {
        if (!PlayerAuth.isLoggedIn()) {
            window.location.href = '/portal/?redirect=' + encodeURIComponent(location.pathname + location.search);
            return;
        }
    } else if (!MachineAPI.getMachineNumber()) {
        MachineAPI.requireMachine();
        return;
    }

    grid = generateGrid();
    renderReels(grid, false);
    setBet(10);
    setWin(0);
    loadBalance();
})();
