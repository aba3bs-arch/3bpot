/**
 * Calle Runner — corredor lateral por niveles.
 * El servidor manda la semilla y la dificultad; el cliente genera la calle y reporta el resultado.
 */
(function () {
    'use strict';

    const isPlayerMode = new URLSearchParams(location.search).has('player');
    const BETS = [1, 2, 5, 10, 15, 20];

    const W = 960;
    const H = 420;
    const GROUND_Y = 340;
    const PX_PER_M = 10;
    const PLAYER_X = 160;
    const PLAYER_W = 42;
    const STAND_H = 78;
    const DUCK_H = 44;
    const GRAVITY = 2400;
    const JUMP_V = -840;
    const DOUBLE_JUMP_V = -700;

    const canvas = document.getElementById('game');
    let use3D = false;
    try {
        use3D = !!(window.CalleRunner3D && window.THREE && CalleRunner3D.init(canvas));
    } catch (err) {
        console.error('[CalleRunner] 3D init failed, fallback 2D:', err);
        use3D = false;
    }
    const ctx = use3D ? null : canvas.getContext('2d');
    if (use3D) {
        canvas.classList.add('is-3d');
        const badge = document.getElementById('modeBadge');
        if (badge) {
            badge.hidden = false;
            badge.textContent = 'MODO 3D';
            badge.classList.add('is-3d');
        }
    } else {
        const badge = document.getElementById('modeBadge');
        if (badge) {
            badge.hidden = false;
            badge.textContent = 'MODO 2D';
            badge.classList.add('is-2d');
        }
        console.warn('[CalleRunner] 3D no activo. THREE=', typeof window.THREE, 'CalleRunner3D=', typeof window.CalleRunner3D);
    }

    const els = {
        balance: document.getElementById('balance'),
        machineNum: document.getElementById('machineNum'),
        backLink: document.getElementById('backLink'),
        levelLabel: document.getElementById('levelLabel'),
        betLabel: document.getElementById('betLabel'),
        prizeLabel: document.getElementById('prizeLabel'),
        coinLabel: document.getElementById('coinLabel'),
        wonLabel: document.getElementById('wonLabel'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        superFill: document.getElementById('superFill'),
        superLabel: document.getElementById('superLabel'),
        superbar: document.querySelector('.superbar'),
        powerChips: document.getElementById('powerChips'),
        countdown: document.getElementById('countdown'),
        betDisplay: document.getElementById('betDisplay'),
        betDown: document.getElementById('betDown'),
        betUp: document.getElementById('betUp'),
        playBtn: document.getElementById('playBtn'),
        restartBtn: document.getElementById('restartBtn'),
        btnJump: document.getElementById('btnJump'),
        btnDuck: document.getElementById('btnDuck'),
        btnSuper: document.getElementById('btnSuper'),
        hint: document.getElementById('hint'),
        toast: document.getElementById('toast'),
        toastMsg: document.getElementById('toastMsg'),
        overlay: document.getElementById('overlay'),
        overlayIcon: document.getElementById('overlayIcon'),
        overlayTitle: document.getElementById('overlayTitle'),
        overlaySubtitle: document.getElementById('overlaySubtitle'),
        overlayPrize: document.getElementById('overlayPrize'),
        overlayStart: document.getElementById('overlayStart'),
        overlayRetry: document.getElementById('overlayRetry'),
    };

    let balance = 0;
    let machineNumber = null;
    let betIndex = 0;
    let busy = false;
    let session = null;
    let track = null;
    let run = null;
    let totalWon = 0;
    let lastFrame = 0;

    /* ---------- API ---------- */
    const api = {
        active: () => (isPlayerMode
            ? PlayerAuth.getActiveCalleRunner()
            : MachineAPI.getActiveCalleRunner(machineNumber)),
        start: (bet, restart) => (isPlayerMode
            ? PlayerAuth.startCalleRunner(bet, restart)
            : MachineAPI.startCalleRunner(bet, restart, machineNumber)),
        finish: (id, report) => (isPlayerMode
            ? PlayerAuth.finishCalleRunner(id, report)
            : MachineAPI.finishCalleRunner(id, report, machineNumber)),
        retry: (id) => (isPlayerMode
            ? PlayerAuth.retryCalleRunner(id)
            : MachineAPI.retryCalleRunner(id, machineNumber)),
    };

    let pendingResume = null;

    function money(n) {
        return isPlayerMode ? PlayerAuth.formatPesos(n) : MachineAPI.formatPesos(n);
    }

    function toast(msg, type) {
        els.toastMsg.textContent = msg;
        els.toast.className = 'toast' + (type ? ' is-' + type : '');
        els.toast.hidden = false;
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { els.toast.hidden = true; }, 2600);
    }

    /* ---------- Audio ---------- */
    const audio = (function () {
        let ac = null;
        function ctxOn() {
            if (!ac) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) ac = new AC();
            }
            if (ac && ac.state === 'suspended') ac.resume();
            return ac;
        }
        function beep(freq, dur, type, gain, slideTo) {
            const a = ctxOn();
            if (!a) return;
            const osc = a.createOscillator();
            const g = a.createGain();
            osc.type = type || 'square';
            osc.frequency.setValueAtTime(freq, a.currentTime);
            if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
            g.gain.setValueAtTime(gain || 0.05, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
            osc.connect(g).connect(a.destination);
            osc.start();
            osc.stop(a.currentTime + dur + 0.02);
        }
        return {
            unlock: ctxOn,
            jump: () => beep(420, 0.14, 'square', 0.05, 780),
            dbl: () => beep(620, 0.14, 'square', 0.045, 980),
            coin: () => beep(980, 0.09, 'triangle', 0.05, 1500),
            power: () => beep(300, 0.28, 'sawtooth', 0.05, 1200),
            hit: () => beep(220, 0.3, 'sawtooth', 0.07, 60),
            hero: () => beep(180, 0.5, 'sawtooth', 0.06, 900),
            win: () => { beep(700, 0.15, 'triangle', 0.06, 900); setTimeout(() => beep(1050, 0.3, 'triangle', 0.06, 1400), 140); },
        };
    })();

    /* ---------- Generación de la calle ---------- */
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const JUMP_KINDS = [
        { kind: 'bote', w: 46, h: 58 },
        { kind: 'cono', w: 36, h: 42 },
        { kind: 'caja', w: 52, h: 48 },
        { kind: 'hidrante', w: 34, h: 56 },
        { kind: 'llanta', w: 48, h: 44 },
    ];

    function buildTrack(cfg) {
        const rnd = mulberry32(cfg.seed || 12345);
        const goalPx = cfg.goal * PX_PER_M;
        const obstacles = [];

        let x = 1500;
        while (x < goalPx - 500) {
            const r = rnd();
            if (r < cfg.duckRatio) {
                obstacles.push({ type: 'duck', kind: 'letrero', x, w: 84, top: 96, h: GROUND_Y - 96 - 52, dead: false });
            } else if (r < cfg.duckRatio + cfg.doubleRatio) {
                obstacles.push({ type: 'jump', kind: 'valla', x, w: 104, h: 50, dead: false });
            } else {
                const k = JUMP_KINDS[Math.floor(rnd() * JUMP_KINDS.length)];
                obstacles.push({ type: 'jump', kind: k.kind, x, w: k.w, h: k.h, dead: false });
            }
            x += cfg.gapMin + rnd() * (cfg.gapMax - cfg.gapMin);
        }

        // Monedas: se reparten en huecos libres, en arco (aire) o al ras del piso.
        const coins = [];
        const total = cfg.maxCoins;
        const groups = Math.max(3, Math.round(total / 6));
        const perGroup = Math.floor(total / groups);
        let left = total - perGroup * groups;
        const span = goalPx - 1000;

        for (let g = 0; g < groups; g++) {
            let count = perGroup + (left > 0 ? 1 : 0);
            if (left > 0) left--;
            let gx = 700 + (span / groups) * g + rnd() * 140;
            const arc = rnd() < 0.55;
            for (let i = 0; i < count; i++) {
                let cx = gx + i * 46;
                // Bajo un letrero no caben monedas altas: se recorren un poco
                while (obstacles.some((o) => o.type === 'duck' && Math.abs(o.x - cx) < 90)) cx += 100;
                const t = count > 1 ? i / (count - 1) : 0.5;
                const y = arc
                    ? GROUND_Y - 96 - Math.sin(t * Math.PI) * 74
                    : GROUND_Y - 42;
                coins.push({ x: cx, y, taken: false, spin: rnd() * 6.28 });
            }
        }
        coins.sort((a, b) => a.x - b.x);

        // Poderes repartidos a lo largo del nivel
        const powers = [];
        const kinds = ['shield', 'magnet', 'turbo'];
        const powerCount = Math.max(2, Math.round(groups / cfg.powerEvery) + 2);
        for (let i = 0; i < powerCount; i++) {
            powers.push({
                x: 1200 + (span / powerCount) * i + rnd() * 200,
                y: GROUND_Y - 118,
                kind: kinds[Math.floor(rnd() * kinds.length)],
                taken: false,
            });
        }

        // Decorados de fondo (deterministas para que no parpadeen)
        const buildings = [];
        for (let i = 0; i < 120; i++) {
            buildings.push({
                x: i * 190 + rnd() * 60,
                w: 110 + rnd() * 90,
                h: 110 + rnd() * 150,
                tone: rnd(),
                windows: rnd() < 0.75,
                neon: rnd() < 0.28,
                antenna: rnd() < 0.4,
                roof: Math.floor(rnd() * 3),
                accent: rnd(),
            });
        }
        const lamps = [];
        for (let i = 0; i < 200; i++) lamps.push({ x: i * 420 + 120 });
        const props = [];
        for (let i = 0; i < 80; i++) {
            props.push({
                x: 300 + i * 260 + rnd() * 80,
                kind: rnd() < 0.45 ? 'car' : rnd() < 0.7 ? 'bin' : 'bush',
                tone: rnd(),
                flip: rnd() < 0.5,
            });
        }
        powers.sort((a, b) => a.x - b.x);

        return { obstacles, coins, powers, buildings, lamps, props, goalPx, cfg, totalCoins: coins.length };
    }

    /* ---------- Estado de la carrera ---------- */
    function newRun() {
        return {
            x: 0,
            speed: session.baseSpeed,
            coins: 0,
            vy: 0,
            y: 0,
            jumps: 0,
            ducking: false,
            state: 'countdown',
            ended: false,
            invuln: 0,
            shield: 0,
            magnet: 0,
            turbo: 0,
            hero: 0,
            superCharge: 0,
            shake: 0,
            phase: 0,
            particles: [],
            pops: [],
            flash: 0,
        };
    }

    function playerHeight() {
        return run && run.ducking && run.y === 0 ? DUCK_H : STAND_H;
    }

    function playerBox() {
        const h = playerHeight();
        return { x: PLAYER_X, y: GROUND_Y - h - run.y, w: PLAYER_W, h };
    }

    function invincible() {
        return run.invuln > 0 || run.turbo > 0 || run.hero > 0;
    }

    /* ---------- Acciones ---------- */
    function doJump() {
        if (!run || run.state !== 'running') return;
        audio.unlock();
        if (run.hero > 0) {
            run.vy = -430;
            spawnDust(6, '#b9ff8a');
            return;
        }
        if (run.y === 0) {
            run.vy = JUMP_V;
            run.jumps = 1;
            run.ducking = false;
            audio.jump();
            spawnDust(8, '#d8e4ff');
        } else if (run.jumps < 2) {
            run.vy = DOUBLE_JUMP_V;
            run.jumps = 2;
            audio.dbl();
            for (let i = 0; i < 10; i++) {
                run.particles.push({
                    x: PLAYER_X + PLAYER_W / 2, y: GROUND_Y - run.y,
                    vx: (Math.random() - 0.5) * 190, vy: 60 + Math.random() * 130,
                    life: 0.4, color: '#7fd8ff', r: 3,
                });
            }
        }
    }

    function setDuck(on) {
        if (!run || run.state !== 'running') return;
        run.ducking = on;
        if (on && run.y > 0 && run.hero <= 0) run.vy = Math.max(run.vy, 620);
    }

    function activateSuper() {
        if (!run || run.state !== 'running' || run.superCharge < 100) return;
        run.superCharge = 0;
        run.hero = 7;
        run.flash = 0.5;
        audio.hero();
        pop('¡MODO HÉROE!', '#b9ff8a');
        updateSuperUI();
    }

    function pop(text, color) {
        run.pops.push({ text, color, x: PLAYER_X + 30, y: GROUND_Y - 130, life: 1.2 });
    }

    function spawnDust(n, color) {
        for (let i = 0; i < n; i++) {
            run.particles.push({
                x: PLAYER_X + 10 + Math.random() * 20, y: GROUND_Y - run.y,
                vx: -80 - Math.random() * 160, vy: -Math.random() * 90,
                life: 0.35 + Math.random() * 0.25, color: color || '#cbd6ee', r: 2 + Math.random() * 2.5,
            });
        }
    }

    /* ---------- Bucle ---------- */
    function update(dt) {
        if (!run || run.state !== 'running') return;

        const progress = Math.min(1, run.x / track.goalPx);
        let speed = session.baseSpeed + (session.maxSpeed - session.baseSpeed) * progress;
        if (run.turbo > 0) speed *= 1.4;
        if (run.hero > 0) speed *= 1.25;
        run.speed = speed;
        run.x += speed * dt;
        run.phase += dt * (speed / 100);

        // Física del jugador
        if (run.hero > 0) {
            run.vy += (run.ducking ? 900 : 520) * dt;
            run.y -= run.vy * dt;
            run.y = Math.max(0, Math.min(230, run.y));
            if (run.y === 0) run.vy = Math.min(run.vy, 0);
        } else {
            run.vy += (run.ducking && run.y > 0 ? GRAVITY * 1.7 : GRAVITY) * dt;
            run.y -= run.vy * dt;
            if (run.y <= 0) {
                if (run.vy > 300) spawnDust(6);
                run.y = 0;
                run.vy = 0;
                run.jumps = 0;
            }
        }

        // Temporizadores
        ['invuln', 'shield', 'magnet', 'turbo', 'hero', 'shake', 'flash'].forEach((k) => {
            if (run[k] > 0) run[k] = Math.max(0, run[k] - dt);
        });

        const box = playerBox();

        // Monedas
        const magnetR = run.hero > 0 ? 460 : (run.magnet > 0 ? 240 : 0);
        for (const c of track.coins) {
            if (c.taken) continue;
            const sx = c.x - run.x;
            if (sx < -80) continue;
            if (sx > W + 200) break;
            c.spin += dt * 6;
            if (magnetR > 0) {
                const dx = (PLAYER_X + 20) - sx;
                const dy = (box.y + box.h / 2) - c.y;
                const d = Math.hypot(dx, dy);
                if (d > 1 && d < magnetR) {
                    const pull = Math.min(1, (magnetR - d) / magnetR) * 680 * dt;
                    c.x += (dx / d) * pull;
                    c.y += (dy / d) * pull;
                }
            }
            const cx = c.x - run.x;
            if (cx > box.x - 26 && cx < box.x + box.w + 26 && c.y > box.y - 22 && c.y < box.y + box.h + 22) {
                c.taken = true;
                run.coins += 1;
                run.superCharge = Math.min(100, run.superCharge + 100 / Math.max(6, session.maxCoins * 0.45));
                audio.coin();
                updateSuperUI();
                els.coinLabel.textContent = String(run.coins);
                for (let i = 0; i < 5; i++) {
                    run.particles.push({
                        x: cx, y: c.y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 180,
                        life: 0.4, color: '#ffd76b', r: 2.5,
                    });
                }
            }
        }

        // Poderes
        for (const p of track.powers) {
            if (p.taken) continue;
            const px = p.x - run.x;
            if (px < -80) continue;
            if (px > W + 200) break;
            if (px > box.x - 30 && px < box.x + box.w + 30 && p.y > box.y - 30 && p.y < box.y + box.h + 30) {
                p.taken = true;
                audio.power();
                if (p.kind === 'shield') { run.shield = 10; pop('ESCUDO', '#7fd8ff'); }
                if (p.kind === 'magnet') { run.magnet = 8; pop('IMÁN', '#ff9ad1'); }
                if (p.kind === 'turbo') { run.turbo = 5; run.invuln = Math.max(run.invuln, 0.2); pop('TURBO', '#ffd05a'); }
            }
        }

        // Obstáculos
        for (const o of track.obstacles) {
            if (o.dead) continue;
            const ox = o.x - run.x;
            if (ox < -200) continue;
            if (ox > W + 200) break;
            const rect = o.type === 'duck'
                ? { x: ox, y: o.top, w: o.w, h: o.h }
                : { x: ox, y: GROUND_Y - o.h, w: o.w, h: o.h };
            const hit = box.x < rect.x + rect.w && box.x + box.w > rect.x
                && box.y < rect.y + rect.h && box.y + box.h > rect.y;
            if (!hit) continue;

            if (run.turbo > 0 || run.hero > 0) {
                o.dead = true;
                run.shake = 0.18;
                audio.hit();
                for (let i = 0; i < 16; i++) {
                    run.particles.push({
                        x: rect.x + rect.w / 2, y: rect.y + rect.h / 2,
                        vx: (Math.random() - 0.3) * 320, vy: -Math.random() * 300,
                        life: 0.6, color: i % 2 ? '#ffd05a' : '#ff8a5c', r: 3 + Math.random() * 3,
                    });
                }
                continue;
            }
            if (run.shield > 0) {
                run.shield = 0;
                o.dead = true;
                run.invuln = 1.4;
                run.shake = 0.25;
                audio.hit();
                pop('¡ESCUDO ROTO!', '#7fd8ff');
                continue;
            }
            if (run.invuln > 0) continue;

            crash(rect);
            return;
        }

        // Partículas y textos
        for (const p of run.particles) {
            p.x += p.vx * dt;
            p.y -= p.vy * dt;
            p.vy -= 900 * dt;
            p.life -= dt;
        }
        run.particles = run.particles.filter((p) => p.life > 0);
        for (const p of run.pops) { p.life -= dt; p.y -= 34 * dt; }
        run.pops = run.pops.filter((p) => p.life > 0);

        updateProgress();

        if (run.x >= track.goalPx) {
            run.x = track.goalPx;
            run.state = 'won';
            audio.win();
            endRun(true);
        }
    }

    function crash(rect) {
        run.state = 'crashed';
        run.shake = 0.5;
        audio.hit();
        for (let i = 0; i < 26; i++) {
            run.particles.push({
                x: rect ? rect.x : PLAYER_X, y: rect ? rect.y : GROUND_Y - 40,
                vx: (Math.random() - 0.2) * 340, vy: -Math.random() * 340,
                life: 0.8, color: i % 3 === 0 ? '#ff6b57' : '#ffd05a', r: 3 + Math.random() * 3,
            });
        }
        endRun(false);
    }

    function updateProgress() {
        const meters = Math.min(session.goal, Math.floor(run.x / PX_PER_M));
        els.progressFill.style.width = (meters / session.goal * 100).toFixed(1) + '%';
        els.progressText.textContent = meters + ' / ' + session.goal + ' m';
    }

    function updateSuperUI() {
        const pct = Math.round(run ? run.superCharge : 0);
        els.superFill.style.width = pct + '%';
        els.superLabel.textContent = pct >= 100 ? '¡SÚPER LISTO!' : 'SÚPER ' + pct + '%';
        els.superbar.classList.toggle('is-ready', pct >= 100);
        els.btnSuper.disabled = !(run && run.state === 'running' && pct >= 100);
    }

    function renderChips() {
        if (!run) { els.powerChips.innerHTML = ''; return; }
        const chips = [];
        if (run.hero > 0) chips.push(['hero', '★ HÉROE ' + run.hero.toFixed(1)]);
        if (run.shield > 0) chips.push(['shield', '🛡 ' + run.shield.toFixed(1)]);
        if (run.magnet > 0) chips.push(['magnet', '🧲 ' + run.magnet.toFixed(1)]);
        if (run.turbo > 0) chips.push(['turbo', '⚡ ' + run.turbo.toFixed(1)]);
        els.powerChips.innerHTML = chips
            .map(([k, t]) => `<span class="powerchip powerchip--${k}">${t}</span>`)
            .join('');
    }

    /* ---------- Dibujo ---------- */
    function lerpColor(hex, amount) {
        if (!hex || hex[0] !== '#' || hex.length < 7) return hex || '#888888';
        const n = parseInt(hex.slice(1, 7), 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        if (amount >= 0) {
            r = Math.round(r + (255 - r) * amount);
            g = Math.round(g + (255 - g) * amount);
            b = Math.round(b + (255 - b) * amount);
        } else {
            const k = 1 + amount;
            r = Math.round(r * k);
            g = Math.round(g * k);
            b = Math.round(b * k);
        }
        return `rgb(${Math.max(0, Math.min(255, r))},${Math.max(0, Math.min(255, g))},${Math.max(0, Math.min(255, b))})`;
    }

    function themeIsNight(theme) {
        const id = theme && theme.id;
        return id === 'noche' || id === 'lluvia';
    }

    function roundBox(x, y, w, h, r) {
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
            return;
        }
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    function draw(dt) {
        if (use3D) {
            CalleRunner3D.sync({ run, track, session, dt: dt || 0.016 });
            return;
        }

        const theme = (session && session.theme) || { sky: '#7ec8e3', ground: '#4d5057', id: 'barrio' };
        const shake = run && run.shake > 0 ? run.shake * 16 : 0;
        const x = run ? run.x : 0;
        const night = themeIsNight(theme);

        ctx.save();
        if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

        drawSky(theme, night);
        drawHills(x, theme, night);
        drawClouds(x, night);
        drawBuildings(x, 0.14, 0.62, theme, night);
        drawBuildings(x, 0.32, 0.38, theme, night);
        drawBuildings(x, 0.52, 0.12, theme, night);
        drawStreetProps(x);
        drawStreet(x, theme, night);
        drawLamps(x, night);
        drawGoal(x);
        drawCoins(x);
        drawPowers(x);
        drawObstacles(x);
        drawSpeedLines();
        drawPlayer();
        drawParticles();
        drawPops();
        drawVignette();

        if (run && run.flash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${run.flash * 0.5})`;
            ctx.fillRect(0, 0, W, H);
        }
        if (run && run.state === 'crashed') {
            ctx.fillStyle = 'rgba(120, 10, 10, 0.28)';
            ctx.fillRect(0, 0, W, H);
        }

        ctx.restore();
    }

    function drawSky(theme, night) {
        const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        if (night) {
            sky.addColorStop(0, '#0a1028');
            sky.addColorStop(0.45, theme.sky);
            sky.addColorStop(1, lerpColor(theme.sky, 0.18));
        } else {
            sky.addColorStop(0, lerpColor(theme.sky, 0.38));
            sky.addColorStop(0.55, theme.sky);
            sky.addColorStop(1, lerpColor(theme.sky, 0.55));
        }
        ctx.fillStyle = sky;
        ctx.fillRect(-20, -20, W + 40, GROUND_Y + 20);

        // Sol / luna
        if (night) {
            ctx.fillStyle = 'rgba(230, 236, 255, 0.92)';
            ctx.beginPath();
            ctx.arc(820, 78, 28, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = theme.sky;
            ctx.beginPath();
            ctx.arc(832, 70, 24, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            for (let i = 0; i < 18; i++) {
                const sx = (i * 97 + 40) % W;
                const sy = 20 + ((i * 53) % 120);
                ctx.fillRect(sx, sy, 2, 2);
            }
        } else {
            const sunG = ctx.createRadialGradient(780, 70, 4, 780, 70, 90);
            sunG.addColorStop(0, 'rgba(255, 244, 180, 0.95)');
            sunG.addColorStop(0.35, 'rgba(255, 196, 90, 0.55)');
            sunG.addColorStop(1, 'rgba(255, 160, 60, 0)');
            ctx.fillStyle = sunG;
            ctx.beginPath();
            ctx.arc(780, 70, 90, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = '#ffe39a';
            ctx.beginPath();
            ctx.arc(780, 70, 26, 0, 6.28);
            ctx.fill();
        }

        // Haze cerca del horizonte
        const haze = ctx.createLinearGradient(0, GROUND_Y - 120, 0, GROUND_Y);
        haze.addColorStop(0, 'rgba(255,255,255,0)');
        haze.addColorStop(1, night ? 'rgba(40,60,110,0.35)' : 'rgba(255,255,255,0.22)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, GROUND_Y - 120, W, 120);
    }

    function drawHills(x, theme, night) {
        const base = night ? 'rgba(18, 28, 58, 0.85)' : 'rgba(70, 95, 120, 0.35)';
        const far = night ? 'rgba(28, 40, 78, 0.7)' : 'rgba(90, 120, 140, 0.28)';
        for (let layer = 0; layer < 2; layer++) {
            const par = layer === 0 ? 0.04 : 0.08;
            const y0 = GROUND_Y - 26 - (layer === 0 ? 90 : 60);
            ctx.fillStyle = layer === 0 ? far : base;
            ctx.beginPath();
            ctx.moveTo(-40, GROUND_Y);
            for (let i = 0; i <= 12; i++) {
                const hx = i * 100 - ((x * par) % 100);
                const hy = y0 - Math.sin(i * 1.1 + layer) * (18 + layer * 10) - (i % 3) * 8;
                ctx.lineTo(hx, hy);
            }
            ctx.lineTo(W + 40, GROUND_Y);
            ctx.closePath();
            ctx.fill();
        }
        // Tint del tema sobre el horizonte
        ctx.fillStyle = theme.sky.length === 7
            ? `${theme.sky}22`
            : 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, GROUND_Y - 40, W, 20);
    }

    function drawClouds(x, night) {
        const alpha = night ? 0.18 : 0.55;
        for (let i = 0; i < 9; i++) {
            const cx = ((i * 340 - x * (0.04 + (i % 3) * 0.02)) % (W + 420) + W + 420) % (W + 420) - 210;
            const cy = 40 + (i % 3) * 32;
            const s = 0.85 + (i % 4) * 0.12;
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 34 * s, 16 * s, 0, 0, 6.28);
            ctx.ellipse(cx + 28 * s, cy + 4, 24 * s, 14 * s, 0, 0, 6.28);
            ctx.ellipse(cx - 26 * s, cy + 6, 22 * s, 12 * s, 0, 0, 6.28);
            ctx.ellipse(cx + 8 * s, cy - 10, 18 * s, 12 * s, 0, 0, 6.28);
            ctx.fill();
            if (!night) {
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.beginPath();
                ctx.ellipse(cx - 6, cy - 4, 16 * s, 7 * s, 0, 0, 6.28);
                ctx.fill();
            }
        }
    }

    function drawBuildings(x, parallax, fade, theme, night) {
        if (!track) return;
        const offset = x * parallax;
        const near = parallax > 0.4;
        for (const b of track.buildings) {
            const bx = b.x - offset;
            if (bx < -280 || bx > W + 80) continue;
            const h = b.h * (parallax < 0.2 ? 0.75 : parallax < 0.4 ? 1 : 1.2);
            const top = GROUND_Y - 26 - h;
            const a = 1 - fade;
            const r = Math.round(28 + b.tone * (night ? 36 : 55));
            const g = Math.round(34 + b.tone * (night ? 42 : 50));
            const bl = Math.round(52 + b.tone * (night ? 70 : 58));
            ctx.fillStyle = `rgba(${r},${g},${bl},${a})`;
            roundBox(bx, top, b.w, h + 30, near ? 4 : 2);
            ctx.fill();

            // Lado sombreado
            ctx.fillStyle = `rgba(0,0,0,${0.14 * a})`;
            ctx.fillRect(bx + b.w * 0.72, top, b.w * 0.28, h + 30);

            // Techo
            ctx.fillStyle = `rgba(${r - 10},${g - 8},${bl - 8},${a})`;
            if (b.roof === 1) {
                ctx.beginPath();
                ctx.moveTo(bx - 4, top + 8);
                ctx.lineTo(bx + b.w / 2, top - 16);
                ctx.lineTo(bx + b.w + 4, top + 8);
                ctx.closePath();
                ctx.fill();
            } else if (b.roof === 2) {
                ctx.fillRect(bx - 3, top - 6, b.w + 6, 10);
            } else {
                ctx.fillRect(bx + 6, top - 10, b.w * 0.35, 12);
            }

            if (b.antenna && near) {
                ctx.strokeStyle = `rgba(200,210,230,${0.55 * a})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(bx + b.w * 0.7, top);
                ctx.lineTo(bx + b.w * 0.7, top - 22);
                ctx.stroke();
                ctx.fillStyle = `rgba(255,120,120,${0.7 * a})`;
                ctx.beginPath();
                ctx.arc(bx + b.w * 0.7, top - 24, 2.5, 0, 6.28);
                ctx.fill();
            }

            if (b.windows) {
                const lit = night ? 0.55 : 0.22;
                for (let wy = top + 14; wy < GROUND_Y - 55; wy += 24) {
                    for (let wx = bx + 10; wx < bx + b.w - 14; wx += 20) {
                        if (((wx + wy + (b.tone * 100 | 0)) | 0) % 3 === 0) continue;
                        const on = night ? ((wx + wy) % 5 !== 0) : true;
                        ctx.fillStyle = on
                            ? `rgba(255, 220, 140, ${lit * a})`
                            : `rgba(40, 55, 80, ${0.35 * a})`;
                        roundBox(wx, wy, 10, 13, 2);
                        ctx.fill();
                    }
                }
            }

            if (b.neon && near && night) {
                const neon = b.accent < 0.33 ? '#ff5ea8' : b.accent < 0.66 ? '#5ce1ff' : '#b8ff5c';
                ctx.strokeStyle = neon;
                ctx.globalAlpha = 0.75 * a;
                ctx.lineWidth = 3;
                roundBox(bx + 12, top + 28, b.w - 24, 18, 4);
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.fillStyle = neon;
                ctx.globalAlpha = 0.2 * a;
                ctx.fillRect(bx + 12, top + 28, b.w - 24, 18);
                ctx.globalAlpha = 1;
            }
        }
    }

    function drawStreetProps(x) {
        if (!track || !track.props) return;
        for (const p of track.props) {
            const px = p.x - x * 0.85;
            if (px < -120 || px > W + 80) continue;
            const y = GROUND_Y - 26;
            ctx.save();
            if (p.flip) {
                ctx.translate(px, 0);
                ctx.scale(-1, 1);
                ctx.translate(-px, 0);
            }
            if (p.kind === 'car') {
                const body = p.tone < 0.33 ? '#3d6fd6' : p.tone < 0.66 ? '#c94b3a' : '#2f9d6a';
                ctx.fillStyle = 'rgba(0,0,0,.25)';
                ctx.beginPath();
                ctx.ellipse(px + 34, y + 4, 36, 5, 0, 0, 6.28);
                ctx.fill();
                ctx.fillStyle = body;
                roundBox(px, y - 22, 68, 20, 6);
                ctx.fill();
                ctx.fillStyle = lerpColor(body, 0.2);
                roundBox(px + 14, y - 34, 34, 14, 5);
                ctx.fill();
                ctx.fillStyle = 'rgba(180,220,255,.55)';
                roundBox(px + 18, y - 32, 12, 10, 2);
                ctx.fill();
                roundBox(px + 34, y - 32, 12, 10, 2);
                ctx.fill();
                ctx.fillStyle = '#1a1d24';
                ctx.beginPath();
                ctx.arc(px + 14, y - 2, 7, 0, 6.28);
                ctx.arc(px + 54, y - 2, 7, 0, 6.28);
                ctx.fill();
            } else if (p.kind === 'bin') {
                ctx.fillStyle = '#3a6b52';
                roundBox(px, y - 28, 22, 28, 4);
                ctx.fill();
                ctx.fillStyle = '#2d5440';
                ctx.fillRect(px - 2, y - 32, 26, 6);
            } else {
                ctx.fillStyle = '#3f8f5a';
                ctx.beginPath();
                ctx.ellipse(px + 16, y - 10, 18, 12, 0, 0, 6.28);
                ctx.fill();
                ctx.fillStyle = '#2f6b44';
                ctx.beginPath();
                ctx.ellipse(px + 8, y - 6, 12, 8, 0, 0, 6.28);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    function drawStreet(x, theme, night) {
        // Banqueta con tiles
        const walk = ctx.createLinearGradient(0, GROUND_Y - 26, 0, GROUND_Y);
        walk.addColorStop(0, night ? '#6a7180' : '#9aa3af');
        walk.addColorStop(1, night ? '#525866' : '#7d8694');
        ctx.fillStyle = walk;
        ctx.fillRect(0, GROUND_Y - 26, W, 26);
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        for (let i = 0; i < 16; i++) {
            const sx = ((i * 72 - x * 0.55) % (W + 144) + W + 144) % (W + 144) - 72;
            ctx.fillRect(sx, GROUND_Y - 24, 68, 1);
            ctx.fillRect(sx, GROUND_Y - 26, 2, 26);
        }
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(0, GROUND_Y - 5, W, 5);

        // Bordillo
        ctx.fillStyle = night ? '#8a909c' : '#c2c8d2';
        ctx.fillRect(0, GROUND_Y - 8, W, 3);

        // Asfalto
        const road = ctx.createLinearGradient(0, GROUND_Y, 0, H);
        road.addColorStop(0, theme.ground);
        road.addColorStop(0.45, lerpColor(theme.ground, -0.08));
        road.addColorStop(1, '#14161c');
        ctx.fillStyle = road;
        ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

        // Textura sutil
        ctx.fillStyle = 'rgba(255,255,255,.03)';
        for (let i = 0; i < 24; i++) {
            const rx = ((i * 97 - x * 0.9) % (W + 120) + W + 120) % (W + 120) - 40;
            const ry = GROUND_Y + 12 + (i % 5) * 11;
            ctx.fillRect(rx, ry, 40 + (i % 3) * 20, 2);
        }

        // Línea central amarilla
        ctx.fillStyle = 'rgba(255, 220, 90, .9)';
        for (let i = 0; i < 14; i++) {
            const lx = ((i * 140 - x) % (W + 280) + W + 280) % (W + 280) - 140;
            roundBox(lx, GROUND_Y + 40, 70, 8, 3);
            ctx.fill();
        }
        // Líneas laterales
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        for (let i = 0; i < 18; i++) {
            const lx = ((i * 180 - x * 1.15) % (W + 360) + W + 360) % (W + 360) - 180;
            ctx.fillRect(lx, GROUND_Y + 72, 100, 3);
        }

        // Alcantarilla ocasional
        for (let i = 0; i < 4; i++) {
            const mx = ((i * 520 - x) % (W + 520) + W + 520) % (W + 520) - 80;
            ctx.fillStyle = 'rgba(0,0,0,.35)';
            ctx.beginPath();
            ctx.ellipse(mx, GROUND_Y + 28, 18, 7, 0, 0, 6.28);
            ctx.fill();
            ctx.strokeStyle = 'rgba(180,180,190,.35)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function drawLamps(x, night) {
        if (!track) return;
        for (const l of track.lamps) {
            const lx = l.x - x * 0.72;
            if (lx < -90 || lx > W + 90) continue;
            ctx.fillStyle = '#1e2533';
            roundBox(lx - 3, GROUND_Y - 26, 12, 10, 2);
            ctx.fill();
            ctx.fillStyle = '#2c3444';
            ctx.fillRect(lx, GROUND_Y - 178, 6, 152);
            ctx.beginPath();
            ctx.moveTo(lx + 3, GROUND_Y - 178);
            ctx.quadraticCurveTo(lx + 28, GROUND_Y - 186, lx + 48, GROUND_Y - 170);
            ctx.lineWidth = 5;
            ctx.strokeStyle = '#2c3444';
            ctx.stroke();
            const glow = night ? 0.22 : 0.1;
            ctx.fillStyle = `rgba(255, 230, 150, ${glow})`;
            ctx.beginPath();
            ctx.moveTo(lx + 48, GROUND_Y - 166);
            ctx.lineTo(lx + 110, GROUND_Y - 26);
            ctx.lineTo(lx - 10, GROUND_Y - 26);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffe6a1';
            ctx.beginPath();
            ctx.ellipse(lx + 48, GROUND_Y - 168, 11, 7, 0, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.55)';
            ctx.beginPath();
            ctx.ellipse(lx + 45, GROUND_Y - 170, 4, 2.5, 0, 0, 6.28);
            ctx.fill();
        }
    }

    function drawCoins(x) {
        if (!track) return;
        for (const c of track.coins) {
            if (c.taken) continue;
            const cx = c.x - x;
            if (cx < -40 || cx > W + 40) continue;
            const wob = Math.abs(Math.cos(c.spin));
            const rw = 13 * Math.max(0.22, wob);
            ctx.save();
            ctx.translate(cx, c.y);
            ctx.fillStyle = 'rgba(255, 215, 107, .30)';
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, 6.28);
            ctx.fill();
            const coin = ctx.createLinearGradient(-rw, -13, rw, 13);
            coin.addColorStop(0, '#c88910');
            coin.addColorStop(0.4, '#ffd76b');
            coin.addColorStop(1, '#f0a91d');
            ctx.fillStyle = coin;
            ctx.beginPath();
            ctx.ellipse(0, 0, rw, 13, 0, 0, 6.28);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, rw * 0.72, 9, 0, 0, 6.28);
            ctx.stroke();
            if (wob > 0.45) {
                ctx.fillStyle = '#8a5a08';
                ctx.font = 'bold 14px Exo 2, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('$', 0, 1);
                ctx.fillStyle = 'rgba(255,255,255,.55)';
                ctx.beginPath();
                ctx.ellipse(-rw * 0.25, -4, 3, 2, -0.4, 0, 6.28);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    function drawPowers(x) {
        if (!track) return;
        const t = performance.now() / 1000;
        for (const p of track.powers) {
            if (p.taken) continue;
            const px = p.x - x;
            if (px < -50 || px > W + 50) continue;
            const bob = Math.sin(t * 3 + p.x) * 6;
            const color = p.kind === 'shield' ? '#7fd8ff' : p.kind === 'magnet' ? '#ff9ad1' : '#ffd05a';
            const label = p.kind === 'shield' ? 'S' : p.kind === 'magnet' ? 'M' : 'T';
            ctx.save();
            ctx.translate(px, p.y + bob);
            const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
            aura.addColorStop(0, color);
            aura.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, 6.28);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#1a2233';
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, 6.28);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.font = 'bold 16px Archivo Black, Exo 2, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, 0, 1);
            ctx.restore();
        }
    }

    function drawObstacles(x) {
        if (!track) return;
        for (const o of track.obstacles) {
            if (o.dead) continue;
            const ox = o.x - x;
            if (ox < -160 || ox > W + 60) continue;
            if (o.type === 'duck') drawSign(ox, o);
            else drawGroundObstacle(ox, o);
        }
    }

    function drawGroundObstacle(ox, o) {
        const y = GROUND_Y - o.h;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.32)';
        ctx.beginPath();
        ctx.ellipse(ox + o.w / 2, GROUND_Y + 4, o.w * 0.62, 8, 0, 0, 6.28);
        ctx.fill();

        if (o.kind === 'cono') {
            const g = ctx.createLinearGradient(ox, y, ox + o.w, GROUND_Y);
            g.addColorStop(0, '#ffb06a');
            g.addColorStop(0.45, '#ff7a2f');
            g.addColorStop(1, '#c44a10');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(ox + o.w / 2, y);
            ctx.lineTo(ox + o.w, GROUND_Y);
            ctx.lineTo(ox, GROUND_Y);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#fff';
            roundBox(ox + 6, y + o.h * 0.42, o.w - 12, 9, 2);
            ctx.fill();
            ctx.fillStyle = '#2a2f38';
            roundBox(ox - 2, GROUND_Y - 6, o.w + 4, 6, 2);
            ctx.fill();
        } else if (o.kind === 'bote') {
            const g = ctx.createLinearGradient(ox, y, ox + o.w, y);
            g.addColorStop(0, '#4d9470');
            g.addColorStop(0.5, '#3f7d5c');
            g.addColorStop(1, '#2c5a42');
            ctx.fillStyle = g;
            roundBox(ox, y + 8, o.w, o.h - 8, 4);
            ctx.fill();
            ctx.fillStyle = '#2f6146';
            for (let i = 1; i < 4; i++) ctx.fillRect(ox + i * (o.w / 4) - 2, y + 12, 3, o.h - 16);
            ctx.fillStyle = '#6ab88a';
            roundBox(ox - 4, y, o.w + 8, 12, 4);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.2)';
            ctx.fillRect(ox + 6, y + 14, 6, o.h - 22);
        } else if (o.kind === 'caja') {
            const g = ctx.createLinearGradient(ox, y, ox, y + o.h);
            g.addColorStop(0, '#d49a55');
            g.addColorStop(1, '#8f5c2c');
            ctx.fillStyle = g;
            roundBox(ox, y, o.w, o.h, 3);
            ctx.fill();
            ctx.strokeStyle = '#6d441f';
            ctx.lineWidth = 3;
            ctx.strokeRect(ox + 2, y + 2, o.w - 4, o.h - 4);
            ctx.beginPath();
            ctx.moveTo(ox + 4, y + 4);
            ctx.lineTo(ox + o.w - 4, y + o.h - 4);
            ctx.moveTo(ox + o.w - 4, y + 4);
            ctx.lineTo(ox + 4, y + o.h - 4);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.18)';
            ctx.fillRect(ox + 4, y + 4, o.w - 8, 6);
        } else if (o.kind === 'hidrante') {
            ctx.fillStyle = '#8f1f18';
            roundBox(ox + 2, GROUND_Y - 8, o.w - 4, 8, 2);
            ctx.fill();
            const g = ctx.createLinearGradient(ox, y, ox + o.w, y);
            g.addColorStop(0, '#ff6a5c');
            g.addColorStop(0.5, '#d1362b');
            g.addColorStop(1, '#9a221a');
            ctx.fillStyle = g;
            roundBox(ox + 6, y + 10, o.w - 12, o.h - 10, 4);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(ox + o.w / 2, y + 12, (o.w - 12) / 2, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = '#b02820';
            roundBox(ox, y + 22, o.w, 10, 3);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.25)';
            ctx.fillRect(ox + 10, y + 14, 4, o.h - 24);
        } else if (o.kind === 'llanta') {
            const cy = GROUND_Y - o.h / 2;
            const cx = ox + o.w / 2;
            ctx.fillStyle = '#15181e';
            ctx.beginPath();
            ctx.ellipse(cx, cy, o.w / 2, o.h / 2, 0, 0, 6.28);
            ctx.fill();
            ctx.strokeStyle = '#3a4048';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.ellipse(cx, cy, o.w / 2 - 3, o.h / 2 - 3, 0, 0, 6.28);
            ctx.stroke();
            ctx.fillStyle = '#5a6270';
            ctx.beginPath();
            ctx.ellipse(cx, cy, o.w / 5, o.h / 5, 0, 0, 6.28);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.15)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 5; i++) {
                const ang = (i / 5) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(ang) * 10, cy + Math.sin(ang) * 8);
                ctx.stroke();
            }
        } else {
            // valla
            ctx.fillStyle = '#ff8a3d';
            roundBox(ox + 4, y, 14, o.h, 3);
            ctx.fill();
            roundBox(ox + o.w - 18, y, 14, o.h, 3);
            ctx.fill();
            ctx.fillStyle = '#e8ecf2';
            roundBox(ox, y, o.w, 11, 2);
            ctx.fill();
            roundBox(ox, y + 22, o.w, 11, 2);
            ctx.fill();
            ctx.fillStyle = '#9aa2ad';
            ctx.fillRect(ox + 2, y, 7, o.h);
            ctx.fillRect(ox + o.w - 9, y, 7, o.h);
            ctx.fillStyle = 'rgba(255,255,255,.35)';
            ctx.fillRect(ox + 6, y + 2, 4, o.h - 4);
        }
        ctx.restore();
    }

    function drawSign(ox, o) {
        ctx.save();
        // Poste
        ctx.fillStyle = '#1c2433';
        roundBox(ox + o.w / 2 - 5, 0, 10, o.top + 8, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        ctx.fillRect(ox + o.w / 2 - 3, 8, 3, o.top - 10);

        const y = o.top;
        const g = ctx.createLinearGradient(ox, y, ox + o.w, y + o.h);
        g.addColorStop(0, '#e0453a');
        g.addColorStop(1, '#9a221a');
        ctx.fillStyle = g;
        roundBox(ox, y, o.w, o.h, 6);
        ctx.fill();
        ctx.strokeStyle = '#ffe9a8';
        ctx.lineWidth = 3;
        roundBox(ox + 4, y + 4, o.w - 8, o.h - 8, 4);
        ctx.stroke();
        ctx.fillStyle = '#ffe9a8';
        ctx.font = 'bold 15px Exo 2, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.translate(ox + o.w / 2, y + o.h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('AGÁCHATE', 0, 0);
        ctx.restore();
        // Flecha abajo
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.moveTo(ox + o.w / 2, y + o.h - 18);
        ctx.lineTo(ox + o.w / 2 + 10, y + o.h - 30);
        ctx.lineTo(ox + o.w / 2 - 10, y + o.h - 30);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawPlayer() {
        if (!run) return;
        const ducking = run.ducking && run.y === 0;
        const h = ducking ? DUCK_H : STAND_H;
        const baseY = GROUND_Y - run.y;
        const cx = PLAYER_X + PLAYER_W / 2;
        const airborne = run.y > 0;
        const swing = Math.sin(run.phase) * (airborne ? 0.4 : 1);

        const shadowScale = Math.max(0.35, 1 - run.y / 260);
        ctx.fillStyle = `rgba(0,0,0,${0.34 * shadowScale})`;
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y + 4, 28 * shadowScale, 8 * shadowScale, 0, 0, 6.28);
        ctx.fill();

        ctx.save();
        ctx.translate(cx, baseY);
        if (run.invuln > 0 && Math.floor(run.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.45;

        if (run.hero > 0) {
            const g = ctx.createRadialGradient(0, -h / 2, 4, 0, -h / 2, 86);
            g.addColorStop(0, 'rgba(185, 255, 138, .6)');
            g.addColorStop(1, 'rgba(185, 255, 138, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, -h / 2, 86, 0, 6.28);
            ctx.fill();
        }
        if (run.shield > 0) {
            const pulse = 0.85 + Math.sin(performance.now() / 120) * 0.15;
            ctx.strokeStyle = `rgba(127, 216, 255, ${0.85 * pulse})`;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.ellipse(0, -h / 2, 40 * pulse, (h / 2 + 16) * pulse, 0, 0, 6.28);
            ctx.stroke();
            ctx.fillStyle = 'rgba(127, 216, 255, .14)';
            ctx.fill();
        }
        if (run.turbo > 0) {
            for (let i = 1; i <= 4; i++) {
                ctx.fillStyle = `rgba(255, 208, 90, ${0.55 - i * 0.08})`;
                ctx.beginPath();
                ctx.ellipse(-22 - i * 13, -h * 0.45, 10, 3 + i, 0, 0, 6.28);
                ctx.fill();
            }
        }

        const skin = '#f4c9a0';
        const shirt = run.hero > 0 ? '#7ee081' : '#2f6ed6';
        const pants = '#243049';
        const cap = run.hero > 0 ? '#2f6ed6' : '#e0453a';

        if (run.hero > 0) {
            ctx.fillStyle = '#e0453a';
            ctx.beginPath();
            ctx.moveTo(-6, -h + 22);
            ctx.quadraticCurveTo(-56 - swing * 10, -h + 34, -48, -h * 0.15);
            ctx.quadraticCurveTo(-22, -h * 0.42, -6, -h + 40);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffd05a';
            ctx.beginPath();
            ctx.moveTo(-10, -h + 30);
            ctx.quadraticCurveTo(-40, -h + 38, -36, -h * 0.35);
            ctx.quadraticCurveTo(-18, -h * 0.45, -8, -h + 42);
            ctx.closePath();
            ctx.fill();
        }

        if (ducking) {
            ctx.fillStyle = pants;
            roundBox(-20, -22, 40, 22, 8);
            ctx.fill();
            ctx.fillStyle = '#e94f37';
            roundBox(-22 + swing * 5, -8, 18, 8, 3);
            ctx.fill();
            roundBox(6 - swing * 5, -8, 18, 8, 3);
            ctx.fill();
            const tg = ctx.createLinearGradient(-24, -44, 22, -18);
            tg.addColorStop(0, lerpColor(shirt, 0.25));
            tg.addColorStop(1, shirt);
            ctx.fillStyle = tg;
            roundBox(-24, -44, 46, 26, 10);
            ctx.fill();
            ctx.fillStyle = '#6b45b8';
            roundBox(-32, -42, 16, 20, 6);
            ctx.fill();
            ctx.strokeStyle = skin;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(8, -34);
            ctx.lineTo(28, -18);
            ctx.stroke();
            ctx.fillStyle = skin;
            ctx.beginPath();
            ctx.arc(18, -52, 14, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = cap;
            ctx.beginPath();
            ctx.arc(18, -54, 14, Math.PI, 0);
            ctx.fill();
            roundBox(18, -58, 22, 5, 2);
            ctx.fill();
            ctx.fillStyle = '#20242e';
            ctx.beginPath();
            ctx.arc(25, -50, 2.5, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.55)';
            ctx.beginPath();
            ctx.arc(24, -51.5, 1, 0, 6.28);
            ctx.fill();
        } else {
            ctx.strokeStyle = pants;
            ctx.lineWidth = 11;
            ctx.lineCap = 'round';
            const legA = airborne ? -0.9 : swing;
            const legB = airborne ? 0.5 : -swing;
            ctx.beginPath();
            ctx.moveTo(-2, -26);
            ctx.lineTo(-2 + legA * 18, -2 - Math.abs(legA) * 4);
            ctx.moveTo(2, -26);
            ctx.lineTo(2 + legB * 18, -2 - Math.abs(legB) * 4);
            ctx.stroke();
            ctx.fillStyle = '#e94f37';
            ctx.beginPath();
            ctx.ellipse(-2 + legA * 20, -1, 10, 5.5, 0, 0, 6.28);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(2 + legB * 20, -1, 10, 5.5, 0, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillRect(-2 + legA * 20 - 2, -3, 5, 2);
            ctx.fillRect(2 + legB * 20 - 2, -3, 5, 2);

            ctx.fillStyle = '#6b45b8';
            roundBox(-26, -62, 18, 28, 7);
            ctx.fill();
            ctx.fillStyle = '#ffd05a';
            roundBox(-24, -48, 14, 5, 2);
            ctx.fill();

            const tg = ctx.createLinearGradient(-14, -62, 14, -24);
            tg.addColorStop(0, lerpColor(shirt, 0.28));
            tg.addColorStop(1, shirt);
            ctx.fillStyle = tg;
            roundBox(-14, -62, 28, 38, 11);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.9)';
            ctx.beginPath();
            ctx.arc(0, -46, 6.5, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = run.hero > 0 ? '#2f6ed6' : '#ffd05a';
            ctx.beginPath();
            ctx.arc(0, -46, 3.2, 0, 6.28);
            ctx.fill();

            ctx.strokeStyle = skin;
            ctx.lineWidth = 8;
            const armA = airborne ? -1.1 : -swing;
            const armB = airborne ? 0.8 : swing;
            ctx.beginPath();
            ctx.moveTo(-8, -56);
            ctx.lineTo(-8 + armA * 20, -34 + Math.abs(armA) * 4);
            ctx.moveTo(8, -56);
            ctx.lineTo(8 + armB * 20, -34 + Math.abs(armB) * 4);
            ctx.stroke();

            ctx.fillStyle = skin;
            ctx.beginPath();
            ctx.arc(2, -76, 15.5, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = '#3b2a1d';
            ctx.beginPath();
            ctx.arc(2, -80, 15.5, Math.PI * 0.95, Math.PI * 2.05);
            ctx.fill();
            ctx.fillStyle = cap;
            ctx.beginPath();
            ctx.arc(2, -80, 15.5, Math.PI, 0);
            ctx.fill();
            roundBox(2, -85, 25, 6, 3);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.25)';
            ctx.fillRect(-8, -88, 14, 3);
            ctx.fillStyle = '#20242e';
            ctx.beginPath();
            ctx.arc(10, -74, 2.7, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.6)';
            ctx.beginPath();
            ctx.arc(9.2, -75, 1, 0, 6.28);
            ctx.fill();
            ctx.strokeStyle = '#c98b6a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(9, -68, 5, 0.15, 1.1);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawSpeedLines() {
        if (!run || run.state !== 'running') return;
        const boost = (run.turbo > 0 || run.hero > 0 || run.speed > 420);
        if (!boost && run.speed < 360) return;
        const n = boost ? 14 : 7;
        const alpha = boost ? 0.22 : 0.1;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = boost ? 2.5 : 1.5;
        for (let i = 0; i < n; i++) {
            const ly = 40 + ((i * 97 + (run.x | 0)) % (H - 80));
            const len = 40 + (i % 4) * 28;
            const lx = W - ((run.x * (1.8 + (i % 3) * 0.3) + i * 80) % (W + 120));
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx - len, ly);
            ctx.stroke();
        }
    }

    function drawVignette() {
        const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.5, H * 0.78);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    function drawParticles() {
        if (!run) return;
        for (const p of run.particles) {
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 6.28);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawPops() {
        if (!run) return;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 26px Archivo Black, Exo 2, sans-serif';
        for (const p of run.pops) {
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
            ctx.lineWidth = 6;
            ctx.strokeStyle = 'rgba(0,0,0,.6)';
            ctx.strokeText(p.text, p.x, p.y);
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;
    }

    function drawGoal(x) {
        if (!track) return;
        const gx = track.goalPx - x;
        if (gx > W + 80 || gx < -140) return;
        const t = performance.now() / 1000;
        const wave = Math.sin(t * 4) * 4;

        // Poste
        ctx.fillStyle = '#1a1f2a';
        roundBox(gx - 2, GROUND_Y - 220, 10, 194, 2);
        ctx.fill();
        ctx.fillStyle = '#3a4458';
        ctx.fillRect(gx, GROUND_Y - 220, 4, 194);

        // Bandera a cuadros con ondulación
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 5; c++) {
                const fx = gx + 10 + c * 15;
                const fy = GROUND_Y - 218 + r * 15 + Math.sin(t * 5 + c * 0.6) * 3;
                ctx.fillStyle = (r + c) % 2 ? '#ffffff' : '#111318';
                ctx.fillRect(fx, fy, 15, 15);
            }
        }

        // Base y glow de meta
        const glow = ctx.createLinearGradient(gx - 20, GROUND_Y - 40, gx + 90, GROUND_Y);
        glow.addColorStop(0, 'rgba(255, 220, 100, 0)');
        glow.addColorStop(0.5, 'rgba(255, 220, 100, 0.28)');
        glow.addColorStop(1, 'rgba(255, 220, 100, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(gx - 20, GROUND_Y - 40, 120, 40);

        ctx.fillStyle = '#ffd05a';
        ctx.font = 'bold 14px Archivo Black, Exo 2, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('META', gx + 14, GROUND_Y - 230 + wave);
    }

    function loop(ts) {
        const dt = Math.min(0.045, lastFrame ? (ts - lastFrame) / 1000 : 0.016);
        lastFrame = ts;
        update(dt);
        draw(dt);
        renderChips();
        requestAnimationFrame(loop);
    }

    /* ---------- Flujo de partida ---------- */
    function setBusy(v) {
        busy = v;
        els.playBtn.disabled = v;
        els.overlayStart.disabled = v;
        els.overlayRetry.disabled = v;
        els.restartBtn.disabled = v;
    }

    function updateHud() {
        els.balance.textContent = money(balance);
        els.betDisplay.textContent = String(BETS[betIndex]);
        els.betLabel.textContent = money(BETS[betIndex]);
        els.wonLabel.textContent = money(totalWon);
        if (session) {
            els.levelLabel.textContent = String(session.level);
            els.prizeLabel.textContent = money(session.prize);
        }
        els.coinLabel.textContent = run ? String(run.coins) : '0';
    }

    function showOverlay({ icon, title, subtitle, prize, startText, retry }) {
        els.overlayIcon.textContent = icon;
        els.overlayTitle.textContent = title;
        els.overlaySubtitle.textContent = subtitle;
        els.overlayPrize.hidden = !prize;
        if (prize) els.overlayPrize.textContent = prize;
        els.overlayStart.textContent = startText;
        els.overlayRetry.hidden = !retry;
        els.overlay.classList.remove('is-hidden');
    }

    function hideOverlay() {
        els.overlay.classList.add('is-hidden');
    }

    function countdown(done) {
        let n = 3;
        els.countdown.hidden = false;
        els.countdown.textContent = String(n);
        const tick = setInterval(() => {
            n -= 1;
            if (n === 0) {
                els.countdown.textContent = '¡YA!';
            } else if (n < 0) {
                clearInterval(tick);
                els.countdown.hidden = true;
                done();
                return;
            } else {
                els.countdown.textContent = String(n);
            }
            els.countdown.style.animation = 'none';
            void els.countdown.offsetWidth;
            els.countdown.style.animation = '';
        }, 700);
    }

    function beginLevel(data) {
        session = data;
        if (use3D) CalleRunner3D.resetTrack();
        track = buildTrack(session);
        run = newRun();
        run.state = 'countdown';
        totalWon = data.totalWon || 0;
        updateHud();
        updateProgress();
        updateSuperUI();
        hideOverlay();
        els.betDown.disabled = true;
        els.betUp.disabled = true;
        countdown(() => {
            if (run) run.state = 'running';
            updateSuperUI();
        });
    }

    async function startLevel(restart) {
        if (busy) return;
        audio.unlock();

        // Retomar carrera ya cobrada (p. ej. tras cerrar la pestaña)
        if (!restart && pendingResume && pendingResume.resumed) {
            const data = pendingResume;
            pendingResume = null;
            balance = data.balance;
            const bi = BETS.indexOf(data.bet);
            if (bi >= 0) betIndex = bi;
            beginLevel(data);
            toast(data.message || `Continúa nivel ${data.level}`, 'win');
            updateHud();
            return;
        }

        const bet = BETS[betIndex];
        // Reiniciar reembolsa el intento en curso en el server; una partida nueva sí exige saldo.
        if (!restart && bet > balance) {
            toast('Saldo insuficiente', 'lose');
            return;
        }

        setBusy(true);
        try {
            const data = await api.start(bet, !!restart);
            balance = data.balance;
            pendingResume = null;
            beginLevel(data);
            toast(data.message || `Nivel ${data.level}`, 'win');
        } catch (err) {
            toast(err.message || 'No se pudo iniciar', 'lose');
        }
        setBusy(false);
    }

    async function retryLevel() {
        if (busy || !session) return;
        audio.unlock();
        setBusy(true);
        try {
            const data = await api.retry(session.sessionId);
            balance = data.balance;
            beginLevel(data);
        } catch (err) {
            toast(err.message || 'No se pudo reintentar', 'lose');
        }
        setBusy(false);
    }

    async function endRun(completed) {
        if (!run || run.ended) return;
        run.ended = true;
        els.betDown.disabled = false;
        els.betUp.disabled = false;
        els.btnSuper.disabled = true;

        const report = {
            completed,
            distance: Math.floor(run.x / PX_PER_M),
            coins: run.coins,
        };

        try {
            const res = await api.finish(session.sessionId, report);
            balance = res.balance;
            totalWon = (res.session && res.session.totalWon) || totalWon;
            session.status = res.session ? res.session.status : session.status;
            updateHud();

            if (completed) {
                showOverlay({
                    icon: '🏁',
                    title: `¡NIVEL ${session.level} SUPERADO!`,
                    subtitle: res.awarded > 0
                        ? `Premio ${money(session.prize)} + bono de monedas ${money(res.coinBonus)} (${res.coins} monedas).`
                        : 'Ya habías cobrado el premio de este nivel en esta partida.',
                    prize: res.awarded > 0 ? '+' + money(res.awarded) : null,
                    startText: 'Siguiente nivel',
                    retry: false,
                });
                if (res.awarded > 0) toast('+' + money(res.awarded), 'win');
            } else {
                showOverlay({
                    icon: '💥',
                    title: '¡CHOCASTE!',
                    subtitle: `Llegaste a ${report.distance} m de ${session.goal} m con ${report.coins} monedas. `
                        + `Reintenta el nivel ${session.level} o reinicia desde el 1.`,
                    prize: null,
                    startText: 'Reiniciar en nivel 1',
                    retry: true,
                });
            }
        } catch (err) {
            toast(err.message || 'Error al cerrar la carrera', 'lose');
            showOverlay({
                icon: '⚠️',
                title: 'Se perdió la conexión',
                subtitle: 'Vuelve a intentar la carrera.',
                prize: null,
                startText: 'Reintentar',
                retry: false,
            });
        }
    }

    /* ---------- Entradas ---------- */
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
            e.preventDefault();
            doJump();
        }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
            e.preventDefault();
            setDuck(true);
        }
        if (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            e.preventDefault();
            activateSuper();
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowDown' || e.code === 'KeyS') setDuck(false);
    });

    function bindHold(el, onDown, onUp) {
        const down = (e) => { e.preventDefault(); el.classList.add('is-down'); onDown(); };
        const up = (e) => { if (e) e.preventDefault(); el.classList.remove('is-down'); if (onUp) onUp(); };
        el.addEventListener('pointerdown', down);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('pointerleave', up);
    }

    bindHold(els.btnJump, doJump);
    bindHold(els.btnDuck, () => setDuck(true), () => setDuck(false));
    bindHold(els.btnSuper, activateSuper);

    // Swipe en la pantalla
    let touchStart = null;
    canvas.addEventListener('pointerdown', (e) => {
        touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvas.addEventListener('pointerup', (e) => {
        if (!touchStart) return;
        const dx = e.clientX - touchStart.x;
        const dy = e.clientY - touchStart.y;
        const quick = performance.now() - touchStart.t < 500;
        touchStart = null;
        if (quick && dy > 40 && Math.abs(dy) > Math.abs(dx)) {
            setDuck(true);
            setTimeout(() => setDuck(false), 650);
        } else {
            doJump();
        }
    });

    els.betDown.addEventListener('click', () => {
        if (betIndex > 0) { betIndex -= 1; updateHud(); }
    });
    els.betUp.addEventListener('click', () => {
        if (betIndex < BETS.length - 1) { betIndex += 1; updateHud(); }
    });

    els.playBtn.addEventListener('click', () => startLevel(false));
    els.restartBtn.addEventListener('click', () => startLevel(true));
    els.overlayRetry.addEventListener('click', retryLevel);
    els.overlayStart.addEventListener('click', () => {
        if (pendingResume && pendingResume.resumed) {
            startLevel(false);
            return;
        }
        if (pendingResume && pendingResume.levelComplete) {
            pendingResume = null;
            startLevel(false);
            return;
        }
        const failed = session && session.status === 'failed';
        startLevel(!!failed);
    });

    // Hook de pruebas: sólo con ?debug=1 en la URL
    if (new URLSearchParams(location.search).has('debug')) {
        window.__runner = {
            state: () => ({ run, track, session }),
            jump: doJump,
            duck: setDuck,
            superPower: activateSuper,
        };
    }

    /* ---------- Arranque ---------- */
    async function checkActiveSession() {
        try {
            const active = await api.active();
            balance = active.balance;
            updateHud();
            if (!active.active) return;
            pendingResume = active;
            const bi = BETS.indexOf(active.bet);
            if (bi >= 0) betIndex = bi;
            updateHud();
            if (active.resumed) {
                showOverlay({
                    icon: '🏃',
                    title: 'CARRERA EN CURSO',
                    subtitle: `Cerraste la página a mitad del nivel ${active.level}. `
                        + `La apuesta (${money(active.bet)}) ya estaba cobrada: puedes continuar sin pagar de nuevo.`,
                    prize: null,
                    startText: 'Continuar carrera',
                    retry: false,
                });
            } else if (active.levelComplete) {
                showOverlay({
                    icon: '🏁',
                    title: `NIVEL ${active.level} LISTO`,
                    subtitle: 'Ya completaste este nivel. Sigue al siguiente (se cobrará la apuesta del nuevo nivel).',
                    prize: null,
                    startText: 'Siguiente nivel',
                    retry: false,
                });
            }
        } catch (_) { /* sin sesión activa */ }
    }

    async function init() {
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
            } catch (err) {
                toast(err.message || 'Error al cargar saldo', 'lose');
            }
        } else {
            machineNumber = MachineAPI.requireMachine();
            if (!machineNumber) return;
            els.machineNum.textContent = '#' + machineNumber;
            els.backLink.href = MachineAPI.inicioUrl();
            MachineAPI.wireInicioLinks();
            try {
                const data = await MachineAPI.getMachine(machineNumber);
                balance = data.balance;
            } catch (err) {
                toast(err.message || 'Error al cargar saldo', 'lose');
            }
        }
        updateHud();
        requestAnimationFrame(loop);
        await checkActiveSession();
    }

    init();
})();
