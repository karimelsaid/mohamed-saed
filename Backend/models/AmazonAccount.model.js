const mongoose = require('mongoose');

const amazonAccountSchema = new mongoose.Schema({
  accountName: {
    type: String,
    required: true,
    trim: true
  },
  sellerId: {
    type: String,
    required: true,
    trim: true
  },
  marketplaceId: {
    type: String,
    default: 'ARBP9OOSHTCHU',
    trim: true
  },
  region: {
    type: String,
    default: 'eu',
    trim: true
  },
  clientId: {
    type: String,
    required: true,
    trim: true
  },
  clientSecret: {
    type: String,
    required: true,
    trim: true
  },
  refreshToken: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  connectionStatus: {
    type: String,
    enum: ['connected', 'error', 'untested'],
    default: 'untested'
  },
  lastTestedAt: {
    type: Date
  },
  lastError: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AmazonAccount', amazonAccountSchema);
