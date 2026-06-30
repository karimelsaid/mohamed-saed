const Product = require('../models/Product.model');

/**
 * Quick Actions Controller
 * Provides smart quick actions to reduce AI token consumption
 * and improve user experience
 */

/**
 * Get all available categories from MongoDB
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
exports.getCategories = async (req, res) => {
  try {
    // Get unique categories from products
    const categories = await Product.distinct('product_category');

    // Filter out empty or null categories
    const validCategories = categories.filter(cat => cat && cat.trim() !== '');

    // Sort categories alphabetically
    validCategories.sort((a, b) => a.localeCompare(b, 'ar'));

    return res.status(200).json({
      success: true,
      data: validCategories
    });
  } catch (error) {
    console.error('Error in getCategories:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب التصنيفات',
      error: error.message
    });
  }
};

/**
 * Get top selling books (MongoDB direct query)
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
exports.getTopSelling = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Get top selling books sorted by sales or quantity
    const topSelling = await Product.find({
      product_quantity: { $gt: 0 } // Only available books
    })
      .sort({ product_quantity: -1 }) // Sort by quantity (assuming higher quantity = more sales)
      .limit(limit)
      .select('products_id product_name product_author product_price product_category product_description product_quantity');

    const formattedBooks = topSelling.map(book => ({
      id: book.products_id,
      title: book.product_name,
      author: book.product_author || 'غير محدد',
      price: book.product_price,
      category: book.product_category,
      description: book.product_description,
      quantity: book.product_quantity,
      buyUrl: `https://knoozbook.com/book/${book.products_id}`
    }));

    return res.status(200).json({
      success: true,
      data: formattedBooks
    });
  } catch (error) {
    console.error('Error in getTopSelling:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الأكثر مبيعاً',
      error: error.message
    });
  }
};

/**
 * Get newest books (MongoDB direct query)
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
exports.getNewestBooks = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Get newest books sorted by creation date
    const newestBooks = await Product.find({
      product_quantity: { $gt: 0 } // Only available books
    })
      .sort({ createdAt: -1 }) // Sort by creation date (newest first)
      .limit(limit)
      .select('products_id product_name product_author product_price product_category product_description product_quantity');

    const formattedBooks = newestBooks.map(book => ({
      id: book.products_id,
      title: book.product_name,
      author: book.product_author || 'غير محدد',
      price: book.product_price,
      category: book.product_category,
      description: book.product_description,
      quantity: book.product_quantity,
      buyUrl: `https://knoozbook.com/book/${book.products_id}`
    }));

    return res.status(200).json({
      success: true,
      data: formattedBooks
    });
  } catch (error) {
    console.error('Error in getNewestBooks:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب أحدث الكتب',
      error: error.message
    });
  }
};

/**
 * Search books by category (MongoDB direct query)
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
exports.searchByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد التصنيف'
      });
    }

    // Search books by category
    const books = await Product.find({
      product_category: category,
      product_quantity: { $gt: 0 } // Only available books
    })
      .limit(limit)
      .select('products_id product_name product_author product_price product_category product_description product_quantity');

    const formattedBooks = books.map(book => ({
      id: book.products_id,
      title: book.product_name,
      author: book.product_author || 'غير محدد',
      price: book.product_price,
      category: book.product_category,
      description: book.product_description,
      quantity: book.product_quantity,
      buyUrl: `https://knoozbook.com/book/${book.products_id}`
    }));

    return res.status(200).json({
      success: true,
      data: formattedBooks,
      category: category,
      count: formattedBooks.length
    });
  } catch (error) {
    console.error('Error in searchByCategory:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في البحث حسب التصنيف',
      error: error.message
    });
  }
};

/**
 * Smart search (direct MongoDB search)
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
exports.smartSearch = async (req, res) => {
  try {
    const { query } = req.query;
    const limit = parseInt(req.query.limit) || 10;

    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد كلمة البحث'
      });
    }

    // Search in title, author, and description
    const books = await Product.find({
      $or: [
        { product_name: { $regex: query, $options: 'i' } },
        { product_author: { $regex: query, $options: 'i' } },
        { product_description: { $regex: query, $options: 'i' } }
      ],
      product_quantity: { $gt: 0 } // Only available books
    })
      .limit(limit)
      .select('products_id product_name product_author product_price product_category product_description product_quantity');

    const formattedBooks = books.map(book => ({
      id: book.products_id,
      title: book.product_name,
      author: book.product_author || 'غير محدد',
      price: book.product_price,
      category: book.product_category,
      description: book.product_description,
      quantity: book.product_quantity,
      buyUrl: `https://knoozbook.com/book/${book.products_id}`
    }));

    return res.status(200).json({
      success: true,
      data: formattedBooks,
      query: query,
      count: formattedBooks.length
    });
  } catch (error) {
    console.error('Error in smartSearch:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في البحث الذكي',
      error: error.message
    });
  }
};

/**
 * Get personalized quick actions for user
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
exports.getPersonalizedActions = async (req, res) => {
  try {
    const { conversationId } = req.query;

    if (!conversationId) {
      // Return default actions for new users
      return res.status(200).json({
        success: true,
        data: getDefaultQuickActions(),
        personalized: false
      });
    }

    // TODO: Get user preferences from conversation
    // For now, return default actions
    return res.status(200).json({
      success: true,
      data: getDefaultQuickActions(),
      personalized: false
    });
  } catch (error) {
    console.error('Error in getPersonalizedActions:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الإجراءات المخصصة',
      error: error.message
    });
  }
};

/**
 * Get default quick actions
 * @returns {Array} - Default quick actions
 */
function getDefaultQuickActions() {
  return [
    {
      id: 'recommend_book',
      title: 'أرشح لي كتاباً',
      icon: '📚',
      action: 'recommend',
      requiresAI: true,
      subActions: [
        { id: 'success', title: 'أريد النجاح', icon: '🎯' },
        { id: 'business', title: 'تعلم التجارة', icon: '💰' },
        { id: 'psychology', title: 'تحسين حالتي النفسية', icon: '🧠' },
        { id: 'relationships', title: 'العلاقات', icon: '❤️' },
        { id: 'novel', title: 'رواية مشوقة', icon: '📖' },
        { id: 'horror', title: 'رعب', icon: '👻' },
        { id: 'islamic', title: 'إسلاميات', icon: '🕋' },
        { id: 'self_development', title: 'تنمية الذات', icon: '📚' },
        { id: 'leadership', title: 'القيادة', icon: '🏆' },
        { id: 'entrepreneurship', title: 'ريادة الأعمال', icon: '💼' }
      ]
    },
    {
      id: 'search_book',
      title: 'أبحث عن كتاب',
      icon: '📖',
      action: 'search',
      requiresAI: false
    },
    {
      id: 'top_selling',
      title: 'الأكثر مبيعاً',
      icon: '🔥',
      action: 'top_selling',
      requiresAI: false
    },
    {
      id: 'newest',
      title: 'أحدث الكتب',
      icon: '🆕',
      action: 'newest',
      requiresAI: false
    },
    {
      id: 'gift',
      title: 'رشح لي هدية',
      icon: '🎁',
      action: 'gift',
      requiresAI: true
    },
    {
      id: 'by_category',
      title: 'حسب التصنيف',
      icon: '📚',
      action: 'category',
      requiresAI: false
    }
  ];
}

/**
 * Get category-specific quick actions
 * @returns {Array} - Category quick actions
 */
function getCategoryQuickActions() {
  return [
    { id: 'self_development', title: 'تطوير الذات', icon: '❤️', category: 'تطوير الذات' },
    { id: 'business', title: 'إدارة الأعمال', icon: '💼', category: 'إدارة الأعمال' },
    { id: 'novels', title: 'الروايات', icon: '📖', category: 'روايات' },
    { id: 'islamic', title: 'الكتب الإسلامية', icon: '🕌', category: 'إسلاميات' },
    { id: 'parenting', title: 'تربية الأطفال', icon: '👨‍👩‍👧', category: 'تربية' },
    { id: 'horror', title: 'الرعب والغموض', icon: '👻', category: 'رعب' },
    { id: 'relationships', title: 'العلاقات', icon: '❤️', category: 'علاقات' },
    { id: 'psychology', title: 'علم النفس', icon: '🧠', category: 'علم نفس' }
  ];
}

/**
 * Get all quick actions (default + categories)
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
exports.getAllQuickActions = async (req, res) => {
  try {
    const { conversationId } = req.query;

    // Get default actions
    const defaultActions = getDefaultQuickActions();
    const categoryActions = getCategoryQuickActions();

    // TODO: Add personalized actions based on conversationId
    let personalizedActions = [];
    if (conversationId) {
      // Get user preferences and add personalized action
      // For now, this is a placeholder
    }

    return res.status(200).json({
      success: true,
      data: {
        default: defaultActions,
        categories: categoryActions,
        personalized: personalizedActions
      }
    });
  } catch (error) {
    console.error('Error in getAllQuickActions:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الإجراءات السريعة',
      error: error.message
    });
  }
};
