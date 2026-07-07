const { buildWeights, pickWeighted } = require('./retention');

const BASE_SYMBOLS = [
    { id: 'poop', emoji: '💩', name: 'Caca Dorada', mult: 2, weight: 22 },
    { id: 'banana', emoji: '🍌', name: 'Plátano Loco', mult: 3, weight: 20 },
    { id: 'taco', emoji: '🌮', name: 'Taco Volador', mult: 4, weight: 18 },
    { id: 'donut', emoji: '🍩', name: 'Donut Galáctico', mult: 6, weight: 14 },
    { id: 'alien', emoji: '👽', name: 'Alien Chismoso', mult: 8, weight: 10 },
    { id: 'clown', emoji: '🤡', name: 'Payaso VIP', mult: 12, weight: 7 },
    { id: 'unicorn', emoji: '🦄', name: 'Jackpot', mult: 25, weight: 3 },
    { id: 'wild', emoji: '🎭', name: 'Comodín', mult: 0, weight: 6, wild: true },
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
    return { id: sym.id, emoji: sym.emoji, name: sym.name, mult: sym.mult, wild: !!sym.wild };
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
    const lines = [{ name: 'Arriba', row: 0 }, { name: 'Centro', row: 1 }, { name: 'Abajo', row: 2 }];
    const wins = [];
    lines.forEach((line, i) => {
        const symbols = [grid[line.row][0], grid[line.row][1], grid[line.row][2]];
        const result = resolveLine(symbols);
        if (result) wins.push({ match: serializeSymbol(result.match), mult: result.mult, lineIndex: i, lineName: line.name, row: line.row });
    });
    return wins;
}

function play(bet, retentionPercent = 15) {
    const adjusted = BASE_SYMBOLS.map((s) => ({
        ...s,
        multiplier: s.wild ? 0 : s.mult,
        weight: Math.max(1, require('./retention').adjustWeight(s.weight, s.wild ? 0 : s.mult, retentionPercent)),
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

module.exports = { BASE_SYMBOLS, play };
