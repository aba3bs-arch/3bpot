/**
 * Zona Libre — battle royale arcade por niveles.
 * Cada misión cobra apuesta. Más nivel = más enemigos/dificultad y mayor premio.
 * Premio una vez por nivel. Reiniciar vuelve al nivel 1.
 */

const BETS = [1, 2, 5, 10, 15, 20];

function prizeMult(level, retentionPercent = 15) {
    const base = 0.55 + level * 0.34;
    const r = Math.max(0, Math.min(50, retentionPercent)) / 100;
    return Math.round(Math.max(0.3, base * (1 - r * 0.4)) * 100) / 100;
}

function missionForLevel(level, bet, retentionPercent = 15) {
    const mult = prizeMult(level, retentionPercent);
    const prize = Math.max(1, Math.floor(bet * mult));
    const enemies = Math.min(3 + Math.floor(level * 0.85), 14);
    const enemyHp = Math.round(38 + level * 9);
    const enemyDmg = Math.round(6 + level * 1.1);
    const playerHp = Math.max(90, 160 - Math.floor(level * 2.5));
    const zoneSeconds = Math.max(28, 55 - level);
    const aimAssist = Math.max(0.08, 0.35 - level * 0.012);

    return {
        level,
        bet,
        prize,
        prizeMult: mult,
        enemies,
        enemyHp,
        enemyDmg,
        playerHp,
        playerMaxHp: playerHp,
        zoneSeconds,
        aimAssist,
        mapSize: 900,
        killsRequired: enemies,
    };
}

function publicMission(session) {
    return {
        sessionId: session.id,
        level: session.level,
        bet: session.bet,
        prize: session.prize,
        prizeMult: session.prizeMult,
        enemies: session.enemies,
        enemyHp: session.enemyHp,
        enemyDmg: session.enemyDmg,
        playerHp: session.playerHp,
        playerMaxHp: session.playerMaxHp,
        zoneSeconds: session.zoneSeconds,
        aimAssist: session.aimAssist,
        mapSize: session.mapSize,
        killsRequired: session.killsRequired,
        status: session.status,
        totalWon: session.totalWon || 0,
        prizePaid: !!session.prizePaid,
        claimedLevels: session.claimedLevels || [],
        kills: session.kills || 0,
    };
}

function completeMission(session, payload = {}) {
    if (session.status !== 'active') {
        throw new Error('Misión no activa');
    }

    const kills = Math.max(0, parseInt(payload.kills, 10) || 0);
    const survived = !!payload.survived;
    const playerHpLeft = Math.max(0, parseInt(payload.playerHp, 10) || 0);
    const elapsed = Math.max(0, Number(payload.elapsed) || 0);

    session.kills = kills;
    session.playerHp = playerHpLeft;

    // Anti-abuso ligero: mínimo tiempo de partida
    const minTime = Math.min(4, 1.2 + session.level * 0.15);
    if (elapsed < minTime) {
        session.status = 'failed';
        return {
            won: false,
            awarded: 0,
            message: 'Partida demasiado corta — misión anulada',
        };
    }

    const won = survived && kills >= session.killsRequired && playerHpLeft > 0;
    let awarded = 0;

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
        return {
            won: true,
            awarded,
            alreadyClaimed: awarded === 0,
            message: awarded > 0
                ? `¡Zona despejada! Nivel ${session.level} · premio +${awarded}`
                : `Victoria (premio ya cobrado en esta partida)`,
        };
    }

    session.status = 'failed';
    return {
        won: false,
        awarded: 0,
        message: kills > 0
            ? `Caíste con ${kills}/${session.killsRequired} bajas. Reintenta o reinicia.`
            : `Eliminado en nivel ${session.level}. Reintenta o reinicia.`,
    };
}

module.exports = {
    BETS,
    prizeMult,
    missionForLevel,
    publicMission,
    completeMission,
};
