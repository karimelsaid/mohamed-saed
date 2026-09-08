const mongoose = require('mongoose');

const partnershipApplicationSchema = new mongoose.Schema({
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    investmentAmount: { type: Number, required: true },
    requestedShares: { type: Number, required: true },
    status: {
        type: String,
        enum: [
            'NEW', 'UNDER_REVIEW', 'CONTACTED', 'APPROVED_FOR_CONTRACT',
            'CONTRACT_SENT', 'CONTRACT_UPLOADED', 'PAYMENT_PENDING',
            'PAYMENT_UPLOADED', 'FINAL_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'
        ],
        default: 'NEW'
    },
    adminNotes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('PartnershipApplication', partnershipApplicationSchema);
