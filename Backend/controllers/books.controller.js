const { downloadAndConvertExcel } = require('../services/excel.service');
const fs = require('fs');
const path = require('path');
const FILE_ID = '1N6rRpXCZRnmw4Os9HK9X-tKS9ZWKOI9M';

// Cache for enriched data
let cachedEnrichedData = null;
let lastCacheUpdate = 0;
const Product = require('../models/Product.model');
const User = require('../models/User.model'); // Added this import

// Cache for enriched data - This will be removed/replaced by cachedExcelData
// let cachedEnrichedData = null;
// let lastCacheUpdate = 0;
// const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for recent books
let cachedRecentBooks = null;
let lastRecentUpdate = 0;

// Cache for Excel data (output.json)
let cachedExcelData = null;
let lastExcelUpdate = 0;

// Cache for unified result (Excel + DB)
let cachedUnifiedData = null;
let lastUnifiedUpdate = 0;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes (reduced from 5 to stay fresher)

function clearBooksCache() {
  console.log('🧹 [BooksController] Clearing unified data cache');
  cachedUnifiedData = null;
  lastUnifiedUpdate = 0;
}

// Helper to get a consistent key for matching (prefer numeric barcode)
const getMatchKey = (item) => {
  if (!item) return null;
  // 1. If numeric products_id exists, use it
  if (item.products_id && /^\d+$/.test(item.products_id.toString())) {
    return item.products_id.toString();
  }

  // 2. If product_image is a numeric barcode, use it
  if (item.product_image && /^\d+$/.test(item.product_image.toString())) {
    return item.product_image.toString();
  }

  // 3. Try to extract ID from path (e.g. "admin__.../393/393.webp")
  if (item.product_image && typeof item.product_image === 'string' && item.product_image.includes('/')) {
    const parts = item.product_image.split('/');
    const folder = parts[parts.length - 2];
    const filename = parts[parts.length - 1].split('.')[0];
    if (/^\d+$/.test(folder)) return folder;
    if (/^\d+$/.test(filename)) return filename;
  }

  // 4. Default to Mongo ID if available
  return item.products_id || (item._id ? item._id.toString() : null);
};

/**
 * Centralized helper to unify Excel and DB products with consistent promotional logic
 */
function unifyAndEnrichData(excelProducts, dbProducts, promoDoc, merchantMap, ratingsMap) {
  const uniqueItems = new Map();
  const excelMap = new Map();
  const nowTime = new Date();

  // 1. Map Excel products for matching
  excelProducts.forEach(item => {
    const matchKey = getMatchKey(item);
    if (matchKey) excelMap.set(matchKey, item);
  });

  // 2. Process DB products (Authoritative for Merchant/Stock, but merge with Excel Promos)
  dbProducts.forEach(product => {
    const matchKey = getMatchKey(product);
    const excelMatch = excelMap.get(matchKey);

    let finalPid = product._id.toString();
    if (excelMatch && excelMatch.products_id) {
      finalPid = excelMatch.products_id.toString();
    } else if (matchKey && /^\d+$/.test(matchKey)) {
      finalPid = matchKey;
    } else if (product.products_id) {
      finalPid = product.products_id.toString();
    }

    const mergedProduct = {
      ...(excelMatch || {}),
      ...product,
      products_id: finalPid,
      _id: product._id.toString(),
      isDbProduct: true
    };

    // For products with a matching Excel entry, Excel is the source of truth for pricing.
    // DB may have stale prices that differ from the current Excel/output.json data.
    if (excelMatch) {
      if (excelMatch.product_price !== undefined) {
        mergedProduct.product_price = excelMatch.product_price;
      }
      if (excelMatch.product_price_before_discount !== undefined) {
        mergedProduct.product_price_before_discount = excelMatch.product_price_before_discount;
      }
      if (excelMatch.product_discount_percent !== undefined) {
        mergedProduct.product_discount_percent = excelMatch.product_discount_percent;
      }
      if (excelMatch.price_cost !== undefined) {
        mergedProduct.price_cost = excelMatch.price_cost;
      }
    }

    // Apply Price/Promo Restoration Logic
    if (excelMatch) {
      const excelPriceBefore = Number(excelMatch.product_price_before_discount) || 0;
      const excelPriceDiscounted = Number(excelMatch.product_price) || 0;
      const dbPrice = Number(product.product_price) || 0;

      // Restore 'price before discount' if Excel has a better (higher) one
      const currentBefore = Number(mergedProduct.product_price_before_discount) || 0;
      if (excelPriceBefore > currentBefore || currentBefore === 0) {
        mergedProduct.product_price_before_discount = excelPriceBefore;
      }

      // Restore Excel discounted price if it's lower than DB and we have a valid 'before' price
      const finalBefore = Number(mergedProduct.product_price_before_discount) || 0;
      if (excelPriceDiscounted > 0 && excelPriceDiscounted < dbPrice && finalBefore > excelPriceDiscounted) {
        mergedProduct.product_price = excelPriceDiscounted;
      }

      if (!product.product_discount_percent && excelMatch.product_discount_percent) {
        mergedProduct.product_discount_percent = excelMatch.product_discount_percent;
      }

      // Force 'rival' status to true if a valid discount exists (ensures badges show in listing pages)
      if (excelMatch.rival === true || finalBefore > Number(mergedProduct.product_price)) {
        mergedProduct.rival = true;
      } else if (product.rival === undefined && excelMatch.rival !== undefined) {
        mergedProduct.rival = excelMatch.rival;
      }
    }
    // Guard: If this key already exists in uniqueItems (from a previous DB product that was
    // already merged with Excel), skip this duplicate to prevent overwriting with stale data.
    const itemKey = matchKey || finalPid;
    if (uniqueItems.has(itemKey) && !excelMatch) {
      // This is a duplicate DB product without an Excel match — skip it
      return;
    }
    uniqueItems.set(itemKey, mergedProduct);
    if (matchKey) excelMap.delete(matchKey);
  });

  // 3. Add remaining Excel products
  excelMap.forEach((item, matchKey) => {
    const pid = item.products_id || matchKey || (item._id ? item._id.toString() : null);
    uniqueItems.set(matchKey, {
      ...item,
      products_id: pid,
      isDbProduct: false
    });
  });

  const jsonData = Array.from(uniqueItems.values());

  // 4. Enrich with Merchants, Ratings, and Global Promotion
  jsonData.forEach(book => {
    // Merchant Info
    if (merchantMap && book.merchantId) {
      const mInfo = merchantMap.get(book.merchantId.toString());
      if (mInfo) {
        book.merchantName = mInfo.name;
        book.merchantLogo = mInfo.logo;
        book.merchantRole = mInfo.role;
        book.shippingMethod = mInfo.shippingMethod;
      }
    }

    // Ratings
    if (ratingsMap && ratingsMap[book.products_id]) {
      book.averageRating = ratingsMap[book.products_id].averageRating;
      book.ratingCount = ratingsMap[book.products_id].ratingCount;
    } else {
      book.averageRating = book.averageRating || 0;
      book.ratingCount = book.ratingCount || 0;
    }

    // Global Promotion
    if (promoDoc) {
      const promoEndDate = new Date(promoDoc.endDate);
      const promotionStartDate = new Date(promoDoc.startDate);
      book.promotionEndDate = promoEndDate.toISOString();

      let globalRival = false;
      if (promoEndDate.getTime() > promotionStartDate.getTime()) {
        globalRival = nowTime.getTime() >= promotionStartDate.getTime() && nowTime.getTime() <= promoEndDate.getTime();
      }
      book.rival = book.rival || globalRival;
    }

    // AUTO-FIX: Ensure original price and discount percent are consistent
    let finalPrice = Number(book.product_price) || 0;
    let currentBefore = Number(book.product_price_before_discount) || 0;
    let discountPercent = Number(book.product_discount_percent) || 0;

    // 0. DATA SANITATION: If 'before' is lower than 'current', swap them
    if (currentBefore > 0 && currentBefore < finalPrice) {
      const temp = finalPrice;
      finalPrice = currentBefore;
      currentBefore = temp;
      book.product_price = finalPrice;
      book.product_price_before_discount = currentBefore;
    }

    // Fix negative percentages
    if (discountPercent < 0) {
      discountPercent = Math.abs(discountPercent);
      book.product_discount_percent = discountPercent;
    }

    // 1. If we have a valid 'before' price higher than current, calculate percent if missing
    if (currentBefore > finalPrice && (discountPercent === 0)) {
      book.product_discount_percent = Math.round(((currentBefore - finalPrice) / currentBefore) * 100);
      discountPercent = book.product_discount_percent;
    }

    // 2. If we have percent but 'before' is missing or same as current, calculate 'before'
    if (discountPercent > 0 && (currentBefore <= finalPrice || currentBefore === 0)) {
      book.product_price_before_discount = Math.round(finalPrice / (1 - discountPercent / 100));
    }
  });

  return jsonData;
}

// Unified function to get both Excel and DB products
async function getExcelData(req, res) {
  try {
    const now = Date.now();
    
    // Check full unified cache first
    if (cachedUnifiedData && (now - lastUnifiedUpdate < CACHE_TTL)) {
      // console.log('⚡ [BooksController] Returning cached unified result');
      return res.json(cachedUnifiedData);
    }

    let excelProducts = [];
    const filePath = path.join(__dirname, '..', 'output.json');
    if (cachedExcelData && (now - lastExcelUpdate < (CACHE_TTL * 2.5))) { // Excel cache can be older
      excelProducts = cachedExcelData;
    } else if (fs.existsSync(filePath)) {
      excelProducts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      cachedExcelData = excelProducts;
      lastExcelUpdate = now;
    }

    const dbProducts = await Product.find({ status: 'approved' }).lean();

    // Get Merchants & Admins to properly identify "Kenouz" products
    const merchants = await User.find({ role: { $in: ['merchant', 'admin'] } }).select('_id name merchantName logo role merchantShippingMethod').lean();
    const merchantMap = new Map();
    merchants.forEach(m => merchantMap.set(m._id.toString(), {
      name: m.role === 'admin' ? 'تاجر كنوز' : (m.merchantName || m.name),
      logo: m.logo,
      role: m.role,
      shippingMethod: m.merchantShippingMethod || 'knoozbook'
    }));

    // Get Promotion
    const PromotionDate = require('../models/PromotionDate.model');
    const promoDoc = await PromotionDate.findOne().sort({ createdAt: -1 }).lean();

    const result = unifyAndEnrichData(excelProducts, dbProducts, promoDoc, merchantMap, null);

    // Update unified cache
    cachedUnifiedData = result;
    lastUnifiedUpdate = now;

    console.log(`✅ [BooksController] Unified ${result.length} items (${dbProducts.length} from DB)`);
    res.json(result);
  } catch (error) {
    console.error('❌ [BooksController] error in getExcelData:', error);
    res.status(500).json({ message: 'Error fetching unified books', error: error.message });
  }
}

// دالة لإرجاع آخر 50 كتابًا مضافًا مع توحيد البيانات
async function getRecentBooks(req, res) {
  try {
    const now = Date.now();
    let excelProducts = [];
    const filePath = path.join(__dirname, '..', 'output.json');

    // 1. Get all Excel products
    if (fs.existsSync(filePath)) {
      excelProducts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    // 2. Get all approved DB products
    const dbProducts = await Product.find({ status: 'approved' }).lean();

    // 3. Get Merchants
    const merchants = await User.find({ role: 'merchant' }).select('_id name merchantName logo merchantShippingMethod').lean();
    const merchantMap = new Map();
    merchants.forEach(m => merchantMap.set(m._id.toString(), {
      name: m.merchantName || m.name,
      logo: m.logo,
      shippingMethod: m.merchantShippingMethod || 'knoozbook'
    }));

    // 4. Get Ratings (Aggregate)
    const ratingsData = await User.aggregate([
      { $unwind: { path: '$ratedBooks', preserveNullAndEmptyArrays: false } }, // Bug fix: ignore users with no ratings
      { $group: { _id: '$ratedBooks.bookId', averageRating: { $avg: '$ratedBooks.rating' }, ratingCount: { $sum: 1 } } }
    ]);
    const ratingsMap = {};
    ratingsData.forEach(r => { ratingsMap[r._id] = { averageRating: r.averageRating, ratingCount: r.ratingCount }; });

    // 5. Get Promotion
    const PromotionDate = require('../models/PromotionDate.model');
    const promoDoc = await PromotionDate.findOne().sort({ createdAt: -1 }).lean();

    // 6. Unify EVERYTHING
    const unified = unifyAndEnrichData(excelProducts, dbProducts, promoDoc, merchantMap, ratingsMap);

    // 7. Sort by createdAt (or fallback for Excel items) and take top 50
    const sorted = unified.sort((a, b) => {
      // Use the best available date: createdAt, lastStockUpdate, or a fallback date field if it exists
      const dateA = (a.createdAt || a.lastStockUpdate || a.date) ? new Date(a.createdAt || a.lastStockUpdate || a.date).getTime() : 0;
      const dateB = (b.createdAt || b.lastStockUpdate || b.date) ? new Date(b.createdAt || b.lastStockUpdate || b.date).getTime() : 0;
      return dateB - dateA;
    }).slice(0, 50);

    console.log(`📦 [BooksController] getRecentBooks: Unified and sorted ${sorted.length} items`);
    res.json(sorted);
  } catch (error) {
    console.error('❌ [BooksController] error in getRecentBooks:', error);
    res.status(500).json({ message: 'Error fetching recent books', error: error.message });
  }
}

// تنزيل وتحويل بيانات Excel من Google Drive
async function updateBooksData() {
  try {
    console.log('جاري تحديث بيانات الكتب من Google Drive...');
    await downloadAndConvertExcel(FILE_ID);
    console.log('✅ تم تحديث بيانات الكتب بنجاح');
  } catch (error) {
    console.error('❌ فشل في تحديث بيانات الكتب:', error);
    throw error;
  }
}

module.exports = {
  getExcelData,
  getRecentBooks,
  updateBooksData,
  clearBooksCache
};
