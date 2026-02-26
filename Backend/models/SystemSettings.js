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
    quranPoints: {
        VERSE_MEMORIZED: { type: Number, default: 5 },
        PAGE_COMPLETE: { type: Number, default: 10 },
        HIZB_COMPLETE: { type: Number, default: 50 },
        JUZ_COMPLETE: { type: Number, default: 100 },
        DAILY_STREAK: { type: Number, default: 20 },
        KHATMA_COMPLETE: { type: Number, default: 1000 },
        REVISION_PAGE_COMPLETE: { type: Number, default: 5 },
        REVISION_VERSE_COMPLETE: { type: Number, default: 2 }
    },
    economy: {
        coinExchangeRate: { type: Number, default: 50 }, // For Store/EPUB
        quranPointsPerEGP: { type: Number, default: 500 }, // For Quran
        quranMinConversionPoints: { type: Number, default: 5 },
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
    printing: {
        paperTypes: [{
            name: { type: String, required: true }, // A4, A3, etc.
            prices: {
                white: { type: Number, default: 0 },
                yellow: { type: Number, default: 0 },
                creamy: { type: Number, default: 0 }
            }
        }],
        printers: [{
            name: { type: String, required: true },
            inkPriceColor: { type: Number, default: 0 }, // Cost of full color set
            inkPriceBW: { type: Number, default: 0 },    // Cost of black ink
            pageYieldColor: { type: Number, default: 0 }, // Pages per 100% color
            pageYieldBW: { type: Number, default: 0 },    // Pages per 100% BW
            inkLevels: {
                black: { type: Number, default: 100 },
                cyan: { type: Number, default: 100 },
                magenta: { type: Number, default: 100 },
                yellow: { type: Number, default: 100 }
            },
            lastUpdatedPages: { type: Number, default: 0 }
        }],
        coverPrices: {
            soft: { type: Number, default: 25.0 },
            hard: { type: Number, default: 60.0 },
            luxuryLeather: { type: Number, default: 100.0 }
        }
    },
    maintenanceMode: { type: Boolean, default: false },
    shortageSettings: {
        threshold: { type: Number, default: 10 },
        categories: [{ type: String }],
        includeSuggestions: { type: Boolean, default: false },
        defaultOrderQuantity: { type: Number, default: 1 },
        orderQuantities: { type: Map, of: Number, default: {} } // products_id -> quantity
    }
}, { timestamps: true });

// Prevent multiple settings documents - Singleton Pattern
systemSettingsSchema.statics.getInstance = async function () {
    const settings = await this.findOne();
    if (settings) return settings;
    return await this.create({});
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
