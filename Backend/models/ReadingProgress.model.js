const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
    cfi: {
        type: String,
        required: true
    },
    label: {
        type: String,
        default: 'إشارة مرجعية'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const highlightSchema = new mongoose.Schema({
    cfi: {
        type: String,
        required: true
    },
    cfiRange: {
        type: String
    },
    text: {
        type: String,
        required: true
    },
    color: {
        type: String,
        default: '#fef08a'
        // Removed enum restriction to allow any color
    },
    note: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const readingProgressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    ebookId: {
        type: String, // Changed from ObjectId to support external IDs (ext_...)
        required: true,
        index: true
    },
    currentCfi: {
        type: String,
        default: ''
    },
    currentPage: {
        type: Number,
        default: 0
    },
    totalPages: {
        type: Number,
        default: 0
    },
    progressPercent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    lastReadAt: {
        type: Date,
        default: Date.now
    },
    bookmarks: [bookmarkSchema],
    highlights: [highlightSchema],
    settings: {
        fontSize: {
            type: Number,
            default: 16,
            min: 12,
            max: 32
        },
        fontFamily: {
            type: String,
            default: 'Arial',
            enum: ['Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Cairo', 'Amiri']
        },
        theme: {
            type: String,
            default: 'light',
            enum: ['light', 'dark', 'sepia']
        },
        backgroundColor: {
            type: String,
            default: '#ffffff'
        },
        textColor: {
            type: String,
            default: '#000000'
        },
        lineHeight: {
            type: Number,
            default: 1.6,
            min: 1.0,
            max: 3.0
        },
        autoScrollSpeed: {
            type: Number,
            default: 200,
            min: 50,
            max: 500
        }
    },
    readingTimeMinutes: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Compound index to ensure one progress per user per ebook
readingProgressSchema.index({ userId: 1, ebookId: 1 }, { unique: true });

// Update lastReadAt on save
readingProgressSchema.pre('save', function (next) {
    this.lastReadAt = new Date();
    next();
});

// Method to add bookmark
readingProgressSchema.methods.addBookmark = function (cfi, label) {
    this.bookmarks.push({ cfi, label });
    return this.save();
};

// Method to remove bookmark
readingProgressSchema.methods.removeBookmark = function (bookmarkId) {
    this.bookmarks.pull(bookmarkId);
    return this.save();
};

// Method to add highlight
readingProgressSchema.methods.addHighlight = function (cfi, text, color, note, cfiRange) {
    this.highlights.push({ cfi, text, color, note, cfiRange });
    return this.save();
};

// Method to remove highlight
readingProgressSchema.methods.removeHighlight = function (highlightId) {
    this.highlights.pull(highlightId);
    return this.save();
};

// Method to update reading position
readingProgressSchema.methods.updatePosition = function (cfi, page, percent) {
    this.currentCfi = cfi;
    this.currentPage = page;
    this.progressPercent = percent;
    return this.save();
};

module.exports = mongoose.model('ReadingProgress', readingProgressSchema);
