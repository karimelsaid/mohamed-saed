const { downloadAndConvertExcel } = require('../services/excel.service');
const fs = require('fs');
const path = require('path');
const FILE_ID = '1N6rRpXCZRnmw4Os9HK9X-tKS9ZWKOI9M';
const logger = require('../services/logger.service');

// Models
const Product = require('../models/Product.model');
const User = require('../models/User.model');
const PromotionDate = require('../models/PromotionDate.model');

// Cache settings
let cachedExcelData = null;
let lastExcelUpdate = 0;
let cachedUnifiedData = null;
let lastUnifiedUpdate = 0;
const isProduction = process.env.NODE_ENV === 'production';
// Increased TTL: 12 hours in production, 24 hours in dev (since it's cleared on database edits anyway)
const CACHE_TTL = isProduction ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; 

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

  let dbProducts = [];
  let merchants = [];
  let ratingsData = [];
  let promoDoc = null;

  try {
    // Run database queries in parallel for maximum speed
    const dbQueriesPromise = Promise.all([
      Product.find({ status: 'approved' }).select('-viewHistory -updatedData').lean(),
      User.find({ role: { $in: ['merchant', 'admin'] } }).select('_id name merchantName logo role merchantShippingMethod').lean(),
      User.aggregate([
        { $unwind: { path: '$ratedBooks', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$ratedBooks.bookId', averageRating: { $avg: '$ratedBooks.rating' }, ratingCount: { $sum: 1 } } }
      ]),
      PromotionDate.findOne().sort({ createdAt: -1 }).lean()
    ]);

    // Timeout database queries - increased to 15s for new server with higher latency to Atlas
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('MongoDB queries timed out')), 15000)
    );

    const [dbP, merch, ratings, promo] = await Promise.race([dbQueriesPromise, timeoutPromise]);
    dbProducts = dbP || [];
    merchants = merch || [];
    ratingsData = ratings || [];
    promoDoc = promo;
    
    // Log detailed info about merchant products (debug level only)
    const merchantProducts = dbProducts.filter(p => p.merchantId && p.merchantId.toString() !== '69d11b07df78621a8d7b1559');
    logger.debug(`Total DB products: ${dbProducts.length}, Merchant products: ${merchantProducts.length}`);
    if (merchantProducts.length > 0) {
      logger.debug(`Sample merchant products:`, merchantProducts.slice(0, 3).map(p => ({
        id: p.products_id,
        name: p.product_name,
        merchantId: p.merchantId,
        category: p.product_category
      })));
    }
  } catch (dbError) {
    logger.error('MongoDB Fallback: Database queries failed or timed out. Falling back to Excel-only data:', dbError.message);
    // Proceed with empty database arrays so the website continues to load spreadsheet products
  }
    
  const merchantMap = new Map();
  merchants.forEach(m => {
    if (!m || !m._id) {
      logger.warn('Found merchant with null/missing _id:', m);
      return;
    }
    merchantMap.set(m._id.toString(), {
      name: (m.merchantName || m.name || 'كنوز'),
      logo: m.logo,
      role: m.role,
      shippingMethod: m.merchantShippingMethod || 'knoozbook'
    });
  });

  const ratingsMap = {};
  ratingsData.forEach(r => { ratingsMap[r._id] = { averageRating: r.averageRating, ratingCount: r.ratingCount }; });

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

    // Fallback to Excel properties if DB properties are empty or missing
    const fieldsToFallback = ['publisher', 'author', 'publishYear', 'pages', 'coverType', 'language', 'weight', 'length', 'width', 'height', 'image_path', 'product_image'];
    if (excelMatch) {
      fieldsToFallback.forEach(f => {
        const dbVal = product[f];
        const excelVal = excelMatch[f];
        const isDbValEmpty = dbVal === undefined || dbVal === null || String(dbVal).trim() === '' || String(dbVal) === '0';
        const isExcelValNotEmpty = excelVal !== undefined && excelVal !== null && String(excelVal).trim() !== '' && String(excelVal) !== '0';
        if (isDbValEmpty && isExcelValNotEmpty) {
          mergedProduct[f] = excelVal;
        }
      });
    }

    const itemKey = matchKey || finalPid;
    uniqueItems.set(itemKey, mergedProduct);
    if (matchKey) excelMap.delete(matchKey);
  });

  excelMap.forEach((item, matchKey) => {
    const pid = item.products_id || matchKey;
    uniqueItems.set(matchKey, { ...item, products_id: pid, isDbProduct: false });
  });

  const jsonData = Array.from(uniqueItems.values());

  // Remove duplicates based on products_id (admin products appearing twice)
  const deduplicatedMap = new Map();
  jsonData.forEach(book => {
    const pid = book.products_id || book._id?.toString();
    if (pid) {
      deduplicatedMap.set(pid, book);
    }
  });

  const finalData = Array.from(deduplicatedMap.values());

  finalData.forEach(book => {
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

    // If product has a publisher, override merchantName with publisher name
    // so the product card/details link to the correct publisher page instead of "كنوز - المتجر الرئيسي"
    const KENOUZ_MERCHANT_NAMES = ['كنوز', 'كنوز - المتجر الرئيسي', 'تاجر كنوز', 'kenouz'];
    if (
      book.publisher &&
      typeof book.publisher === 'string' &&
      book.publisher.trim() !== '' &&
      (book.merchantRole === 'admin' || KENOUZ_MERCHANT_NAMES.includes((book.merchantName || '').toLowerCase().trim()) || KENOUZ_MERCHANT_NAMES.includes((book.merchantName || '').trim()))
    ) {
      book.merchantName = book.publisher.trim();
      book.merchantRole = 'publisher'; // Mark as virtual publisher (not admin, not merchant)
    }

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
    console.error('Error in getExcelData:', error);
    res.status(500).json({ message: 'Error fetching books', error: error.message });
  }
}

async function searchBooks(req, res) {
  try {
    const { q, page = 1, limit = 20, category, minPrice, maxPrice, publisher, author, sortBy = 'relevance' } = req.query;
    const pageNumberRaw = parseInt(page, 10);
    const limitNumberRaw = parseInt(limit, 10);
    const pageNumber = Number.isFinite(pageNumberRaw) && pageNumberRaw > 0 ? pageNumberRaw : 1;
    const limitNumber = Number.isFinite(limitNumberRaw) && limitNumberRaw > 0 ? limitNumberRaw : 20;

    const allData = await fetchUnifiedData();
    let filtered = allData;

    if (q && q.trim()) {
      // Remove extra spaces and normalize the query
      const normalizedQuery = normalizeArabic(q.trim().replace(/\s+/g, ' '));
      const keywords = normalizedQuery.split(/\s+/).filter(k => k.length > 0);
      
      filtered = filtered.filter(item => {
        // Normalize and remove extra spaces from product text
        const text = normalizeArabic(`${item.product_name || ''} ${item.author || ''} ${item.publisher || ''} ${item.merchantName || ''} ${item.product_description || ''} ${item.products_id || ''} ${item.barcode || ''} ${item.product_image || ''}`.replace(/\s+/g, ' '));
        
        // Check if ANY keyword matches (more tolerant than requiring ALL keywords)
        // This allows finding products even with typos or missing words
        return keywords.some(kw => text.includes(kw));
      });
      
      // Remove duplicates based on products_id
      const uniqueMap = new Map();
      filtered.forEach(item => {
        const key = item.products_id || item.barcode || item._id;
        if (key && !uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });
      filtered = Array.from(uniqueMap.values());
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
    else if (sortBy === 'newest') {
      filtered.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.lastStockUpdate || 0).getTime();
        const dateB = new Date(b.createdAt || b.lastStockUpdate || 0).getTime();
        return dateB - dateA;
      });
    }

    // 7. Pagination & Metadata
    const totalCount = filtered.length;
    const startIndex = (pageNumber - 1) * limitNumber;
    const paginatedItems = filtered.slice(startIndex, startIndex + limitNumber);

    // Get unique categories from the filtered set (before pagination)
    const availableCategories = [...new Set(filtered.map(item => item.product_category).filter(Boolean))].sort();

    res.json({
      success: true,
      totalCount,
      page: pageNumber,
      totalPages: Math.max(1, Math.ceil(totalCount / limitNumber)),
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

async function getBookById(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'معرف الكتاب مطلوب' });
    }
    
    const trimmedId = id.trim();
    const allData = await fetchUnifiedData();
    const book = allData.find(item => item.products_id.toString() === trimmedId);
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'الكتاب غير موجود' });
    }
    
    res.json({ success: true, data: book });
  } catch (error) {
    console.error('Error fetching book by ID:', error);
    res.status(500).json({ success: false, message: 'خطأ في جلب بيانات الكتاب', error: error.message });
  }
}

async function updateBooksData() {
  await downloadAndConvertExcel(FILE_ID);
}

async function getSimilarBooks(req, res) {
  try {
    const { category, author, excludeBookId, limit = 5, price } = req.query;
    const allData = await fetchUnifiedData();
    let filtered = allData;

    if (category) {
      const normCat = normalizeArabic(category);
      filtered = filtered.filter(item => item.product_category && normalizeArabic(item.product_category).includes(normCat));
    }

    if (author && author.trim()) {
      const normAuthor = normalizeArabic(author);
      filtered = filtered.filter(item => item.author && normalizeArabic(item.author).includes(normAuthor));
    }

    if (excludeBookId) {
      filtered = filtered.filter(item => item.products_id !== excludeBookId && item.barcode !== excludeBookId);
    }

    // Filter by price range (±50% of the original book price)
    if (price) {
      const priceNum = parseFloat(price);
      if (!isNaN(priceNum)) {
        const minPrice = priceNum * 0.5;
        const maxPrice = priceNum * 1.5;
        filtered = filtered.filter(item => {
          const itemPrice = item.product_price || 0;
          return itemPrice >= minPrice && itemPrice <= maxPrice;
        });
      }
    }

    // Shuffle to get variety
    filtered = filtered.sort(() => Math.random() - 0.5);

    const similarBooks = filtered.slice(0, parseInt(limit)).map(item => ({
      id: item.products_id,
      name: item.product_name,
      author: item.author,
      price: item.product_price,
      image: item.product_image,
      category: item.product_category,
      barcode: item.barcode
    }));

    res.json({ success: true, recommendations: similarBooks });
  } catch (error) {
    console.error('Error getting similar books:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { getExcelData, getRecentBooks, searchBooks, updateBooksData, clearBooksCache, getCategories, getBookById, getSimilarBooks };
