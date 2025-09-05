const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  product_name: { type: String, required: true },
  product_quantity: { type: Number, required: true },
  product_category: { type: String, required: true },
  product_description: { type: String, required: true },
  product_price: { type: Number, required: true },
  price_cost: { type: Number, required: true },
  product_image: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
