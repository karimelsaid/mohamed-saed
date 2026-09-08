const mongoose = require('mongoose');

const youtubeVideoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  contentType: {
    type: String,
    enum: ['text_summary', 'video_summary'],
    required: true
  },
  sourceContent: {
    type: String,
    required: true
  },
  youtubeVideoId: {
    type: String,
    default: null
  },
  youtubeUrl: {
    type: String,
    default: null
  },
  thumbnailUrl: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['draft', 'processing', 'scheduled', 'uploading', 'published', 'failed'],
    default: 'draft'
  },
  scheduledAt: {
    type: Date,
    default: null
  },
  publishedAt: {
    type: Date,
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    default: 'Education'
  },
  privacy: {
    type: String,
    enum: ['public', 'unlisted', 'private'],
    default: 'public'
  },
  n8nExecutionId: {
    type: String,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for efficient querying
youtubeVideoSchema.index({ status: 1 });
youtubeVideoSchema.index({ scheduledAt: 1 });
youtubeVideoSchema.index({ createdAt: -1 });

module.exports = mongoose.model('YouTubeVideo', youtubeVideoSchema);
