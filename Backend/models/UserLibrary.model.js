const mongoose = require('mongoose');

const userLibrarySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    ebookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ebook',
        required: true,
        index: true
    },
    acquiredVia: {
        type: String,
        enum: ['purchase', 'bundle', 'gift', 'promotion'],
        required: true
    },
    acquiredDate: {
        type: Date,
        default: Date.now,
        required: true
    },
    relatedPhysicalOrderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    relatedProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    },
    pricePaid: {
        type: Number,
        default: 0
    },
    lastAccessedAt: {
        type: Date
    },
    accessCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Compound index to prevent duplicate entries
userLibrarySchema.index({ userId: 1, ebookId: 1 }, { unique: true });

// Index for efficient queries
userLibrarySchema.index({ userId: 1, acquiredDate: -1 });

// Static method to check if user owns an ebook
userLibrarySchema.statics.userOwnsEbook = async function (userId, ebookId) {
    const entry = await this.findOne({ userId, ebookId });
    return !!entry;
};

// Static method to add ebook to user's library
userLibrarySchema.statics.addToLibrary = async function (userId, ebookId, acquiredVia, additionalData = {}) {
    try {
        const entry = await this.create({
            userId,
            ebookId,
            acquiredVia,
            ...additionalData
        });
        return entry;
    } catch (error) {
        // If duplicate, return existing entry
        if (error.code === 11000) {
            return await this.findOne({ userId, ebookId });
        }
        throw error;
    }
};

module.exports = mongoose.model('UserLibrary', userLibrarySchema);
