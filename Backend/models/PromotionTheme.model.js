const mongoose = require('mongoose');

const promotionThemeSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g., "Ramadan", "Eid Al-Adha"
    slug: { type: String, unique: true, sparse: true }, // auto-generated, sparse allows multiple nulls
    isActive: { type: Boolean, default: false },
    startDate: { type: Date },
    endDate: { type: Date },
    themeConfig: {
        primaryColor: { type: String, default: '#8b5cf6' },
        secondaryColor: { type: String, default: '#ede9fe' },
        accentColor: { type: String, default: '#f59e0b' },
        backgroundImage: { type: String },
        heroBanner: { type: String },
        fontFamily: { type: String },
        icons: {
            wheel: { type: String },
            package: { type: String }
        }
    },
    luckyWheel: {
        isEnabled: { type: Boolean, default: true },
        spinLimitPerUser: { type: Number, default: 1 },
        prizes: [{
            type: { type: String, enum: ['coupon', 'book', 'points', 'nothing'], required: true },
            value: { type: mongoose.Schema.Types.Mixed }, // Coupon code, Product ID(s), or points amount
            label: { type: String, required: true },
            quantity: { type: Number, default: 1 }, // Number of items per win (e.g., 2 books)
            probability: { type: Number, default: 0.1 }, // 0.0 to 1.0
            icon: { type: String }
        }]
    }
}, { timestamps: true });

module.exports = mongoose.model('PromotionTheme', promotionThemeSchema);
