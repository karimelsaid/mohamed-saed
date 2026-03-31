const mongoose = require('mongoose');

const merchantRatingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: String, required: true }, // Rating linked to a specific order
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Ensure a user can only rate a merchant once per order
merchantRatingSchema.index({ userId: 1, orderId: 1 }, { unique: true });

module.exports = mongoose.model('MerchantRating', merchantRatingSchema);
