const mongoose = require('mongoose');

const WatinSpeakerSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: {
    ar: { type: String, required: true, trim: true, maxlength: 200 },
    en: { type: String, trim: true, maxlength: 200 }
  },
  title: { type: String, trim: true },             // e.g. "د." or "الشيخ"
  bio: { type: String, maxlength: 2000 },
  avatarUrl: { type: String },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  lectureCount: { type: Number, default: 0, min: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, collection: 'watin_speakers' });

WatinSpeakerSchema.index({ status: 1, 'name.ar': 1 });

module.exports = mongoose.model('WatinSpeaker', WatinSpeakerSchema);
