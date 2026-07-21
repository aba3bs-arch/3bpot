/**
 * Rompecabezas — niveles infinitos.
 * Cada nivel cobra apuesta (agota saldo). Premio una sola vez por nivel.
 * Reiniciar vuelve al nivel 1.
 */

const BETS = [1, 2, 5, 10, 15, 20];

function sizeForLevel(level) {
    if (level <= 5) return 3;
    if (level <= 15) return 4;
    return 5;
}

function prizeMult(level, retentionPercent = 15) {
    const base = 0.45 + level * 0.28;
    const r = Math.max(0, Math.min(50, retentionPercent)) / 100;
    const scaled = base * (1 - r * 0.35);
    return Math.round(Math.max(0.25, scaled) * 100) / 100;
}

function shuffleDepth(level) {
    const size = sizeForLevel(level);
    return Math.min(10 + level * 2, size * size * 5);
}

function moveLimit(level) {
    return shuffleDepth(level) * 4;
}

function solvedBoard(size) {
    const n = size * size;
    const board = [];
    for (let i = 1; i < n; i++) board.push(i);
    board.push(0);
    return board;
}

function emptyIndex(board) {
    return board.indexOf(0);
}

function neighbors(size, empty) {
    const row = Math.floor(empty / size);
    const col = empty % size;
    const out = [];
    if (row > 0) out.push(empty - size);
    if (row < size - 1) out.push(empty + size);
    if (col > 0) out.push(empty - 1);
    if (col < size - 1) out.push(empty + 1);
    return out;
}

function shuffleBoard(size, depth) {
    const board = solvedBoard(size);
    let empty = emptyIndex(board);
    let last = -1;
    for (let i = 0; i < depth; i++) {
        const opts = neighbors(size, empty).filter((idx) => idx !== last);
        const pick = opts[Math.floor(Math.random() * opts.length)];
        board[empty] = board[pick];
        board[pick] = 0;
        last = empty;
        empty = pick;
    }
    if (isSolved(board)) {
        const opts = neighbors(size, empty);
        const pick = opts[0];
        board[empty] = board[pick];
        board[pick] = 0;
    }
    return board;
}

function isSolved(board) {
    const n = board.length;
    for (let i = 0; i < n - 1; i++) {
        if (board[i] !== i + 1) return false;
    }
    return board[n - 1] === 0;
}

function createLevel(level, bet, retentionPercent = 15) {
    const size = sizeForLevel(level);
    const mult = prizeMult(level, retentionPercent);
    const prize = Math.max(1, Math.floor(bet * mult));
    return {
        level,
        size,
        board: shuffleBoard(size, shuffleDepth(level)),
        prize,
        prizeMult: mult,
        moves: 0,
        moveLimit: moveLimit(level),
        prizePaid: false,
    };
}

function publicLevel(session) {
    return {
        sessionId: session.id,
        level: session.level,
        size: session.size,
        board: session.board.slice(),
        prize: session.prize,
        prizeMult: session.prizeMult,
        moves: session.moves,
        moveLimit: session.moveLimit,
        prizePaid: session.prizePaid,
        status: session.status,
        totalWon: session.totalWon || 0,
        bet: session.bet,
        claimedLevels: session.claimedLevels || [],
    };
}

function applyMove(session, tileIndex) {
    if (session.status !== 'playing') {
        throw new Error('No hay nivel activo para mover');
    }
    const idx = parseInt(tileIndex, 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= session.board.length) {
        throw new Error('Ficha inválida');
    }

    const empty = emptyIndex(session.board);
    const valid = neighbors(session.size, empty);
    if (!valid.includes(idx)) {
        throw new Error('Esa ficha no se puede mover');
    }

    session.board[empty] = session.board[idx];
    session.board[idx] = 0;
    session.moves += 1;

    if (isSolved(session.board)) {
        const already = (session.claimedLevels || []).includes(session.level);
        let awarded = 0;
        if (!already && !session.prizePaid) {
            session.prizePaid = true;
            awarded = session.prize;
            session.totalWon = (session.totalWon || 0) + awarded;
            if (!session.claimedLevels) session.claimedLevels = [];
            session.claimedLevels.push(session.level);
        }
        session.status = 'level_complete';
        return {
            ok: true,
            solved: true,
            awarded,
            alreadyClaimed: already || awarded === 0,
            message: awarded > 0
                ? `¡Nivel ${session.level} completado! Premio +${awarded}`
                : `Nivel ${session.level} resuelto (premio ya cobrado en esta partida)`,
            failed: false,
        };
    }

    if (session.moves >= session.moveLimit) {
        session.status = 'failed';
        return {
            ok: false,
            solved: false,
            awarded: 0,
            failed: true,
            message: `Sin movimientos — nivel ${session.level} fallido. Reinicia o reintenta pagando de nuevo.`,
        };
    }

    return {
        ok: true,
        solved: false,
        awarded: 0,
        failed: false,
        message: 'Movimiento ok',
    };
}

module.exports = {
    BETS,
    sizeForLevel,
    prizeMult,
    createLevel,
    publicLevel,
    applyMove,
    isSolved,
};
