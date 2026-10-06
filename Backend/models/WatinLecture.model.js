const mongoose = require('mongoose');

const WatinLectureSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  title: { type: String, required: true, trim: true, maxlength: 250 },
  description: { type: String, maxlength: 5000 },

  speakerId: { type: mongoose.Schema.Types.ObjectId, ref: 'WatinSpeaker', index: true },
  categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WatinCategory' }],
  primaryCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'WatinCategory' },
  tags: [{ type: String }],

  series: {
    name: { type: String },
    order: { type: Number }
  },

  audio: {
    url: { type: String },                           // audio file URL or path (can be external IslamHouse URL)
    originalFilename: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number, min: 0 },
    durationSec: { type: Number, min: 0 },
  },

  source: {
    origin: { type: String, enum: ['internal', 'islamhouse', 'alukah', 'king_fahd', 'other'], default: 'internal' },
    externalId: { type: String },                     // The ID from IslamHouse or other API
    sourceUrl: { type: String },                      // Link to the original page for reference
    rightsStatus: { type: String, enum: ['owned', 'api_licensed', 'unknown', 'public_domain'], default: 'unknown' },
    sourceName: { type: String },                     // Display name of the source, e.g. "IslamHouse.com"
  },

  transcription: {
    status: { 
      type: String, 
      enum: ['not_requested', 'pending', 'processing', 'completed', 'failed', 'canceled'],
      default: 'not_requested' 
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    requestedAt: { type: Date },
    completedAt: { type: Date },
    totalSegments: { type: Number, default: 0 },
    quranSegments: { type: Number, default: 0 },
    // Transcript data stored as embedded JSON
    results: [{
      start: Number,
      end: Number,
      text: String,
      type: { type: String, enum: ['quran', 'speech'] },
      verified: Boolean,
      match: {
        surah_number: Number,
        surah_name: String,
        ayah_number: Number,
        original_text: String,
        confidence: Number
      }
    }],
    error: {
      code: String,
      message: String
    },
    reviewStatus: {
      type: String,
      enum: ['unreviewed', 'in_review', 'reviewed'],
      default: 'unreviewed'
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },

  transcriptPublic: { type: Boolean, default: false },

  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  publishedAt: { type: Date },

  stats: {
    plays: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 }
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, collection: 'watin_lectures' });

WatinLectureSchema.index({ status: 1, publishedAt: -1 });
WatinLectureSchema.index({ categoryIds: 1, status: 1 });
WatinLectureSchema.index({ speakerId: 1, status: 1 });
WatinLectureSchema.index({ 'transcription.status': 1 });

module.exports = mongoose.model('WatinLecture', WatinLectureSchema);
