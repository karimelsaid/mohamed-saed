const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  product_name: { type: String, required: true },
  product_quantity: { type: Number, required: true },
  product_category: { type: String, required: true },
  product_description: { type: String, required: true },
  product_price: { type: Number, required: true },
  price_cost: { type: Number, required: true },
  product_image: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'pending_update'], default: 'pending' },
  updateRequest: { type: Boolean, default: false },
  updatedData: { type: Object },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  // E-book related fields
  productType: { type: String, enum: ['physical', 'digital', 'bundle'], default: 'physical' },
  linkedEbookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ebook' },
  epubFilePath: { type: String, default: '' },
  miniEpubFilePath: { type: String, default: '' },
  digitalDelivery: { type: Boolean, default: false }
});

module.exports = mongoose.model('Product', productSchema);
