const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  products_id: { type: String, index: true }, // Numeric ID from Excel/Frontend
  product_name: { type: String, required: true },
  product_quantity: { type: Number, required: true },
  product_category: { type: String, required: true },
  product_description: { type: String, required: true },
  product_price: { type: Number, required: true },
  price_cost: { type: Number, required: true },
  product_image: { type: String },
  product_price_before_discount: { type: Number },
  rival: { type: Boolean, default: false },
  product_discount_percent: { type: Number },
  promotionEndDate: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'pending_update'], default: 'pending' },
  updateRequest: { type: Boolean, default: false },
  updatedData: { type: Object },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  // Physical Dimensions
  weight: { type: Number, required: true, default: 0 },
  length: { type: Number },
  width: { type: Number },
  height: { type: Number },
  // E-book related fields
  productType: { type: String, enum: ['physical', 'digital', 'bundle'], default: 'physical' },
  linkedEbookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ebook' },
  epubFilePath: { type: String, default: '' },
  miniEpubFilePath: { type: String, default: '' },
  digitalDelivery: { type: Boolean, default: false },
  lastStockUpdate: { type: Date },
  copyType: { type: String, enum: ['هاي كوبي', 'أصلي', ''] },
  condition: { type: String, enum: ['جديد', 'مستعمل بحالة جيدة', ''] },
  images: [{ type: String }],
  // Analytics Tracking
  views: { type: Number, default: 0 },
  viewHistory: [{
    date: { type: String }, // YYYY-MM-DD
    count: { type: Number, default: 0 }
  }]
});

module.exports = mongoose.model('Product', productSchema);
