const mongoose = require('mongoose');

const PromotionDateSchema = new mongoose.Schema({
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
}, { timestamps: true });

const PromotionDate = mongoose.model('PromotionDate', PromotionDateSchema);

module.exports = PromotionDate;
