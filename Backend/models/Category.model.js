const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  type: { type: String, default: 'book' }, // 'book', 'other', etc.
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
