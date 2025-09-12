const mongoose = require('mongoose');

const productUpdateRequestSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalProduct: {
    product_name: String,
    product_quantity: Number,
    product_category: String,
    product_description: String,
    product_price: Number,
    price_cost: Number
  },
  updatedProduct: {
    product_name: String,
    product_quantity: Number,
    product_category: String,
    product_description: String,
    product_price: Number,
    price_cost: Number
  },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('ProductUpdateRequest', productUpdateRequestSchema);
