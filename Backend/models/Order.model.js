const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    required: false // Made optional for Amazon orders
  },
  customerName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: function() { return this.source !== 'amazon'; }
  },
  address: {
    type: String,
    required: true
  },
  products: [{
    product_id: {
      type: String
    },
    product_name: {
      type: String,
      required: true
    },
    product_quantity: {
      type: Number,
      required: true
    },
    product_price: {
      type: Number,
      required: true
    },
    product_image: {
      type: String,
      default: ''
    },
    // Amazon-specific item fields
    sellerSku: { type: String },
    asin: { type: String },
    orderItemId: { type: String }
  }],
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'قيد الانتظار', 'قيد المعالجة', 'تم الشحن', 'تم الاستلام', 'تم التسليم', 'تم الإلغاء', 'مؤرشف', 'ارسال الاستلام'],
    default: 'pending'
  },
  totalAmount: {
    type: Number,
    required: true
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  preparationTime: {
    type: Number,
    default: 1,
    min: 1,
    max: 30
  },
  shippingMethod: {
    type: String,
    enum: ['merchant', 'knoozbook'],
    default: 'knoozbook'
  },
  // Amazon Integration Fields
  source: {
    type: String,
    enum: ['website', 'amazon'],
    default: 'website'
  },
  amazonOrderId: {
    type: String,
    unique: true,
    sparse: true
  },
  amazonOrderStatus: {
    type: String,
    default: 'Unshipped'
  },
  fulfillmentChannel: {
    type: String,
    default: 'MFN'
  },
  easyShipStatus: {
    type: String,
    default: null
  },
  scheduledPackageId: {
    type: String,
    default: null
  },
  handoverSlot: {
    slotId: String,
    startTime: Date,
    endTime: Date,
    handoverMethod: String
  },
  packageDetails: {
    weight: { type: Number, default: 0.5 },
    weightUnit: { type: String, default: 'kg' },
    length: { type: Number, default: 25 },
    width: { type: Number, default: 18 },
    height: { type: Number, default: 5 },
    dimensionUnit: { type: String, default: 'cm' }
  },
  earliestShipDate: Date,
  latestShipDate: Date,
  shippingAddressDetails: {
    name: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    stateOrRegion: String,
    postalCode: String,
    countryCode: String,
    phone: String
  },
  // Stock Issue Tracking
  hasStockIssues: {
    type: Boolean,
    default: false
  },
  stockIssueDetails: [{
    productId: String,
    requestedQty: Number,
    reason: String
  }],
  // Shipping Integration Fields
  shippingCarrier: {
    type: String,
    enum: ['bosta', 'aramex', 'none'],
    default: 'none'
  },
  trackingNumber: {
    type: String
  },
  shippingId: {
    type: String
  },
  shippingLabelUrl: {
    type: String
  },
  shippingStatus: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
