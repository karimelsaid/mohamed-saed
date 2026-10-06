const mongoose = require('mongoose');

const WatinDailyVerseSchema = new mongoose.Schema({
  date: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },     // e.g. "2026-10-02"
  surah: { type: Number, min: 1, max: 114, required: true },
  surahName: { type: String, required: true },
  ayahFrom: { type: Number, min: 1, required: true },
  ayahTo: { type: Number, min: 1, required: true },
  text: { type: String, required: true },                     // diacritized verse text
  reflection: { type: String, maxlength: 1000 },              // tadabbur note
  status: { type: String, enum: ['draft', 'scheduled', 'published', 'archived'], default: 'draft' },
  isEvergreen: { type: Boolean, default: false },             // fallback pool entry
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, collection: 'watin_daily_verses' });

WatinDailyVerseSchema.index({ date: 1 }, { unique: true, sparse: true });
WatinDailyVerseSchema.index({ isEvergreen: 1, status: 1 });

module.exports = mongoose.model('WatinDailyVerse', WatinDailyVerseSchema);
