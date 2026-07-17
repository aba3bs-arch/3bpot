const { adjustWeight, pickWeighted } = require('./retention');

/**
 * Lotería mexicana — tabla 4×4 + cartas cantadas.
 * Premios: frijoles, línea, esquinas, diagonal, corazón, ¡LOTERÍA!
 */

const CARDS = [
    { id: 1, name: 'El Gallo', emoji: '🐓' },
    { id: 2, name: 'El Diablito', emoji: '😈' },
    { id: 3, name: 'La Dama', emoji: '👗' },
    { id: 4, name: 'El Catrín', emoji: '🎩' },
    { id: 5, name: 'El Paraguas', emoji: '☂️' },
    { id: 6, name: 'La Sirena', emoji: '🧜‍♀️' },
    { id: 7, name: 'La Escalera', emoji: '🪜' },
    { id: 8, name: 'La Botella', emoji: '🍾' },
    { id: 9, name: 'El Barril', emoji: '🛢️' },
    { id: 10, name: 'El Árbol', emoji: '🌳' },
    { id: 11, name: 'El Melón', emoji: '🍈' },
    { id: 12, name: 'El Valiente', emoji: '💪' },
    { id: 13, name: 'El Gorrito', emoji: '🧢' },
    { id: 14, name: 'La Muerte', emoji: '💀' },
    { id: 15, name: 'La Pera', emoji: '🍐' },
    { id: 16, name: 'La Bandera', emoji: '🇲🇽' },
    { id: 17, name: 'El Bandolón', emoji: '🪕' },
    { id: 18, name: 'El Violoncello', emoji: '🎻' },
    { id: 19, name: 'La Garza', emoji: '🦩' },
    { id: 20, name: 'El Pájaro', emoji: '🐦' },
    { id: 21, name: 'La Mano', emoji: '✋' },
    { id: 22, name: 'La Bota', emoji: '👢' },
    { id: 23, name: 'La Luna', emoji: '🌙' },
    { id: 24, name: 'El Cotorro', emoji: '🦜' },
    { id: 25, name: 'El Borracho', emoji: '🥴' },
    { id: 26, name: 'El Negrito', emoji: '🎭' },
    { id: 27, name: 'El Corazón', emoji: '❤️' },
    { id: 28, name: 'La Sandía', emoji: '🍉' },
    { id: 29, name: 'El Tambor', emoji: '🥁' },
    { id: 30, name: 'El Camarón', emoji: '🦐' },
    { id: 31, name: 'Las Jaras', emoji: '🏺' },
    { id: 32, name: 'El Músico', emoji: '🎺' },
    { id: 33, name: 'La Araña', emoji: '🕷️' },
    { id: 34, name: 'El Soldado', emoji: '🪖' },
    { id: 35, name: 'La Estrella', emoji: '⭐' },
    { id: 36, name: 'El Cazo', emoji: '🍲' },
    { id: 37, name: 'El Mundo', emoji: '🌍' },
    { id: 38, name: 'El Apache', emoji: '🪶' },
    { id: 39, name: 'El Nopal', emoji: '🌵' },
    { id: 40, name: 'El Alacrán', emoji: '🦂' },
    { id: 41, name: 'La Rosa', emoji: '🌹' },
    { id: 42, name: 'La Calavera', emoji: '☠️' },
    { id: 43, name: 'La Campana', emoji: '🔔' },
    { id: 44, name: 'El Cantarito', emoji: '🫙' },
    { id: 45, name: 'El Venado', emoji: '🦌' },
    { id: 46, name: 'El Sol', emoji: '☀️' },
    { id: 47, name: 'La Corona', emoji: '👑' },
    { id: 48, name: 'La Chalupa', emoji: '🛶' },
    { id: 49, name: 'El Pino', emoji: '🌲' },
    { id: 50, name: 'El Pescado', emoji: '🐟' },
    { id: 51, name: 'La Palma', emoji: '🌴' },
    { id: 52, name: 'La Maceta', emoji: '🪴' },
    { id: 53, name: 'El Arpa', emoji: '🎶' },
    { id: 54, name: 'La Rana', emoji: '🐸' },
];

const OUTCOMES = [
    { id: 'nada', label: 'Sin premio', mult: 0, weight: 48 },
    { id: 'frijol', label: '¡Cuatro frijoles!', mult: 0.5, weight: 26 },
    { id: 'linea', label: '¡Línea!', mult: 1.5, weight: 12 },
    { id: 'esquinas', label: '¡Cuatro esquinas!', mult: 2.5, weight: 7 },
    { id: 'diagonal', label: '¡Diagonal!', mult: 4, weight: 4 },
    { id: 'corazon', label: '¡Corazón!', mult: 6, weight: 2 },
    { id: 'llena', label: '¡LOTERÍA!', mult: 20, weight: 1 },
];

const LINES = [
    [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
    [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
];
const DIAGONALS = [[0, 5, 10, 15], [3, 6, 9, 12]];
const CORNERS = [0, 3, 12, 15];
const HEART = [5, 6, 9, 10];

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function publicCard(c) {
    return { id: c.id, name: c.name, emoji: c.emoji };
}

function pickOutcome(retentionPercent) {
    const tiers = OUTCOMES.map((o) => ({
        ...o,
        weight: Math.max(0.5, adjustWeight(o.weight, o.mult, retentionPercent)),
    }));
    const total = tiers.reduce((s, t) => s + t.weight, 0);
    return pickWeighted(tiers, total).item;
}

function cellsFor(outcomeId) {
    if (outcomeId === 'llena') return Array.from({ length: 16 }, (_, i) => i);
    if (outcomeId === 'corazon') return [...HEART];
    if (outcomeId === 'diagonal') return [...DIAGONALS[Math.floor(Math.random() * 2)]];
    if (outcomeId === 'esquinas') return [...CORNERS];
    if (outcomeId === 'linea') return [...LINES[Math.floor(Math.random() * LINES.length)]];
    if (outcomeId === 'frijol') return shuffle([...Array(16).keys()]).slice(0, 4);
    return shuffle([...Array(16).keys()]).slice(0, 1 + Math.floor(Math.random() * 2));
}

function buildRound(outcome) {
    const tablaCards = shuffle(CARDS).slice(0, 16).map(publicCard);
    const winCells = cellsFor(outcome.id);
    const winIds = new Set(winCells.map((i) => tablaCards[i].id));

    // Cartas cantadas: relleno que NO complete patrones mayores + las ganadoras al final
    const offTabla = CARDS.filter((c) => !tablaCards.some((t) => t.id === c.id));
    const onTablaNotWin = tablaCards.filter((c) => !winIds.has(c.id));

    // Solo usar cartas fuera de tabla o no-ganadoras, pero limitar no-ganadoras
    // para no formar línea/esquinas accidentalmente: 0 extras de tabla si hay patrón
    const safeFill = shuffle(offTabla).slice(0, 6 + Math.floor(Math.random() * 4));
    let extras = [];
    if (outcome.id === 'nada' || outcome.id === 'frijol') {
        extras = shuffle(onTablaNotWin).slice(0, Math.max(0, (outcome.id === 'frijol' ? 0 : 0)));
    }

    const drawn = [
        ...safeFill.map(publicCard),
        ...extras,
        ...shuffle([...winIds]).map((id) => publicCard(CARDS.find((c) => c.id === id))),
    ];

    const drawnSet = new Set(drawn.map((c) => c.id));
    const marked = tablaCards.map((c) => drawnSet.has(c.id));

    return {
        tabla: tablaCards,
        drawn,
        marked,
        winCells,
        frijoles: marked.filter(Boolean).length,
    };
}

function play(bet, retentionPercent = 15) {
    const outcome = pickOutcome(retentionPercent);
    const round = buildRound(outcome);
    const payout = Math.floor(bet * outcome.mult);

    return {
        payout,
        net: payout - bet,
        mult: outcome.mult,
        label: outcome.label,
        outcomeId: outcome.id,
        tabla: round.tabla,
        drawn: round.drawn,
        marked: round.marked,
        winCells: round.winCells,
        frijoles: round.frijoles,
    };
}

module.exports = { CARDS, OUTCOMES, play };
