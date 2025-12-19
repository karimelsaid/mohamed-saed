const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ['reading_time', 'books_read', 'streak_length'], required: true },
    targetValue: { type: Number, required: true }, // e.g., 60 minutes, 3 books
    startDate: { type: Date },
    endDate: { type: Date },
    xpReward: { type: Number, required: true },
    badgeIcon: { type: String }, // URL
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Challenge', challengeSchema);
