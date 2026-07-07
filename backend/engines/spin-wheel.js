const { buildWeights, pickWeighted } = require('./retention');

const BASE_SEGMENTS = [
    { label: '0×', multiplier: 0, weight: 28 },
    { label: '0.5×', multiplier: 0.5, weight: 18 },
    { label: '1×', multiplier: 1, weight: 16 },
    { label: '2×', multiplier: 2, weight: 14 },
    { label: '3×', multiplier: 3, weight: 10 },
    { label: '5×', multiplier: 5, weight: 7 },
    { label: '10×', multiplier: 10, weight: 4 },
    { label: '20×', multiplier: 20, weight: 3 },
];

function play(bet, retentionPercent = 15) {
    const { segments, totalWeight } = buildWeights(BASE_SEGMENTS, retentionPercent);
    const { item, index } = pickWeighted(segments, totalWeight);
    const payout = Math.floor(bet * item.multiplier);
    return {
        segment: { label: item.label, multiplier: item.multiplier, index },
        payout,
        net: payout - bet,
    };
}

module.exports = { BASE_SEGMENTS, play };
