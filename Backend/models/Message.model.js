const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    halaqaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Halaqa', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true }, // Text content or URL for media
    type: {
        type: String,
        enum: ['text', 'image', 'audio', 'system'],
        default: 'text'
    },
    isDeleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster queries by halaqa and time
messageSchema.index({ halaqaId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
