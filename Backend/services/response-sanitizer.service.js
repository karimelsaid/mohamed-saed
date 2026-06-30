/**
 * Response Sanitizer Service
 * خدمة تنظيف وتحسين جودة الردود قبل إرسالها للمستخدم
 */

const logger = require('./logger.service');
const { hasValidBookTokens, removeBookTokens } = require('../utils/book-token-parser');

class ResponseSanitizerService {
  constructor() {
    // الأنماط غير المرغوبة
    this.unwantedPatterns = [
      // Placeholders و Tokens
      /\[BOOK:\d+:[^\]]+\]/g,
      /\[PRODUCT:\d+:[^\]]+\]/g,
      /\[ID:\d+\]/g,
      /BOOK:\d+:/g,
      /PRODUCT:\d+:/g,
      /ID:\d+/g,
      
      // JSON fragments
      /\{[^}]*\}/g,
      /\[[^\]]*\]/g,
      /"[^"]*":\s*[^,\n]*/g,
      
      // Markdown غير المقصود
      /```[\s\S]*?```/g,
      /`[^`]+`/g,
      /\*\*[^*]+\*\*/g,
      /__[^_]+__/g,
      
      // كلمات بلغات غير عربية/إنجليزية (باستثناء أسماء الكتب والمؤلفين)
      /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0041-\u005A\u0061-\u007A\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u0600-\u06FF\u0660-\u0669\u06F0-\u06F9\s\d.,،؛:؟!()\-'"«»]/g,
      
      // جمل غير مكتملة
      /أرشح لك لأن[^.!?]*$/gm,
      /قد يفيدك لأنه[^.!?]*$/gm,
      /وأيضاً[^.!?]*$/gm,
      /لأنه[^.!?]*$/gm,
      /بسبب[^.!?]*$/gm,
      
      // فراغات زائدة
      /\n{3,}/g,
      / {2,}/g,
      /^\s+|\s+$/gm
    ];

    // الكلمات المسموح بها (أسماء كتب ومؤلفين أجانب)
    this.allowedForeignWords = new Set([
      'book', 'novel', 'story', 'author', 'publisher', 'page', 'pages',
      'isbn', 'edition', 'volume', 'chapter', 'pdf', 'epub', 'kindle'
    ]);
  }

  /**
   * تنظيف الرد بالكامل
   * @param {string} response - الرد الأصلي
   * @param {Array} books - الكتب المذكورة في الرد
   * @returns {Object} - الرد المنظف ومعلومات عن التنظيف
   */
  sanitize(response, books = []) {
    if (!response || typeof response !== 'string') {
      logger.debug('[ResponseSanitizer] Invalid response type');
      return {
        cleanedResponse: '',
        isClean: false,
        issues: ['Invalid response'],
        buttons: []
      };
    }

    let cleaned = response;
    const issues = [];
    let isClean = true;
    
    // استخراج الأزرار قبل التنظيف
    const buttons = this.extractButtons(response);

    // 1. إزالة Placeholders و Tokens (استبدال BOOK token باسم الكتاب)
    const beforePlaceholders = cleaned;
    cleaned = this.removePlaceholders(cleaned);
    // استبدال BOOK token باسم الكتاب لا يعتبر فشل - هذا سلوك متوقع
    // لا نضيف issue لهذا التغيير لأنه تحسين للنص

    // 2. إزالة JSON fragments
    const beforeJson = cleaned;
    cleaned = this.removeJsonFragments(cleaned);
    if (beforeJson !== cleaned) {
      logger.debug('[ResponseSanitizer] Removed JSON fragments');
      issues.push('Removed JSON fragments');
      isClean = false;
    }

    // 3. إزالة كلمات بلغات غير مطلوبة
    const beforeForeign = cleaned;
    cleaned = this.removeUnwantedForeignWords(cleaned, books);
    if (beforeForeign !== cleaned) {
      logger.debug('[ResponseSanitizer] Removed unwanted foreign words');
      issues.push('Removed unwanted foreign words');
      isClean = false;
    }

    // 4. إزالة جمل غير مكتملة
    const beforeIncomplete = cleaned;
    cleaned = this.removeIncompleteSentences(cleaned);
    if (beforeIncomplete !== cleaned) {
      logger.debug('[ResponseSanitizer] Removed incomplete sentences');
      issues.push('Removed incomplete sentences');
      isClean = false;
    }

    // 5. تنظيف الفراغات
    cleaned = this.cleanWhitespace(cleaned);

    // 6. إزالة BUTTON tokens من النص النهائي
    cleaned = this.removeButtonTokens(cleaned);

    // 7. التحقق من جودة اللغة العربية
    const languageIssues = this.checkArabicQuality(cleaned);
    if (languageIssues.length > 0) {
      logger.debug('[ResponseSanitizer] Arabic quality issues:', languageIssues);
      issues.push(...languageIssues);
      isClean = false;
    }

    // 8. التحقق من أن الرد ليس فارغاً
    if (!cleaned || cleaned.trim().length === 0) {
      logger.debug('[ResponseSanitizer] Response is empty after cleaning');
      issues.push('Response is empty after cleaning');
      isClean = false;
    }

    if (!isClean) {
      logger.debug('[ResponseSanitizer] Sanitization failed with issues:', issues);
    } else {
      logger.debug('[ResponseSanitizer] Sanitization passed');
    }

    return {
      cleanedResponse: cleaned.trim(),
      isClean,
      issues,
      buttons
    };
  }

  /**
   * استخراج الأزرار من النص
   * @param {string} text - النص
   * @returns {Array} - قائمة الأزرار
   */
  extractButtons(text) {
    const buttons = [];
    const buttonRegex = /\[BUTTON:([^:]+):([^\]]+)\]/g;
    let match;
    
    while ((match = buttonRegex.exec(text)) !== null) {
      buttons.push({
        label: match[1],
        action: match[2]
      });
    }
    
    return buttons;
  }

  /**
   * إزالة BUTTON tokens من النص
   * @param {string} text - النص
   * @returns {string} - النص المنظف
   */
  removeButtonTokens(text) {
    return text.replace(/\[BUTTON:[^\]]+\]/g, '');
  }

  /**
   * إزالة Placeholders و Tokens
   * @param {string} text - النص
   * @returns {string} - النص المنظف
   */
  removePlaceholders(text) {
    let cleaned = text;
    
    // استبدال تنسيق BOOK: الكامل باسم الكتاب
    cleaned = cleaned.replace(/\[BOOK:(\d+):([^:]+):([^:]+):([^:]+):([^\]]+)\]/g, (match, id, title, author, price, url) => {
      return title; // استبدال باسم الكتاب فقط
    });
    
    // استبدال تنسيق BOOK: المكسور (بدون إغلاق القوس) باسم الكتاب
    cleaned = cleaned.replace(/\[BOOK:(\d+):([^:\n]*)(?::([^:\n]*))?(?::([^:\n]*))?(?::([^\n]*))?$/gm, (match, id, title, author, price, url) => {
      return title || 'كتاب'; // استبدال بالاسم أو "كتاب" إذا لم يوجد
    });
    
    // إزالة PRODUCT:xxx format
    cleaned = cleaned.replace(/\[PRODUCT:\d+:[^\]]+\]/g, '');
    cleaned = cleaned.replace(/PRODUCT:\d+:/g, '');
    
    // إزالة ID:xxx format
    cleaned = cleaned.replace(/\[ID:\d+\]/g, '');
    cleaned = cleaned.replace(/ID:\d+/g, '');
    
    return cleaned;
  }

  /**
   * إزالة JSON fragments
   * @param {string} text - النص
   * @returns {string} - النص المنظف
   */
  removeJsonFragments(text) {
    let cleaned = text;
    
    // إزالة JSON objects فقط إذا كانت تحتوي على key:value بشكل واضح
    // نتجنب إزالة أي شيء بين {} قد يكون جزء من نص طبيعي
    cleaned = cleaned.replace(/\{[^}]*"[^"]+"\s*:\s*[^}]+\}/g, '');
    
    // إزالة JSON arrays التي تحتوي على key:value أو strings فقط (مش أرقام أو حروف عادية)
    // نتجنب إزالة [BOOK:...] أو [BUTTON:...] لأنها اتعالجت قبل كده
    cleaned = cleaned.replace(/\["[^"]*"(?:\s*,\s*"[^"]*")*\]/g, '');
    
    // إزالة key:value patterns في سطر لوحده
    cleaned = cleaned.replace(/^"[^"]*":\s*[^,\n]*$/gm, '');
    
    return cleaned;
  }

  /**
   * إزالة كلمات بلغات غير مطلوبة
   * @param {string} text - النص
   * @param {Array} books - الكتب المذكورة
   * @returns {string} - النص المنظف
   */
  removeUnwantedForeignWords(text, books) {
    let cleaned = text;
    
    // استخراج أسماء الكتب والمؤلفين المسموحة
    const allowedWords = new Set(this.allowedForeignWords);
    books.forEach(book => {
      if (book.title) allowedWords.add(book.title.toLowerCase());
      if (book.author) allowedWords.add(book.author.toLowerCase());
    });

    // إزالة كلمات صينية وفيتنامية وغيرها
    const unwantedPatterns = [
      /[\u4e00-\u9fff]+/g, // Chinese
      /[\u0400-\u04FF]+/g, // Cyrillic
      /[\u0E00-\u0E7F]+/g, // Thai
      /[\u3040-\u309F\u30A0-\u30FF]+/g, // Japanese
      /[\uAC00-\uD7AF]+/g, // Korean
      /[\u1EA0-\u1EF9]+/g, // Vietnamese
    ];

    unwantedPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned;
  }

  /**
   * إزالة جمل غير مكتملة
   * @param {string} text - النص
   * @returns {string} - النص المنظف
   */
  removeIncompleteSentences(text) {
    let cleaned = text;
    
    // إزالة جمل تنتهي بـ "لأن" بدون إكمال
    cleaned = cleaned.replace(/أرشح لك لأن[^.!?]*$/gm, '');
    cleaned = cleaned.replace(/قد يفيدك لأنه[^.!?]*$/gm, '');
    cleaned = cleaned.replace(/وأيضاً[^.!?]*$/gm, '');
    cleaned = cleaned.replace(/لأنه[^.!?]*$/gm, '');
    cleaned = cleaned.replace(/بسبب[^.!?]*$/gm, '');
    
    // إزالة جمل تحتوي على حرف جر معلق بدون مفعول (مثل "بـ" متبوع بـ "لأنه")
    cleaned = cleaned.replace(/بـ\s+لأنه/gm, 'لأنه');
    cleaned = cleaned.replace(/بـ\s+\s+لأنه/gm, 'لأنه');
    
    // إزالة جمل تحتوي على "تبدأ بـ" بدون اسم بعدها
    cleaned = cleaned.replace(/تبدأ بـ\s+لأنه/gm, 'تبدأ بكتاب لأنه');
    cleaned = cleaned.replace(/تبدأ بـ\s+\s+لأنه/gm, 'تبدأ بكتاب لأنه');
    
    return cleaned;
  }

  /**
   * تنظيف الفراغات
   * @param {string} text - النص
   * @returns {string} - النص المنظف
   */
  cleanWhitespace(text) {
    let cleaned = text;
    
    // إزالة أسطر فارغة متكررة
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // إزالة فراغات متكررة
    cleaned = cleaned.replace(/ {2,}/g, ' ');
    
    // إزالة فراغات في بداية ونهاية الأسطر
    cleaned = cleaned.replace(/^\s+|\s+$/gm, '');
    
    return cleaned;
  }

  /**
   * التحقق من جودة اللغة العربية
   * @param {string} text - النص
   * @returns {Array} - قائمة المشاكل
   */
  checkArabicQuality(text) {
    const issues = [];
    
    // استثناء URLs من النص قبل حساب نسبة اللغة العربية
    const textWithoutUrls = text.replace(/https?:\/\/[^\s]+/g, '');
    const textWithoutBookNames = textWithoutUrls.replace(/[a-zA-Z]+/g, ' '); // استثناء الكلمات الإنجليزية (أسماء كتب/مؤلفين)
    
    // التحقق من وجود نص عربي (بعد استثناء URLs)
    const arabicChars = textWithoutBookNames.match(/[\u0600-\u06FF]/g);
    const totalChars = textWithoutBookNames.replace(/\s/g, '').length;
    
    // إذا كان النص قصير جداً (< 10 حروف)، نتجاوز فحص النسبة
    if (totalChars > 10) {
      if (!arabicChars || arabicChars.length < totalChars * 0.2) { // خفض العتبة من 30% إلى 20%
        issues.push('Low Arabic content');
      }
    }

    // التحقق من جمل قصيرة جداً
    const sentences = text.split(/[.!?]/);
    sentences.forEach(sentence => {
      if (sentence.trim().length > 0 && sentence.trim().length < 3) {
        issues.push('Very short sentences');
      }
    });

    // التحقق من تكرار الكلمات (استثناء الكلمات القصيرة)
    const words = text.split(/\s+/);
    const wordCount = {};
    words.forEach(word => {
      if (word.length > 3) { // زيادة الحد الأدنى من 2 إلى 3
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });
    
    // كلمات مسموح بتكرارها بشكل طبيعي في النص العربي
    const allowedRepeatedWords = new Set([
      'الله', 'كتاب', 'كتب', 'رواية', 'روايات', 'مكتبة',
      'عايز', 'ممكن', 'فيها', 'لأنه', 'لأنك', 'بتحب',
      'القصة', 'الكتاب', 'موضوع', 'أسلوب', 'القراءة'
    ]);
    
    Object.entries(wordCount).forEach(([word, count]) => {
      if (count > 5 && !allowedRepeatedWords.has(word)) {
        issues.push(`Repeated word: ${word}`);
      }
    });

    return issues;
  }

  /**
   * التحقق من وجود BOOK tokens سليمة
   * @param {string} response - الرد
   * @returns {boolean} - true إذا كان هناك BOOK tokens سليمة
   */
  hasValidBookTokens(response) {
    return hasValidBookTokens(response);
  }

  /**
   * التحقق من وجود BUTTON tokens سليمة
   * @param {string} response - الرد
   * @returns {boolean} - true إذا كان هناك BUTTON tokens سليمة
   */
  hasValidButtonTokens(response) {
    return /\[BUTTON:[^\]:]+:[^\]]+\]/.test(response);
  }

  /**
   * إعادة توليد الرد إذا لم يكن نظيفاً
   * @param {string} originalResponse - الرد الأصلي
   * @param {Array} books - الكتب المذكورة
   * @param {Function} regenerateFunction - دالة إعادة التوليد
   * @returns {Promise<Object>} - الرد النهائي
   */
  async sanitizeWithRegeneration(originalResponse, books, regenerateFunction) {
    const firstPass = this.sanitize(originalResponse, books);
    
    // إذا كان الرد نظيف، ارجعه مباشرة
    if (firstPass.isClean) {
      logger.debug('[ResponseSanitizer] Response is clean, no regeneration needed');
      return firstPass;
    }

    // إذا كان الرد يحتوي على BOOK tokens سليمة، لا تقم بـ regeneration
    // فقط نظف النص المحيط واستخدم النتيجة
    if (this.hasValidBookTokens(originalResponse)) {
      logger.debug('[ResponseSanitizer] Response has valid BOOK tokens, using cleaned version without regeneration');
      return firstPass;
    }

    // إذا كان الرد يحتوي على BUTTON tokens، لا تقم بـ regeneration حتى لو مفيش كتب
    // الأزرار وحدها ردّ صحيح (مثلاً: قوائم، اختيارات، روابط)
    if (this.hasValidButtonTokens(originalResponse)) {
      logger.debug('[ResponseSanitizer] Response has valid BUTTON tokens, using cleaned version without regeneration');
      return firstPass;
    }

    // إعادة التوليد مرة واحدة فقط إذا لم يكن هناك BOOK tokens أو BUTTON tokens سليمة
    logger.warn('[ResponseSanitizer] First pass failed without valid BOOK/BUTTON tokens, regenerating...');
    const regeneratedResponse = await regenerateFunction();
    const secondPass = this.sanitize(regeneratedResponse, books);
    
    if (secondPass.isClean) {
      logger.debug('[ResponseSanitizer] Second pass successful');
      return secondPass;
    }

    // إذا فشلت المحاولة الثانية، استخدم fallback response نظيف برمجياً
    logger.warn('[ResponseSanitizer] Second pass failed, using fallback response');
    const fallbackResponse = this.generateFallbackResponse(books);
    const fallbackPass = this.sanitize(fallbackResponse, books);
    
    return fallbackPass;
  }

  /**
   * توليد fallback response نظيف برمجياً
   * @param {Array} books - الكتب المذكورة
   * @returns {string} - الرد البديل
   */
  generateFallbackResponse(books) {
    if (!books || books.length === 0) {
      return 'بناءً على طلبك، يرجى محاولة صياغة طلبك بشكل مختلف للحصول على توصيات أفضل.';
    }

    const bookNames = books.map(b => b.title || 'كتاب').join(' و ');
    return `بناءً على طلبك، أنصحك بـ ${bookNames}. هذه الكتب مناسبة لطلبك. تقدر تشوف التفاصيل والشراء من الروابط المتاحة.`;
  }
}

module.exports = new ResponseSanitizerService();