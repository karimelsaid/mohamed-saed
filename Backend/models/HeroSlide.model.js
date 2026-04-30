const mongoose = require('mongoose');

const heroSlideSchema = new mongoose.Schema({
    desktopPath: { type: String, required: true },
    mobilePath: { type: String, required: true },
    titleAr: { type: String },
    titleEn: { type: String },
    subtitleAr: { type: String },
    subtitleEn: { type: String },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('HeroSlide', heroSlideSchema);
