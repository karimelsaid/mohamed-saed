const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional, user might be guest
    username: { type: String },
    email: { type: String },
    content: { type: String, required: true },
    page: { type: Number }, // Might be useful to know where they were in the Mushaf
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
