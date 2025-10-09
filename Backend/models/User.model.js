const mongoose = require('mongoose');

const paymentRequestSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  status: { type: String, required: true, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
});


const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: function() { return !this.googleId; } },
  phone: { type: String, required: function() { return !this.googleId; } },
  governorate: { type: String, required: function() { return !this.googleId; } }, // المحافظة
  city: { type: String, required: function() { return !this.googleId; } },       // المدينة
  village: { type: String, required: function() { return !this.googleId; } },                    // القرية (إجباري)
  googleId: { type: String, required: false, unique: true, sparse: true },

  // حقول التاجر الجديدة
  role: { type: String, required: true, default: 'user', enum: ['user', 'merchant', 'admin'] },
  taxNumber: { type: String },
  logo: { type: String },
  bio: { type: String }, // نبذة تعريفية عن التاجر
  approved: { type: Boolean, default: false },
  suspended: { type: Boolean, default: false }, // إيقاف الحساب مؤقتاً
  merchantName: { type: String },
  preparationTime: { type: Number, default: 1 }, // مدة تجهيز الطلب (1 أو 2 يوم)

  favorites: [{ type: String }], // مصفوفة فيها ID الكتب المفضلة
  cart: [{ type: String }],      // مصفوفة فيها ID الكتب في السلة
  orders: [{
    date: { type: Date, default: Date.now },
    preparationTime: { type: Number, default: 1 }, // حفظ مدة تجهيز الطلب وقت الشراء
    products: [{
      bookId: String,
      bookName: String,
      quantity: Number,
      price: Number
    }],
    printProjects: [{
      filename: { type: String, required: true },
      filepath: { type: String, required: true },
      size: { type: String, required: true },
      coverType: { type: String, required: true },
      printColor: { type: String, required: true },
      pages: { type: Number, required: true },
      copies: { type: Number, required: true },
      notes: { type: String },
      projectTitle: { type: String, required: true },
      estimatedPrice: { type: Number, required: true },
      createdAt: { type: Date, default: Date.now }
    }],
    shippingCost:Number,
    totalAmount: Number,
    paymentSessionUrl: { type: String, default: null },
    status: { type: String, default: 'قيد الإنتظار' }, // pending, shipped, completed,cancelled
    isPickup: { type: Boolean, default: false },
    pickupLocation: { type: String },
    shippingAddress: {
      governorate: String,
      city: String,
      village: String,
      phone:String
    }
  }],
  requestedBooks: [{
    bookName: { type: String, required: true },
    authorName: { type: String },
    dateRequested: { type: Date, default: Date.now },
    added: { type: Boolean, default: false }
  }],
  ratedBooks: [{
    bookId: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    dateRated: { type: Date, default: Date.now }
  }],
  notifications: [{
    message: { type: String, required: true },
    type: { type: String, required: true }, // e.g., 'order', 'suggestion'
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    relatedId: { type: String } // e.g., orderId or suggestionId
  }],
  referralCode: { type: String, unique: true, sparse: true },
  referralBalance: { type: Number, default: 0 },
  paymentRequests: [paymentRequestSchema]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);

module.exports = mongoose.model('User', userSchema);
