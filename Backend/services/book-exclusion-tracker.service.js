/**
 * Book Exclusion Tracker Service
 * خدمة تتبع الكتب المقترحة لتجنب إعادة اقتراحها
 */

class BookExclusionTracker {
  constructor() {
    // تخزين الكتب المستبعدة لكل محادثة
    this.conversationExclusions = new Map();
    
    // الحد الأقصى للكتب المستبعدة لكل محادثة
    this.maxExclusionsPerConversation = 50;
  }

  /**
   * إضافة كتاب لقائمة الاستبعاد لمحادثة معينة
   * @param {string} conversationId - معرف المحادثة
   * @param {string} bookId - معرف الكتاب
   */
  addExclusion(conversationId, bookId) {
    if (!conversationId || !bookId) return;

    if (!this.conversationExclusions.has(conversationId)) {
      this.conversationExclusions.set(conversationId, new Set());
    }

    const exclusions = this.conversationExclusions.get(conversationId);
    exclusions.add(bookId);

    // التحقق من الحد الأقصى
    if (exclusions.size > this.maxExclusionsPerConversation) {
      const oldest = exclusions.values().next().value;
      exclusions.delete(oldest);
    }
  }

  /**
   * إضافة عدة كتب لقائمة الاستبعاد
   * @param {string} conversationId - معرف المحادثة
   * @param {Array} bookIds - مصفوفة معرفات الكتب
   */
  addExclusions(conversationId, bookIds) {
    if (!conversationId || !bookIds || !Array.isArray(bookIds)) return;

    bookIds.forEach(bookId => {
      this.addExclusion(conversationId, bookId);
    });
  }

  /**
   * الحصول على الكتب المستبعدة لمحادثة معينة
   * @param {string} conversationId - معرف المحادثة
   * @returns {Set} - مجموعة الكتب المستبعدة
   */
  getExclusions(conversationId) {
    if (!conversationId) return new Set();
    return this.conversationExclusions.get(conversationId) || new Set();
  }

  /**
   * التحقق مما إذا كان الكتاب مستبعداً
   * @param {string} conversationId - معرف المحادثة
   * @param {string} bookId - معرف الكتاب
   * @returns {boolean} - هل الكتاب مستبعد
   */
  isExcluded(conversationId, bookId) {
    if (!conversationId || !bookId) return false;
    const exclusions = this.getExclusions(conversationId);
    return exclusions.has(bookId);
  }

  /**
   * تصفية مصفوفة كتب لإزالة الكتب المستبعدة
   * @param {string} conversationId - معرف المحادثة
   * @param {Array} books - مصفوفة الكتب
   * @returns {Array} - الكتب المفلترة
   */
  filterExcludedBooks(conversationId, books) {
    if (!conversationId || !books || !Array.isArray(books)) return books;

    const exclusions = this.getExclusions(conversationId);
    if (exclusions.size === 0) return books;

    return books.filter(book => !exclusions.has(book.id));
  }

  /**
   * مسح قائمة الاستبعاد لمحادثة معينة
   * @param {string} conversationId - معرف المحادثة
   */
  clearExclusions(conversationId) {
    if (!conversationId) return;
    this.conversationExclusions.delete(conversationId);
  }

  /**
   * مسح جميع قوائم الاستبعاد
   */
  clearAllExclusions() {
    this.conversationExclusions.clear();
  }

  /**
   * الحصول على إحصائيات الاستبعاد
   * @param {string} conversationId - معرف المحادثة
   * @returns {Object} - الإحصائيات
   */
  getStats(conversationId) {
    const exclusions = this.getExclusions(conversationId);
    return {
      conversationId,
      excludedCount: exclusions.size,
      excludedIds: Array.from(exclusions)
    };
  }

  /**
   * تنظيف المحادثات القديمة
   * @param {number} maxAge - الحد الأقصى للعمر بالمللي ثانية
   */
  cleanupOldConversations(maxAge = 24 * 60 * 60 * 1000) {
    // هذه الدالة يمكن توسيعها لتتبع وقت إنشاء كل محادثة
    // حالياً تقوم بمسح جميع المحادثات
    this.clearAllExclusions();
  }
}

module.exports = new BookExclusionTracker();
