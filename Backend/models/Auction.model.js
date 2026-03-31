const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bookTitle: { type: String, required: true },
  author: { type: String },
  description: { type: String },
  condition: { type: String },
  images: [{ type: String }],
  startingPrice: { type: Number, required: true, default: 0 },
  currentPrice: { type: Number, required: true, default: 0 },
  highestBidder: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  endTime: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['active', 'ended', 'cancelled'], 
    default: 'active' 
  },
  paymentStatus: { type: String, enum: ['pending', 'requested', 'paid'], default: 'pending' },
  shippingStatus: { type: String, enum: ['pending', 'collecting_from_owner', 'received_by_admin', 'delivering_to_winner', 'completed'], default: 'pending' },
  bids: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    amount: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Virtual to check if auction has expired
AuctionSchema.virtual('isExpired').get(function() {
  return new Date() > this.endTime;
});

module.exports = mongoose.model('Auction', AuctionSchema);
