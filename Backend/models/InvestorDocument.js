const mongoose = require('mongoose');

const investorDocumentSchema = new mongoose.Schema({
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    type: { type: String, required: true },
    file: { type: String, required: true },
    status: { type: String, default: 'ACTIVE' }
}, { timestamps: true });

module.exports = mongoose.model('InvestorDocument', investorDocumentSchema);
