const mongoose = require('mongoose');

/**
 * Chat Message Schema
 * Schema لرسائل الدردشة في نظام AI Sales Agent
 */
const chatMessageSchema = new mongoose.Schema({
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  // معلومات عن تحليل النية
  intentAnalysis: {
    intent: String,
    keywords: [String],
    category: String,
    confidence: Number
  },
  // معلومات عن الكتب الموصى بها
  recommendedBooks: [{
    bookId: String,
    bookTitle: String,
    reason: String
  }],
  // معلومات عن الأداء
  performance: {
    processingTime: Number, // بالمللي ثانية
    tokensUsed: Number,
    cost: Number
  },
  // معلومات إضافية
  metadata: {
    model: String,
    provider: String,
    temperature: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ role: 1 });
chatMessageSchema.index({ 'intentAnalysis.intent': 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
