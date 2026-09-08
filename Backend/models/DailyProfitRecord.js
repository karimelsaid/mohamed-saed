const mongoose = require('mongoose');

const dailyProfitRecordSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    
    grossSales: { type: Number, default: 0 },
    cogs: { type: Number, default: 0 },
    shippingExpenses: { type: Number, default: 0 },
    paymentFees: { type: Number, default: 0 },
    marketingExpenses: { type: Number, default: 0 },
    operatingExpenses: { type: Number, default: 0 },
    returns: { type: Number, default: 0 },
    otherExpenses: { type: Number, default: 0 },

    netProfit: { type: Number, required: true },
    distributableProfit: { type: Number, required: true },

    status: {
        type: String,
        enum: ['ESTIMATED', 'UNDER_REVIEW', 'APPROVED', 'PAID', 'REVERSED'],
        default: 'ESTIMATED'
    },
    
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('DailyProfitRecord', dailyProfitRecordSchema);
