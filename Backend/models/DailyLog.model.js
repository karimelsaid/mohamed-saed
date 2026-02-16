const mongoose = require('mongoose');

const dailyLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // Format "YYYY-MM-DD"
    minutesRead: { type: Number, default: 0 },
    pagesRead: { type: Number, default: 0 }
}, { timestamps: true });

// Compound index for user and date
dailyLogSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyLog', dailyLogSchema);
