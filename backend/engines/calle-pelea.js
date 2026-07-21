/**
 * Calle Pelea — combates por niveles infinitos.
 * Cada pelea cobra apuesta. Premio una vez por nivel; más nivel = más premio y rival más duro.
 * Reiniciar vuelve al nivel 1.
 */

const BETS = [1, 2, 5, 10, 15, 20];
const ACTIONS = ['punch', 'kick', 'block'];

const RIVALS = [
    { name: 'Rocco', color: '#c45c26', hair: '#1a1208' },
    { name: 'Blaze', color: '#e8b84a', hair: '#f5d76e' },
    { name: 'Viktor', color: '#4a6fa5', hair: '#2c3e50' },
    { name: 'Nova', color: '#c0392b', hair: '#8e1b1b' },
    { name: 'Kane', color: '#5d6d7e', hair: '#1c2833' },
    { name: 'Rex', color: '#27ae60', hair: '#145a32' },
    { name: 'Shadow', color: '#6c3483', hair: '#1a0520' },
    { name: 'Titan', color: '#922b21', hair: '#3d0c08' },
];

function prizeMult(level, retentionPercent = 15) {
    const base = 0.5 + level * 0.32;
    const r = Math.max(0, Math.min(50, retentionPercent)) / 100;
    return Math.round(Math.max(0.3, base * (1 - r * 0.4)) * 100) / 100;
}

function rivalForLevel(level) {
    const base = RIVALS[(level - 1) % RIVALS.length];
    const tier = Math.floor((level - 1) / RIVALS.length);
    return {
        ...base,
        name: tier > 0 ? `${base.name} Lv${tier + 1}` : base.name,
    };
}

function createFight(level, bet, retentionPercent = 15) {
    const mult = prizeMult(level, retentionPercent);
    const prize = Math.max(1, Math.floor(bet * mult));
    const rival = rivalForLevel(level);
    const enemyMaxHp = Math.round(70 + level * 14);
    const playerMaxHp = 100;
    return {
        level,
        bet,
        prize,
        prizeMult: mult,
        rival,
        playerHp: playerMaxHp,
        playerMaxHp,
        enemyHp: enemyMaxHp,
        enemyMaxHp,
        enemyDmg: 7 + level * 1.4,
        playerPunch: 11,
        playerKick: 16,
        round: 0,
        maxRounds: Math.min(12 + Math.floor(level / 3), 20),
        prizePaid: false,
        log: [],
    };
}

function pickEnemyAction(level, playerHistory) {
    const last = playerHistory[playerHistory.length - 1];
    const aggression = Math.min(0.85, 0.35 + level * 0.03);
    const blockBias = Math.min(0.45, 0.12 + level * 0.015);
    let roll = Math.random();

    // A niveles altos, el rival “lee” el último golpe un poco más
    if (last && level >= 4 && Math.random() < Math.min(0.55, 0.15 + level * 0.02)) {
        if (last === 'punch') return Math.random() < 0.55 ? 'block' : 'kick';
        if (last === 'kick') return Math.random() < 0.55 ? 'block' : 'punch';
        return Math.random() < aggression ? 'punch' : 'kick';
    }

    if (roll < blockBias) return 'block';
    roll -= blockBias;
    if (roll < aggression) return Math.random() < 0.55 ? 'punch' : 'kick';
    return Math.random() < 0.5 ? 'punch' : 'kick';
}

function resolveRound(session, playerAction) {
    if (session.status !== 'fighting') throw new Error('No hay pelea activa');
    const action = ACTIONS.includes(playerAction) ? playerAction : null;
    if (!action) throw new Error('Acción inválida (punch, kick o block)');

    session.round += 1;
    if (!session.playerHistory) session.playerHistory = [];
    session.playerHistory.push(action);

    const enemyAction = pickEnemyAction(session.level, session.playerHistory);
    let playerDmg = 0;
    let enemyDmg = 0;
    let note = '';

    const pAtk = action === 'kick' ? session.playerKick : action === 'punch' ? session.playerPunch : 0;
    const eAtk = enemyAction === 'block' ? 0 : session.enemyDmg * (enemyAction === 'kick' ? 1.25 : 1);

    if (action === 'block' && enemyAction === 'block') {
        note = 'Ambos bloquean';
    } else if (action === 'block') {
        playerDmg = Math.max(1, Math.round(eAtk * 0.28));
        note = `Bloqueas el ${enemyAction === 'kick' ? 'patadón' : 'golpe'}`;
    } else if (enemyAction === 'block') {
        enemyDmg = Math.max(1, Math.round(pAtk * 0.35));
        note = `Rival bloquea tu ${action === 'kick' ? 'patada' : 'golpe'}`;
    } else {
        // Intercambio: kick gana a punch (más daño neto al que usó punch)
        if (action === 'kick' && enemyAction === 'punch') {
            enemyDmg = Math.round(pAtk);
            playerDmg = Math.round(eAtk * 0.55);
            note = '¡Patada conecta fuerte!';
        } else if (action === 'punch' && enemyAction === 'kick') {
            enemyDmg = Math.round(pAtk * 0.55);
            playerDmg = Math.round(eAtk);
            note = 'Te alcanza la patada rival';
        } else {
            enemyDmg = Math.round(pAtk);
            playerDmg = Math.round(eAtk);
            note = '¡Intercambio de golpes!';
        }
    }

    session.playerHp = Math.max(0, session.playerHp - playerDmg);
    session.enemyHp = Math.max(0, session.enemyHp - enemyDmg);

    const entry = {
        round: session.round,
        playerAction: action,
        enemyAction,
        playerDmg,
        enemyDmg,
        note,
        playerHp: session.playerHp,
        enemyHp: session.enemyHp,
    };
    session.log = (session.log || []).slice(-8);
    session.log.push(entry);

    let finished = false;
    let won = false;
    let awarded = 0;

    if (session.enemyHp <= 0 || session.playerHp <= 0) {
        finished = true;
        won = session.enemyHp <= 0 && session.playerHp > 0;
        if (session.enemyHp <= 0 && session.playerHp <= 0) won = false;
    } else if (session.round >= session.maxRounds) {
        finished = true;
        won = session.playerHp > session.enemyHp;
    }

    if (finished) {
        if (won) {
            const already = (session.claimedLevels || []).includes(session.level);
            if (!already && !session.prizePaid) {
                session.prizePaid = true;
                awarded = session.prize;
                session.totalWon = (session.totalWon || 0) + awarded;
                if (!session.claimedLevels) session.claimedLevels = [];
                session.claimedLevels.push(session.level);
            }
            session.status = 'level_complete';
        } else {
            session.status = 'failed';
        }
    }

    return {
        ok: true,
        finished,
        won,
        awarded,
        alreadyClaimed: won && awarded === 0,
        entry,
        message: finished
            ? (won
                ? (awarded > 0
                    ? `¡Victoria! Nivel ${session.level} · premio +${awarded}`
                    : `Victoria (premio ya cobrado en esta partida)`)
                : `Derrota en nivel ${session.level}. Reintenta o reinicia.`)
            : entry.note,
    };
}

function publicFight(session) {
    return {
        sessionId: session.id,
        level: session.level,
        bet: session.bet,
        prize: session.prize,
        prizeMult: session.prizeMult,
        rival: session.rival,
        playerHp: session.playerHp,
        playerMaxHp: session.playerMaxHp,
        enemyHp: session.enemyHp,
        enemyMaxHp: session.enemyMaxHp,
        round: session.round,
        maxRounds: session.maxRounds,
        status: session.status,
        totalWon: session.totalWon || 0,
        prizePaid: !!session.prizePaid,
        claimedLevels: session.claimedLevels || [],
        log: session.log || [],
    };
}

module.exports = {
    BETS,
    ACTIONS,
    RIVALS,
    prizeMult,
    createFight,
    resolveRound,
    publicFight,
};
