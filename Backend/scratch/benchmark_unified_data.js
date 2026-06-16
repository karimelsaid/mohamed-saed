const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Product = require('../models/Product.model');
const User = require('../models/User.model');
const PromotionDate = require('../models/PromotionDate.model');

const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

function unifyAndEnrichData(excelProducts, dbProducts, promoDoc, merchantMap, ratingsMap) {
  const uniqueItems = new Map();
  const excelMap = new Map();
  const nowTime = new Date();

  excelProducts.forEach(item => {
    const matchKey = getMatchKey(item);
    if (matchKey) excelMap.set(matchKey, item);
  });

  dbProducts.forEach(product => {
    const matchKey = getMatchKey(product);
    const excelMatch = excelMap.get(matchKey);

    let finalPid = product._id.toString();
    if (excelMatch && excelMatch.products_id) finalPid = excelMatch.products_id.toString();

    const mergedProduct = {
      ...(excelMatch || {}),
      ...product,
      products_id: finalPid,
      _id: product._id.toString(),
      isDbProduct: true
    };

    const itemKey = matchKey || finalPid;
    uniqueItems.set(itemKey, mergedProduct);
    if (matchKey) excelMap.delete(matchKey);
  });

  excelMap.forEach((item, matchKey) => {
    const pid = item.products_id || matchKey;
    uniqueItems.set(matchKey, { ...item, products_id: pid, isDbProduct: false });
  });

  const jsonData = Array.from(uniqueItems.values());

  jsonData.forEach(book => {
    if (!book.merchantId && !book.isDbProduct) book.merchantId = '69d11b07df78621a8d7b1559';

    if (merchantMap && book.merchantId) {
      const mInfo = merchantMap.get(book.merchantId.toString());
      if (mInfo) {
        book.merchantName = mInfo.name;
        book.merchantLogo = mInfo.logo || book.merchantLogo;
        book.merchantRole = mInfo.role;
        book.shippingMethod = mInfo.shippingMethod || book.shippingMethod;
      }
    }
    if (!book.merchantName) book.merchantName = 'كنوز';

    if (ratingsMap && ratingsMap[book.products_id]) {
      book.averageRating = ratingsMap[book.products_id].averageRating;
      book.ratingCount = ratingsMap[book.products_id].ratingCount;
    }

    if (promoDoc) {
      const promoEndDate = new Date(promoDoc.endDate);
      const promoStartDate = new Date(promoDoc.startDate);
      book.promotionEndDate = promoEndDate.toISOString();
      const globalRival = nowTime >= promoStartDate && nowTime <= promoEndDate;
      book.rival = book.rival || globalRival;
    }

    // Auto-fix pricing
    let price = Number(book.product_price) || 0;
    let before = Number(book.product_price_before_discount) || 0;
    if (before > 0 && before < price) [price, before] = [before, price];
    
    book.product_price = price;
    book.product_price_before_discount = before;
    book.product_discount_percent = before > price ? Math.round(((before - price) / before) * 100) : 0;
    
    if (!book.price_cost || Number(book.price_cost) === 0) book.price_cost = Math.ceil(price * 0.7);
  });

  return jsonData;
}

const getMatchKey = (item) => {
  if (!item) return null;
  if (item.products_id && /^\d+$/.test(item.products_id.toString())) return item.products_id.toString();
  if (item.product_image && /^\d+$/.test(item.product_image.toString())) return item.product_image.toString();
  return item.products_id || (item._id ? item._id.toString() : null);
};

async function runBenchmark() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  console.log('\n⏱️ Starting Benchmark...');

  // 1. output.json load
  const fileStart = Date.now();
  const filePath = path.join(__dirname, '..', 'output.json');
  let excelProducts = [];
  if (fs.existsSync(filePath)) {
    excelProducts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  const fileTime = Date.now() - fileStart;
  console.log(`1. output.json parsed: ${excelProducts.length} items in ${fileTime}ms`);

  // 2. Product.find
  const prodStart = Date.now();
  const dbProducts = await Product.find({ status: 'approved' }).lean();
  const prodTime = Date.now() - prodStart;
  console.log(`2. Product.find (status: approved): ${dbProducts.length} items in ${prodTime}ms`);

  // 3. User.find (merchants)
  const merchStart = Date.now();
  const merchants = await User.find({ role: { $in: ['merchant', 'admin'] } })
    .select('_id name merchantName logo role merchantShippingMethod')
    .lean();
  const merchTime = Date.now() - merchStart;
  console.log(`3. User.find (merchants): ${merchants.length} items in ${merchTime}ms`);

  // 4. User.aggregate (ratings)
  const ratingsStart = Date.now();
  const ratingsData = await User.aggregate([
    { $unwind: { path: '$ratedBooks', preserveNullAndEmptyArrays: false } },
    { $group: { _id: '$ratedBooks.bookId', averageRating: { $avg: '$ratedBooks.rating' }, ratingCount: { $sum: 1 } } }
  ]);
  const ratingsMap = {};
  ratingsData.forEach(r => { ratingsMap[r._id] = { averageRating: r.averageRating, ratingCount: r.ratingCount }; });
  const ratingsTime = Date.now() - ratingsStart;
  console.log(`4. User.aggregate (ratings): ${ratingsData.length} items in ${ratingsTime}ms`);

  // 5. PromotionDate
  const promoStart = Date.now();
  const promoDoc = await PromotionDate.findOne().sort({ createdAt: -1 }).lean();
  const promoTime = Date.now() - promoStart;
  console.log(`5. PromotionDate.findOne: ${promoTime}ms`);

  // 6. unifyAndEnrichData
  const unifyStart = Date.now();
  const merchantMap = new Map();
  merchants.forEach(m => merchantMap.set(m._id.toString(), {
    name: (m.merchantName || m.name || 'كنوز'),
    logo: m.logo,
    role: m.role,
    shippingMethod: m.merchantShippingMethod || 'knoozbook'
  }));
  const result = unifyAndEnrichData(excelProducts, dbProducts, promoDoc, merchantMap, ratingsMap);
  const unifyTime = Date.now() - unifyStart;
  console.log(`6. unifyAndEnrichData: ${result.length} items in ${unifyTime}ms`);

  // Total
  const totalTime = fileTime + prodTime + merchTime + ratingsTime + promoTime + unifyTime;
  console.log(`\n🏁 Total calculation time: ${totalTime}ms`);

  await mongoose.disconnect();
  process.exit(0);
}

runBenchmark().catch(console.error);
