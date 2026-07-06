const SEGMENTS = [
    { label: '0×', multiplier: 0, weight: 28 },
    { label: '0.5×', multiplier: 0.5, weight: 18 },
    { label: '1×', multiplier: 1, weight: 16 },
    { label: '2×', multiplier: 2, weight: 14 },
    { label: '3×', multiplier: 3, weight: 10 },
    { label: '5×', multiplier: 5, weight: 7 },
    { label: '10×', multiplier: 10, weight: 4 },
    { label: '20×', multiplier: 20, weight: 3 },
];

const totalWeight = SEGMENTS.reduce((s, seg) => s + seg.weight, 0);

function pickSegment() {
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < SEGMENTS.length; i++) {
        roll -= SEGMENTS[i].weight;
        if (roll <= 0) return { ...SEGMENTS[i], index: i };
    }
    const last = SEGMENTS.length - 1;
    return { ...SEGMENTS[last], index: last };
}

function play(bet) {
    const segment = pickSegment();
    const payout = Math.floor(bet * segment.multiplier);
    const net = payout - bet;
    return {
        segment: {
            label: segment.label,
            multiplier: segment.multiplier,
            index: segment.index,
        },
        payout,
        net,
    };
}

module.exports = { SEGMENTS, play };
