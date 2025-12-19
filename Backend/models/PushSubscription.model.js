const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    platform: { type: String, enum: ['web', 'android', 'ios'], default: 'web' },

    // Web Push Details
    endpoint: { type: String },
    keys: {
        p256dh: { type: String },
        auth: { type: String }
    },

    // Native Push Details (FCM)
    token: { type: String },

    userAgent: { type: String },
    expirationTime: { type: Number }
}, { timestamps: true });

// Ensure unique subscription. 
// For Web: endpoint is unique.
// For Native: token is unique.
// Ensure unique subscription. 
// For Web: endpoint is unique. Use partialFilterExpression to ignore nulls.
pushSubscriptionSchema.index({ endpoint: 1 }, {
    unique: true,
    partialFilterExpression: { endpoint: { $type: "string" } }
});

pushSubscriptionSchema.index({ token: 1 }, { unique: true, sparse: true });
pushSubscriptionSchema.index({ userId: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
