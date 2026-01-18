const mongoose = require('mongoose');
const User = require('./models/User.model');

const MONGO_URI = "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz";

async function debug() {
    await mongoose.connect(MONGO_URI);
    const user = await User.findOne({ email: 'kenouz999@gmail.com' });

    if (!user) {
        console.log("User not found");
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayLog = user.mutabaa.dailyLog.find(l => l.date === today);

    console.log("--- DEBUG LOG FOR TODAY (" + today + ") ---");
    if (todayLog) {
        console.log("Muraja Log:", JSON.stringify(todayLog.muraja, null, 2));
        console.log("Hifz Log:", JSON.stringify(todayLog.hifz, null, 2));
    } else {
        console.log("No log found for today.");
    }

    console.log("--- HIFZ PLAN STATE ---");
    console.log("NewMemorization Cursor:", JSON.stringify(user.hifzPlan.cursors.newMemorization, null, 2));
    console.log("DailyCapacity:", JSON.stringify(user.hifzPlan.dailyCapacity, null, 2));

    const memorized = user.hifzPlan.memorizedContent || [];
    console.log("Total Memorized:", memorized.length);
    console.log("Last 5 Memorized:", JSON.stringify(memorized.slice(-5), null, 2));

    // Check if verses of page 142 are present
    const p142 = memorized.filter(v => v.verseKey.startsWith('6:11'));
    console.log("Verses on Page 142 (6:111-118) in DB:", p142.map(v => v.verseKey));

    mongoose.disconnect();
}

debug();
