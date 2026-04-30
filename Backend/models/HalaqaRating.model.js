const mongoose = require('mongoose');

const halaqaRatingSchema = new mongoose.Schema({
    fromUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    toUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    halaqaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Halaqa',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    feedback: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['recitation', 'general'],
        default: 'recitation'
    }
}, { timestamps: true });

module.exports = mongoose.model('HalaqaRating', halaqaRatingSchema);
