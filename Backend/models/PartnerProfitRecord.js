const mongoose = require('mongoose');

const partnerProfitRecordSchema = new mongoose.Schema({
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    investmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investment', required: true },
    dailyProfitRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyProfitRecord', required: true },
    date: { type: Date, required: true },
    
    ownershipPercentage: { type: Number, required: true },
    distributableProfit: { type: Number, required: true },
    partnerProfit: { type: Number, required: true },

    status: {
        type: String,
        enum: ['ESTIMATED', 'UNDER_REVIEW', 'APPROVED', 'PAID', 'REVERSED'],
        default: 'ESTIMATED'
    },
    
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    paidAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('PartnerProfitRecord', partnerProfitRecordSchema);
