const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    halaqaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Halaqa', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true }, // Text content or URL for media
    type: {
        type: String,
        enum: ['text', 'image', 'audio', 'voice', 'system', 'announcement', 'file'],
        default: 'text'
    },
    // Phase 2 features
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isPinned: { type: Boolean, default: false },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    pinnedAt: { type: Date, default: null },

    fileMetadata: {
        name: String,
        size: Number,
        mimeType: String
    },

    isDeleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster queries by halaqa and time
messageSchema.index({ halaqaId: 1, createdAt: -1 });
messageSchema.index({ replyTo: 1 }); // For finding threads
messageSchema.index({ halaqaId: 1, isPinned: 1, createdAt: -1 }); // For pinned list

module.exports = mongoose.model('Message', messageSchema);
