const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    message: { type: String },
    status: { type: String, default: 'completed', enum: ['pending', 'completed', 'failed'] },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Donation', donationSchema);
