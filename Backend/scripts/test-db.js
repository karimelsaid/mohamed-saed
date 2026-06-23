const { connectDB } = require('../config/database');
const Product = require('../models/Product.model');
const User = require('../models/User.model');
const PromotionDate = require('../models/PromotionDate.model');
require('dotenv').config();

async function run() {
  console.log('⏳ Testing DB connection...');
  const start = Date.now();
  try {
    await connectDB();
    console.log(`✅ Connected in ${Date.now() - start}ms`);
    
    console.log('⏳ Running User count...');
    const userCount = await User.countDocuments();
    console.log('👤 Users count:', userCount);

    console.log('⏳ Running Product count...');
    const productCount = await Product.countDocuments();
    console.log('📦 Products count:', productCount);

    console.log('⏳ Running fetchUnifiedData queries...');
    const qStart = Date.now();
    const [dbP, merch, ratings, promo] = await Promise.all([
      Product.find({ status: 'approved' }).select('-viewHistory -updatedData').lean(),
      User.find({ role: { $in: ['merchant', 'admin'] } }).select('_id name merchantName logo role merchantShippingMethod').lean(),
      User.aggregate([
        { $unwind: { path: '$ratedBooks', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$ratedBooks.bookId', averageRating: { $avg: '$ratedBooks.rating' }, ratingCount: { $sum: 1 } } }
      ]),
      PromotionDate.findOne().sort({ createdAt: -1 }).lean()
    ]);
    console.log(`✅ Queries completed in ${Date.now() - qStart}ms`);
    console.log(`📊 Approved Products: ${dbP.length}, Merchants/Admins: ${merch.length}, Ratings: ${ratings.length}`);
  } catch (err) {
    console.error('❌ Database Test Error:', err);
  }
  process.exit();
}
run();
