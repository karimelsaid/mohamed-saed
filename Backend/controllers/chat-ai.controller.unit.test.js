/**
 * Unit Tests for Chat AI Controller Helper Functions
 * اختبارات وحدة لدوال مساعدة في Chat AI Controller
 */

const { isKenouzLibraryQuery } = require('./chat-ai.controller');

describe('isKenouzLibraryQuery', () => {
  
  describe('should return true for library-related queries', () => {
    
    it('should recognize "مكتبة" with related words', () => {
      expect(isKenouzLibraryQuery('معلومات عن المكتبة')).toBe(true);
      expect(isKenouzLibraryQuery('عنوان المكتبة')).toBe(true);
      expect(isKenouzLibraryQuery('رقم هاتف المكتبة')).toBe(true);
      expect(isKenouzLibraryQuery('أوقات عمل المكتبة')).toBe(true);
      expect(isKenouzLibraryQuery('مواعيد عمل المكتبة')).toBe(true);
    });

    it('should recognize "library" with related words', () => {
      expect(isKenouzLibraryQuery('library information')).toBe(true);
      expect(isKenouzLibraryQuery('library address')).toBe(true);
      expect(isKenouzLibraryQuery('library phone number')).toBe(true);
    });

    it('should recognize "المكتبة" with related words', () => {
      expect(isKenouzLibraryQuery('معلومات المكتبة')).toBe(true);
      expect(isKenouzLibraryQuery('عنوان المكتبة')).toBe(true);
    });

    it('should recognize "مكتبه" with related words', () => {
      expect(isKenouzLibraryQuery('معلومات مكتبه')).toBe(true);
      expect(isKenouzLibraryQuery('عنوان مكتبه')).toBe(true);
    });

    it('should recognize "المكتبه" with related words', () => {
      expect(isKenouzLibraryQuery('معلومات المكتبه')).toBe(true);
      expect(isKenouzLibraryQuery('عنوان المكتبه')).toBe(true);
    });

    it('should recognize knoozbook keywords with related words', () => {
      expect(isKenouzLibraryQuery('معلومات knoozbook')).toBe(true);
      expect(isKenouzLibraryQuery('عنوان knoozbook')).toBe(true);
      expect(isKenouzLibraryQuery('رقم هاتف knoozbook')).toBe(true);
      expect(isKenouzLibraryQuery('أوقات عمل knoozbook')).toBe(true);
      expect(isKenouzLibraryQuery('مواعيد عمل knoozbook')).toBe(true);
      expect(isKenouzLibraryQuery('كنوز')).toBe(true);
      expect(isKenouzLibraryQuery('kenouz')).toBe(true);
    });
  });

  describe('should return false for non-library queries', () => {
    
    it('should return false for library word without related words', () => {
      expect(isKenouzLibraryQuery('مكتبة')).toBe(false);
      expect(isKenouzLibraryQuery('library')).toBe(false);
      expect(isKenouzLibraryQuery('المكتبة')).toBe(false);
      expect(isKenouzLibraryQuery('مكتبه')).toBe(false);
      expect(isKenouzLibraryQuery('المكتبه')).toBe(false);
    });

    it('should return false for knoozbook without related words', () => {
      expect(isKenouzLibraryQuery('knoozbook')).toBe(false);
      expect(isKenouzLibraryQuery('kenouz')).toBe(false);
    });

    it('should return false for unrelated queries', () => {
      expect(isKenouzLibraryQuery('أريد كتاباً')).toBe(false);
      expect(isKenouzLibraryQuery('محتاج رواية')).toBe(false);
      expect(isKenouzLibraryQuery('كتاب عن التاريخ')).toBe(false);
      expect(isKenouzLibraryQuery('السلام عليكم')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isKenouzLibraryQuery('LIBRARY INFORMATION')).toBe(true);
      expect(isKenouzLibraryQuery('Library Address')).toBe(true);
      expect(isKenouzLibraryQuery('KNOOZBOOK')).toBe(false); // بدون كلمة مرتبطة
      expect(isKenouzLibraryQuery('معلومات KNOOZBOOK')).toBe(true);
    });
  });

  describe('edge cases', () => {
    
    it('should handle empty string', () => {
      expect(isKenouzLibraryQuery('')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(isKenouzLibraryQuery(null)).toBe(false);
      expect(isKenouzLibraryQuery(undefined)).toBe(false);
    });

    it('should require at least 2 related words for knoozbook queries', () => {
      expect(isKenouzLibraryQuery('knoozbook مكتبة')).toBe(true);
      expect(isKenouzLibraryQuery('knoozbook عنوان')).toBe(true);
      expect(isKenouzLibraryQuery('knoozbook فقط')).toBe(false);
    });

    it('should require at least 1 related word for library word queries', () => {
      expect(isKenouzLibraryQuery('مكتبة معلومات')).toBe(true);
      expect(isKenouzLibraryQuery('library address')).toBe(true);
      expect(isKenouzLibraryQuery('مكتبة كتاب')).toBe(false); // "كتاب" ليست في قائمة الكلمات المرتبطة
    });
  });
});
