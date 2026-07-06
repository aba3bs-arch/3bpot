(function () {
    'use strict';

    const INITIAL_BALANCE = 0;
    const MIN_BET = 5;
    const MAX_BET = 500;
    const ROWS = 3;
    const COLS = 3;
    const CELL_H = 80;

    const SYMBOLS = [
        { id: 'poop', emoji: '💩', name: 'Caca Dorada', mult: 2, weight: 22 },
        { id: 'banana', emoji: '🍌', name: 'Plátano Loco', mult: 3, weight: 20 },
        { id: 'taco', emoji: '🌮', name: 'Taco Volador', mult: 4, weight: 18 },
        { id: 'donut', emoji: '🍩', name: 'Donut Galáctico', mult: 6, weight: 14 },
        { id: 'alien', emoji: '👽', name: 'Alien Chismoso', mult: 8, weight: 10 },
        { id: 'clown', emoji: '🤡', name: 'Payaso VIP', mult: 12, weight: 7 },
        { id: 'unicorn', emoji: '🦄', name: 'Unicornio Jackpot', mult: 25, weight: 3 },
        { id: 'wild', emoji: '🎭', name: 'Comodín', mult: 0, weight: 6, wild: true },
    ];

    const PAYLINES = [
        { name: 'Arriba', row: 0, cls: 'payline--top' },
        { name: 'Centro', row: 1, cls: 'payline--mid' },
        { name: 'Abajo', row: 2, cls: 'payline--bot' },
    ];

    const HOST_IDLE = [
        '¡Apuesta y gira, campeón! 🎪',
        '¿Hoy toca unicornio? 🦄',
        'El payaso trae suerte... o no 🤡',
        '¡3 iguales y eres leyenda!',
        'No mires el taco, mira el premio 🌮',
    ];

    const WIN_MSGS = {
        poop: ['¡Caca de oro!', '¡Qué asco... de premio!', '¡Esto huele a dinero!'],
        banana: ['¡Resbalón millonario!', '¡Plátano power!', '¡Monkeys approved! 🐒'],
        taco: ['¡TACO TUESDAY FOREVER!', '¡Con extra queso y premio!', '¡Olé!'],
        donut: ['¡Donut del universo!', '¡Azúcar pura!', '¡Glaseado de victoria!'],
        alien: ['¡Te abducen las monedas!', '¡E.T. phone money!', '¡Ovni de la suerte!'],
        clown: ['¡PAYASADA ÉPICA!', '¡Globo de billetes!', '¡Circo en tu bolsillo!'],
        unicorn: ['¡UNICORNIO MÁGICO!', '¡Arcoíris de dinero!', '¡JACKPOT LOCO!'],
        wild: ['¡Comodín salvaje!', '¡Máscara de la fortuna!'],
    };

    const LOSE_MSGS = [
        '¡Nada! Ni caca dorada 💩',
        'El payaso se ríe de ti 🤡',
        '¡Inténtalo otra vez, valiente!',
        'El unicornio se fue de vacaciones 🦄',
        '¡ZAP! Sin premio esta vez',
    ];

    const totalWeight = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);

    let balance = INITIAL_BALANCE;
    let currentBet = 50;
    let isSpinning = false;
    let totalSpins = 0;
    let totalWins = 0;
    let bestWin = 0;
    let sessionStartBalance = INITIAL_BALANCE;
    let historyCount = 0;
    let grid = [];
    let confettiParticles = [];

    const spinBtn = document.getElementById('spinBtn');
    const spinBtnCost = document.getElementById('spinBtnCost');
    const balanceEl = document.getElementById('balance');
    const currentBetEl = document.getElementById('currentBet');
    const jackpotDisplay = document.getElementById('jackpotDisplay');
    const betChips = document.getElementById('betChips');
    const customBetInput = document.getElementById('customBet');
    const lastResultEl = document.getElementById('lastResult');
    const historyEl = document.getElementById('history');
    const legendEl = document.getElementById('legend');
    const toastEl = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMsg = document.getElementById('toastMsg');
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modalContent');
    const modalIcon = document.getElementById('modalIcon');
    const modalTitle = document.getElementById('modalTitle');
    const modalAmount = document.getElementById('modalAmount');
    const modalText = document.getElementById('modalText');
    const modalClose = document.getElementById('modalClose');
    const resetBtn = document.getElementById('resetBtn');
    const totalSpinsEl = document.getElementById('totalSpins');
    const totalWinsEl = document.getElementById('totalWins');
    const bestWinEl = document.getElementById('bestWin');
    const netProfitEl = document.getElementById('netProfit');
    const historyCountEl = document.getElementById('historyCount');
    const slotLightsEl = document.getElementById('slotLights');
    const halfBetBtn = document.getElementById('halfBetBtn');
    const doubleBetBtn = document.getElementById('doubleBetBtn');
    const maxBetBtn = document.getElementById('maxBetBtn');
    const hostMessage = document.getElementById('hostMessage');
    const winLinesEl = document.getElementById('winLines');
    const winLinesLabel = document.getElementById('winLinesLabel');
    const reelsEl = document.getElementById('reels');
    const confettiCanvas = document.getElementById('confetti');
    const confettiCtx = confettiCanvas.getContext('2d');
    const paylineEls = PAYLINES.map((p) => document.querySelector('.' + p.cls));

    function formatMoney(n) {
        return WinPot.formatCoins(n);
    }

    async function loadBalance() {
        try {
            const data = await WinPot.getBalance();
            balance = data.balance;
            sessionStartBalance = balance;
            updateBalanceUI();
            setBet(currentBet);
        } catch (err) {
            showToast(err.message || 'Error al cargar saldo', 'lose', '⚠️');
        }
    }

    function getActiveBet() {
        return customBetInput.value ? parseInt(customBetInput.value, 10) : currentBet;
    }

    function clampBet(val) {
        return Math.max(MIN_BET, Math.min(MAX_BET, Math.min(val, balance || MAX_BET)));
    }

    function setBet(val) {
        currentBet = clampBet(val);
        customBetInput.value = '';
        betChips.querySelectorAll('.bet-chip').forEach((c) => {
            c.classList.toggle('is-active', parseInt(c.dataset.bet, 10) === currentBet);
        });
        updateBetUI();
    }

    function updateBalanceUI(flashType) {
        balanceEl.textContent = formatMoney(balance);
        if (flashType) {
            balanceEl.classList.remove('balance-flash', 'lose-flash');
            void balanceEl.offsetWidth;
            balanceEl.classList.add('balance-flash', flashType === 'lose' ? 'lose-flash' : '');
        }
        netProfitEl.textContent = formatMoney(balance - sessionStartBalance);
        netProfitEl.style.color = balance >= sessionStartBalance ? 'var(--comic-green)' : 'var(--comic-red)';
    }

    function updateBetUI() {
        const bet = getActiveBet();
        const active = isNaN(bet) ? currentBet : bet;
        currentBetEl.textContent = formatMoney(active);
        spinBtnCost.textContent = formatMoney(active);
        jackpotDisplay.textContent = formatMoney(active * 25 * COLS);
    }

    function updateStatsUI() {
        totalSpinsEl.textContent = totalSpins;
        totalWinsEl.textContent = totalWins;
        bestWinEl.textContent = bestWin > 0 ? formatMoney(bestWin) : '—';
        historyCountEl.textContent = historyCount + (historyCount === 1 ? ' jugada' : ' jugadas');
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
            for (let c = 0; c < COLS; c++) {
                g[r][c] = pickSymbol();
            }
        }
        return g;
    }

    function resolveLine(symbols) {
        const nonWild = symbols.filter((s) => !s.wild);
        if (nonWild.length === 0) {
            return { match: symbols[0], count: 3, mult: 25 };
        }
        const base = nonWild[0];
        const allSameOrWild = symbols.every((s) => s.wild || s.id === base.id);
        if (allSameOrWild) {
            return { match: base, count: 3, mult: base.mult };
        }
        return null;
    }

    function checkWins(g) {
        const wins = [];
        PAYLINES.forEach((line, i) => {
            const symbols = [g[line.row][0], g[line.row][1], g[line.row][2]];
            const result = resolveLine(symbols);
            if (result) {
                wins.push({ ...result, lineIndex: i, lineName: line.name, row: line.row });
            }
        });
        return wins;
    }

    function buildLegend() {
        legendEl.innerHTML = SYMBOLS.filter((s) => !s.wild).map((sym) =>
            `<div class="legend-item">
                <span class="legend-item__emoji">${sym.emoji}</span>
                <span class="legend-item__name">${sym.name}</span>
                <span class="legend-item__mult">${sym.mult}×</span>
            </div>`
        ).join('') + `<div class="legend-item">
            <span class="legend-item__emoji">🎭</span>
            <span class="legend-item__name">Comodín</span>
            <span class="legend-item__mult">★</span>
        </div>`;
    }

    function buildLights() {
        slotLightsEl.innerHTML = '';
        const positions = [
            [5, 5], [50, 2], [95, 5], [98, 50], [95, 95], [50, 98], [5, 95], [2, 50],
        ];
        positions.forEach(([x, y], i) => {
            const light = document.createElement('span');
            light.className = 'slot-light';
            light.style.left = x + '%';
            light.style.top = y + '%';
            light.style.animationDelay = (i * 0.15) + 's';
            slotLightsEl.appendChild(light);
        });
    }

    function renderReels(g, animate) {
        const reelEls = reelsEl.querySelectorAll('.reel');
        reelEls.forEach((reelEl, col) => {
            const strip = reelEl.querySelector('.reel__strip');
            const symbols = [g[0][col], g[1][col], g[2][col]];

            if (!animate) {
                strip.innerHTML = symbols.map((s) =>
                    `<div class="reel__cell">${s.emoji}</div>`
                ).join('');
                strip.style.transform = 'translateY(0)';
                reelEl.classList.remove('is-spinning', 'is-stopped', 'is-win');
                return;
            }

            const extra = [];
            for (let i = 0; i < 14; i++) extra.push(pickSymbol());
            const allCells = [...extra, ...symbols];
            strip.innerHTML = allCells.map((s) =>
                `<div class="reel__cell">${s.emoji}</div>`
            ).join('');

            const targetOffset = (allCells.length - ROWS) * CELL_H;
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
            reelEl.classList.add('is-spinning');
            reelEl.classList.remove('is-stopped', 'is-win');
            reelEl.dataset.targetOffset = targetOffset;
        });
    }

    function spinReels(g) {
        return new Promise((resolve) => {
            renderReels(g, true);
            const reelEls = reelsEl.querySelectorAll('.reel');
            let stopped = 0;

            reelEls.forEach((reelEl, col) => {
                const strip = reelEl.querySelector('.reel__strip');
                const delay = 600 + col * 400;

                setTimeout(() => {
                    const targetOffset = parseInt(reelEl.dataset.targetOffset, 10);
                    strip.style.transition = 'transform 0.55s cubic-bezier(0.15, 0.85, 0.25, 1)';
                    strip.style.transform = `translateY(-${targetOffset}px)`;
                    reelEl.classList.remove('is-spinning');

                    setTimeout(() => {
                        reelEl.classList.add('is-stopped');
                        stopped++;
                        if (stopped === COLS) resolve();
                    }, 520);
                }, delay);
            });
        });
    }

    function highlightWins(wins) {
        paylineEls.forEach((el) => el.classList.remove('is-win'));
        winLinesEl.hidden = wins.length === 0;

        if (wins.length === 0) return;

        wins.forEach((w) => {
            paylineEls[w.lineIndex].classList.add('is-win');
        });

        const reelEls = reelsEl.querySelectorAll('.reel');
        wins.forEach((w) => {
            reelEls.forEach((reel) => reel.classList.add('is-win'));
        });

        const names = wins.map((w) => w.lineName).join(', ');
        winLinesLabel.textContent = `¡Línea${wins.length > 1 ? 's' : ''} ${names}!`;
    }

    function setHostMessage(msg) {
        hostMessage.textContent = msg;
        hostMessage.parentElement.classList.remove('speech-bubble--host');
        void hostMessage.parentElement.offsetWidth;
        hostMessage.parentElement.classList.add('speech-bubble--host');
    }

    function randomFrom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    async function spin() {
        if (isSpinning) return;

        const bet = getActiveBet();
        if (isNaN(bet) || bet < MIN_BET || bet > MAX_BET) {
            showToast('Apuesta entre ' + formatMoney(MIN_BET) + ' y ' + formatMoney(MAX_BET), 'lose', '⚠️');
            return;
        }
        if (bet > balance) {
            showToast('¡Sin WinCoins! Compra más en el portal', 'lose', '💸');
            return;
        }

        isSpinning = true;
        spinBtn.disabled = true;
        spinBtn.classList.add('is-spinning');
        paylineEls.forEach((el) => el.classList.remove('is-win'));
        winLinesEl.hidden = true;
        reelsEl.querySelectorAll('.reel').forEach((r) => r.classList.remove('is-stopped', 'is-win'));
        setHostMessage('¡Girando... agarraos! 🌀');

        try {
            const apiResult = await WinPot.spinComicSlot(bet);
            totalSpins++;
            updateStatsUI();

            grid = apiResult.grid;
            await spinReels(grid);

            const wins = apiResult.wins;
            const totalPayout = apiResult.payout;
            balance = apiResult.balance;
            const net = apiResult.net;

            if (net > 0) totalWins++;
            if (net > bestWin) bestWin = net;

            highlightWins(wins);
            updateBalanceUI(net >= 0 && totalPayout > 0 ? 'win' : 'lose');
            updateStatsUI();
            showLastResult(wins, totalPayout, net);
            addHistory(bet, wins, net);
            showToastResult(wins, net, totalPayout);

            if (wins.some((w) => w.mult >= 12)) fireConfetti(true);
            else if (wins.length > 0) fireConfetti(false);

            if (wins.some((w) => w.mult >= 25)) {
                showModal(wins.find((w) => w.mult >= 25), totalPayout);
            }

            if (net > 0 && wins.length > 0) {
                const topWin = wins.reduce((a, b) => (b.mult > a.mult ? b : a), wins[0]);
                setHostMessage(randomFrom(WIN_MSGS[topWin.match.id] || WIN_MSGS.wild));
            } else {
                setHostMessage(randomFrom(LOSE_MSGS));
            }

            if (balance <= 0) {
                setTimeout(() => {
                    showModal(null, 0, '¡Sin WinCoins! Ve al portal para comprar más.', 'gameover');
                }, 800);
            }
        } catch (err) {
            showToast(err.message || 'Error al girar', 'lose', '⚠️');
            setHostMessage(randomFrom(HOST_IDLE));
        }

        isSpinning = false;
        spinBtn.disabled = false;
        spinBtn.classList.remove('is-spinning');
    }

    function showLastResult(wins, payout, net) {
        const isWin = net > 0;
        lastResultEl.className = 'result-box ' + (isWin ? 'is-win' : 'is-lose');

        if (wins.length === 0) {
            const midRow = grid[1].map((s) => s.emoji).join(' ');
            lastResultEl.innerHTML = `
                <div>
                    <div class="result-box__symbols">${midRow}</div>
                    <div class="result-box__amount lose">${formatMoney(net)}</div>
                    <div class="result-box__msg">${randomFrom(LOSE_MSGS)}</div>
                </div>`;
            return;
        }

        const best = wins.reduce((a, b) => (b.mult > a.mult ? b : a), wins[0]);
        const symRow = grid[best.row].map((s) => s.emoji).join(' ');
        lastResultEl.innerHTML = `
            <div>
                <div class="result-box__symbols">${symRow}</div>
                <div class="result-box__amount win">+${formatMoney(net)}</div>
                <div class="result-box__msg">${best.match.emoji} ${best.match.name} · ${best.mult}× · ${wins.length} línea${wins.length > 1 ? 's' : ''}</div>
            </div>`;
    }

    function addHistory(bet, wins, net) {
        const empty = historyEl.querySelector('.history__empty');
        if (empty) empty.remove();

        historyCount++;
        const li = document.createElement('li');
        const midRow = grid[1].map((s) => s.emoji).join('');
        const resultCls = net > 0 ? 'win' : 'lose';
        const label = wins.length > 0 ? wins.map((w) => w.match.emoji).join('') : midRow;
        li.innerHTML = `
            <div class="history__left">
                <span class="history__bet">Apuesta ${formatMoney(bet)}</span>
                <span class="history__symbols">${label}</span>
            </div>
            <span class="history__result ${resultCls}">${net >= 0 ? '+' : ''}${formatMoney(net)}</span>`;
        historyEl.prepend(li);
        while (historyEl.children.length > 15) historyEl.removeChild(historyEl.lastChild);
        updateStatsUI();
    }

    function showToastResult(wins, net, payout) {
        if (wins.length === 0) {
            showToast(randomFrom(LOSE_MSGS), 'lose', '😵');
        } else if (net > 0) {
            showToast(`+${formatMoney(net)} · ${wins.length} línea${wins.length > 1 ? 's' : ''} ganadora${wins.length > 1 ? 's' : ''}`, 'win', '🎉');
        } else {
            showToast(`${formatMoney(payout)} recuperados`, 'lose', '😬');
        }
    }

    function showToast(msg, type, icon) {
        toastMsg.textContent = msg;
        toastIcon.textContent = icon || '';
        toastEl.className = 'toast ' + type;
        toastEl.hidden = false;
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(() => { toastEl.hidden = true; }, 3200);
    }

    function showModal(win, payout, customText, mode) {
        modalContent.classList.toggle('is-jackpot', !customText && win);

        if (customText) {
            modalIcon.textContent = mode === 'gameover' ? '💸' : 'ℹ️';
            modalTitle.textContent = mode === 'gameover' ? '¡Game Over!' : 'Aviso';
            modalAmount.textContent = '';
            modalAmount.hidden = true;
            modalText.textContent = customText;
        } else {
            modalIcon.textContent = win.match.emoji;
            modalTitle.textContent = win.mult >= 25 ? '¡JACKPOT LOCO!' : '¡PREMIO GIGANTE!';
            modalAmount.textContent = formatMoney(payout);
            modalAmount.hidden = false;
            modalText.textContent = randomFrom(WIN_MSGS[win.match.id] || WIN_MSGS.wild);
        }
        modal.hidden = false;
    }

    function resizeConfetti() {
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
    }

    function fireConfetti(big) {
        const colors = ['#ffe135', '#ff6b2b', '#e63946', '#06d6a0', '#8338ec', '#fff'];
        const count = big ? 100 : 50;
        confettiParticles = [];
        for (let i = 0; i < count; i++) {
            confettiParticles.push({
                x: confettiCanvas.width / 2 + (Math.random() - 0.5) * 280,
                y: confettiCanvas.height / 2,
                vx: (Math.random() - 0.5) * 16,
                vy: Math.random() * -18 - 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 10 + 5,
                rot: Math.random() * 360,
                rotV: (Math.random() - 0.5) * 14,
                life: 1,
            });
        }
        animateConfetti();
    }

    function animateConfetti() {
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        confettiParticles = confettiParticles.filter((p) => p.life > 0);
        confettiParticles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.4;
            p.rot += p.rotV;
            p.life -= 0.012;
            confettiCtx.save();
            confettiCtx.translate(p.x, p.y);
            confettiCtx.rotate((p.rot * Math.PI) / 180);
            confettiCtx.globalAlpha = p.life;
            confettiCtx.fillStyle = p.color;
            confettiCtx.strokeStyle = '#1a1a2e';
            confettiCtx.lineWidth = 1;
            confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            confettiCtx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            confettiCtx.restore();
        });
        if (confettiParticles.length > 0) requestAnimationFrame(animateConfetti);
    }

    betChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.bet-chip');
        if (!chip) return;
        setBet(parseInt(chip.dataset.bet, 10));
    });

    customBetInput.addEventListener('input', () => {
        betChips.querySelectorAll('.bet-chip').forEach((c) => c.classList.remove('is-active'));
        const val = parseInt(customBetInput.value, 10);
        if (!isNaN(val)) {
            currentBet = val;
            updateBetUI();
        }
    });

    halfBetBtn.addEventListener('click', () => setBet(Math.floor(getActiveBet() / 2)));
    doubleBetBtn.addEventListener('click', () => setBet(getActiveBet() * 2));
    maxBetBtn.addEventListener('click', () => setBet(Math.min(MAX_BET, balance)));
    spinBtn.addEventListener('click', spin);
    modalClose.addEventListener('click', () => { modal.hidden = true; });

    resetBtn.addEventListener('click', () => {
        totalSpins = 0;
        totalWins = 0;
        bestWin = 0;
        historyCount = 0;
        historyEl.innerHTML = '<li class="history__empty">Sin jugadas recientes</li>';
        lastResultEl.className = 'result-box';
        lastResultEl.innerHTML = `<div class="result-box__empty"><span class="result-box__emoji">🎰</span><span>¡Dale al botón gigante!</span></div>`;
        paylineEls.forEach((el) => el.classList.remove('is-win'));
        winLinesEl.hidden = true;
        grid = generateGrid();
        renderReels(grid, false);
        loadBalance().then(() => {
            sessionStartBalance = balance;
            setBet(50);
            updateStatsUI();
            setHostMessage('Estadísticas reiniciadas 🎪');
            showToast('¡Listo!', 'win', '✓');
        });
    });

    window.addEventListener('resize', resizeConfetti);

    setInterval(() => {
        if (!isSpinning) setHostMessage(randomFrom(HOST_IDLE));
    }, 8000);

    if (!WinPot.requireAuth()) return;

    buildLegend();
    buildLights();
    grid = generateGrid();
    renderReels(grid, false);
    setBet(50);
    updateStatsUI();
    resizeConfetti();
    loadBalance();
})();
