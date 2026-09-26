const mongoose = require('mongoose');

const ebookSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    coverImage: {
        type: String,
        required: true
    },
    epubFilePath: {
        type: String,
        required: true,
        unique: true
    },
    miniEpubFilePath: {
        type: String
    },
    fileSize: {
        type: Number,
        required: true
    },
    category: {
        type: String,
        required: true,
        trim: true,
        default: 'غير مصنف'
    },
    language: {
        type: String,
        enum: ['العربية', 'English'],
        default: 'العربية'
    },
    publisher: {
        type: String,
        trim: true
    },
    publishYear: {
        type: Number
    },
    isbn: {
        type: String,
        trim: true
    },
    relatedProductId: {
        type: String,
        trim: true
    },
    pages: {
        type: Number
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    availableForSubscription: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'pending'],
        default: 'active'
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    viewCount: {
        type: Number,
        default: 0
    },
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    ratingCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for faster searches
ebookSchema.index({ category: 1 });
ebookSchema.index({ status: 1 });

module.exports = mongoose.model('Ebook', ebookSchema);
