const prizes = [
    { label: 'Prize 1', probability: 0 },
    { label: 'Prize 2', probability: 0 },
    { label: 'Prize 3', probability: 0 },
    { label: 'Prize 4', probability: 0 }
];

function simulateSpin(prizes) {
    const sumOfProbabilities = prizes.reduce((sum, p) => sum + (p.probability || 0), 0);

    let selectedPrize;
    let randomValue;
    let totalWeight;

    if (sumOfProbabilities === 0) {
        totalWeight = prizes.length;
        randomValue = Math.random() * totalWeight;
        const selectedIndex = Math.floor(randomValue);
        selectedPrize = prizes[selectedIndex];
    } else {
        totalWeight = sumOfProbabilities;
        randomValue = Math.random() * totalWeight;

        let cumulativeProbability = 0;
        selectedPrize = prizes[prizes.length - 1];

        for (let i = 0; i < prizes.length; i++) {
            cumulativeProbability += (prizes[i].probability || 0);
            if (randomValue < cumulativeProbability) {
                selectedPrize = prizes[i];
                break;
            }
        }
    }
    return selectedPrize.label;
}

const stats = {};
const iterations = 10000;

console.log(`Simulating ${iterations} spins with equal weights (all zeros)...`);
for (let i = 0; i < iterations; i++) {
    const winner = simulateSpin(prizes);
    stats[winner] = (stats[winner] || 0) + 1;
}
console.log(stats);

const weightedPrizes = [
    { label: 'Rare (5%)', probability: 0.05 },
    { label: 'Common (45%)', probability: 0.45 },
    { label: 'Gold (10%)', probability: 0.1 },
    { label: 'Silver (40%)', probability: 0.4 }
];

const stats2 = {};
console.log(`\nSimulating ${iterations} spins with weighted probabilities...`);
for (let i = 0; i < iterations; i++) {
    const winner = simulateSpin(weightedPrizes);
    stats2[winner] = (stats2[winner] || 0) + 1;
}
console.log(stats2);
