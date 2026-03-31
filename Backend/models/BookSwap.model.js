const mongoose = require('mongoose');

const BookSwapSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bookTitle: { type: String, required: true },
  author: { type: String },
  condition: { 
    type: String, 
    enum: ['new', 'used-good', 'used-fair'], 
    default: 'used-good' 
  },
  description: { type: String },
  notes: { type: String }, // User's personal notes about the book
  images: [{ type: String }],
  lookingFor: { type: String }, // What the user wants in exchange
  location: { type: String },
  status: {
    type: String,
    enum: ['available', 'pending', 'swapped'],
    default: 'available'
  },
  shippingStatus: { type: String, enum: ['pending', 'collecting_from_both', 'received_by_admin', 'delivering_to_both', 'completed'], default: 'pending' },
  requests: [{
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requesterName: String,
    requesterAvatar: String,
    offeredBookTitle: { type: String },
    offeredBookCondition: { type: String },
    offeredBookNotes: { type: String },
    offeredBookImage: { type: String },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('BookSwap', BookSwapSchema);
