const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  governorate: { type: String },
  city: { type: String },
  village: { type: String },
  taxNumber: { type: String },
  logo: { type: String }, // Path or URL to merchant logo
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});


// Update updatedAt on save
merchantSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Merchant = mongoose.model('Merchant', merchantSchema);

module.exports = Merchant;
