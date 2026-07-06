const SYMBOLS = [
    { id: 'poop', emoji: '💩', name: 'Caca Dorada', mult: 2, weight: 22 },
    { id: 'banana', emoji: '🍌', name: 'Plátano Loco', mult: 3, weight: 20 },
    { id: 'taco', emoji: '🌮', name: 'Taco Volador', mult: 4, weight: 18 },
    { id: 'donut', emoji: '🍩', name: 'Donut Galáctico', mult: 6, weight: 14 },
    { id: 'alien', emoji: '👽', name: 'Alien Chismoso', mult: 8, weight: 10 },
    { id: 'clown', emoji: '🤡', name: 'Payaso VIP', mult: 12, weight: 7 },
    { id: 'unicorn', emoji: '🦄', name: 'Unicornio Jackpot', mult: 25, weight: 3 },
    { id: 'wild', emoji: '🎭', name: 'Comodín', mult: 0, weight: 6, wild: true },
];

const PAYLINES = [
    { name: 'Arriba', row: 0 },
    { name: 'Centro', row: 1 },
    { name: 'Abajo', row: 2 },
];

const totalWeight = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);

function pickSymbol() {
    let roll = Math.random() * totalWeight;
    for (const sym of SYMBOLS) {
        roll -= sym.weight;
        if (roll <= 0) return sym;
    }
    return SYMBOLS[SYMBOLS.length - 1];
}

function serializeSymbol(sym) {
    return {
        id: sym.id,
        emoji: sym.emoji,
        name: sym.name,
        mult: sym.mult,
        wild: !!sym.wild,
    };
}

function generateGrid() {
    const grid = [];
    for (let r = 0; r < 3; r++) {
        grid[r] = [];
        for (let c = 0; c < 3; c++) {
            grid[r][c] = pickSymbol();
        }
    }
    return grid;
}

function resolveLine(symbols) {
    const nonWild = symbols.filter((s) => !s.wild);
    if (nonWild.length === 0) {
        return { match: symbols[0], count: 3, mult: 25 };
    }
    const base = nonWild[0];
    const allSameOrWild = symbols.every((s) => s.wild || s.id === base.id);
    if (allSameOrWild) {
        return { match: base, count: 3, mult: base.mult };
    }
    return null;
}

function checkWins(grid) {
    const wins = [];
    PAYLINES.forEach((line, i) => {
        const symbols = [grid[line.row][0], grid[line.row][1], grid[line.row][2]];
        const result = resolveLine(symbols);
        if (result) {
            wins.push({
                match: serializeSymbol(result.match),
                mult: result.mult,
                lineIndex: i,
                lineName: line.name,
                row: line.row,
            });
        }
    });
    return wins;
}

function play(bet) {
    const grid = generateGrid();
    const wins = checkWins(grid);
    let payout = 0;
    wins.forEach((w) => {
        payout += Math.floor(bet * w.mult);
    });
    const net = payout - bet;

    const gridOut = grid.map((row) => row.map(serializeSymbol));

    return {
        grid: gridOut,
        wins,
        payout,
        net,
    };
}

module.exports = { SYMBOLS, play };
