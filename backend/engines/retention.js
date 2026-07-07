/**
 * Ajusta pesos de premios según retención de la casa (% que se queda el negocio).
 * retention 15 = casa retiene ~15%, menos premios grandes.
 */
function adjustWeight(weight, multiplier, retention) {
    const r = Math.max(0, Math.min(50, retention)) / 100;
    if (multiplier === 0) return weight * (1 + r * 2.5);
    if (multiplier <= 1) return weight * (1 + r * 1.2);
    if (multiplier <= 3) return weight * (1 + r * 0.4);
    if (multiplier <= 6) return weight / (1 + r * 1.5);
    return weight / (1 + r * 3);
}

function buildWeights(segments, retentionPercent) {
    const adjusted = segments.map((seg) => ({
        ...seg,
        weight: Math.max(1, adjustWeight(seg.weight, seg.multiplier ?? seg.mult ?? 0, retentionPercent)),
    }));
    const total = adjusted.reduce((s, seg) => s + seg.weight, 0);
    return { segments: adjusted, totalWeight: total };
}

function pickWeighted(segments, totalWeight) {
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < segments.length; i++) {
        roll -= segments[i].weight;
        if (roll <= 0) return { item: segments[i], index: i };
    }
    const last = segments.length - 1;
    return { item: segments[last], index: last };
}

module.exports = { buildWeights, pickWeighted, adjustWeight };
