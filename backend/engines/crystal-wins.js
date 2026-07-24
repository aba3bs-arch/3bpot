const { adjustWeight } = require('./retention');

const BASE_SYMBOLS = [
    { id: 'cherry', emoji: '🍒', name: 'Cereza', mult: 2, weight: 24 },
    { id: 'lemon', emoji: '🍋', name: 'Limón', mult: 3, weight: 20 },
    { id: 'orange', emoji: '🍊', name: 'Naranja', mult: 4, weight: 18 },
    { id: 'plum', emoji: '🍇', name: 'Ciruela', mult: 6, weight: 14 },
    { id: 'seven', emoji: '777', name: 'Siete', mult: 15, weight: 8 },
    { id: 'wild', emoji: '💎', name: 'Cristal', mult: 0, weight: 6, wild: true },
];

const PAYLINES = [
    { name: 'Arriba', cells: [[0, 0], [0, 1], [0, 2]] },
    { name: 'Centro', cells: [[1, 0], [1, 1], [1, 2]] },
    { name: 'Abajo', cells: [[2, 0], [2, 1], [2, 2]] },
    { name: 'Diag \\', cells: [[0, 0], [1, 1], [2, 2]] },
    { name: 'Diag /', cells: [[0, 2], [1, 1], [2, 0]] },
];

function pickSymbol(symbols, totalWeight) {
    let roll = Math.random() * totalWeight;
    for (const sym of symbols) {
        roll -= sym.weight;
        if (roll <= 0) return sym;
    }
    return symbols[symbols.length - 1];
}

function serializeSymbol(sym) {
    return {
        id: sym.id,
        emoji: sym.emoji,
        name: sym.name,
        mult: sym.mult,
        wild: !!sym.wild,
        seven: sym.id === 'seven',
    };
}

function generateGrid(symbols, totalWeight) {
    const grid = [];
    for (let r = 0; r < 3; r++) {
        grid[r] = [];
        for (let c = 0; c < 3; c++) grid[r][c] = pickSymbol(symbols, totalWeight);
    }
    return grid;
}

function resolveLine(symbols) {
    const nonWild = symbols.filter((s) => !s.wild);
    if (nonWild.length === 0) return { match: symbols[0], mult: 25 };
    const base = nonWild[0];
    if (symbols.every((s) => s.wild || s.id === base.id)) {
        return { match: base, mult: base.mult };
    }
    return null;
}

function checkWins(grid) {
    const wins = [];
    PAYLINES.forEach((line, i) => {
        const symbols = line.cells.map(([r, c]) => grid[r][c]);
        const result = resolveLine(symbols);
        if (result) {
            wins.push({
                match: serializeSymbol(result.match),
                mult: result.mult,
                lineIndex: i,
                lineName: line.name,
                cells: line.cells,
            });
        }
    });
    return wins;
}

function play(bet, retentionPercent = 15) {
    const adjusted = BASE_SYMBOLS.map((s) => ({
        ...s,
        weight: Math.max(1, adjustWeight(s.weight, s.wild ? 0 : s.mult, retentionPercent)),
    }));
    const totalWeight = adjusted.reduce((s, x) => s + x.weight, 0);

    const grid = generateGrid(adjusted, totalWeight);
    const wins = checkWins(grid);
    let payout = 0;
    wins.forEach((w) => { payout += Math.floor(bet * w.mult); });

    return {
        grid: grid.map((row) => row.map(serializeSymbol)),
        wins,
        payout,
        net: payout - bet,
    };
}

module.exports = { BASE_SYMBOLS, PAYLINES, play };
