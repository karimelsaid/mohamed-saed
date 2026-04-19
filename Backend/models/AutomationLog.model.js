const mongoose = require('mongoose');

const automationLogSchema = new mongoose.Schema({
    type: { 
        type: String, 
        required: true,
        enum: ['post', 'comment', 'dm', 'random_post', 'webhook_received']
    },
    platform: { 
        type: String, 
        required: true,
        enum: ['facebook', 'instagram', 'system']
    },
    status: { 
        type: String, 
        required: true,
        enum: ['success', 'failed', 'pending']
    },
    title: String,
    details: {
        caption: String,
        link: String,
        imageUrl: String,
        message: String,
        response: mongoose.Schema.Types.Mixed
    },
    error: String,
    metadata: {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        messageId: String,
        commentId: String
    }
}, { timestamps: true });

module.exports = mongoose.model('AutomationLog', automationLogSchema);
