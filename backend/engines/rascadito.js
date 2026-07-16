const { buildWeights, pickWeighted, adjustWeight } = require('./retention');

/**
 * Rascadito — más reintegros que premios grandes.
 * Premios grandes limitados al fondo acumulado de depósitos (menos retención casa).
 */
const SYMBOLS = [
    { id: 'cherry', emoji: '🍒', label: 'Cereza', mult: 0.5 },
    { id: 'lemon', emoji: '🍋', label: 'Limón', mult: 1 },
    { id: 'bell', emoji: '🔔', label: 'Campana', mult: 2 },
    { id: 'star', emoji: '⭐', label: 'Estrella', mult: 5 },
    { id: 'diamond', emoji: '💎', label: 'Diamante', mult: 10 },
    { id: 'jackpot', emoji: '7️⃣', label: 'Jackpot', mult: 25 },
];

const BASE_TIERS = [
    { mult: 0, label: 'Sin premio', weight: 38, symbolId: null },
    { mult: 0.5, label: 'Reintegro 50%', weight: 30, symbolId: 'cherry' },
    { mult: 1, label: 'Reintegro total', weight: 20, symbolId: 'lemon' },
    { mult: 2, label: 'Premio ×2', weight: 8, symbolId: 'bell' },
    { mult: 5, label: 'Premio ×5', weight: 3, symbolId: 'star' },
    { mult: 10, label: 'Gran premio ×10', weight: 0.8, symbolId: 'diamond' },
    { mult: 25, label: 'Jackpot ×25', weight: 0.2, symbolId: 'jackpot' },
];

const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

function symbolById(id) {
    return SYMBOLS.find((s) => s.id === id) || SYMBOLS[0];
}

function symbolForMult(mult) {
    const tier = BASE_TIERS.find((t) => t.mult === mult && t.symbolId);
    return symbolById(tier?.symbolId || 'cherry');
}

function pickTier(retentionPercent) {
    const tiers = BASE_TIERS.map((t) => ({
        ...t,
        weight: Math.max(0.1, adjustWeight(t.weight, t.mult, retentionPercent)),
    }));
    const total = tiers.reduce((s, t) => s + t.weight, 0);
    return pickWeighted(tiers, total).item;
}

function capTierByPool(tier, bet, poolAvailable) {
    if (tier.mult === 0) return tier;
    if (Math.floor(bet * tier.mult) <= poolAvailable) return tier;
    const sorted = [...BASE_TIERS].filter((t) => t.mult > 0).sort((a, b) => b.mult - a.mult);
    for (const candidate of sorted) {
        if (Math.floor(bet * candidate.mult) <= poolAvailable) return candidate;
    }
    return BASE_TIERS[0];
}

function countSymbol(grid, id) {
    return grid.filter((c) => c === id).length;
}

function hasWinningLine(grid) {
    for (const line of WIN_LINES) {
        const a = grid[line[0]];
        const b = grid[line[1]];
        const c = grid[line[2]];
        if (a && a === b && b === c) return line;
    }
    return null;
}

function pickFillerSymbol(grid, index, winLine, winSymbolId) {
    const inWinLine = winLine.includes(index);
    const counts = {};
    for (let i = 0; i < 9; i++) {
        if (grid[i]) counts[grid[i]] = (counts[grid[i]] || 0) + 1;
    }
    const options = SYMBOLS.filter((s) => {
        if (inWinLine) return false;
        if (s.id === winSymbolId) return (counts[s.id] || 0) < 2;
        return (counts[s.id] || 0) < 2;
    });
    if (!options.length) return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id;
    return options[Math.floor(Math.random() * options.length)].id;
}

function buildWinningGrid(symbolId) {
    const grid = Array(9).fill(null);
    const winLine = WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)];
    for (const i of winLine) grid[i] = symbolId;
    for (let i = 0; i < 9; i++) {
        if (grid[i]) continue;
        grid[i] = pickFillerSymbol(grid, i, winLine, symbolId);
    }
    return { grid, winLine };
}

function buildLosingGrid() {
    for (let attempt = 0; attempt < 40; attempt++) {
        const grid = Array(9).fill(null);
        for (let i = 0; i < 9; i++) {
            grid[i] = pickFillerSymbol(grid, i, [], null);
        }
        if (!hasWinningLine(grid)) return { grid, winLine: null };
    }
    const grid = ['cherry', 'lemon', 'bell', 'star', 'diamond', 'jackpot', 'cherry', 'lemon', 'bell'];
    return { grid, winLine: null };
}

function buildGridForTier(tier) {
    if (!tier.mult) return buildLosingGrid();
    const sym = symbolForMult(tier.mult);
    return buildWinningGrid(sym.id);
}

function play(bet, retentionPercent = 15, poolInfo = {}) {
    const poolAvailable = Math.max(0, Number(poolInfo.available) || 0);
    let tier = pickTier(retentionPercent);

    if (tier.mult > 0) {
        tier = capTierByPool(tier, bet, poolAvailable);
    }

    const payout = Math.floor(bet * tier.mult);
    const { grid, winLine } = buildGridForTier(tier);
    const cells = grid.map((id) => {
        const sym = symbolById(id);
        return { id: sym.id, emoji: sym.emoji, label: sym.label, mult: sym.mult };
    });

    return {
        payout,
        net: payout - bet,
        mult: tier.mult,
        label: tier.label,
        winLine,
        cells,
        poolUsed: payout,
        poolAvailableBefore: poolAvailable,
        poolAvailableAfter: Math.max(0, poolAvailable - payout),
        reintegro: tier.mult > 0 && tier.mult <= 1,
    };
}

module.exports = { SYMBOLS, BASE_TIERS, play };
