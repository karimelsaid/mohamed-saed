const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    required: true
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
    required: true
  },
  address: {
    type: String,
    required: true
  },
  products: [{
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
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
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
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
