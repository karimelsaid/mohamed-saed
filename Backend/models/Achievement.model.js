const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true }, // e.g., 'FIRST_BOOK', 'READING_MARATHON'
    title: { type: String, required: true },
    description: { type: String },
    icon: { type: String },
    requirements: {
        type: { type: String, enum: ['books_read', 'reading_time_total', 'streak_length'], required: true },
        value: { type: Number, required: true }
    },
    xpReward: { type: Number, default: 50 }
}, { timestamps: true });

module.exports = mongoose.model('Achievement', achievementSchema);
