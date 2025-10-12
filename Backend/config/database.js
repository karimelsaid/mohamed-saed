// إعدادات اتصال MongoDB
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz";

async function connectDB() {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      maxPoolSize: 10, // Maintain up to 10 socket connections
      family: 4 // Use IPv4, skip trying IPv6
    });
    console.log('تم الاتصال بنجاح بـ MongoDB!');
    console.log('URI المستخدم:', uri.replace(/\/\/.*@/, '//***:***@')); // Log URI with credentials masked
  } catch (err) {
    console.error('حدث خطأ في الاتصال بـ MongoDB:', err.message);
    console.error('تفاصيل الخطأ:', err);
    throw err;
  }
}

module.exports = { connectDB };
