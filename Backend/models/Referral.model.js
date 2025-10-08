const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  referredId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bookId: { type: String, required: true }, // Store products_id as string
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  earned: { type: Number, default: 0 }
});

module.exports = mongoose.model('Referral', referralSchema);
