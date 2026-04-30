const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true },
    maxUses: { type: Number, default: 100 }, // Total times it can be used globally
    uses: { type: Number, default: 0 },
    maxUsers: { type: Number, default: 1 }, // Max times a single user can use it
    minOrderAmount: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number }, // For percentage coupons
    minPrice: { type: Number }, // Target product price range
    maxPrice: { type: Number },
    maxProducts: { type: Number, default: 0 }, // 0 means unlimited
    maxQtyPerProduct: { type: Number, default: 0 }, // 0 means unlimited
    isActive: { type: Boolean, default: true },
    durationValue: { type: Number },
    durationUnit: { type: String, enum: ['hours', 'days'], default: 'days' },
    expiryDate: { type: Date },
    usedBy: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 0 }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);
