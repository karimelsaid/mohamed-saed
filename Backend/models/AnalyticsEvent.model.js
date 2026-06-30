const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  eventType: { type: String, required: true }, // impression, click, search, purchase_batch, comment
  productId: { type: String, default: null },
  userId: { type: String, default: 'anonymous' },
  sessionId: { type: String },
  orderId: { type: String, default: null },
  products: { type: Array, default: [] },
  metadata: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
