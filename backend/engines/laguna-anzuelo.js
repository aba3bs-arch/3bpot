const { adjustWeight } = require('./retention');

/**
 * Laguna Anzuelo — pesca de peces de colores en pesos MXN.
 * Entre más valioso el pez, más grande y más se resiste (mayor mult, mayor "resist").
 * Piraña rompe la cuerda y se pierde el lance (igual que un fallo).
 */
const OUTCOMES = [
    { id: 'miss', label: 'Fallaste', fishId: null, mult: 0, resist: 0, weight: 26 },
    { id: 'piranha', label: 'Piraña', fishId: 'piranha', mult: 0, resist: 0, weight: 14, piranha: true },
    { id: 'f025', label: '$0.25', fishId: 'f025', mult: 0.3, resist: 1.2, weight: 30 },
    { id: 'f050', label: '$0.50', fishId: 'f050', mult: 0.6, resist: 1.8, weight: 22 },
    { id: 'f1', label: '$1.00', fishId: 'f1', mult: 1.2, resist: 2.6, weight: 16 },
    { id: 'f3', label: '$3.00', fishId: 'f3', mult: 3, resist: 3.8, weight: 8 },
    { id: 'f5', label: '$5.00', fishId: 'f5', mult: 5, resist: 5.2, weight: 4 },
    { id: 'f10', label: '$10.00', fishId: 'f10', mult: 10, resist: 7, weight: 2 },
];

function play(bet, retentionPercent = 15) {
    const adjusted = OUTCOMES.map((o) => ({
        ...o,
        weight: Math.max(1, adjustWeight(o.weight, o.mult, retentionPercent)),
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

    const caught = !picked.piranha && picked.mult > 0;
    const payout = caught ? Math.max(1, Math.round(bet * picked.mult)) : 0;

    return {
        outcome: picked.id,
        label: picked.label,
        fishId: picked.fishId,
        mult: picked.mult,
        resist: picked.resist,
        caught,
        piranha: !!picked.piranha,
        missed: picked.id === 'miss',
        payout,
        net: payout - bet,
        fish: caught
            ? { fishId: picked.fishId, label: picked.label, mult: picked.mult, resist: picked.resist }
            : null,
    };
}

module.exports = { OUTCOMES, play };
