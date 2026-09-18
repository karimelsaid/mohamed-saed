const mongoose = require('mongoose');
// Update: Added 'verses' to newMemorization enum and memorizationAmount field.

const paymentRequestSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  status: { type: String, required: true, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: function () { return !this.googleId; } },
  phone: { type: String, required: function () { return !this.googleId; } },
  governorate: { type: String, required: false }, // المحافظة
  city: { type: String, required: false },       // المدينة
  village: { type: String, required: false },    // القرية
  postOffice: {
    governorate: String,
    city: String,
    address: String,
    name: String
  },
  googleId: { type: String, required: false, unique: true, sparse: true },
  gender: { type: String, enum: ['male', 'female'], required: false }, // إلزامي للمجتمع التفاعلي
  country: { type: String },
  isSheikh: { type: Boolean, default: false }, // للمقرئين المعتمدين

  // حقول التاجر الجديدة
  role: { type: String, required: true, default: 'user', enum: ['user', 'merchant', 'admin', 'staff', 'marketer'] },
  permissions: [{ type: String }], // e.g., ['orders', 'products', 'notifications', 'marketing']
  taxNumber: { type: String },
  logo: { type: String },
  profileImage: { type: String, default: null }, // صورة الملف الشخصي
  bio: { type: String }, // نبذة تعريفية عن التاجر
  approved: { type: Boolean, default: false },
  suspended: { type: Boolean, default: false }, // إيقاف الحساب مؤقتاً
  merchantName: { type: String },
  coverPhoto: { type: String }, // صورة غلاف المتجر
  preparationTime: { type: Number, default: 1 }, // مدة تجهيز الطلب (1 أو 2 يوم)
  merchantShippingMethod: { type: String, enum: ['merchant', 'knoozbook'], default: 'knoozbook' }, // تفضيل الشحن للتاجر
  averageRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },

  // --- نظام المسوقين (Marketers) ---
  marketer: {
    isMarketer: { type: Boolean, default: false },
    applicationStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    bio: { type: String }, // نبذة عن المسوق عند التقديم
    applicationDate: { type: Date },
    rejectionReason: { type: String },
    commissionRate: { type: Number, default: 10 }, // نسبة الربح الأساسية (%)
    balance: { type: Number, default: 0 },         // الرصيد الحالي القابل للسحب
    totalEarnings: { type: Number, default: 0 },   // إجمالي الأرباح التاريخية
    level: { type: Number, default: 1 },           // مستوى المسوق
    levelLabel: { type: String, default: 'مسوق مبتدئ' },
    points: { type: Number, default: 0 },          // نقاط التقدم للمسوق
    ordersCount: { type: Number, default: 0 },     // عدد الأوردرات الناجحة
    clicksCount: { type: Number, default: 0 },     // عدد النقرات على روابطه
    tasks: [{
      title: String,
      description: String,
      target: Number,
      current: { type: Number, default: 0 },
      reward: Number, // قيمة الجائزة المالية
      status: { type: String, enum: ['active', 'completed', 'claimed'], default: 'active' },
      deadline: Date,
      targetId: String, // ID of the book or target
      targetType: { type: String, enum: ['book', 'category', 'home'], default: 'book' }
    }],
    prizes: [{
      title: String,
      value: String,
      type: { type: String, enum: ['cash', 'gift', 'rank_up'] },
      claimed: { type: Boolean, default: false },
      date: { type: Date, default: Date.now }
    }],
    referralLinks: [{
      targetId: String,
      targetType: { type: String, enum: ['book', 'category', 'home'] },
      shortCode: String,
      clicks: { type: Number, default: 0 }
    }]
  },

  // حقول الاشتراك في الكتب الإلكترونية
  activeSubscription: { type: Boolean, default: false },
  subscriptionEndDate: { type: Date },
  subscriptionDiscount: { type: Number, default: 10 }, // نسبة الخصم على المنتجات الورقية للمشتركين

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
      fromPage: { type: Number, default: 1 },
      toPage: { type: Number },
      copies: { type: Number, required: true },
      notes: { type: String },
      projectTitle: { type: String, required: true },
      estimatedPrice: { type: Number, required: true },
      finalPrice: { type: Number, default: null },
      createdAt: { type: Date, default: Date.now }
    }],
    shippingCost: Number,
    totalAmount: Number,
    subTotal: Number,
    walletDiscount: Number,
    paymentSessionUrl: { type: String, default: null },
    paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    status: { type: String, default: 'قيد الإنتظار' }, // pending, shipped, completed,cancelled
    statusLog: [{
      status: String,
      updatedAt: { type: Date, default: Date.now },
      updatedBy: String,
      role: String,
      note: String
    }],
    isPickup: { type: Boolean, default: false },
    pickupLocation: { type: String },
    shippingAddress: {
      deliveryType: String,
      pickupLocation: String,
      governorate: String,
      city: String,
      village: String,
      phone: String,
      name: String, // For post office name
      address: String, // For post office address
      postOffice: {
        governorate: String,
        city: String,
        address: String,
        name: String
      }
    },
    postOffice: {
      governorate: String,
      city: String,
      address: String,
      name: String
    },
    address: String,
    paymentMethod: { type: String, enum: ['online', 'cod', 'wallet'], default: 'online' },
    codFee: { type: Number, default: 0 },
    isCommunityItem: { type: Boolean, default: false },
    communityItemId: { type: String },
    communityOwnerId: { type: String },
    communityOwnerName: { type: String },
    communityOwnerPhone: { type: String },
    communityOwnerAddress: { type: String },
    shippingMethod: { type: String, enum: ['merchant', 'knoozbook'], default: 'knoozbook' }, // طريقة الشحن لهذا الطلب
    referredByMarketer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // تتبع الطلب لمسوق
    marketerCommission: { type: Number, default: 0 }, // عمولة المسوق لهذا الطلب
    // Shipping Integration Fields
    shippingCarrier: { type: String, enum: ['bosta', 'aramex', 'none'], default: 'none' },
    trackingNumber: { type: String },
    shippingId: { type: String },
    shippingLabelUrl: { type: String },
    shippingStatus: { type: String }
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
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  urgencyRequests: [{
    bookId: { type: String, required: true },
    bookName: { type: String, required: true },
    merchantId: { type: String },
    merchantName: { type: String },
    requestedAt: { type: Date, default: Date.now },
    status: { type: String, default: 'pending', enum: ['pending', 'fulfilled'] }
  }],
  gamification: {
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastStreakUpdate: { type: Date },
    coins: { type: Number, default: 0 },
    lastLoginRewardDate: { type: Date },
    lastRewardDateString: { type: String }, // For atomic checks (YYYY-MM-DD)
    lastWheelSpin: { type: Date }, // To limit lucky wheel usage
    dailySpinCount: { type: Number, default: 0 }
  },
  earnedCoupons: [{
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    code: String,
    earnedAt: { type: Date, default: Date.now },
    isUsed: { type: Boolean, default: false }
  }],
  prizes: [{
    type: { type: String }, // 'book', 'points'
    value: String,
    receivedAt: { type: Date, default: Date.now },
    isClaimed: { type: Boolean, default: false }
  }],
  // نظام تقدم القرآن الكريم
  quranProgress: {
    totalPoints: { type: Number, default: 0 },          // إجمالي نقاط القرآن
    dailyStreak: { type: Number, default: 0 },          // أيام الالتزام المتتالية
    longestStreak: { type: Number, default: 0 },        // أطول سلسلة التزام
    pagesRead: { type: Number, default: 0 },            // الصفحات المقروءة
    pagesReviewed: { type: Number, default: 0 },        // الصفحات المراجعة
    versesMemorized: { type: Number, default: 0 },      // الآيات المحفوظة
    totalMinutesReading: { type: Number, default: 0 },  // دقائق القراءة
    khatmatCount: { type: Number, default: 0 },         // عدد الختمات
    lastActivityDate: { type: Date },                   // آخر نشاط
    lastPage: { type: Number, default: 1 },             // آخر صفحة تم قراءتها
    bookmarks: [{ type: Number }],                       // الصفحات المحفوظة
    walletBalance: { type: Number, default: 0 }         // رصيد المحفظة (ج.م)
  },
  // نظام المتابعة الذكية (Smart Mutaba'a)
  mutabaa: {
    // إعدادات الخطة اليومية
    plan: {
      tilawoTarget: { type: Number, default: 2 }, // عدد صفحات التلاوة اليومية
      hifzTarget: { type: Number, default: 0 },   // عدد آيات الحفظ الجديد
      murajaTarget: { type: Number, default: 0 }, // عدد صفحات المراجعة القريبة
      deepMurajaTarget: { type: Number, default: 0 } // عدد صفحات المراجعة البعيدة
    },
    // سجل المتابعة اليومي
    dailyLog: [{
      date: { type: String }, // YYYY-MM-DD
      tilawo: {
        status: { type: String, enum: ['pending', 'done', 'postponed'], default: 'pending' },
        pagesCompleted: { type: Number, default: 0 }
      },
      hifz: {
        status: { type: String, enum: ['pending', 'done', 'postponed'], default: 'pending' },
        versesCompleted: { type: Number, default: 0 }
      },
      muraja: {
        status: { type: String, enum: ['pending', 'done', 'postponed'], default: 'pending' },
        pagesCompleted: { type: Number, default: 0 },
        versesCompleted: { type: Number, default: 0 }
      },
      deepMuraja: {
        status: { type: String, enum: ['pending', 'done', 'postponed'], default: 'pending' },
        pagesCompleted: { type: Number, default: 0 }
      },
      completedAt: { type: Date } // وقت إتمام جميع المهام
    }]
  },
  // نظام الحفظ الديناميكي (Dynamic Hifz Plan)
  hifzPlan: {
    // إعداد المستخدم الأولي
    isSetupComplete: { type: Boolean, default: false },
    userLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    // طاقة المستخدم اليومية
    dailyCapacity: {
      recitationType: { type: String, enum: ['page', 'half_hizb', 'hizb', 'juz'], default: 'page' },
      recitationAmount: { type: Number, default: 2 }, // عدد الوحدات
      newMemorization: { type: String, enum: ['verse', 'half_page', 'page', 'verses'], default: 'verse' },
      memorizationAmount: { type: Number, default: 5 }, // For 'verses' type
      memorizationDays: { type: Number, default: 5 }, // أيام الحفظ في الأسبوع
      reviewType: { type: String, enum: ['light', 'weekly', 'rescue'], default: 'light' },
      reviewAmount: { type: Number, default: 1 } // الكمية للمراجعة
    },
    // خريطة المحفوظات (surah:verse -> memory state)
    memorizedContent: [{
      verseKey: { type: String }, // "2:255" format
      strength: { type: String, enum: ['strong', 'medium', 'weak', 'rescue'], default: 'medium' },
      lastReviewed: { type: Date },
      nextReview: { type: Date },
      reviewCount: { type: Number, default: 0 }
    }],
    // المؤشرات (Cursors) لتتبع التقدم
    cursors: {
      newMemorization: { surah: { type: Number, default: 1 }, verse: { type: Number, default: 1 } },
      review: { surah: { type: Number, default: 1 }, page: { type: Number, default: 1 } },
      recitation: { page: { type: Number, default: 1 } }
    },
    // الموقع الحالي في الحفظ الجديد (Deprecated: use cursors.newMemorization)
    currentPosition: {
      surah: { type: Number, default: 1 },
      verse: { type: Number, default: 1 }
    },
    // إحصائيات
    stats: {
      totalVersesMemorized: { type: Number, default: 0 },
      currentStreak: { type: Number, default: 0 },
      bestStreak: { type: Number, default: 0 },
      lastActiveDate: { type: String } // YYYY-MM-DD
    },
    // إعدادات التنبيهات المخصصة
    reminders: {
      recitation: { enabled: { type: Boolean, default: false }, time: { type: String, default: '08:00' } },
      memorization: { enabled: { type: Boolean, default: false }, time: { type: String, default: '09:00' } },
      revision: { enabled: { type: Boolean, default: false }, time: { type: String, default: '10:00' } }
    }
  },
  paymentRequests: [paymentRequestSchema],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Merchant Store Analytics
  storeViews: { type: Number, default: 0 },
  storeViewHistory: [{
    date: { type: String }, // YYYY-MM-DD
    count: { type: Number, default: 0 }
  }],
  shippingRates: [{
    governorate: String,
    rate: { type: Number, default: 50 }
  }]
}, { timestamps: true });

userSchema.index({ role: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ 'orders.date': -1 });
userSchema.index({ 'orders.status': 1 });

userSchema.index({ 'hifzPlan.reminders.recitation.time': 1, 'hifzPlan.reminders.recitation.enabled': 1 });
userSchema.index({ 'hifzPlan.reminders.memorization.time': 1, 'hifzPlan.reminders.memorization.enabled': 1 });
userSchema.index({ 'hifzPlan.reminders.revision.time': 1, 'hifzPlan.reminders.revision.enabled': 1 });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
