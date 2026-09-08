const mongoose = require('mongoose');

const shippingSettingSchema = new mongoose.Schema({
  activeCarrier: {
    type: String,
    enum: ['bosta', 'aramex', 'mylerz', 'jnt', 'shipblu', 'sprint', 'none'],
    default: 'none'
  },
  bosta: {
    apiKey: { type: String, default: '' },
    isTestMode: { type: Boolean, default: true },
    baseUrl: { type: String, default: 'https://api.bosta.co' }
  },
  aramex: {
    userName: { type: String, default: '' },
    password: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountPin: { type: String, default: '' },
    accountEntity: { type: String, default: '' },
    accountCountryCode: { type: String, default: '' },
    isTestMode: { type: Boolean, default: true }
  },
  mylerz: {
    username: { type: String, default: '' },
    password: { type: String, default: '' },
    isTestMode: { type: Boolean, default: true }
  },
  jnt: {
    customerCode: { type: String, default: '' },
    apiAccount: { type: String, default: '' },
    apiPassword: { type: String, default: '' },
    isTestMode: { type: Boolean, default: true }
  },
  shipblu: {
    apiKey: { type: String, default: '' },
    isTestMode: { type: Boolean, default: true }
  },
  sprint: {
    apiKey: { type: String, default: '' },
    isTestMode: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ShippingSetting', shippingSettingSchema);
