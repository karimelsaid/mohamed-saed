// إعدادات اتصال MongoDB
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz";

async function connectDB() {
  try {
    console.log('⏳ جاري الاتصال بـ MongoDB...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 20000, // Increased timeout to 15s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      maxPoolSize: 10, // Maintain up to 10 socket connections
      family: 4 // Use IPv4, skip trying IPv6
    });
    console.log('✅ تم الاتصال بنجاح بـ MongoDB!');
    const connectionInfo = mongoose.connection.host;
    console.log(`🌐 متصل بـ: ${connectionInfo}`);
  } catch (err) {
    console.error('حدث خطأ في الاتصال بـ MongoDB:', err.message);
    console.error('تفاصيل الخطأ:', err);
    throw err;
  }
}

module.exports = { connectDB };
