const mongoose = require('mongoose');

const searchQuerySchema = new mongoose.Schema({
  term: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  count: {
    type: Number,
    default: 1
  },
  lastSearchedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for getting top searches quickly
searchQuerySchema.index({ count: -1 });
searchQuerySchema.index({ term: 1 }, { unique: true });

module.exports = mongoose.model('SearchQuery', searchQuerySchema);
