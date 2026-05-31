const { downloadAndConvertExcel } = require('../services/excel.service');
const fs = require('fs');
const path = require('path');
const FILE_ID = '1N6rRpXCZRnmw4Os9HK9X-tKS9ZWKOI9M';

// Models
const Product = require('../models/Product.model');
const User = require('../models/User.model');
const PromotionDate = require('../models/PromotionDate.model');

// Cache settings
let cachedExcelData = null;
let lastExcelUpdate = 0;
let cachedUnifiedData = null;
let lastUnifiedUpdate = 0;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function clearBooksCache() {
  console.log('🧹 [BooksController] Clearing unified data cache');
  cachedUnifiedData = null;
  lastUnifiedUpdate = 0;
}

// Helper to normalize Arabic text for consistent searching
function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[يى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // Remove Harakat (diacritics)
    .toLowerCase()
    .trim();
}

/**
 * Internal helper to get unified (Excel + DB) data with caching
 */
async function fetchUnifiedData() {
  const now = Date.now();
  
  if (cachedUnifiedData && (now - lastUnifiedUpdate < CACHE_TTL)) {
    return cachedUnifiedData;
  }

  let excelProducts = [];
  const filePath = path.join(__dirname, '..', 'output.json');
  
  if (cachedExcelData && (now - lastExcelUpdate < (CACHE_TTL * 5))) {
    excelProducts = cachedExcelData;
  } else if (fs.existsSync(filePath)) {
    try {
      excelProducts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      cachedExcelData = excelProducts;
      lastExcelUpdate = now;
    } catch (e) {
      console.error('Error parsing output.json:', e);
    }
  }

  const dbProducts = await Product.find({ status: 'approved' }).lean();

  const merchants = await User.find({ role: { $in: ['merchant', 'admin'] } })
    .select('_id name merchantName logo role merchantShippingMethod')
    .lean();
    
  const merchantMap = new Map();
  merchants.forEach(m => merchantMap.set(m._id.toString(), {
    name: (m.merchantName || m.name || 'كنوز'),
    logo: m.logo,
    role: m.role,
    shippingMethod: m.merchantShippingMethod || 'knoozbook'
  }));

  const ratingsData = await User.aggregate([
    { $unwind: { path: '$ratedBooks', preserveNullAndEmptyArrays: false } },
    { $group: { _id: '$ratedBooks.bookId', averageRating: { $avg: '$ratedBooks.rating' }, ratingCount: { $sum: 1 } } }
  ]);
  const ratingsMap = {};
  ratingsData.forEach(r => { ratingsMap[r._id] = { averageRating: r.averageRating, ratingCount: r.ratingCount }; });

  const promoDoc = await PromotionDate.findOne().sort({ createdAt: -1 }).lean();

  const result = unifyAndEnrichData(excelProducts, dbProducts, promoDoc, merchantMap, ratingsMap);

  // Filter out digital products from the public physical listing
  const filteredResult = result.filter(item => {
    const isDigital = item.is_digital === true || 
                      item.is_digital === 'true' || 
                      (item.products_id && String(item.products_id).startsWith('DIG-')) ||
                      (item.barcode && String(item.barcode).startsWith('DIG-'));
    return !isDigital;
  });

  cachedUnifiedData = filteredResult;
  lastUnifiedUpdate = now;

  console.log(`✅ [BooksController] Unified ${filteredResult.length} items (${dbProducts.length} from DB)`);
  return filteredResult;
}

const getMatchKey = (item) => {
  if (!item) return null;
  if (item.products_id && /^\d+$/.test(item.products_id.toString())) return item.products_id.toString();
  if (item.product_image && /^\d+$/.test(item.product_image.toString())) return item.product_image.toString();
  return item.products_id || (item._id ? item._id.toString() : null);
};

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

async function getExcelData(req, res) {
  try {
    if (req.query.clearCache === 'true') clearBooksCache();
    const result = await fetchUnifiedData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching books', error: error.message });
  }
}

async function searchBooks(req, res) {
  try {
    const { q, page = 1, limit = 20, category, minPrice, maxPrice, publisher, author, sortBy = 'relevance' } = req.query;
    const allData = await fetchUnifiedData();
    let filtered = allData;

    if (q && q.trim()) {
      const keywords = normalizeArabic(q).split(/\s+/).filter(k => k.length > 0);
      filtered = filtered.filter(item => {
        const text = normalizeArabic(`${item.product_name} ${item.author} ${item.publisher} ${item.merchantName || ''} ${item.product_description} ${item.products_id} ${item.barcode} ${item.product_image}`);
        return keywords.every(kw => text.includes(kw));
      });
    }

    if (category) {
      const normCat = normalizeArabic(category);
      filtered = filtered.filter(item => item.product_category && normalizeArabic(item.product_category).includes(normCat));
    }

    if (author) {
      const normAuthor = normalizeArabic(author);
      filtered = filtered.filter(item => item.author && normalizeArabic(item.author).includes(normAuthor));
    }

    if (publisher) {
      const normPub = normalizeArabic(publisher);
      filtered = filtered.filter(item => item.publisher && normalizeArabic(item.publisher).includes(normPub));
    }

    if (minPrice) filtered = filtered.filter(item => (item.product_price || 0) >= parseFloat(minPrice));
    if (maxPrice) filtered = filtered.filter(item => (item.product_price || 0) <= parseFloat(maxPrice));

    if (sortBy === 'priceAsc') filtered.sort((a, b) => (a.product_price || 0) - (b.product_price || 0));
    else if (sortBy === 'priceDesc') filtered.sort((a, b) => (b.product_price || 0) - (a.product_price || 0));
    else if (sortBy === 'newest') filtered.sort((a, b) => (b.isDbProduct ? 1 : 0) - (a.isDbProduct ? 1 : 0));

    // 7. Pagination & Metadata
    const totalCount = filtered.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedItems = filtered.slice(startIndex, startIndex + parseInt(limit));

    // Get unique categories from the filtered set (before pagination)
    const availableCategories = [...new Set(filtered.map(item => item.product_category).filter(Boolean))].sort();

    res.json({
      success: true,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      items: paginatedItems,
      availableCategories
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Search error', error: error.message });
  }
}

async function getRecentBooks(req, res) {
  try {
    const unified = await fetchUnifiedData();
    const sorted = [...unified].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.lastStockUpdate || 0).getTime();
      const dateB = new Date(b.createdAt || b.lastStockUpdate || 0).getTime();
      return dateB - dateA;
    }).slice(0, 50);
    res.json(sorted);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching recent books', error: error.message });
  }
}

async function getCategories(req, res) {
  try {
    const allData = await fetchUnifiedData();
    const categories = [...new Set(allData.map(item => item.product_category).filter(Boolean))].sort();
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
}

async function updateBooksData() {
  await downloadAndConvertExcel(FILE_ID);
}

module.exports = { getExcelData, getRecentBooks, searchBooks, updateBooksData, clearBooksCache, getCategories };
