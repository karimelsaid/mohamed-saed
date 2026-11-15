// إعدادات اتصال MongoDB النهائية والمستقرة
const mongoose = require('mongoose');
mongoose.set('bufferCommands', false);
mongoose.set('autoIndex', false); // Disable auto-indexing to avoid language_override issue
const dns = require('dns');

// التقاط نسخة من البحث الأصلي لضمان الاستقرار
const originalLookup = dns.lookup.bind(dns);

// Simplified DB configuration - Keeping it lean for stability
const uri = process.env.MONGO_URI || "mongodb+srv://kenouz_user:nuwRkmwJospZXapy@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function connectDB() {
  try {
    console.log('⏳ جاري الاتصال بـ MongoDB Atlas (البوابة: 27017)...');

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 120000,
      family: 4,
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      retryReads: true
    });

    console.log('✅ تم الاتصال بنجاح بـ MongoDB!');
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة البيانات.');
    console.error('التفاصيل:', err.message);
    console.error('💡 تلميح: قد تحتاج إلى إضافة IP الحالي إلى IP Whitelist في MongoDB Atlas');
    throw err;
  }
}

module.exports = { connectDB };

