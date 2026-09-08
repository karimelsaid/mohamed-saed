const mongoose = require('mongoose');

const shareholderSchema = new mongoose.Schema({
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    shares: { type: Number, required: true },
    ownershipPercentage: { type: Number, required: true },
    status: { type: String, default: 'ACTIVE' }
}, { timestamps: true });

module.exports = mongoose.model('Shareholder', shareholderSchema);
