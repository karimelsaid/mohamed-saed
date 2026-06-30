const mongoose = require('mongoose');

/**
 * Book Request Schema
 * لحفظ اقتراحات الكتب المطلوبة من المستخدمين
 */
const BookRequestSchema = new mongoose.Schema({
  // اسم الكتاب المطلوب
  bookName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  
  // التصنيف المطلوب (اختياري)
  category: {
    type: String,
    trim: true
  },
  
  // معرف المحادثة
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  
  // معرف المستخدم (إذا كان مسجلاً)
  userId: {
    type: String,
    index: true
  },
  
  // معرف الجلسة (للمستخدمين غير المسجلين)
  sessionId: {
    type: String,
    index: true
  },
  
  // عدد مرات طلب هذا الكتاب
  requestCount: {
    type: Number,
    default: 1
  },
  
  // عدد المستخدمين المختلفين الذين طلبوا هذا الكتاب
  uniqueUserCount: {
    type: Number,
    default: 1
  },
  
  // تاريخ آخر طلب
  lastRequestedAt: {
    type: Date,
    default: Date.now
  },
  
  // حالة الطلب
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'rejected'],
    default: 'pending'
  },
  
  // ملاحظات من الإدارة
  adminNotes: {
    type: String
  },
  
  // تاريخ الإضافة
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // تاريخ التحديث
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes للبحث السريع
BookRequestSchema.index({ bookName: 1, status: 1 });
BookRequestSchema.index({ requestCount: -1 });
BookRequestSchema.index({ lastRequestedAt: -1 });

// Middleware لتحديث updatedAt
BookRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method للبحث عن طلب موجود أو إنشاء جديد
BookRequestSchema.statics.findOrCreate = async function(bookData) {
  const { bookName, category, conversationId, userId, sessionId } = bookData;
  
  // البحث عن طلب موجود لنفس الكتاب
  const existingRequest = await this.findOne({ 
    bookName: bookName.toLowerCase().trim(),
    status: { $in: ['pending', 'in_progress'] }
  });
  
  if (existingRequest) {
    // تحديث الطلب الموجود
    existingRequest.requestCount += 1;
    existingRequest.lastRequestedAt = new Date();
    
    // التحقق من مستخدم جديد
    if (userId && !existingRequest.userId) {
      existingRequest.userId = userId;
      existingRequest.uniqueUserCount += 1;
    } else if (sessionId && existingRequest.sessionId !== sessionId) {
      existingRequest.uniqueUserCount += 1;
    }
    
    await existingRequest.save();
    return existingRequest;
  }
  
  // إنشاء طلب جديد
  return await this.create({
    bookName: bookName.toLowerCase().trim(),
    category: category || null,
    conversationId,
    userId: userId || null,
    sessionId: sessionId || null,
    requestCount: 1,
    uniqueUserCount: 1,
    status: 'pending'
  });
};

// Static method للحصول على تقرير الإحصائيات
BookRequestSchema.statics.getStatistics = async function() {
  const totalRequests = await this.countDocuments();
  const pendingRequests = await this.countDocuments({ status: 'pending' });
  const completedRequests = await this.countDocuments({ status: 'completed' });
  
  const mostRequested = await this
    .find({ status: { $in: ['pending', 'in_progress'] } })
    .sort({ requestCount: -1 })
    .limit(10)
    .select('bookName requestCount uniqueUserCount lastRequestedAt');
  
  const recentRequests = await this
    .find()
    .sort({ lastRequestedAt: -1 })
    .limit(10)
    .select('bookName category requestCount lastRequestedAt status');
  
  return {
    totalRequests,
    pendingRequests,
    completedRequests,
    mostRequested,
    recentRequests
  };
};

const BookRequest = mongoose.model('BookRequest', BookRequestSchema);

module.exports = BookRequest;
