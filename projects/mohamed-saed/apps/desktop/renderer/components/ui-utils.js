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
   * تنسيق الوقت بنظام 12 ساعة مع ص/م (صباحاً / مساءً)
   * @param {string|Date} dateStr
   * @returns {string}
   */
  formatTime(dateStr) {
    if (!dateStr) return '—';

    // دعم نصوص الوقت المباشرة مثل "14:30" أو "02:00:00"
    if (typeof dateStr === 'string' && /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.test(dateStr.trim())) {
      const match = dateStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      let hours = parseInt(match[1], 10);
      const minutes = match[2];
      const period = hours < 12 ? 'ص' : 'م';
      const hours12 = hours % 12 || 12;
      return `${String(hours12).padStart(2, '0')}:${minutes} ${period}`;
    }

    const date = this.parseDate(dateStr);
    if (!date || isNaN(date.getTime())) return String(dateStr);

    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours < 12 ? 'ص' : 'م';
    const hours12 = hours % 12 || 12; // تحويل 0 إلى 12
    const minutesStr = String(minutes).padStart(2, '0');
    const hours12Str = String(hours12).padStart(2, '0');

    return `${hours12Str}:${minutesStr} ${period}`;
  },

  /**
   * تنسيق التاريخ العربي مع إمكانية عرض الوقت بنظام 12 ساعة (ص/م)
   * @param {string|Date} dateStr
   * @param {boolean} withTime
   * @returns {string}
   */
  parseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    const str = String(dateStr).trim();
    // Parse YYYY-MM-DD HH:MM:SS directly into local Date to prevent UTC timezone shifting
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const hour = match[4] ? parseInt(match[4], 10) : 0;
      const min = match[5] ? parseInt(match[5], 10) : 0;
      const sec = match[6] ? parseInt(match[6], 10) : 0;
      return new Date(year, month, day, hour, min, sec);
    }
    return new Date(dateStr);
  },

  formatDate(dateStr, withTime = false) {
    if (!dateStr) return '—';
    const date = this.parseDate(dateStr);
    if (!date || isNaN(date.getTime())) return String(dateStr);

    const dateFormatted = date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    if (withTime) {
      const timeFormatted = this.formatTime(date);
      return `${dateFormatted} في ${timeFormatted}`;
    }

    return dateFormatted;
  },

  /**
   * تنسيق التاريخ والوقت معاً بصيغة 12 ساعة ص/م
   * @param {string|Date} dateStr
   * @returns {string}
   */
  formatDateTime(dateStr) {
    return this.formatDate(dateStr, true);
  },

  /**
   * تنسيق التاريخ والوقت بالأرقام المختصرة بنظام 12 ساعة
   * @param {string|Date} dateStr
   * @returns {string}
   */
  formatDateTimeShort(dateStr) {
    if (!dateStr) return '—';
    const date = this.parseDate(dateStr);
    if (!date || isNaN(date.getTime())) return String(dateStr);

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const timeFormatted = this.formatTime(date);

    return `${y}/${m}/${d} ${timeFormatted}`;
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
