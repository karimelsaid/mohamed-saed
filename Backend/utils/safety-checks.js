/**
 * Safety checks for AI responses
 * Prevents AI from making false promises or suggesting non-existent products
 */

/**
 * فحص الرد لاكتشاف وعود بخدمات غير موجودة (حارس أخير)
 * @param {string} text - رد AI
 * @returns {Object} - { isSuspicious: boolean, detectedPatterns: string[] }
 */
function containsFabricatedServicePromise(text) {
  const suspiciousPatterns = [
    { pattern: /طلب مسبق/i, description: 'طلب مسبق' },
    { pattern: /هتوصلك خلال/i, description: 'هتوصلك خلال' },
    { pattern: /توصل خلال (يومين|ثلاثة|3 أيام|\d+ أيام)/i, description: 'وعد بتوصيل خلال أيام' },
    { pattern: /ممكن نطلب لك/i, description: 'ممكن نطلب لك' },
    { pattern: /كتب خارجية/i, description: 'كتب خارجية' },
    { pattern: /نجلبه لك/i, description: 'نجلبه لك' },
    { pattern: /نحضره لك/i, description: 'نحضره لك' },
    { pattern: /نوصله لك/i, description: 'نوصله لك' },
    { pattern: /خلال يومين/i, description: 'خلال يومين' },
    { pattern: /خلال (ثلاثة|3) أيام/i, description: 'خلال 3 أيام' },
  ];

  const detectedPatterns = [];
  for (const { pattern, description } of suspiciousPatterns) {
    if (pattern.test(text)) {
      detectedPatterns.push(description);
    }
  }

  return {
    isSuspicious: detectedPatterns.length > 0,
    detectedPatterns
  };
}

/**
 * إزالة علامات ** الفاضية من النص
 * @param {string} text - النص
 * @returns {string} - النص النظيف
 */
function removeEmptyBoldMarkers(text) {
  // إزالة ** مع مسافات
  text = text.replace(/\*\*\s*\*\*/g, '');
  // إزالة **** بدون مسافات
  text = text.replace(/\*\*\*\*/g, '');
  return text;
}

/**
 * الرد الآمن الموحد عند اكتشاف وعود مختلقة
 */
const SAFE_FALLBACK_RESPONSE = `للأسف الكتاب المطلوب غير متوفر حالياً في مكتبتنا.
تقدر تتواصل معنا مباشرة على 01094612729 للاستفسار عن إمكانية توفيره،
أو تصفح موقعنا www.knoozbook.com لمشاهدة الكتب المتاحة حالياً.`;

module.exports = {
  containsFabricatedServicePromise,
  removeEmptyBoldMarkers,
  SAFE_FALLBACK_RESPONSE
};
