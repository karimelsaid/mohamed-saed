const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz';

async function debug() {
    await mongoose.connect(MONGO_URI);
    const user = await User.findOne({ email: 'kenouz999@gmail.com' });
    if (!user) {
        console.log('User not found');
        process.exit();
    }

    const memorized = user.hifzPlan?.memorizedContent || [];
    const sorted = [...memorized]
        .filter(v => v.lastReviewed)
        .sort((a, b) => new Date(b.lastReviewed) - new Date(a.lastReviewed));

    console.log(`Total memorized: ${memorized.length}`);
    console.log(`Total with timestamps: ${sorted.length}`);

    const wirds = [];
    if (sorted.length > 0) {
        let currentWird = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const prevTime = new Date(sorted[i - 1].lastReviewed).getTime();
            const currTime = new Date(sorted[i].lastReviewed).getTime();
            if (Math.abs(prevTime - currTime) <= 2 * 60 * 1000) {
                currentWird.push(sorted[i]);
            } else {
                wirds.push(currentWird);
                currentWird = [sorted[i]];
            }
        }
        if (currentWird.length > 0) wirds.push(currentWird);
    }

    console.log(`Detected ${wirds.length} wirds:`);
    wirds.forEach((w, idx) => {
        const start = w[0].verseKey;
        const end = w[w.length - 1].verseKey;
        const time = new Date(w[0].lastReviewed).toISOString();
        console.log(`Wird ${idx + 1}: [${time}] ${start} to ${end} (${w.length} verses)`);
    });

    process.exit();
}

debug();
