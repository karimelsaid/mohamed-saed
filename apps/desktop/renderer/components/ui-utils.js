// UI Formatting & Accessibility Utilities (Arabic & RTL)

const UiUtils = {
  /**
   * تنسيق العملة بالجنيه المصري (EGP)
   * @param {number} amount
   * @param {boolean} withSymbol
   * @returns {string}
   */
  formatCurrency(amount, withSymbol = true) {
    const num = Number(amount) || 0;
    const formatted = num.toLocaleString('ar-EG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return withSymbol ? `${formatted} ج.م` : formatted;
  },

  /**
   * تنسيق التاريخ العربي
   * @param {string|Date} dateStr
   * @param {boolean} withTime
   * @returns {string}
   */
  formatDate(dateStr, withTime = false) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return String(dateStr);

    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };

    if (withTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = true;
    }

    return date.toLocaleDateString('ar-EG', options);
  },

  /**
   * تنسيق رقم الهاتف المصري (01xxxxxxxxx)
   * @param {string} phone
   * @returns {string}
   */
  formatPhone(phone) {
    if (!phone) return '';
    const cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('01')) {
      return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
    }
    return phone;
  },

  /**
   * التحقق من رقم الهاتف المصري
   * @param {string} phone
   * @returns {boolean}
   */
  isValidEgyptianPhone(phone) {
    const cleaned = String(phone).replace(/\D/g, '');
    return /^01[0125]\d{8}$/.test(cleaned);
  },

  /**
   * توليد معرف فريد للعناصر
   */
  generateId(prefix = 'el') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UiUtils };
} else {
  window.UiUtils = UiUtils;
}
