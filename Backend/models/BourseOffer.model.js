const mongoose = require('mongoose');

const bourseOfferSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  slotIndex: { type: Number, required: true }, // 0 to 31
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  books: [{
    bookId: { type: String, required: true }, // refers to products_id
    bookName: { type: String, required: true },
    originalPrice: { type: Number, required: true },
    boursePrice: { type: Number, required: true },
    quantityAvailable: { type: Number, default: 0 },
    quantitySold: { type: Number, default: 0 }
  }],
  status: { type: String, enum: ['scheduled', 'active', 'expired'], default: 'scheduled' }
}, { timestamps: true });

// Check if a given time falls within the offer's time range
bourseOfferSchema.methods.isActiveAt = function (checkTime = new Date()) {
  return checkTime >= this.startTime && checkTime <= this.endTime;
};

module.exports = mongoose.model('BourseOffer', bourseOfferSchema);
