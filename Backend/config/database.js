// إعدادات اتصال MongoDB النهائية والمستقرة
const mongoose = require('mongoose');
const dns = require('dns');

// التقاط نسخة من البحث الأصلي لضمان الاستقرار
const originalLookup = dns.lookup.bind(dns);

// Simplified DB configuration - Keeping it lean for stability
const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function connectDB() {
  try {
    console.log('⏳ جاري الاتصال بـ MongoDB Atlas (البوابة: 27017)...');
    
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 60000,
      connectTimeoutMS: 60000,
      socketTimeoutMS: 75000,
      family: 4
    });

    console.log('✅ تم الاتصال بنجاح بـ MongoDB!');
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة البيانات.');
    console.error('التفاصيل:', err.message);
  }
}

module.exports = { connectDB };

