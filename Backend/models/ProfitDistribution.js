const mongoose = require('mongoose');

const profitDistributionSchema = new mongoose.Schema({
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    investmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investment', required: true },
    period: { type: String, required: true },
    amount: { type: Number, required: true },
    
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'FAILED', 'CANCELLED'],
        default: 'PENDING'
    },
    
    paymentReference: { type: String },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('ProfitDistribution', profitDistributionSchema);
