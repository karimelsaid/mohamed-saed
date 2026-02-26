const { downloadAndConvertExcel } = require('../services/excel.service');
const fs = require('fs');
const path = require('path');
const FILE_ID = '1N6rRpXCZRnmw4Os9HK9X-tKS9ZWKOI9M';

// Cache for enriched data
let cachedEnrichedData = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for recent books
let cachedRecentBooks = null;
let lastRecentUpdate = 0;

// جلب بيانات الكتب من ملف Excel
async function getExcelData(req, res) {
  try {
    const now = Date.now();
    if (cachedEnrichedData && (now - lastCacheUpdate < CACHE_TTL)) {
      console.log('📦 [BooksController] getExcelData: Cache HIT');
      return res.json(cachedEnrichedData);
    }
    console.log('📂 [BooksController] getExcelData: Cache MISS - Reading from file');

    fs.readFile(path.join(__dirname, '..', 'output.json'), 'utf8', async (err, data) => {
      if (err) {
        return res.status(500).json({
          message: 'حدث خطأ أثناء قراءة الملف',
          error: err
        });
      }

      try {
        const jsonData = JSON.parse(data);

        // Enrich with merchant info
        try {
          const Product = require('../models/Product.model');
          const approvedProducts = await Product.find({ status: 'approved' }).populate('merchantId', 'merchantName username logo');
          const productMap = {};
          approvedProducts.forEach(product => {
            if (product.products_id) { // Use products_id as the key
              productMap[product.products_id] = {
                merchantId: product.merchantId._id,
                merchantName: product.merchantId.merchantName || product.merchantId.username,
                merchantLogo: product.merchantId.logo,
                product_image: product.product_image
              };
            }
          });

          jsonData.forEach(book => {
            if (productMap[book.products_id]) {
              book.merchantId = productMap[book.products_id].merchantId;
              book.merchantName = productMap[book.products_id].merchantName;
              book.merchantLogo = productMap[book.products_id].merchantLogo;
              book.product_image = book.products_id; // Ensure product_image is the ID
            }
          });
        } catch (enrichError) {
          console.error('Error enriching with merchant info:', enrichError);
          // Continue without merchant info
        }

        // Enrich with ratings data
        try {
          const User = require('../models/User.model');
          const ratingsData = await User.aggregate([
            { $unwind: '$ratedBooks' },
            {
              $group: {
                _id: '$ratedBooks.bookId',
                averageRating: { $avg: '$ratedBooks.rating' },
                ratingCount: { $sum: 1 }
              }
            }
          ]);

          const ratingsMap = {};
          ratingsData.forEach(rating => {
            ratingsMap[rating._id] = {
              averageRating: rating.averageRating,
              ratingCount: rating.ratingCount
            };
          });

          jsonData.forEach(book => {
            if (ratingsMap[book.products_id]) {
              book.averageRating = ratingsMap[book.products_id].averageRating;
              book.ratingCount = ratingsMap[book.products_id].ratingCount;
            } else {
              book.averageRating = 0;
              book.ratingCount = 0;
            }
          });
        } catch (ratingError) {
          console.error('Error enriching with ratings:', ratingError);
          // Set default ratings
          jsonData.forEach(book => {
            book.averageRating = 0;
            book.ratingCount = 0;
          });
        }

        // Enrich with promotion dates to ensure countdown timer works even if sync fails
        try {
          const PromotionDate = require('../models/PromotionDate.model');
          const promoDoc = await PromotionDate.findOne().sort({ createdAt: -1 }).exec();
          if (promoDoc) {
            const now = new Date();
            const promoEndDate = promoDoc.endDate;
            const promotionStartDate = promoDoc.startDate;

            jsonData.forEach(book => {
              book.promotionEndDate = promoEndDate.toISOString();
              // Recalculate rival flag based on real-time dates
              if (promoEndDate.getTime() <= promotionStartDate.getTime()) {
                book.rival = false;
              } else {
                book.rival = now.getTime() >= promotionStartDate.getTime() && now.getTime() <= promoEndDate.getTime();
              }
            });
          }
        } catch (promoError) {
          console.error('Error enriching with promotion dates:', promoError);
        }

        cachedEnrichedData = jsonData;
        lastCacheUpdate = Date.now();
        res.json(jsonData);
      } catch (error) {
        res.status(500).json({
          message: 'حدث خطأ أثناء تحويل بيانات JSON',
          error
        });
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'حدث خطأ أثناء جلب بيانات الكتب',
      error
    });
  }
}

// دالة جديدة لإرجاع آخر 50 كتابًا مضافًا
async function getRecentBooks(req, res) {
  try {
    const now = Date.now();
    if (cachedRecentBooks && (now - lastRecentUpdate < CACHE_TTL)) {
      console.log('📦 [BooksController] getRecentBooks: Cache HIT');
      return res.json(cachedRecentBooks);
    }
    console.log('📂 [BooksController] getRecentBooks: Cache MISS - Reading from file');

    fs.readFile(path.join(__dirname, '..', 'output.json'), 'utf8', async (err, data) => {
      if (err) {
        return res.status(500).json({
          message: 'حدث خطأ أثناء قراءة الملف',
          error: err
        });
      }

      try {
        const jsonData = JSON.parse(data);
        // افتراض أن ترتيب الكتب يعكس ترتيب الإضافة
        const recentBooks = jsonData.slice(-50).reverse(); // آخر 50 كتابًا مع عكس الترتيب لعرض الأحدث أولاً

        // Enrich with merchant info
        try {
          const Product = require('../models/Product.model');
          const approvedProducts = await Product.find({ status: 'approved' }).populate('merchantId', 'merchantName username logo');
          const productMap = {};
          approvedProducts.forEach(product => {
            if (product.products_id) { // Use products_id as the key
              productMap[product.products_id] = {
                merchantId: product.merchantId._id,
                merchantName: product.merchantId.merchantName || product.merchantId.username,
                merchantLogo: product.merchantId.logo,
                product_image: product.product_image
              };
            }
          });

          recentBooks.forEach(book => {
            if (productMap[book.products_id]) {
              book.merchantId = productMap[book.products_id].merchantId;
              book.merchantName = productMap[book.products_id].merchantName;
              book.merchantLogo = productMap[book.products_id].merchantLogo;
              book.product_image = book.products_id; // Ensure product_image is the ID
            }
          });
        } catch (enrichError) {
          console.error('Error enriching with merchant info:', enrichError);
          // Continue without merchant info
        }

        // Enrich with ratings data
        try {
          const User = require('../models/User.model');
          const ratingsData = await User.aggregate([
            { $unwind: '$ratedBooks' },
            {
              $group: {
                _id: '$ratedBooks.bookId',
                averageRating: { $avg: '$ratedBooks.rating' },
                ratingCount: { $sum: 1 }
              }
            }
          ]);

          const ratingsMap = {};
          ratingsData.forEach(rating => {
            ratingsMap[rating._id] = {
              averageRating: rating.averageRating,
              ratingCount: rating.ratingCount
            };
          });

          recentBooks.forEach(book => {
            if (ratingsMap[book.products_id]) {
              book.averageRating = ratingsMap[book.products_id].averageRating;
              book.ratingCount = ratingsMap[book.products_id].ratingCount;
            } else {
              book.averageRating = 0;
              book.ratingCount = 0;
            }
          });
        } catch (ratingError) {
          console.error('Error enriching with ratings:', ratingError);
          // Set default ratings
          recentBooks.forEach(book => {
            book.averageRating = 0;
            book.ratingCount = 0;
          });
        }

        // Enrich with promotion dates to ensure countdown timer works even if sync fails
        try {
          const PromotionDate = require('../models/PromotionDate.model');
          const promoDoc = await PromotionDate.findOne().sort({ createdAt: -1 }).exec();
          if (promoDoc) {
            const now = new Date();
            const promoEndDate = promoDoc.endDate;
            const promotionStartDate = promoDoc.startDate;

            recentBooks.forEach(book => {
              book.promotionEndDate = promoEndDate.toISOString();
              // Recalculate rival flag based on real-time dates
              if (promoEndDate.getTime() <= promotionStartDate.getTime()) {
                book.rival = false;
              } else {
                book.rival = now.getTime() >= promotionStartDate.getTime() && now.getTime() <= promoEndDate.getTime();
              }
            });
          }
        } catch (promoError) {
          console.error('Error enriching with promotion dates in recent books:', promoError);
        }

        cachedRecentBooks = recentBooks;
        lastRecentUpdate = Date.now();
        res.json(recentBooks);
      } catch (error) {
        res.status(500).json({
          message: 'حدث خطأ أثناء تحويل بيانات JSON',
          error
        });
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'حدث خطأ أثناء جلب بيانات الكتب',
      error
    });
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
  updateBooksData
};
