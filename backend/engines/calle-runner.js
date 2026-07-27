/**
 * Calle Runner — niño corriendo por la calle, niveles infinitos.
 * Cada intento cobra apuesta. El premio se paga una vez por nivel completado.
 * Las monedas recogidas dan un bono extra acotado (nunca supera coinBonusMax).
 */

const BETS = [1, 2, 5, 10, 15, 20];

const THEMES = [
    { id: 'barrio', name: 'Barrio', sky: '#7ec8e3', ground: '#4d5057' },
    { id: 'centro', name: 'Centro', sky: '#f7b267', ground: '#4a4a55' },
    { id: 'noche', name: 'Noche', sky: '#1b2450', ground: '#2c2f3a' },
    { id: 'lluvia', name: 'Lluvia', sky: '#5c7a99', ground: '#3a3f4a' },
    { id: 'atardecer', name: 'Atardecer', sky: '#e2734f', ground: '#40353a' },
];

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function prizeMult(level, retentionPercent = 15) {
    const base = 0.6 + level * 0.3;
    const r = clamp(retentionPercent, 0, 50) / 100;
    return Math.round(Math.max(0.3, base * (1 - r * 0.4)) * 100) / 100;
}

function themeForLevel(level) {
    const base = THEMES[(level - 1) % THEMES.length];
    const tier = Math.floor((level - 1) / THEMES.length);
    return { ...base, name: tier > 0 ? `${base.name} ${tier + 1}` : base.name };
}

/** Configuración de dificultad del nivel (la usa el cliente para generar la calle). */
function levelConfig(level) {
    const lv = Math.max(1, level);
    return {
        goal: 900 + lv * 240,
        baseSpeed: 290 + lv * 16,
        maxSpeed: 470 + lv * 22,
        gapMin: Math.max(240, 460 - lv * 14),
        gapMax: Math.max(360, 720 - lv * 18),
        duckRatio: clamp(0.2 + lv * 0.03, 0.2, 0.5),
        doubleRatio: clamp(lv * 0.04, 0, 0.35),
        maxCoins: 24 + lv * 3,
        powerEvery: Math.max(3, 8 - Math.floor(lv / 3)),
        theme: themeForLevel(lv),
    };
}

function createRun(level, bet, retentionPercent = 15) {
    const cfg = levelConfig(level);
    const mult = prizeMult(level, retentionPercent);
    const prize = Math.max(1, Math.floor(bet * mult));
    return {
        level,
        bet,
        prize,
        prizeMult: mult,
        coinBonusMax: Math.floor(prize * 0.5),
        seed: Math.floor(Math.random() * 2147483647),
        ...cfg,
    };
}

/**
 * Valida y liquida el reporte del cliente. Todo se acota contra la config del nivel,
 * así un reporte manipulado nunca puede pagar de más.
 */
function settleRun(session, report = {}) {
    if (session.status !== 'running') throw new Error('No hay carrera activa');

    const distance = clamp(Math.floor(Number(report.distance) || 0), 0, session.goal);
    const coins = clamp(Math.floor(Number(report.coins) || 0), 0, session.maxCoins);
    const completed = !!report.completed && distance >= session.goal;

    session.distance = distance;
    session.coins = coins;

    let awarded = 0;
    let coinBonus = 0;

    if (completed) {
        const already = (session.claimedLevels || []).includes(session.level);
        if (!already && !session.prizePaid) {
            coinBonus = Math.floor(session.coinBonusMax * (coins / Math.max(1, session.maxCoins)));
            awarded = session.prize + coinBonus;
            session.prizePaid = true;
            session.totalWon = (session.totalWon || 0) + awarded;
            if (!session.claimedLevels) session.claimedLevels = [];
            session.claimedLevels.push(session.level);
        }
        session.status = 'level_complete';
    } else {
        session.status = 'failed';
    }

    return {
        ok: true,
        completed,
        awarded,
        coinBonus,
        coins,
        distance,
        alreadyClaimed: completed && awarded === 0,
        message: completed
            ? (awarded > 0
                ? `¡Nivel ${session.level} superado! +${awarded} (${coins} monedas)`
                : 'Nivel superado (premio ya cobrado en esta partida)')
            : `Chocaste a los ${distance} m de ${session.goal}. Reintenta o reinicia.`,
    };
}

function publicRun(session) {
    return {
        sessionId: session.id,
        level: session.level,
        bet: session.bet,
        prize: session.prize,
        prizeMult: session.prizeMult,
        coinBonusMax: session.coinBonusMax,
        seed: session.seed,
        goal: session.goal,
        baseSpeed: session.baseSpeed,
        maxSpeed: session.maxSpeed,
        gapMin: session.gapMin,
        gapMax: session.gapMax,
        duckRatio: session.duckRatio,
        doubleRatio: session.doubleRatio,
        maxCoins: session.maxCoins,
        powerEvery: session.powerEvery,
        theme: session.theme,
        status: session.status,
        distance: session.distance || 0,
        coins: session.coins || 0,
        totalWon: session.totalWon || 0,
        prizePaid: !!session.prizePaid,
        claimedLevels: session.claimedLevels || [],
    };
}

module.exports = {
    BETS,
    THEMES,
    prizeMult,
    levelConfig,
    createRun,
    settleRun,
    publicRun,
};
