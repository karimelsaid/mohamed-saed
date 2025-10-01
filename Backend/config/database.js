// إعدادات اتصال MongoDB
const mongoose = require('mongoose');

const uri = "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz";

async function connectDB() {
  try {
    await mongoose.connect(uri);
    console.log('تم الاتصال بنجاح بـ MongoDB!');
  } catch (err) {
    console.log('حدث خطأ في الاتصال بـ MongoDB:', err);
    throw err;
  }
}

module.exports = { connectDB };
