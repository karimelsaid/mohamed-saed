const mongoose = require('mongoose');

const globalPrizeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  value: { type: String, required: true },
  minLevel: { type: Number, default: 1 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GlobalPrize', globalPrizeSchema);
