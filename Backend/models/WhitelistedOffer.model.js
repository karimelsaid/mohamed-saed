const mongoose = require('mongoose');

const whitelistedOfferSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { 
        type: String, 
        required: true, 
        enum: ['discount', 'free_months', 'free_days', 'lifetime'] 
    },
    value: { type: Number, default: 0 }, // Discount %, number of months/days
    isClaimed: { type: Boolean, default: false },
    isWelcomed: { type: Boolean, default: false }, // To show the surprise popup only once
    notes: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('WhitelistedOffer', whitelistedOfferSchema);
