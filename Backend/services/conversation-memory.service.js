/**
 * Conversation Memory Service
 * يحفظ ذاكرة المحادثة لكل conversation لتجنب البحث المتكرر
 */

class ConversationMemoryService {
  constructor() {
    // في الذاكرة (يمكن استبدالها بـ Redis/Database في الإنتاج)
    this.memory = new Map();
    
    // الحد الأقصى للكتب المحفوظة
    this.MAX_SUGGESTED_BOOKS = 20;
    this.MAX_SHOWN_BOOKS = 20;
    this.MAX_SEARCH_RESULTS = 20;
  }

  /**
   * الحصول على ذاكرة المحادثة
   * @param {string} conversationId - معرف المحادثة
   * @returns {Object} - ذاكرة المحادثة
   */
  getMemory(conversationId) {
    if (!this.memory.has(conversationId)) {
      this.memory.set(conversationId, {
        suggestedBooks: [], // آخر 20 كتاب تم اقتراحهم
        shownBooks: [], // آخر 20 كتاب تم عرضهم
        lastSearchResults: [], // آخر نتائج Search
        lastSearchQuery: null, // آخر استعلام بحث
        searchHistory: [] // تاريخ البحث
      });
    }
    return this.memory.get(conversationId);
  }

  /**
   * إضافة كتاب إلى قائمة الكتب المقترحة
   * @param {string} conversationId - معرف المحادثة
   * @param {Object} book - بيانات الكتاب
   */
  addSuggestedBook(conversationId, book) {
    const memory = this.getMemory(conversationId);
    
    // إزالة الكتاب إذا كان موجوداً مسبقاً
    memory.suggestedBooks = memory.suggestedBooks.filter(b => b.id !== book.id);
    
    // إضافة الكتاب في البداية
    memory.suggestedBooks.unshift(book);
    
    // الحفاظ على الحد الأقصى
    if (memory.suggestedBooks.length > this.MAX_SUGGESTED_BOOKS) {
      memory.suggestedBooks = memory.suggestedBooks.slice(0, this.MAX_SUGGESTED_BOOKS);
    }
  }

  /**
   * إضافة كتاب إلى قائمة الكتب المعروضة
   * @param {string} conversationId - معرف المحادثة
   * @param {Object} book - بيانات الكتاب
   */
  addShownBook(conversationId, book) {
    const memory = this.getMemory(conversationId);
    
    // إزالة الكتاب إذا كان موجوداً مسبقاً
    memory.shownBooks = memory.shownBooks.filter(b => b.id !== book.id);
    
    // إضافة الكتاب في البداية
    memory.shownBooks.unshift(book);
    
    // الحفاظ على الحد الأقصى
    if (memory.shownBooks.length > this.MAX_SHOWN_BOOKS) {
      memory.shownBooks = memory.shownBooks.slice(0, this.MAX_SHOWN_BOOKS);
    }
  }

  /**
   * حفظ نتائج البحث الأخيرة
   * @param {string} conversationId - معرف المحادثة
   * @param {Array} results - نتائج البحث
   * @param {string} query - استعلام البحث
   */
  saveSearchResults(conversationId, results, query) {
    const memory = this.getMemory(conversationId);
    
    memory.lastSearchResults = results;
    memory.lastSearchQuery = query;
    
    // إضافة إلى تاريخ البحث
    memory.searchHistory.unshift({
      query,
      results: results.map(r => r.id),
      timestamp: new Date().toISOString()
    });
    
    // الحفاظ على آخر 10 عمليات بحث
    if (memory.searchHistory.length > 10) {
      memory.searchHistory = memory.searchHistory.slice(0, 10);
    }
  }

  /**
  * الحصول على آخر نتائج البحث
   * @param {string} conversationId - معرف المحادثة
   * @returns {Object} - { results, query }
   */
  getLastSearchResults(conversationId) {
    const memory = this.getMemory(conversationId);
    return {
      results: memory.lastSearchResults || [],
      query: memory.lastSearchQuery
    };
  }

  /**
   * البحث عن كتاب في الكتب المقترحة/المعروضة
   * @param {string} conversationId - معرف المحادثة
   * @param {string} bookTitle - عنوان الكتاب
   * @returns {Object|null} - الكتاب إذا وجد
   */
  findBookInMemory(conversationId, bookTitle) {
    const memory = this.getMemory(conversationId);
    
    // البحث في الكتب المقترحة
    const inSuggested = memory.suggestedBooks.find(book => 
      this.isTitleMatch(book.title, bookTitle)
    );
    
    if (inSuggested) return inSuggested;
    
    // البحث في الكتب المعروضة
    const inShown = memory.shownBooks.find(book => 
      this.isTitleMatch(book.title, bookTitle)
    );
    
    if (inShown) return inSuggested;
    
    // البحث في نتائج البحث الأخيرة
    const inSearchResults = memory.lastSearchResults.find(book => 
      this.isTitleMatch(book.title, bookTitle)
    );
    
    return inSearchResults || null;
  }

  /**
   * التحقق من تطابق العناوين
   * @param {string} title1 - العنوان الأول
   * @param {string} title2 - العنوان الثاني
   * @returns {boolean} - هل يتطابقان
   */
  isTitleMatch(title1, title2) {
    if (!title1 || !title2) return false;
    
    const normalized1 = this.normalizeTitle(title1);
    const normalized2 = this.normalizeTitle(title2);
    
    return normalized1 === normalized2 || 
           normalized1.includes(normalized2) || 
           normalized2.includes(normalized1);
  }

  /**
   * تطبيع العنوان للمقارنة
   * @param {string} title - العنوان
   * @returns {string} - العنوان المطبع
   */
  normalizeTitle(title) {
    return title
      .toLowerCase()
      .trim()
      .replace(/[إأآا]/g, 'ا')
      .replace(/[ؤو]/g, 'و')
      .replace(/[ئي]/g, 'ي')
      .replace(/[ةه]/g, 'ه')
      .replace(/[^ا-ي0-9\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * استبعاد الكتب الموجودة في الذاكرة من النتائج
   * @param {string} conversationId - معرف المحادثة
   * @param {Array} books - قائمة الكتب
   * @returns {Array} - الكتب المستبعدة
   */
  excludeShownBooks(conversationId, books) {
    const memory = this.getMemory(conversationId);
    const shownIds = new Set([
      ...memory.suggestedBooks.map(b => b.id),
      ...memory.shownBooks.map(b => b.id)
    ]);
    
    return books.filter(book => !shownIds.has(book.id));
  }

  /**
   * مسح ذاكرة المحادثة
   * @param {string} conversationId - معرف المحادثة
   */
  clearMemory(conversationId) {
    this.memory.delete(conversationId);
  }

  /**
   * مسح جميع الذاكرة (للاختبار)
   */
  clearAllMemory() {
    this.memory.clear();
  }

  /**
   * الحصول على إحصائيات الذاكرة
   * @param {string} conversationId - معرف المحادثة
   * @returns {Object} - الإحصائيات
   */
  getMemoryStats(conversationId) {
    const memory = this.getMemory(conversationId);
    return {
      suggestedBooksCount: memory.suggestedBooks.length,
      shownBooksCount: memory.shownBooks.length,
      lastSearchResultsCount: memory.lastSearchResults.length,
      searchHistoryCount: memory.searchHistory.length
    };
  }
}

module.exports = new ConversationMemoryService();
