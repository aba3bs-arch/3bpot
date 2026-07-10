const { adjustWeight } = require('./retention');

/**
 * Rancho Lazo — economía ~40% RTP (60% retención casa).
 * Cerdo ×0.5 | Vaca ×1.5 | Toro ×8
 */
const OUTCOMES = [
    { id: 'miss', label: 'Fallaste', kind: null, mult: 0, weight: 24 },
    { id: 'escape', label: 'Escapó', kind: 'cow', mult: 0, weight: 16 },
    { id: 'pig', label: 'Cerdo', kind: 'pig', mult: 0.5, weight: 42 },
    { id: 'cow', label: 'Vaca', kind: 'cow', mult: 1.5, weight: 15 },
    { id: 'bull', label: 'Toro', kind: 'bull', mult: 8, weight: 3 },
];

function play(bet, retentionPercent = 60) {
    // Rancho Lazo apunta a ~60% casa; el admin mueve un poco
    const admin = Number(retentionPercent) || 60;
    const r = Math.max(50, Math.min(70, admin));
    const adjusted = OUTCOMES.map((o) => ({
        ...o,
        weight: Math.max(1, adjustWeight(o.weight, o.mult, r)),
    }));
    const total = adjusted.reduce((s, o) => s + o.weight, 0);
    let roll = Math.random() * total;
    let picked = adjusted[adjusted.length - 1];
    for (const o of adjusted) {
        roll -= o.weight;
        if (roll <= 0) {
            picked = o;
            break;
        }
    }

    const caught = picked.mult > 0;
    const payout = caught ? Math.max(1, Math.round(bet * picked.mult)) : 0;

    return {
        outcome: picked.id,
        label: picked.label,
        kind: picked.kind,
        mult: picked.mult,
        caught,
        escaped: picked.id === 'escape',
        missed: picked.id === 'miss',
        payout,
        net: payout - bet,
        animal: picked.kind
            ? {
                kind: picked.kind,
                label: picked.label,
                mult: picked.mult,
            }
            : null,
    };
}

module.exports = { OUTCOMES, play };
