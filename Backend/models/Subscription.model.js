const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    plan: {
        type: String,
        enum: ['monthly', 'yearly', 'lifetime', 'free_months', 'free_days'],
        default: 'monthly',
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'cancelled', 'pending'],
        default: 'pending',
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    autoRenew: {
        type: Boolean,
        default: false
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'wallet', 'cash', 'manual', 'special_offer'],
        default: 'card'
    },
    paymentSessionUrl: {
        type: String
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    cancelledAt: {
        type: Date
    },
    cancellationReason: {
        type: String
    }
}, {
    timestamps: true
});

// Index for efficient queries
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ endDate: 1 });

// Method to check if subscription is currently active
subscriptionSchema.methods.isActive = function () {
    return this.status === 'active' && this.endDate > new Date();
};

// Static method to find active subscription for a user
subscriptionSchema.statics.findActiveSubscription = function (userId) {
    return this.findOne({
        userId: userId,
        status: 'active',
        endDate: { $gt: new Date() }
    });
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
