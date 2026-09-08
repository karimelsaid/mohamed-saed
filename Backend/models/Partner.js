const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    partnerId: { type: String, unique: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    partnerType: { type: String },
    status: {
        type: String,
        enum: ['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'],
        default: 'PENDING'
    },
    notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Partner', partnerSchema);
