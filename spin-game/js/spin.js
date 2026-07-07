(function () {
    'use strict';

    const INITIAL_BALANCE = 0;
    const MIN_BET = 5;
    const MAX_BET = 500;

    const SEGMENTS = [
        { label: '0×', multiplier: 0, color: '#1a1d26', colorEnd: '#2d3344', weight: 28 },
        { label: '0.5×', multiplier: 0.5, color: '#3d4a63', colorEnd: '#505e77', weight: 18 },
        { label: '1×', multiplier: 1, color: '#2a3550', colorEnd: '#3d4f6f', weight: 16 },
        { label: '2×', multiplier: 2, color: '#c42a34', colorEnd: '#e73843', weight: 14 },
        { label: '3×', multiplier: 3, color: '#a8222c', colorEnd: '#d43040', weight: 10 },
        { label: '5×', multiplier: 5, color: '#d4920a', colorEnd: '#ffc857', weight: 7 },
        { label: '10×', multiplier: 10, color: '#e73843', colorEnd: '#ff6b6b', weight: 4 },
        { label: '20×', multiplier: 20, color: '#b8860b', colorEnd: '#ffd700', weight: 3 },
    ];

    const totalWeight = SEGMENTS.reduce((s, seg) => s + seg.weight, 0);

    let balance = INITIAL_BALANCE;
    let currentBet = 50;
    let machineNumber = null;
    let minBet = MIN_BET;
    let maxBet = MAX_BET;
    let isSpinning = false;
    let rotation = 0;
    let totalSpins = 0;
    let totalWins = 0;
    let bestWin = 0;
    let sessionStartBalance = INITIAL_BALANCE;
    let historyCount = 0;

    const canvas = document.getElementById('wheel');
    const ctx = canvas.getContext('2d');
    const confettiCanvas = document.getElementById('confetti');
    const confettiCtx = confettiCanvas.getContext('2d');
    const spinBtn = document.getElementById('spinBtn');
    const spinBtnSub = document.getElementById('spinBtnSub');
    const balanceEl = document.getElementById('balance');
    const currentBetEl = document.getElementById('currentBet');
    const potentialWinEl = document.getElementById('potentialWin');
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
    const wheelLightsEl = document.getElementById('wheelLights');
    const halfBetBtn = document.getElementById('halfBetBtn');
    const doubleBetBtn = document.getElementById('doubleBetBtn');
    const maxBetBtn = document.getElementById('maxBetBtn');

    let confettiParticles = [];

    function formatMoney(n) {
        return MachineAPI.formatPesos(n);
    }

    async function loadBalance() {
        machineNumber = MachineAPI.requireMachine();
        if (!machineNumber) return;
        const machineNumEl = document.getElementById('machineNum');
        if (machineNumEl) machineNumEl.textContent = '#' + machineNumber;
        try {
            const data = await MachineAPI.getMachine(machineNumber);
            balance = data.balance;
            minBet = data.minBet || MIN_BET;
            maxBet = data.maxBet || MAX_BET;
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
        return Math.max(minBet, Math.min(maxBet, Math.min(val, balance || maxBet)));
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
        netProfitEl.style.color = balance >= sessionStartBalance ? 'var(--green)' : 'var(--red-light)';
    }

    function updateBetUI() {
        const bet = getActiveBet();
        currentBetEl.textContent = formatMoney(isNaN(bet) ? currentBet : bet);
        spinBtnSub.textContent = formatMoney(isNaN(bet) ? currentBet : bet);
        const maxMult = Math.max(...SEGMENTS.map((s) => s.multiplier));
        potentialWinEl.textContent = formatMoney(Math.floor((isNaN(bet) ? currentBet : bet) * maxMult));
    }

    function updateStatsUI() {
        totalSpinsEl.textContent = totalSpins;
        totalWinsEl.textContent = totalWins;
        bestWinEl.textContent = bestWin > 0 ? formatMoney(bestWin) : '—';
        historyCountEl.textContent = historyCount + (historyCount === 1 ? ' jugada' : ' jugadas');
    }

    function getSegmentAngles() {
        const angles = [];
        let start = 0;
        SEGMENTS.forEach((seg) => {
            const slice = (seg.weight / totalWeight) * Math.PI * 2;
            angles.push({ ...seg, start, end: start + slice, mid: start + slice / 2 });
            start += slice;
        });
        return angles;
    }

    function setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const size = Math.min(rect.width || 480, 480);
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWheel(size);
    }

    function drawWheel(size) {
        const cx = size / 2;
        const cy = size / 2;
        const r = cx - 12;
        const segments = getSegmentAngles();

        ctx.clearRect(0, 0, size, size);

        // Outer rim shadow
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0c12';
        ctx.fill();

        segments.forEach((seg, i) => {
            const startAngle = seg.start - Math.PI / 2;
            const endAngle = seg.end - Math.PI / 2;

            const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
            grad.addColorStop(0, seg.colorEnd);
            grad.addColorStop(1, seg.color);

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            // Segment divider
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Inner highlight
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r * 0.92, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();

            // Label
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(seg.mid - Math.PI / 2);
            ctx.textAlign = 'right';
            ctx.fillStyle = seg.multiplier >= 5 ? '#1a1f2b' : '#ffffff';
            ctx.font = `800 ${Math.max(12, size * 0.034)}px Montserrat, sans-serif`;
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.fillText(seg.label, r - 22, 5);
            ctx.shadowBlur = 0;
            ctx.restore();
        });

        // Center hub
        const hubGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 52);
        hubGrad.addColorStop(0, '#2a3142');
        hubGrad.addColorStop(1, '#0f1117');
        ctx.beginPath();
        ctx.arc(cx, cy, 52, 0, Math.PI * 2);
        ctx.fillStyle = hubGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,87,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function buildWheelLights() {
        const count = 24;
        wheelLightsEl.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
            const light = document.createElement('span');
            light.className = 'wheel-light';
            const pct = 50 + Math.cos(angle) * 47;
            const pctY = 50 + Math.sin(angle) * 47;
            light.style.left = pct + '%';
            light.style.top = pctY + '%';
            light.style.animationDelay = (i * 0.1) + 's';
            wheelLightsEl.appendChild(light);
        }
    }

    function buildLegend() {
        legendEl.innerHTML = SEGMENTS.map((seg) => {
            const pct = Math.round((seg.weight / totalWeight) * 100);
            return `<div class="legend-item">
                <span class="legend-item__mult" style="color:${seg.colorEnd}">${seg.label}</span>
                <span class="legend-item__prob">${pct}% prob.</span>
                <div class="legend-item__bar">
                    <div class="legend-item__bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${seg.color},${seg.colorEnd})"></div>
                </div>
            </div>`;
        }).join('');
    }

    function pickSegment() {
        let roll = Math.random() * totalWeight;
        for (const seg of SEGMENTS) {
            roll -= seg.weight;
            if (roll <= 0) return seg;
        }
        return SEGMENTS[SEGMENTS.length - 1];
    }

    function spinWheel() {
        if (isSpinning) return;

        const bet = getActiveBet();

        if (isNaN(bet) || bet < minBet || bet > maxBet) {
            showToast('Apuesta entre ' + formatMoney(minBet) + ' y ' + formatMoney(maxBet), 'lose', '⚠️');
            return;
        }

        if (bet > balance) {
            showToast('Saldo insuficiente — paga en caja para recargar', 'lose', '💳');
            return;
        }

        isSpinning = true;
        spinBtn.disabled = true;
        spinBtn.classList.add('is-spinning');
        canvas.classList.add('spinning');

        MachineAPI.spinWheel(bet, machineNumber).then((apiResult) => {
            totalSpins++;
            updateStatsUI();

            const winner = {
                ...SEGMENTS[apiResult.segment.index],
                label: apiResult.segment.label,
                multiplier: apiResult.segment.multiplier,
            };

            const segments = getSegmentAngles();
            const segAngle = segments[apiResult.segment.index];
            const spins = 6 + Math.random() * 2;
            const targetRotation = rotation + spins * Math.PI * 2 + (Math.PI * 1.5 - segAngle.mid);
            const startRotation = rotation;
            const duration = 4500 + Math.random() * 600;
            const startTime = performance.now();

            function animate(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 5);

                rotation = startRotation + (targetRotation - startRotation) * eased;
                canvas.style.transform = `rotate(${rotation}rad)`;

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    finishSpin(winner, bet, apiResult);
                }
            }

            requestAnimationFrame(animate);
        }).catch((err) => {
            isSpinning = false;
            spinBtn.disabled = false;
            spinBtn.classList.remove('is-spinning');
            canvas.classList.remove('spinning');
            showToast(err.message || 'Error al girar', 'lose', '⚠️');
        });
    }

    function finishSpin(segment, bet, apiResult) {
        isSpinning = false;
        spinBtn.disabled = false;
        spinBtn.classList.remove('is-spinning');
        canvas.classList.remove('spinning');

        const payout = apiResult.payout;
        balance = apiResult.balance;
        const net = apiResult.net;

        if (net > 0) totalWins++;
        if (net > bestWin) bestWin = net;

        updateBalanceUI(net >= 0 ? 'win' : 'lose');
        updateStatsUI();
        showLastResult(segment, payout, net);
        addHistory(bet, segment, net);
        showToastResult(segment, net, payout);

        if (segment.multiplier >= 5) fireConfetti(segment.multiplier >= 10);
        if (segment.multiplier >= 10) showModal(segment, payout);

        if (balance <= 0) {
            setTimeout(() => {
                showModal(null, 0, 'Sin saldo. Paga en caja para seguir jugando.', 'gameover');
            }, 800);
        }
    }

    function showLastResult(segment, payout, net) {
        const isLose = segment.multiplier === 0;
        const isWin = net > 0;
        const multCls = isLose ? 'lose' : isWin ? 'win' : 'neutral';
        const boxCls = isLose ? 'is-lose' : isWin ? 'is-win' : '';

        lastResultEl.className = 'result-box ' + boxCls;
        lastResultEl.innerHTML = `
            <div>
                <span class="result-box__multiplier ${multCls}">${segment.label}</span>
                <span class="result-box__badge ${isWin ? 'win' : 'lose'}">${isWin ? 'Victoria' : isLose ? 'Perdida' : 'Empate'}</span>
                <div class="result-box__amount ${isWin ? 'win' : 'lose'}">${net >= 0 ? '+' : ''}${formatMoney(net)}</div>
            </div>
        `;
    }

    function addHistory(bet, segment, net) {
        const empty = historyEl.querySelector('.history__empty');
        if (empty) empty.remove();

        historyCount++;
        const li = document.createElement('li');
        const resultCls = net > 0 ? 'win' : 'lose';
        li.innerHTML = `
            <div class="history__left">
                <span class="history__bet">Apuesta ${formatMoney(bet)}</span>
                <span class="history__mult">${segment.label}</span>
            </div>
            <span class="history__result ${resultCls}">${net >= 0 ? '+' : ''}${formatMoney(net)}</span>
        `;
        historyEl.prepend(li);
        while (historyEl.children.length > 15) historyEl.removeChild(historyEl.lastChild);
        updateStatsUI();
    }

    function showToastResult(segment, net, payout) {
        if (segment.multiplier === 0) {
            showToast('Sin suerte — perdiste la apuesta', 'lose', '😔');
        } else if (net > 0) {
            showToast(`+${formatMoney(net)} · ${segment.label}`, 'win', '🎰');
        } else if (segment.multiplier === 1) {
            showToast('Empate — apuesta recuperada', 'win', '🔄');
        } else {
            showToast(`${formatMoney(payout)} recuperados (${segment.label})`, 'lose', '📉');
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

    function showModal(segment, payout, customText, mode) {
        modalContent.classList.toggle('is-jackpot', !customText && segment);

        if (customText) {
            modalIcon.textContent = mode === 'gameover' ? '💸' : 'ℹ️';
            modalTitle.textContent = mode === 'gameover' ? 'Sin saldo' : 'Aviso';
            modalAmount.textContent = '';
            modalAmount.hidden = true;
            modalText.textContent = customText;
        } else {
            modalIcon.textContent = '🏆';
            modalTitle.textContent = segment.multiplier >= 20 ? '¡MEGA JACKPOT!' : '¡GRAN PREMIO!';
            modalAmount.textContent = formatMoney(payout);
            modalAmount.hidden = false;
            modalText.textContent = `Multiplicador ${segment.label} — ¡Increíble jugada!`;
        }
        modal.hidden = false;
    }

    /* Confetti */
    function resizeConfetti() {
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
    }

    function fireConfetti(big) {
        const colors = ['#ffc857', '#e73843', '#34d399', '#fff', '#ff6b6b'];
        const count = big ? 120 : 60;
        confettiParticles = [];

        for (let i = 0; i < count; i++) {
            confettiParticles.push({
                x: confettiCanvas.width / 2 + (Math.random() - 0.5) * 200,
                y: confettiCanvas.height / 2,
                vx: (Math.random() - 0.5) * 14,
                vy: Math.random() * -16 - 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 8 + 4,
                rot: Math.random() * 360,
                rotV: (Math.random() - 0.5) * 12,
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
            p.vy += 0.35;
            p.rot += p.rotV;
            p.life -= 0.012;

            confettiCtx.save();
            confettiCtx.translate(p.x, p.y);
            confettiCtx.rotate((p.rot * Math.PI) / 180);
            confettiCtx.globalAlpha = p.life;
            confettiCtx.fillStyle = p.color;
            confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            confettiCtx.restore();
        });

        if (confettiParticles.length > 0) requestAnimationFrame(animateConfetti);
    }

    /* Events */
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
    maxBetBtn.addEventListener('click', () => setBet(Math.min(maxBet, balance)));

    spinBtn.addEventListener('click', spinWheel);
    modalClose.addEventListener('click', () => { modal.hidden = true; });

    resetBtn.addEventListener('click', () => {
        totalSpins = 0;
        totalWins = 0;
        bestWin = 0;
        historyCount = 0;
        historyEl.innerHTML = '<li class="history__empty">Sin jugadas recientes</li>';
        lastResultEl.className = 'result-box';
        lastResultEl.innerHTML = `<div class="result-box__empty">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" opacity="0.3"/>
                <path d="M24 14V26M24 30V34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
            <span>Gira la ruleta para comenzar</span>
        </div>`;
        loadBalance().then(() => {
            sessionStartBalance = balance;
            setBet(50);
            updateStatsUI();
            showToast('Estadísticas reiniciadas', 'win', '✓');
        });
    });

    window.addEventListener('resize', () => {
        setupCanvas();
        resizeConfetti();
    });

    /* Init */
    if (!MachineAPI.getMachineNumber()) {
        MachineAPI.requireMachine();
        return;
    }

    buildWheelLights();
    buildLegend();
    setBet(50);
    updateStatsUI();
    resizeConfetti();
    requestAnimationFrame(setupCanvas);
    loadBalance();
})();
