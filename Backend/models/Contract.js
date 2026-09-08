const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    investmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investment', required: true },
    contractId: { type: String, unique: true },
    version: { type: String },
    
    originalFile: { type: String },
    signedFile: { type: String },

    status: {
        type: String,
        enum: ['NOT_SENT', 'SENT', 'DOWNLOADED', 'SIGNED_UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
        default: 'NOT_SENT'
    },
    
    sentAt: { type: Date },
    downloadedAt: { type: Date },
    uploadedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Contract', contractSchema);
