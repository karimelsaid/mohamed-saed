const mongoose = require('mongoose');

const systemSettingsSchema = mongoose.Schema({
    gamification: {
        loginPoints: { type: Number, default: 10 },
        readingPointsPerMinute: { type: Number, default: 1 },
        referralPoints: { type: Number, default: 50 },
        streakBonus7Days: { type: Number, default: 100 },
        streakBonus30Days: { type: Number, default: 500 },
        reviewPoints: { type: Number, default: 20 }
    },
    economy: {
        coinExchangeRate: { type: Number, default: 50 }, // 50 Coins = 1 EGP
        minimumWithdrawal: { type: Number, default: 500 }
    },
    subscription: {
        monthlyPrice: { type: Number, default: 50 },
        yearlyPrice: { type: Number, default: 500 }
    },
    notificationSchedules: {
        streakSaver: { hour: { type: Number, default: 20 }, minute: { type: Number, default: 0 } },
        dailyReward: { hour: { type: Number, default: 9 }, minute: { type: Number, default: 0 } },
        dailyWisdom: { hour: { type: Number, default: 14 }, minute: { type: Number, default: 0 } }
    },
    maintenanceMode: { type: Boolean, default: false }
}, { timestamps: true });

// Prevent multiple settings documents - Singleton Pattern
systemSettingsSchema.statics.getInstance = async function () {
    const settings = await this.findOne();
    if (settings) return settings;
    return await this.create({});
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
