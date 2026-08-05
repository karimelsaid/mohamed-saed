const Product = require('../models/Product.model');
const SemanticSearchService = require('./semantic-search.service');
const KnowledgeMapService = require('./knowledge-map.service');
const IntentExpansionService = require('./intent-expansion.service');
const ConversationMemoryService = require('./conversation-memory.service');
const BookRequest = require('../models/BookRequest.model');
const { arabicFuzzyRegex, normalizeArabic } = require('../utils/arabic-normalizer');

/**
 * Book Search Service
 * خدمة البحث عن الكتب باستخدام MongoDB - Sales Recommendation Engine
 */
class BookSearchService {
  constructor() {
    // قائمة Aliases للكتب المشهورة
    this.bookAliases = {
      'فن اللامبالاة': ['اللامبالاة', 'The Subtle Art', 'Mark Manson', 'فن اللامبالا'],
      'الأب الغني والأب الفقير': ['الاب الغني والاب الفقير', 'Rich Dad Poor Dad', 'Robert Kiyosaki'],
      'العادات الذرية': ['العادة الذرية', 'Atomic Habits', 'James Clear'],
      'قوة الآن': ['القوة الحالية', 'The Power of Now', 'Eckhart Tolle'],
      'القوة الداخلية': ['القوة الداخليه', 'Inner Strength'],
      'القوة الخفية': ['القوة الخفيه', 'Hidden Power'],
      'كيف تصبح غنياً': ['كيف تصبح غني', 'How to Get Rich'],
      'التفكير وإثراؤه': ['التفكير واثراؤه', 'Think and Grow Rich', 'Napoleon Hill'],
      'السبعة عادات': ['السبعة عادات', 'The 7 Habits', 'Stephen Covey'],
      'من لا يكفي': ['من لا يكفيك', 'Not Enough', 'أنت لا تكفي']
    };

    // Keyword Expansion Map
    this.keywordExpansion = {
      'الأمل': ['التفاؤل', 'النجاح', 'الصبر', 'الأزمات', 'التغيير', 'الحياة', 'الشفاء', 'الطاقة', 'الإيجابية', 'الثقة', 'الإلهام', 'الحماس', 'الأهداف', 'التحفيز'],
      'التجارة': ['الأعمال', 'التسويق', 'المبيعات', 'الاستثمار', 'ريادة الأعمال', 'إدارة الأعمال', 'التجارة الإلكترونية'],
      'النجاح': ['الإنجاز', 'التميز', 'التفوق', 'النمو', 'التطور', 'الإنتاجية', 'القيادة'],
      'الحب': ['الرومانسية', 'العلاقات', 'الزواج', 'الأسرة', 'الصداقة'],
      'الخوف': ['القلق', 'التوتر', 'الرهاب', 'الشجاعة', 'الثقة بالنفس'],
      'الحزن': ['الاكتئاب', 'الألم', 'المعاناة', 'الشفاء', 'الأمل'],
      'المال': ['الثروة', 'الاستثمار', 'التوفير', 'الاقتصاد', 'التمويل']
    };
  }

  /**
   * البحث عن كتب بناءً على استعلام نصي - Sales Recommendation Engine
   * @param {string} query - استعلام البحث
   * @param {Object} options - خيارات البحث
   * @param {Array} excludedBookIds - معرفات الكتب المستبعدة
   * @param {string} conversationId - معرف المحادثة (للاستخدام مع Conversation Memory)
   * @param {Object} intentAnalysis - تحليل Intent (اختياري)
   * @returns {Promise<Object>} - كائن يحتوي على الكتب ورسالة التوصية
   */
  async searchBooks(query, options = {}, excludedBookIds = [], conversationId = null, intentAnalysis = null) {
    const {
      limit = 10,
      category = null,
      minPrice = null,
      maxPrice = null,
      inStockOnly = true,
      useRecommendationEngine = true
    } = options;

    try {
      // التحقق من Conversation Memory أولاً
      if (conversationId) {
        const bookInMemory = ConversationMemoryService.findBookInMemory(conversationId, query);
        if (bookInMemory) {
          console.log('[BookSearch] Book found in conversation memory:', bookInMemory.title);
          return {
            books: [bookInMemory],
            message: null,
            recommendationReason: null,
            fromMemory: true
          };
        }
      }

      // بناء استعلام البحث الأساسي
      const baseQuery = {
        status: 'approved',
        product_quantity: inStockOnly ? { $gt: 0 } : { $gte: 0 }
      };

      // تصفية حسب التصنيف
      if (category) {
        baseQuery.product_category = category;
      }

      // تصفية حسب السعر
      if (minPrice !== null || maxPrice !== null) {
        baseQuery.product_price = {};
        if (minPrice !== null) {
          baseQuery.product_price.$gte = minPrice;
        }
        if (maxPrice !== null) {
          baseQuery.product_price.$lte = maxPrice;
        }
      }

      // إذا لم يوجد استعلام، إرجاع الكتب الشائعة
      if (!query || !query.trim()) {
        const popularBooks = await this.getPopularBooks(limit);
        return {
          books: popularBooks,
          message: 'هذه كتب شائعة قد تناسبك',
          recommendationReason: null
        };
      }

      // التحقق من أن الاستعلام هو اسم كتاب محدد (بدون Intent Expansion)
      const isSpecificBookName = this.isSpecificBookName(query.trim());
      
      if (isSpecificBookName) {
        console.log('[BookSearch] Detected specific book name, skipping intent expansion');
        // البحث المباشر عن الكتاب بدون Intent Expansion
        const searchResults = await this.multiStageSearch(query.trim(), baseQuery, limit);
        
        // استبعاد الكتب المحددة
        let finalResults = searchResults;
        if (excludedBookIds.length > 0) {
          finalResults = searchResults.filter(book => !excludedBookIds.includes(book.id));
        }
        
        if (finalResults.length > 0) {
          const validResults = this.filterValidBooks(finalResults);
          return {
            books: validResults,
            message: 'تم العثور على الكتاب',
            recommendationReason: null
          };
        }
        
        // إذا لم يتم العثور على الكتاب، حفظ الطلب
        if (conversationId && query.trim()) {
          await this.saveMissingBookRequest(query.trim(), conversationId, intentAnalysis);
        }
        
        const popularBooks = await this.getPopularBooks(limit);
        return {
          books: popularBooks,
          message: 'هذه كتب شائعة قد تناسبك',
          recommendationReason: null,
          bookNotFound: true,
          requestedBook: query.trim()
        };
      }

      // استخدام Multi-stage Search للبحث الشامل
      const searchResults = await this.multiStageSearch(query.trim(), baseQuery, limit);

      // استبعاد الكتب المحددة
      let finalResults = searchResults;
      if (excludedBookIds.length > 0) {
        finalResults = searchResults.filter(book => !excludedBookIds.includes(book.id));
      }

      // إذا لم توجد نتائج، استخدم Keyword Expansion
      if (finalResults.length === 0) {
        const expandedQueries = this.expandKeywords(query.trim());
        for (const expandedQuery of expandedQueries) {
          const expandedResults = await this.multiStageSearch(expandedQuery, baseQuery, limit);
          if (expandedResults.length > 0) {
            finalResults = expandedResults;
            break;
          }
        }
      }

      // إذا لم توجد نتائج بعد، استخدم Semantic Recommendation
      if (finalResults.length === 0) {
        finalResults = await this.semanticRecommendation(query.trim(), baseQuery, limit);
      }

      // التحقق من عدد النتائج وتوسيع البحث إذا لزم الأمر
      if (finalResults.length < 3 && finalResults.length > 0) {
        const additionalResults = await this.semanticRecommendation(query.trim(), baseQuery, limit - finalResults.length);
        finalResults = [...finalResults, ...additionalResults].slice(0, limit);
      }

      // حفظ النتائج في Conversation Memory
      if (conversationId && finalResults.length > 0) {
        ConversationMemoryService.saveSearchResults(conversationId, finalResults, query);
        finalResults.forEach(book => ConversationMemoryService.addShownBook(conversationId, book));
      }

      // ترتيب النتائج حسب Search Score
      const scoredResults = this.scoreAndRankResults(finalResults, query.trim());

      // التحقق من صحة البيانات قبل الرد
      const validResults = this.filterValidBooks(scoredResults);
      if (validResults.length !== scoredResults.length) {
        console.log('[BookSearch] Filtered invalid books:', scoredResults.length - validResults.length);
      }

      // تحديد رسالة التوصية
      let message = null;
      let recommendationReason = null;

      if (validResults.length === 0) {
        // حفظ الكتاب المطلوب في قاعدة البيانات للتحليل المستقبلي
        if (conversationId && query.trim()) {
          await this.saveMissingBookRequest(query.trim(), conversationId, intentAnalysis);
        }
        
        const popularBooks = await this.getPopularBooks(limit);
        return {
          books: popularBooks,
          message: 'هذه كتب شائعة قد تناسبك',
          recommendationReason: null,
          bookNotFound: true,
          requestedBook: query.trim()
        };
      }

      return {
        books: validResults,
        message: message,
        recommendationReason: recommendationReason
      };
    } catch (error) {
      console.error('Error in searchBooks:', error);
      return {
        books: [],
        message: null,
        recommendationReason: null
      };
    }
  }

  /**
   * حفظ طلب كتاب غير موجود في قاعدة البيانات
   * @param {string} bookName - اسم الكتاب المطلوب
   * @param {string} conversationId - معرف المحادثة
   * @param {Object} intentAnalysis - تحليل Intent
   */
  async saveMissingBookRequest(bookName, conversationId, intentAnalysis = null) {
    try {
      const category = intentAnalysis?.category || null;
      
      await BookRequest.findOrCreate({
        bookName,
        category,
        conversationId,
        userId: null, // يمكن إضافة userId لاحقاً
        sessionId: conversationId
      });
      
      console.log('[BookSearch] Saved missing book request:', bookName);
    } catch (error) {
      console.error('[BookSearch] Error saving missing book request:', error);
    }
  }

  /**
   * التحقق من أن الاستعلام هو اسم كتاب محدد
   * @param {string} query - استعلام البحث
   * @returns {boolean} - هل هو اسم كتاب محدد
   */
  isSpecificBookName(query) {
    // إذا كان الاستعلام قصير (كلمة أو كلمتين) وبدون كلمات عامة
    const words = query.trim().split(/\s+/);
    const generalKeywords = ['رشح', 'اقترح', 'أريد', 'أبحث', 'محتاج', 'هل', 'عندكم', 'موجود', 'متوفر', 'كتاب', 'رواية', 'عن', 'في'];
    
    // إذا كان الاستعلام يحتوي على كلمات عامة، فهو ليس اسم كتاب محدد
    const hasGeneralKeyword = generalKeywords.some(keyword => 
      query.toLowerCase().includes(keyword)
    );
    
    if (hasGeneralKeyword) return false;
    
    // إذا كان الاستعلام قصير (1-3 كلمات) وبدون كلمات عامة، قد يكون اسم كتاب
    if (words.length <= 3 && words.length >= 1) {
      return true;
    }
    
    return false;
  }

  /**
   * Multi-stage Search - بحث بـ 10 مراحل مختلفة
   * @param {string} query - استعلام البحث
   * @param {Object} baseQuery - الاستعلام الأساسي
   * @param {number} limit - عدد النتائج المطلوبة
   * @returns {Promise<Array>} - مصفوفة الكتب المطابقة
   */
  async multiStageSearch(query, baseQuery, limit) {
    console.log('[BookSearch] Starting multi-stage search for:', query);

    // المرحلة 1: Title Exact Match
    let results = await this.searchByTitleExact(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 1 (Title Exact):', results.length);
      return results;
    }

    // المرحلة 2: Normalized Title
    results = await this.searchByNormalizedTitle(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 2 (Normalized Title):', results.length);
      return results;
    }

    // المرحلة 3: Regex Search
    results = await this.searchByRegex(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 3 (Regex):', results.length);
      return results;
    }

    // المرحلة 4: Contains Search
    results = await this.searchByContains(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 4 (Contains):', results.length);
      return results;
    }

    // المرحلة 5: Arabic Normalized
    results = await this.searchByArabicNormalized(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 5 (Arabic Normalized):', results.length);
      return results;
    }

    // المرحلة 6: Without Diacritics
    results = await this.searchWithoutDiacritics(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 6 (Without Diacritics):', results.length);
      return results;
    }

    // المرحلة 7: Without Hamzas
    results = await this.searchWithoutHamzas(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 7 (Without Hamzas):', results.length);
      return results;
    }

    // المرحلة 8: Without Al
    results = await this.searchWithoutAl(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 8 (Without Al):', results.length);
      return results;
    }

    // المرحلة 9: Fuzzy Search
    results = await this.fuzzySearch(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 9 (Fuzzy Search):', results.length);
      return results;
    }

    // المرحلة 10: Text Index Search
    results = await this.searchByTextIndex(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in stage 10 (Text Index):', results.length);
      return results;
    }

    // البحث بالـ Aliases
    results = await this.searchByAliases(query, baseQuery, limit);
    if (results.length > 0) {
      console.log('[BookSearch] Found in Aliases Search:', results.length);
      return results;
    }

    console.log('[BookSearch] No results found in any stage');
    return [];
  }

  /**
   * المرحلة 1: Title Exact Match
   */
  async searchByTitleExact(query, baseQuery, limit) {
    const books = await Product.find({
      ...baseQuery,
      product_name: query
    })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * المرحلة 2: Normalized Title
   */
  async searchByNormalizedTitle(query, baseQuery, limit) {
    const normalizedQuery = normalizeArabic(query);
    const books = await Product.find({
      ...baseQuery,
      product_name: normalizedQuery
    })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * المرحلة 3: Regex Search
   */
  async searchByRegex(query, baseQuery, limit) {
    const regex = new RegExp(query, 'i');
    const books = await Product.find({
      ...baseQuery,
      product_name: regex
    })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * المرحلة 4: Contains Search
   */
  async searchByContains(query, baseQuery, limit) {
    const books = await Product.find({
      ...baseQuery,
      product_name: { $regex: query, $options: 'i' }
    })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * المرحلة 5: Arabic Normalized
   */
  async searchByArabicNormalized(query, baseQuery, limit) {
    const normalizedQuery = normalizeArabic(query);
    const regex = arabicFuzzyRegex(normalizedQuery);
    
    const books = await Product.find({
      ...baseQuery,
      product_name: regex
    })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * المرحلة 6: Without Diacritics
   */
  async searchWithoutDiacritics(query, baseQuery, limit) {
    const withoutDiacritics = query.replace(/[ًٌٍَُِّْ]/g, '');
    const books = await Product.find({
      ...baseQuery,
      product_name: { $regex: withoutDiacritics, $options: 'i' }
    })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * المرحلة 7: Without Hamzas
   * بتحول كل حرف همزة في الـ query لـ pattern يقبل الهمزة وبدونها
   * مثال: "لانك" → "ل[اأإآ]نك" يطابق "لأنك" و"لانك"
   */
  async searchWithoutHamzas(query, baseQuery, limit) {
    // normalize الهمزات أولاً، بعدين نبني pattern يقبل كل الأشكال في الاتجاهين
    const hamzaPattern = query
      .replace(/[أإآ]/g, 'ا')   // normalize كل همزات الألف
      .replace(/[ؤ]/g, 'و')
      .replace(/[ئ]/g, 'ي')
      .replace(/[ة]/g, 'ه')
      // بعد الـ normalize، نحول كل حرف لـ character class يقبل بهمزة أو بدونها
      .replace(/ا/g, '[اأإآ]')
      .replace(/و/g, '[وؤ]')
      .replace(/ي/g, '[يئ]')
      .replace(/ه/g, '[هة]');
    
    const books = await Product.find({
      ...baseQuery,
      product_name: { $regex: hamzaPattern, $options: 'i' }
    })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * المرحلة 8: Without Al
   */
  async searchWithoutAl(query, baseQuery, limit) {
    const withoutAl = query.replace(/^(ال)/, '');
    const books = await Product.find({
      ...baseQuery,
      product_name: { $regex: withoutAl, $options: 'i' }
    })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * المرحلة 10: Text Index Search (DISABLED - language_override issue)
   */
  async searchByTextIndex(query, baseQuery, limit) {
    // Temporarily disabled to avoid language_override error
    return [];
  }

  /**
   * البحث بالـ Aliases للكتب المشهورة
   */
  async searchByAliases(query, baseQuery, limit) {
    const aliases = [];
    
    // البحث عن aliases في القائمة
    for (const [bookTitle, aliasList] of Object.entries(this.bookAliases)) {
      if (aliasList.some(alias => query.toLowerCase().includes(alias.toLowerCase()))) {
        aliases.push(bookTitle);
      }
    }

    if (aliases.length === 0) return [];

    // البحث باستخدام الـ aliases
    const books = await Product.find({
      ...baseQuery,
      product_name: { $in: aliases }
    })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * Keyword Expansion - توسيع الكلمات المفتاحية
   * @param {string} query - الاستعلام الأصلي
   * @returns {Array} - الاستعلامات الموسعة
   */
  expandKeywords(query) {
    const expandedQueries = [query];
    
    for (const [keyword, expansions] of Object.entries(this.keywordExpansion)) {
      if (query.toLowerCase().includes(keyword.toLowerCase())) {
        expandedQueries.push(...expansions);
      }
    }

    return expandedQueries;
  }

  /**
   * Semantic Recommendation - توصية دلالية عند عدم وجود تطابق مباشر
   * @param {string} query - الاستعلام
   * @param {Object} baseQuery - الاستعلام الأساسي
   * @param {number} limit - عدد النتائج
   * @returns {Promise<Array>} - الكتب الموصى بها
   */
  async semanticRecommendation(query, baseQuery, limit) {
    // البحث في الوصف والتصنيف والكلمات المفتاحية
    const words = query.split(/\s+/).filter(w => w.length > 2);
    
    if (words.length === 0) return [];

    const semanticQuery = {
      ...baseQuery,
      $or: [
        { product_description: { $regex: query, $options: 'i' } },
        { product_category: { $regex: query, $options: 'i' } },
        { author: { $regex: query, $options: 'i' } }
      ]
    };

    const books = await Product.find(semanticQuery)
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1
      })
      .limit(limit);

    return books.map(book => this.formatBookForAI(book)).filter(b => b !== null);
  }

  /**
   * Search Score System - حساب درجة البحث لكل نتيجة
   * @param {Array} books - الكتب
   * @param {string} query - الاستعلام
   * @returns {Array} - الكتب المرتبة حسب الدرجة
   */
  scoreAndRankResults(books, query) {
    const scoredBooks = books.map(book => {
      let score = 0;

      // Title Match (+100)
      if (book.title.toLowerCase() === query.toLowerCase()) {
        score += 100;
      }

      // Exact Match (+200)
      if (book.title.toLowerCase().includes(query.toLowerCase())) {
        score += 200;
      }

      // Description Match (+60)
      if (book.description && book.description.toLowerCase().includes(query.toLowerCase())) {
        score += 60;
      }

      // Category Match (+40)
      if (book.category && book.category.toLowerCase().includes(query.toLowerCase())) {
        score += 40;
      }

      // Author Match (+80)
      if (book.author && book.author.toLowerCase().includes(query.toLowerCase())) {
        score += 80;
      }

      // Keyword Match (+30)
      const words = query.split(/\s+/);
      words.forEach(word => {
        if (book.title.toLowerCase().includes(word.toLowerCase())) {
          score += 30;
        }
      });

      // Popularity (+20)
      if (book.views) {
        score += Math.min(book.views / 100, 20);
      }

      return { ...book, searchScore: score };
    });

    // الترتيب حسب: تشابه → مبيعات → تقييم → أحدث
    return scoredBooks
      .sort((a, b) => {
        // 1. Search Score
        if (b.searchScore !== a.searchScore) {
          return b.searchScore - a.searchScore;
        }
        
        // 2. Views (المبيعات)
        if ((b.views || 0) !== (a.views || 0)) {
          return (b.views || 0) - (a.views || 0);
        }
        
        // 3. Publish Year (الأحدث)
        if (a.publishYear && b.publishYear) {
          return parseInt(b.publishYear) - parseInt(a.publishYear);
        }
        
        return 0;
      })
      .map(({ searchScore, ...book }) => book);
  }

  /**
   * البحث باستخدام Intent Expansion - Sales Recommendation Engine
   * @param {string} query - استعلام البحث
   * @param {Object} baseQuery - الاستعلام الأساسي
   * @param {number} limit - عدد النتائج المطلوبة
   * @param {Array} excludedBookIds - معرفات الكتب المستبعدة
   * @returns {Promise<Object>} - كائن يحتوي على الكتب ورسالة التوصية
   */
  async searchWithIntentExpansion(query, baseQuery, limit, excludedBookIds = []) {
    try {
      // توسيع النية
      const expandedIntent = IntentExpansionService.detectAndExpand(query);
      
      console.log('[BookSearch] Expanded Intent:', JSON.stringify(expandedIntent));

      // البحث في التصنيفات الموسعة
      let books = [];
      
      if (expandedIntent.categories.length > 0) {
        // البحث في التصنيفات المحددة
        const categoryQuery = {
          ...baseQuery,
          product_category: { $in: expandedIntent.categories }
        };
        
        books = await Product.find(categoryQuery)
          .select({
            products_id: 1,
            product_name: 1,
            product_description: 1,
            product_category: 1,
            product_price: 1,
            product_quantity: 1,
            author: 1,
            publisher: 1,
            pages: 1,
            coverType: 1,
            language: 1,
            publishYear: 1,
            product_image: 1,
            image_path: 1,
            views: 1
          })
          .limit(limit * 3); // جلب المزيد للترتيب والتنويع
      }

      // البحث في الكلمات المفتاحية
      if (books.length < limit * 2 && expandedIntent.keywords.length > 0) {
        const keywordQuery = {
          ...baseQuery,
          $or: []
        };

        expandedIntent.keywords.slice(0, 10).forEach(keyword => {
          // استخدام arabicFuzzyRegex لمطابقة أشكال مختلفة من الحروف العربية
          const regex = arabicFuzzyRegex(keyword);
          keywordQuery.$or.push(
            { product_name: regex },
            { product_description: regex },
            { author: regex },
            { publisher: regex }
          );
        });

        const keywordBooks = await Product.find(keywordQuery)
          .select({
            products_id: 1,
            product_name: 1,
            product_description: 1,
            product_category: 1,
            product_price: 1,
            product_quantity: 1,
            author: 1,
            publisher: 1,
            pages: 1,
            coverType: 1,
            language: 1,
            publishYear: 1,
            product_image: 1,
            image_path: 1,
            views: 1
          })
          .limit(limit * 3);

        // دمج النتائج بدون تكرار
        const existingIds = new Set(books.map(b => b.products_id));
        keywordBooks.forEach(book => {
          if (!existingIds.has(book.products_id)) {
            books.push(book);
          }
        });
      }

      // إذا لم توجد نتائج، استخدم البحث التقليدي
      if (books.length === 0) {
        const expandedQuery = SemanticSearchService.expandQuery(query.trim());
        books = await this.multiFieldSearch(expandedQuery, baseQuery, limit * 2);
      }

      // استبعاد الكتب المحددة
      if (excludedBookIds.length > 0) {
        books = books.filter(book => !excludedBookIds.includes(book.products_id));
      }

      // ترتيب الكتب حسب درجة الصلة
      const rankedBooks = IntentExpansionService.rankBooksByRelevance(books, expandedIntent);
      
      // تصفية الكتب بدرجة صلة أقل من 70%
      const highRelevanceBooks = rankedBooks.filter(book => {
        const score = IntentExpansionService.calculateRelevanceScore(book, expandedIntent);
        return score >= 70;
      });

      // تطبيق Recommendation Diversity
      const diverseBooks = this.applyRecommendationDiversity(
        highRelevanceBooks.length > 0 ? highRelevanceBooks : rankedBooks,
        limit
      );
      
      // أخذ أفضل النتائج
      const finalBooks = diverseBooks.slice(0, limit).map(book => this.formatBookForAI(book));

      // تحديد رسالة التوصية
      let message = null;
      let recommendationReason = null;

      if (finalBooks.length === 0) {
        // جلب كتب شائعة كبدائل
        const popularBooks = await this.getPopularBooks(limit);
        message = IntentExpansionService.getNoMatchMessage(expandedIntent.originalIntent, null);
        return {
          books: popularBooks,
          message: message,
          recommendationReason: null,
          relevanceWarning: true
        };
      }

      // الحصول على سبب التوصية لأول كتاب
      if (finalBooks.length > 0) {
        recommendationReason = IntentExpansionService.getRecommendationReason(
          books.find(b => b.products_id === finalBooks[0].id),
          expandedIntent
        );
      }

      // إذا كانت النتائج من تصنيفات مختلفة عن المطلوب
      if (expandedIntent.categories.length > 0) {
        const hasDirectMatch = finalBooks.some(book => 
          expandedIntent.categories.some(cat => 
            book.category.toLowerCase().includes(cat.toLowerCase())
          )
        );

        if (!hasDirectMatch) {
          message = IntentExpansionService.getNoMatchMessage(expandedIntent.originalIntent, null);
        }
      }

      // تحذير إذا كانت النتائج منخفضة الصلة
      const relevanceWarning = highRelevanceBooks.length === 0 && finalBooks.length > 0;

      return {
        books: finalBooks,
        message: message,
        recommendationReason: recommendationReason,
        relevanceWarning: relevanceWarning
      };
    } catch (error) {
      console.error('Error in searchWithIntentExpansion:', error);
      // الرجوع للبحث التقليدي في حالة الخطأ
      const expandedQuery = SemanticSearchService.expandQuery(query.trim());
      const searchResults = await this.multiFieldSearch(expandedQuery, baseQuery, limit);
      
      return {
        books: searchResults,
        message: null,
        recommendationReason: null,
        relevanceWarning: false
      };
    }
  }

  /**
   * تطبيق Recommendation Diversity لتنويع التوصيات
   * @param {Array} books - الكتب المرتبة
   * @param {number} limit - عدد الكتب المطلوبة
   * @returns {Array} - الكتب المتنوعة
   */
  applyRecommendationDiversity(books, limit) {
    if (books.length <= limit) {
      return books;
    }

    const diverseBooks = [];
    const usedAuthors = new Set();
    const usedPublishers = new Set();
    const priceRanges = new Set();

    // تقسيم الأسعار إلى نطاقات
    const getPriceRange = (price) => {
      if (price < 50) return 'low';
      if (price < 100) return 'medium';
      return 'high';
    };

    for (const book of books) {
      if (diverseBooks.length >= limit) break;

      const author = book.author || 'غير محدد';
      const publisher = book.publisher || 'غير محدد';
      const priceRange = getPriceRange(book.product_price || 0);

      // التحقق من التنوع
      const authorDiversity = !usedAuthors.has(author);
      const publisherDiversity = !usedPublishers.has(publisher);
      const priceDiversity = !priceRanges.has(priceRange);

      // إضافة الكتاب إذا كان يحقق التنوع
      if (authorDiversity || publisherDiversity || priceDiversity) {
        diverseBooks.push(book);
        usedAuthors.add(author);
        usedPublishers.add(publisher);
        priceRanges.add(priceRange);
      }
    }

    // إذا لم نحصل على عدد كافٍ، أضف الباقي
    if (diverseBooks.length < limit) {
      const remainingBooks = books.filter(book => 
        !diverseBooks.includes(book)
      );
      diverseBooks.push(...remainingBooks.slice(0, limit - diverseBooks.length));
    }

    return diverseBooks;
  }

  /**
   * البحث المتعدد الحقول - يبحث في حقول متعددة بالترتيب
   * @param {Array} keywords - مصفوفة الكلمات المفتاحية
   * @param {Object} baseQuery - الاستعلام الأساسي
   * @param {number} limit - عدد النتائج المطلوبة
   * @returns {Promise<Array>} - مصفوفة الكتب المطابقة
   */
  async multiFieldSearch(keywords, baseQuery, limit) {
    const results = new Map(); // استخدام Map لتجنب التكرار

    // ترتيب الحقول حسب الأولوية
    const searchFields = [
      { field: 'product_name', weight: 10 },      // 1. اسم الكتاب
      { field: 'product_description', weight: 8 }, // 2. الوصف
      { field: 'author', weight: 7 },             // 6. المؤلف
      { field: 'publisher', weight: 6 },          // 7. الناشر
      { field: 'product_category', weight: 5 }     // 5. التصنيف
    ];

    for (const { field, weight } of searchFields) {
      for (const keyword of keywords) {
        // استخدام arabicFuzzyRegex لمطابقة أشكال مختلفة من الحروف العربية
        const searchRegex = arabicFuzzyRegex(keyword);
        
        const books = await Product.find({
          ...baseQuery,
          [field]: searchRegex
        })
          .select({
            products_id: 1,
            product_name: 1,
            product_description: 1,
            product_category: 1,
            product_price: 1,
            product_quantity: 1,
            author: 1,
            publisher: 1,
            pages: 1,
            coverType: 1,
            language: 1,
            publishYear: 1,
            product_image: 1,
            image_path: 1,
            views: 1
          })
          .limit(limit);

        // إضافة النتائج مع الوزن
        books.forEach(book => {
          const bookId = book.products_id;
          if (!results.has(bookId)) {
            results.set(bookId, { book, score: weight });
          } else {
            results.get(bookId).score += weight;
          }
        });

        // إذا وصلنا للحد المطلوب، توقف
        if (results.size >= limit) {
          break;
        }
      }

      if (results.size >= limit) {
        break;
      }
    }

    // ترتيب النتائج حسب الوزن
    const sortedResults = Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.book);

    return sortedResults.map(book => this.formatBookForAI(book));
  }

  /**
   * البحث التقريبي (Fuzzy Search) - للبحث عن نتائج قريبة
   * @param {string} query - الاستعلام الأصلي
   * @param {Object} baseQuery - الاستعلام الأساسي
   * @param {number} limit - عدد النتائج المطلوبة
   * @returns {Promise<Array>} - مصفوفة الكتب المطابقة
   */
  async fuzzySearch(query, baseQuery, limit) {
    try {
      // تقسيم الاستعلام إلى كلمات
      const words = query.split(/\s+/).filter(w => w.length > 2);
      
      if (words.length === 0) {
        return [];
      }

      // البحث عن كتب تحتوي على أي جزء من الاستعلام
      const fuzzyQuery = {
        ...baseQuery,
        $or: []
      };

      words.forEach(word => {
        // استخدام arabicFuzzyRegex لمطابقة أشكال مختلفة من الحروف العربية
        const regex = arabicFuzzyRegex(word);
        fuzzyQuery.$or.push(
          { product_name: regex },
          { product_description: regex },
          { author: regex },
          { publisher: regex },
          { product_category: regex }
        );
      });

      const books = await Product.find(fuzzyQuery)
        .select({
          products_id: 1,
          product_name: 1,
          product_description: 1,
          product_category: 1,
          product_price: 1,
          product_quantity: 1,
          author: 1,
          publisher: 1,
          pages: 1,
          coverType: 1,
          language: 1,
          publishYear: 1,
          product_image: 1,
          image_path: 1,
          views: 1
        })
        .limit(limit)
        .sort({ views: -1 });

      return books.map(book => this.formatBookForAI(book));
    } catch (error) {
      console.error('Error in fuzzySearch:', error);
      return [];
    }
  }

  /**
   * البحث عن كتاب بواسطة ID
   * @param {string} productId - معرف الكتاب
   * @returns {Promise<Object|null>} - الكتاب أو null
   */
  async getBookById(productId) {
    try {
      const book = await Product.findOne({
        products_id: productId,
        status: 'approved'
      }).select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1
      });

      return book ? this.formatBookForAI(book) : null;
    } catch (error) {
      console.error('Error in getBookById:', error);
      return null;
    }
  }

  /**
   * الحصول على كتب مشابهة
   * @param {string} productId - معرف الكتاب المرجعي
   * @param {number} limit - عدد الكتب المشابهة
   * @returns {Promise<Array>} - مصفوفة الكتب المشابهة
   */
  async getSimilarBooks(productId, limit = 3) {
    try {
      const referenceBook = await Product.findOne({
        products_id: productId,
        status: 'approved'
      }).select('product_category author publisher');

      if (!referenceBook) {
        return [];
      }

      const similarBooks = await Product.find({
        products_id: { $ne: productId }, // استبعاد الكتاب المرجعي
        status: 'approved',
        product_quantity: { $gt: 0 },
        $or: [
          { product_category: referenceBook.product_category },
          { author: referenceBook.author },
          { publisher: referenceBook.publisher }
        ]
      })
        .select({
          products_id: 1,
          product_name: 1,
          product_description: 1,
          product_category: 1,
          product_price: 1,
          product_quantity: 1,
          author: 1,
          publisher: 1,
          pages: 1,
          coverType: 1,
          language: 1,
          publishYear: 1,
          product_image: 1,
          image_path: 1
        })
        .limit(limit)
        .sort({ views: -1 });

      return similarBooks.map(book => this.formatBookForAI(book));
    } catch (error) {
      console.error('Error in getSimilarBooks:', error);
      return [];
    }
  }

  /**
   * الحصول على الكتب الأكثر شعبية
   * @param {number} limit - عدد الكتب
   * @returns {Promise<Array>} - مصفوفة الكتب الشائعة
   */
  async getPopularBooks(limit = 5) {
    try {
      const popularBooks = await Product.find({
        status: 'approved',
        product_quantity: { $gt: 0 }
      })
        .select({
          products_id: 1,
          product_name: 1,
          product_description: 1,
          product_category: 1,
          product_price: 1,
          product_quantity: 1,
          author: 1,
          publisher: 1,
          pages: 1,
          coverType: 1,
          language: 1,
          publishYear: 1,
          product_image: 1,
          image_path: 1,
          views: 1
        })
        .limit(limit)
        .sort({ views: -1 });

      return popularBooks.map(book => this.formatBookForAI(book));
    } catch (error) {
      console.error('Error in getPopularBooks:', error);
      return [];
    }
  }

  /**
   * Recommendation Engine - محرك التوصيات الذكي
   * إذا كانت النتائج أقل من 3، يجلب كتب من مصادر متعددة
   * @param {Array} currentResults - النتائج الحالية
   * @param {string} query - الاستعلام الأصلي
   * @param {number} targetCount - العدد المستهدف
   * @returns {Promise<Array>} - مصفوفة الكتب الموصى بها
   */
  async getRecommendations(currentResults, query, targetCount = 5) {
    try {
      if (currentResults.length >= targetCount) {
        return currentResults;
      }

      const recommendations = new Map();
      const currentIds = new Set(currentResults.map(b => b.id));

      // 1. كتب من نفس القسم
      if (currentResults.length > 0) {
        const categories = [...new Set(currentResults.map(b => b.category))];
        for (const category of categories) {
          const categoryBooks = await this.getBooksByCategory(category, 3);
          categoryBooks.forEach(book => {
            if (!currentIds.has(book.id) && !recommendations.has(book.id)) {
              recommendations.set(book.id, { book, source: 'category', score: 8 });
            }
          });
        }
      }

      // 2. كتب من نفس المؤلف
      if (currentResults.length > 0) {
        const authors = [...new Set(currentResults.map(b => b.author).filter(a => a && a !== 'غير محدد'))];
        for (const author of authors) {
          const authorBooks = await Product.find({
            status: 'approved',
            product_quantity: { $gt: 0 },
            author: author
          })
            .select({
              products_id: 1,
              product_name: 1,
              product_description: 1,
              product_category: 1,
              product_price: 1,
              product_quantity: 1,
              author: 1,
              publisher: 1,
              pages: 1,
              coverType: 1,
              language: 1,
              publishYear: 1,
              product_image: 1,
              image_path: 1,
              views: 1
            })
            .limit(3)
            .sort({ views: -1 });

          authorBooks.forEach(book => {
            if (!currentIds.has(book.products_id) && !recommendations.has(book.products_id)) {
              recommendations.set(book.products_id, { book: this.formatBookForAI(book), source: 'author', score: 7 });
            }
          });
        }
      }

      // 3. أكثر الكتب مبيعاً
      const popularBooks = await this.getPopularBooks(5);
      popularBooks.forEach(book => {
        if (!currentIds.has(book.id) && !recommendations.has(book.id)) {
          recommendations.set(book.id, { book, source: 'popular', score: 6 });
        }
      });

      // 4. أحدث الكتب
      const latestBooks = await Product.find({
        status: 'approved',
        product_quantity: { $gt: 0 }
      })
        .select({
          products_id: 1,
          product_name: 1,
          product_description: 1,
          product_category: 1,
          product_price: 1,
          product_quantity: 1,
          author: 1,
          publisher: 1,
          pages: 1,
          coverType: 1,
          language: 1,
          publishYear: 1,
          product_image: 1,
          image_path: 1,
          views: 1
        })
        .limit(5)
        .sort({ createdAt: -1 });

      latestBooks.forEach(book => {
        if (!currentIds.has(book.products_id) && !recommendations.has(book.products_id)) {
          recommendations.set(book.products_id, { book: this.formatBookForAI(book), source: 'latest', score: 5 });
        }
      });

      // 5. كتب ذات صلة دلالية
      if (query && query.trim()) {
        const semanticBooks = await this.multiFieldSearch(
          SemanticSearchService.expandQuery(query),
          { status: 'approved', product_quantity: { $gt: 0 } },
          5
        );
        semanticBooks.forEach(book => {
          if (!currentIds.has(book.id) && !recommendations.has(book.id)) {
            recommendations.set(book.id, { book, source: 'semantic', score: 4 });
          }
        });
      }

      // ترتيب التوصيات حسب الوزن
      const sortedRecommendations = Array.from(recommendations.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, targetCount - currentResults.length)
        .map(item => item.book);

      return [...currentResults, ...sortedRecommendations];
    } catch (error) {
      console.error('Error in getRecommendations:', error);
      return currentResults;
    }
  }

  /**
   * الحصول على الكتب حسب التصنيف
   * @param {string} category - التصنيف
   * @param {number} limit - عدد الكتب
   * @returns {Promise<Array>} - مصفوفة الكتب
   */
  async getBooksByCategory(category, limit = 5) {
    try {
      const books = await Product.find({
        status: 'approved',
        product_category: category,
        product_quantity: { $gt: 0 }
      })
        .select({
          products_id: 1,
          product_name: 1,
          product_description: 1,
          product_category: 1,
          product_price: 1,
          product_quantity: 1,
          author: 1,
          publisher: 1,
          pages: 1,
          coverType: 1,
          language: 1,
          publishYear: 1,
          product_image: 1,
          image_path: 1
        })
        .limit(limit)
        .sort({ views: -1 });

      return books.map(book => this.formatBookForAI(book));
    } catch (error) {
      console.error('Error in getBooksByCategory:', error);
      return [];
    }
  }

  /**
   * التحقق من صحة بيانات الكتاب
   * @param {Object} book - بيانات الكتاب
   * @returns {boolean} - هل البيانات صحيحة
   */
  validateBookData(book) {
    if (!book) return false;
    
    // التحقق من وجود id
    if (!book.id && !book.products_id) {
      console.error('[BookSearch] Book missing id:', book);
      return false;
    }
    
    // التحقق من وجود عنوان
    if (!book.title && !book.product_name) {
      console.error('[BookSearch] Book missing title:', book);
      return false;
    }
    
    // التحقق من وجود سعر
    if (book.price === undefined || book.price === null || book.price === '') {
      console.error('[BookSearch] Book missing price:', book);
      return false;
    }
    
    // التحقق من وجود رابط
    if (!book.url && !book.buyUrl) {
      console.error('[BookSearch] Book missing url:', book);
      return false;
    }
    
    // التحقق من الكمية
    if (book.quantity !== undefined && book.quantity < 0) {
      console.error('[BookSearch] Book has invalid quantity:', book);
      return false;
    }
    
    return true;
  }

  /**
   * تصفية الكتب غير الصالحة
   * @param {Array} books - قائمة الكتب
   * @returns {Array} - الكتب الصالحة فقط
   */
  filterValidBooks(books) {
    return books.filter(book => this.validateBookData(book));
  }

  /**
   * تنسيق بيانات الكتاب للاستخدام مع AI
   * @param {Object} book - بيانات الكتاب من MongoDB
   * @returns {Object} - الكتاب المنسق
   */
  formatBookForAI(book) {
    const baseUrl = 'https://knoozbook.com';
    const encodedName = encodeURIComponent(book.product_name.replace(/\s+/g, '-'));
    
    // التأكد من وجود id صحيح
    const bookId = book.products_id || book.id;
    if (!bookId) {
      console.error('[BookSearch] Book missing id:', book.product_name);
      return null;
    }
    
    return {
      id: bookId,
      title: book.product_name,
      description: book.product_description,
      category: book.product_category,
      price: book.product_price,
      quantity: book.product_quantity,
      inStock: book.product_quantity > 0,
      author: book.author || 'غير محدد',
      publisher: book.publisher || 'غير محدد',
      pages: book.pages || 0,
      coverType: book.coverType || 'غير محدد',
      language: book.language || 'غير محدد',
      publishYear: book.publishYear || 'غير محدد',
      image: book.product_image || book.image_path || '',
      url: `${baseUrl}/book/${bookId}/${encodedName}`,
      buyUrl: `${baseUrl}/book/${bookId}/${encodedName}`
    };
  }

  /**
   * تحويل مصفوفة الكتب إلى نص للـ AI
   * @param {Array} books - مصفوفة الكتب
   * @returns {string} - نص الكتب بالتنسيق الهيكلي
   */
  formatBooksForAI(books) {
    if (!books || books.length === 0) {
      return 'لا توجد كتب مطابقة.';
    }

    // تصفية الكتب بـ null (بدون id صحيح)
    const validBooks = books.filter(book => book !== null && book.id);
    
    if (validBooks.length === 0) {
      return 'لا توجد كتب مطابقة.';
    }

    return validBooks.map((book, index) => {
      return `${index + 1}. العنوان: ${book.title}
   المؤلف: ${book.author}
   السعر: ${book.price} ج.م
   التصنيف: ${book.category || 'غير محدد'}
   الوصف: ${book.description || 'لا يوجد وصف'}
   رابط الشراء: ${book.buyUrl}
   
   عند اقتراح هذا الكتاب، استخدم الصيغة: [BOOK:${book.title}]`;
    }).join('\n\n');
  }
}

module.exports = new BookSearchService();