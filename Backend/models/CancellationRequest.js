const mongoose = require('mongoose');

const cancellationRequestSchema = new mongoose.Schema({
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    investmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investment', required: true },
    reason: { type: String },
    requestedAt: { type: Date, default: Date.now },
    
    status: {
        type: String,
        enum: ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'],
        default: 'REQUESTED'
    },
    
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    adminNotes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('CancellationRequest', cancellationRequestSchema);
