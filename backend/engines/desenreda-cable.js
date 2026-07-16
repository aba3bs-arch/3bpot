/**
 * Desenreda Cable — puzzle de nudos con premios por dificultad.
 * Sesión multi-paso: start → pull (izquierda/derecha) hasta terminar.
 */
const MAX_KNOTS = 12;
const MAX_WRONG = 8;
const JACKPOT_MULT = 10;

const DIFFICULTIES = {
    easy: { label: 'Fácil', mult: 0.5, weight: 40, color: '#86efac' },
    medium: { label: 'Medio', mult: 1.5, weight: 30, color: '#facc15' },
    hard: { label: 'Difícil', mult: 3, weight: 20, color: '#fb923c' },
    expert: { label: 'Experto', mult: 5, weight: 10, color: '#f472b6' },
};

const DIFF_KEYS = Object.keys(DIFFICULTIES);

function pickDifficulty(retentionPercent = 15) {
    const r = Math.max(0, Math.min(50, retentionPercent)) / 100;
    const weighted = DIFF_KEYS.map((key) => {
        const d = DIFFICULTIES[key];
        let w = d.weight;
        if (d.mult >= 5) w /= 1 + r * 2.5;
        else if (d.mult >= 3) w /= 1 + r * 1.5;
        else if (d.mult <= 0.5) w *= 1 + r * 0.8;
        return { key, weight: Math.max(1, w) };
    });
    const total = weighted.reduce((s, x) => s + x.weight, 0);
    let roll = Math.random() * total;
    for (const x of weighted) {
        roll -= x.weight;
        if (roll <= 0) return x.key;
    }
    return 'easy';
}

function createKnot(id, difficulty) {
    const d = DIFFICULTIES[difficulty];
    return {
        id,
        t: 0.12 + Math.random() * 0.76,
        difficulty,
        prizeMult: d.mult,
        label: d.label,
        color: d.color,
        correctEnd: Math.random() < 0.5 ? 'left' : 'right',
        untied: false,
    };
}

function generatePuzzle(bet, retentionPercent = 15) {
    const count = 4 + Math.floor(Math.random() * 3);
    const knots = [];
    for (let i = 0; i < count; i++) {
        knots.push(createKnot(i + 1, pickDifficulty(retentionPercent)));
    }
    knots.sort((a, b) => a.t - b.t);
    return { bet, knots, jackpotMult: JACKPOT_MULT };
}

function publicKnot(k) {
    return {
        id: k.id,
        t: k.t,
        difficulty: k.difficulty,
        prizeMult: k.prizeMult,
        label: k.label,
        color: k.color,
        untied: k.untied,
    };
}

function publicSession(session) {
    const remaining = session.knots.filter((k) => !k.untied).length;
    const active = session.knots.find((k) => !k.untied) || null;
    return {
        sessionId: session.id,
        bet: session.bet,
        knots: session.knots.map(publicKnot),
        activeKnotId: active?.id ?? null,
        accumulated: session.accumulated,
        remaining,
        wrongPulls: session.wrongPulls,
        status: session.status,
        jackpotMult: JACKPOT_MULT,
    };
}

function resolvePull(session, end) {
    if (session.status !== 'active') {
        throw new Error('La partida ya terminó');
    }
    const side = end === 'left' || end === 'right' ? end : null;
    if (!side) throw new Error('Elige izquierda o derecha');

    const active = session.knots.find((k) => !k.untied);
    if (!active) {
        return {
            success: true,
            finished: true,
            jackpot: 0,
            movePayout: 0,
            message: '¡Cable desenredado!',
        };
    }

    if (side === active.correctEnd) {
        active.untied = true;
        const movePayout = Math.floor(session.bet * active.prizeMult);
        session.accumulated += movePayout;
        const remaining = session.knots.filter((k) => !k.untied).length;

        if (remaining === 0) {
            const jackpot = Math.floor(session.bet * JACKPOT_MULT);
            session.accumulated += jackpot;
            session.status = 'done';
            return {
                success: true,
                finished: true,
                jackpot,
                movePayout,
                untiedKnot: publicKnot(active),
                message: `¡Jackpot! +${jackpot} por desenredar todo`,
            };
        }

        return {
            success: true,
            finished: false,
            jackpot: 0,
            movePayout,
            untiedKnot: publicKnot(active),
            message: `Nudo ${active.label} deshecho · +${movePayout}`,
        };
    }

    session.wrongPulls += 1;
    let newKnot = null;
    const untiedLeft = session.knots.filter((k) => !k.untied).length;

    if (session.knots.length < MAX_KNOTS && Math.random() < 0.78) {
        const maxId = session.knots.reduce((m, k) => Math.max(m, k.id), 0);
        newKnot = createKnot(maxId + 1, pickDifficulty(15));
        session.knots.push(newKnot);
        session.knots.sort((a, b) => a.t - b.t);
    }

    const tooHard = session.knots.length >= MAX_KNOTS || session.wrongPulls >= MAX_WRONG;
    if (tooHard && untiedLeft > 0) {
        session.status = 'done';
        return {
            success: false,
            finished: true,
            failed: true,
            jackpot: 0,
            movePayout: 0,
            newKnot: newKnot ? publicKnot(newKnot) : null,
            message: session.knots.length >= MAX_KNOTS
                ? '¡Demasiados nudos! Partida terminada con lo acumulado'
                : 'Demasiados errores — conservas lo desenredado',
        };
    }

    return {
        success: false,
        finished: false,
        jackpot: 0,
        movePayout: 0,
        newKnot: newKnot ? publicKnot(newKnot) : null,
        message: newKnot ? '¡Mal jalón! Se formó otro nudo' : 'Jalón incorrecto — inténtalo de nuevo',
    };
}

module.exports = {
    DIFFICULTIES,
    JACKPOT_MULT,
    MAX_KNOTS,
    generatePuzzle,
    publicSession,
    resolvePull,
};
