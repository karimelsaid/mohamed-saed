const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    investmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investment', required: true },
    
    amount: { type: Number, required: true },
    method: { type: String },
    referenceNumber: { type: String },
    paymentDate: { type: Date },
    receiptFile: { type: String },

    status: {
        type: String,
        enum: ['PAYMENT_PENDING', 'PAYMENT_UPLOADED', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED'],
        default: 'PAYMENT_PENDING'
    },
    
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
