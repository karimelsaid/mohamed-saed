const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema({
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnershipSettings' },
    
    investmentAmount: { type: Number, required: true },
    sharesPurchased: { type: Number, required: true },
    ownershipPercentage: { type: Number, required: true },

    companyValuationAtPurchase: { type: Number, required: true },
    sharePriceAtPurchase: { type: Number, required: true },
    totalSharesAtPurchase: { type: Number, required: true },

    status: {
        type: String,
        enum: ['PENDING', 'ACTIVE', 'CANCELLED'],
        default: 'PENDING'
    },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    activatedAt: { type: Date },
    cancellationDeadline: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Investment', investmentSchema);
