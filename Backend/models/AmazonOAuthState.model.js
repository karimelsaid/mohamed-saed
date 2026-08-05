const mongoose = require('mongoose');

const amazonOAuthStateSchema = new mongoose.Schema({
  state: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // Auto-expire & delete from MongoDB after 600 seconds (10 minutes)
  }
});

module.exports = mongoose.model('AmazonOAuthState', amazonOAuthStateSchema);
