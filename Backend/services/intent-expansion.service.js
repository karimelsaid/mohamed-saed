/**
 * Intent Expansion Service
 * خدمة توسيع النية لتحسين البحث والتوصيات
 */

const KnowledgeMapService = require('./knowledge-map.service');
const SemanticSearchService = require('./semantic-search.service');
const { containsArabic } = require('../utils/arabic-normalizer');

class IntentExpansionService {
  /**
   * توسيع النية الأساسية للحصول على تصنيفات وكلمات مفتاحية شاملة
   * @param {string} originalIntent - النية الأساسية
   * @param {string} userQuery - استعلام المستخدم الأصلي
   * @returns {Object} - النية الموسعة مع التصنيفات والكلمات
   */
  expandIntent(originalIntent, userQuery = '') {
    // تحديد النية من النص إذا لم تكن موجودة
    const detectedIntent = originalIntent || KnowledgeMapService.detectIntent(userQuery);
    
    // الحصول على التوسيع من Knowledge Map
    const expandedData = KnowledgeMapService.expandSearch(detectedIntent);
    
    // إضافة الكلمات من Semantic Search
    const semanticKeywords = SemanticSearchService.expandQuery(userQuery);
    
    // دمج الكلمات المفتاحية
    const allKeywords = new Set([
      ...expandedData.keywords,
      ...semanticKeywords
    ]);
    
    return {
      originalIntent: detectedIntent,
      categories: expandedData.categories,
      keywords: Array.from(allKeywords),
      relatedIntents: KnowledgeMapService.getRelatedIntents(detectedIntent)
    };
  }

  /**
   * تحديد النية من النص وتوسيعها
   * @param {string} text - النص
   * @returns {Object} - النية الموسعة
   */
  detectAndExpand(text) {
    const detectedIntent = KnowledgeMapService.detectIntent(text);
    return this.expandIntent(detectedIntent, text);
  }

  /**
   * الحصول على Relevance Score لكتاب معين بناءً على النية الموسعة
   * @param {Object} book - بيانات الكتاب
   * @param {Object} expandedIntent - النية الموسعة
   * @returns {number} - درجة الصلة (0-100)
   */
  calculateRelevanceScore(book, expandedIntent) {
    let score = 0;
    
    const bookData = {
      category: book.product_category || '',
      title: book.product_name || '',
      description: book.product_description || '',
      author: book.author || '',
      publisher: book.publisher || ''
    };
    
    const lowerBookData = {
      category: bookData.category.toLowerCase(),
      title: bookData.title.toLowerCase(),
      description: bookData.description.toLowerCase(),
      author: bookData.author.toLowerCase(),
      publisher: bookData.publisher.toLowerCase()
    };
    
    // +50 إذا كان التصنيف مطابقاً
    const categoryMatch = expandedIntent.categories.some(cat => 
      containsArabic(bookData.category, cat)
    );
    if (categoryMatch) {
      score += 50;
    }
    
    // +25 إذا كان العنوان يحتوي الكلمات
    const titleMatches = expandedIntent.keywords.filter(keyword => 
      containsArabic(bookData.title, keyword)
    ).length;
    score += Math.min(titleMatches * 5, 25);
    
    // +15 إذا كان الوصف يحتوي الكلمات
    const descriptionMatches = expandedIntent.keywords.filter(keyword => 
      containsArabic(bookData.description, keyword)
    ).length;
    score += Math.min(descriptionMatches * 3, 15);
    
    // +10 إذا كان المؤلف مشهوراً في المجال
    const authorMatches = expandedIntent.keywords.filter(keyword => 
      containsArabic(bookData.author, keyword)
    ).length;
    score += Math.min(authorMatches * 2, 10);
    
    // +5 إذا كان الناشر مطابقاً
    const publisherMatches = expandedIntent.keywords.filter(keyword => 
      containsArabic(bookData.publisher, keyword)
    ).length;
    score += Math.min(publisherMatches * 1, 5);
    
    return Math.min(score, 100);
  }

  /**
   * ترتيب الكتب حسب درجة الصلة
   * @param {Array} books - مصفوفة الكتب
   * @param {Object} expandedIntent - النية الموسعة
   * @returns {Array} - الكتب مرتبة حسب الصلة
   */
  rankBooksByRelevance(books, expandedIntent) {
    return books.map(book => ({
      book,
      score: this.calculateRelevanceScore(book, expandedIntent)
    })).sort((a, b) => b.score - a.score).map(item => item.book);
  }

  /**
   * الحصول على تفسير لسبب التوصية
   * @param {Object} book - بيانات الكتاب
   * @param {Object} expandedIntent - النية الموسعة
   * @returns {string} - تفسير التوصية
   */
  getRecommendationReason(book, expandedIntent) {
    // فحص إذا كان الكتاب undefined
    if (!book) {
      return 'كتاب مناسب لطلبك';
    }

    const reasons = [];

    const bookData = {
      category: book.product_category || book.category || '',
      title: book.product_name || book.title || '',
      description: book.product_description || book.description || '',
      author: book.author || book.product_author || ''
    };
    
    const lowerBookData = {
      category: bookData.category.toLowerCase(),
      title: bookData.title.toLowerCase(),
      description: bookData.description.toLowerCase(),
      author: bookData.author.toLowerCase()
    };
    
    // التحقق من التصنيف
    const categoryMatch = expandedIntent.categories.find(cat => 
      containsArabic(bookData.category, cat)
    );
    if (categoryMatch) {
      reasons.push(`ينتمي لقسم ${categoryMatch}`);
    }
    
    // التحقق من العنوان
    const titleMatches = expandedIntent.keywords.filter(keyword => 
      containsArabic(bookData.title, keyword)
    );
    if (titleMatches.length > 0) {
      reasons.push(`عنوانه يحتوي على كلمات مفتاحية`);
    }
    
    // التحقق من الوصف
    const descriptionMatches = expandedIntent.keywords.filter(keyword => 
      containsArabic(bookData.description, keyword)
    );
    if (descriptionMatches.length > 0) {
      reasons.push(`يغطي مواضيع مهمة في هذا المجال`);
    }
    
    // التحقق من المؤلف
    const authorMatches = expandedIntent.keywords.filter(keyword => 
      containsArabic(bookData.author, keyword)
    );
    if (authorMatches.length > 0) {
      reasons.push(`مؤلفه متخصص في المجال`);
    }
    
    if (reasons.length === 0) {
      return 'كتاب شائع قد يناسب اهتماماتك';
    }
    
    return reasons.join('، ');
  }

  /**
   * الحصول على رسالة توضيحية عند عدم وجود تطابق مباشر
   * @param {string} originalIntent - النية الأصلية
   * @param {string} detectedCategory - التصنيف المكتشف
   * @returns {string} - رسالة توضيحية
   */
  getNoMatchMessage(originalIntent, detectedCategory) {
    const intentMessages = {
      'horror': 'لا يوجد لدينا حالياً قسم رعب صريح، لكن إذا كنت تحب أجواء الرعب والغموض فأرشح لك هذه الروايات',
      'romance': 'لم أجد روايات رومانسية صريحة، لكن وجدت كتب عاطفية ودرامية قد تناسبك',
      'success': 'لم أجد كتاباً يطابق طلبك تماماً، لكن إذا كان هدفك النجاح والتطوير فأرشح لك هذه الكتب',
      'business': 'لم أجد كتاباً في هذا المجال تحديداً، لكن وجدت كتب في الأعمال والإدارة قد تساعدك',
      'money': 'لم أجد كتاباً عن هذا الموضوع تحديداً، لكن وجدت كتب في الاستثمار والاقتصاد قد تناسبك',
      'default': 'لم أجد كتاباً يطابق طلبك تماماً، لكن وجدت كتب قريبة جداً قد تناسبك'
    };
    
    return intentMessages[originalIntent] || intentMessages['default'];
  }
}

module.exports = new IntentExpansionService();
