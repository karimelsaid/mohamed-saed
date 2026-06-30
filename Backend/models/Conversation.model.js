const mongoose = require('mongoose');

/**
 * Conversation Schema
 * Schema للمحادثات
 */
const conversationSchema = new mongoose.Schema({
  conversationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null للزوار غير المسجلين
  },
  sessionId: {
    type: String,
    default: null // Session ID للزوار
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'archived'],
    default: 'active'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  messageCount: {
    type: Number,
    default: 0
  },
  // معلومات إضافية للتحليل
  metadata: {
    userAgent: String,
    ipAddress: String,
    platform: String,
    browser: String
  },
  // معلومات عن العميل (للتحليل)
  customerProfile: {
    interests: [String],
    preferredCategories: [String],
    priceRange: {
      min: Number,
      max: Number
    },
    lastSearchQuery: String
  }
}, {
  timestamps: true
});

conversationSchema.index({ userId: 1 });
conversationSchema.index({ sessionId: 1 });
conversationSchema.index({ status: 1 });
conversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
