const mongoose = require('mongoose');

const partnershipSettingsSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['OPEN', 'PAUSED', 'CLOSED'],
        default: 'CLOSED'
    },
    companyValuation: { type: Number, required: true },
    totalShares: { type: Number, required: true },
    sharePrice: { type: Number, required: true },
    sharePriceMode: {
        type: String,
        enum: ['MANUAL', 'AUTOMATIC'],
        default: 'MANUAL'
    },
    availableShares: { type: Number, required: true },
    minimumInvestment: { type: Number, required: true },
    maximumInvestment: { type: Number, required: true },

    cancellationPeriodDays: { type: Number, default: 14 },

    profitCalculationMode: { type: String, default: 'STANDARD' },
    distributableProfitPercentage: { type: Number, default: 100 },
    partnerProfitModel: { type: String, default: 'PROPORTIONAL' },
    profitApprovalRequired: { type: Boolean, default: true },

    description: { type: String },
    paymentInstructions: { type: String },
    contact: {
        phone: String,
        whatsapp: String,
        email: String
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('PartnershipSettings', partnershipSettingsSchema);
