/**
 * Follow-up Intent Resolver Service
 * خدمة حل نية المتابعة لتحسين ذاكرة المحادثة
 */

class FollowupIntentResolver {
  constructor() {
    // الكلمات التي تدل على متابعة المحادثة
    this.followupKeywords = [
      'غيرهم', 'غيرها', 'غير', 'كمان', 'أكثر', 'طيب', 'تمام', 'أوكي', 
      'غير ذلك', 'شوية', 'زيادة', 'باقي', 'تاني', 'تانية', 'بدل',
      'عندك غير', 'فيه غير', 'هات غير', 'بدلهم', 'بدلها',
      'اخرى', 'أخرى', 'بديل', 'بدائل', 'خيارات', 'مختلف', 'جديد'
    ];

    // الكلمات التي تدل على التأكيد
    this.confirmationKeywords = [
      'أيوة', 'أيوه', 'نعم', 'صح', 'كده', 'كدا', 'تمام', 'زين', 'حلو',
      'مظبوط', 'أكيد', 'بالتأكيد', 'طبعاً', 'سليم', 'ممتاز', 'حاضر'
    ];

    // الكلمات التي تدل على النفي
    this.negationKeywords = [
      'لا', 'لأ', 'مش', 'موش', 'أبداً', 'أبدا', 'منفصل', 'لازمش',
      'ما', 'ماش', 'مفيش', 'مفي', 'لازم'
    ];

    // الحد الأدنى لطول الرسالة لتعتبر متابعة
    this.minFollowupLength = 10;
  }

  /**
   * التحقق مما إذا كانت الرسالة متابعة للمحادثة السابقة
   * @param {string} currentMessage - الرسالة الحالية
   * @param {Array} conversationHistory - تاريخ المحادثة
   * @returns {Object} - نتيجة التحليل
   */
  isFollowup(currentMessage, conversationHistory = []) {
    if (!currentMessage || !conversationHistory || conversationHistory.length === 0) {
      return {
        isFollowup: false,
        type: null,
        previousIntent: null,
        confidence: 0
      };
    }

    const trimmedMessage = currentMessage.trim().toLowerCase();
    
    // التحقق من طول الرسالة
    if (trimmedMessage.length > this.minFollowupLength) {
      return {
        isFollowup: false,
        type: null,
        previousIntent: null,
        confidence: 0
      };
    }

    // التحقق من كلمات المتابعة
    const hasFollowupKeyword = this.followupKeywords.some(keyword => 
      trimmedMessage.includes(keyword)
    );

    if (!hasFollowupKeyword) {
      return {
        isFollowup: false,
        type: null,
        previousIntent: null,
        confidence: 0
      };
    }

    // الحصول على آخر نية من المحادثة
    const previousIntent = this.getLastIntent(conversationHistory);

    if (!previousIntent) {
      return {
        isFollowup: false,
        type: null,
        previousIntent: null,
        confidence: 0
      };
    }

    // تحديد نوع المتابعة
    const followupType = this.determineFollowupType(trimmedMessage);

    return {
      isFollowup: true,
      type: followupType,
      previousIntent: previousIntent,
      confidence: 0.9
    };
  }

  /**
   * تحديد نوع المتابعة
   * @param {string} message - الرسالة
   * @returns {string} - نوع المتابعة
   */
  determineFollowupType(message) {
    // طلب بدائل
    if (message.includes('غير') || message.includes('بدل') || message.includes('بديل')) {
      return 'alternatives';
    }

    // طلب المزيد
    if (message.includes('كمان') || message.includes('أكثر') || message.includes('زيادة')) {
      return 'more';
    }

    // تأكيد
    if (this.confirmationKeywords.some(k => message.includes(k))) {
      return 'confirmation';
    }

    // نفي
    if (this.negationKeywords.some(k => message.includes(k))) {
      return 'negation';
    }

    // افتراضي
    return 'general';
  }

  /**
   * الحصول على آخر نية من المحادثة
   * @param {Array} conversationHistory - تاريخ المحادثة
   * @returns {Object|null} - آخر نية
   */
  getLastIntent(conversationHistory) {
    // البحث عن آخر رسالة تحتوي على intent
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const message = conversationHistory[i];
      if (message.intent && message.intent !== 'general_inquiry') {
        return message.intent;
      }
    }
    return null;
  }

  /**
   * الحصول على آخر كتب تم اقتراحها
   * @param {Array} conversationHistory - تاريخ المحادثة
   * @returns {Array} - آخر الكتب المقترحة
   */
  getLastSuggestedBooks(conversationHistory) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const message = conversationHistory[i];
      if (message.suggestedBooks && Array.isArray(message.suggestedBooks)) {
        return message.suggestedBooks;
      }
    }
    return [];
  }

  /**
   * تحديث الرسالة الحالية بناءً على المتابعة
   * @param {string} currentMessage - الرسالة الحالية
   * @param {Object} followupAnalysis - تحليل المتابعة
   * @param {Array} conversationHistory - تاريخ المحادثة
   * @returns {string} - الرسالة المحدثة
   */
  expandFollowupMessage(currentMessage, followupAnalysis, conversationHistory) {
    if (!followupAnalysis.isFollowup || !followupAnalysis.previousIntent) {
      return currentMessage;
    }

    const previousIntent = followupAnalysis.previousIntent;
    const followupType = followupAnalysis.type;

    // بناء رسالة موسعة
    let expandedMessage = currentMessage;

    switch (followupType) {
      case 'alternatives':
        expandedMessage = `بدائل لآخر طلب (${previousIntent.intent})`;
        break;
      case 'more':
        expandedMessage = `المزيد من ${previousIntent.intent}`;
        break;
      case 'confirmation':
        expandedMessage = `تأكيد على ${previousIntent.intent}`;
        break;
      case 'negation':
        expandedMessage = `غير ${previousIntent.intent}`;
        break;
      default:
        expandedMessage = `متابعة لـ ${previousIntent.intent}`;
    }

    return expandedMessage;
  }

  /**
   * الحصول على الكتب المستبعدة للمتابعة
   * @param {Array} conversationHistory - تاريخ المحادثة
   * @returns {Set} - معرفات الكتب المستبعدة
   */
  getExcludedBooks(conversationHistory) {
    const excludedIds = new Set();
    
    conversationHistory.forEach(message => {
      if (message.suggestedBooks && Array.isArray(message.suggestedBooks)) {
        message.suggestedBooks.forEach(book => {
          if (book.id) {
            excludedIds.add(book.id);
          }
        });
      }
    });

    return excludedIds;
  }

  /**
   * تحليل الرسالة مع مراعاة المتابعة
   * @param {string} currentMessage - الرسالة الحالية
   * @param {Array} conversationHistory - تاريخ المحادثة
   * @returns {Object} - نتيجة التحليل الكاملة
   */
  analyzeWithFollowup(currentMessage, conversationHistory = []) {
    const followupAnalysis = this.isFollowup(currentMessage, conversationHistory);
    
    if (followupAnalysis.isFollowup) {
      const expandedMessage = this.expandFollowupMessage(
        currentMessage,
        followupAnalysis,
        conversationHistory
      );

      const excludedBooks = this.getExcludedBooks(conversationHistory);
      const lastSuggestedBooks = this.getLastSuggestedBooks(conversationHistory);

      return {
        isFollowup: true,
        originalMessage: currentMessage,
        expandedMessage: expandedMessage,
        followupType: followupAnalysis.type,
        previousIntent: followupAnalysis.previousIntent,
        excludedBooks: Array.from(excludedBooks),
        lastSuggestedBooks: lastSuggestedBooks,
        confidence: followupAnalysis.confidence
      };
    }

    return {
      isFollowup: false,
      originalMessage: currentMessage,
      expandedMessage: currentMessage,
      followupType: null,
      previousIntent: null,
      excludedBooks: [],
      lastSuggestedBooks: [],
      confidence: 0
    };
  }
}

module.exports = new FollowupIntentResolver();
