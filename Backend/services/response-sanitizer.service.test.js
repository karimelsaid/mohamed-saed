/**
 * Unit Tests for Response Sanitizer Service
 * اختبارات وحدة خدمة تنظيف الردود
 */

const ResponseSanitizer = require('./response-sanitizer.service');

describe('ResponseSanitizer Service', () => {
  
  describe('removePlaceholders', () => {
    test('should replace BOOK token with book title', () => {
      const input = 'أرشح لك [BOOK:123:تعافيت بك:أحمد محمد:50:https://example.com] لأنه ممتاز';
      const result = ResponseSanitizer.removePlaceholders(input);
      expect(result).toBe('أرشح لك تعافيت بك لأنه ممتاز');
      expect(result).not.toContain('[BOOK:');
    });

    test('should replace broken BOOK token with book title', () => {
      const input = 'أرشح لك [BOOK:123:تعافيت بك:أحمد محمد:50:https://example.com';
      const result = ResponseSanitizer.removePlaceholders(input);
      expect(result).toBe('أرشح لك تعافيت بك');
      expect(result).not.toContain('[BOOK:');
    });

    test('should replace multiple BOOK tokens', () => {
      const input = '[BOOK:123:كتاب1:مؤلف1:50:url1] و [BOOK:456:كتاب2:مؤلف2:60:url2]';
      const result = ResponseSanitizer.removePlaceholders(input);
      expect(result).toBe('كتاب1 و كتاب2');
      expect(result).not.toContain('[BOOK:');
    });

    test('should handle BOOK token without title', () => {
      const input = 'أرشح لك [BOOK:123]';
      const result = ResponseSanitizer.removePlaceholders(input);
      expect(result).toBe('أرشح لك كتاب');
    });

    test('should remove PRODUCT tokens', () => {
      const input = 'منتج [PRODUCT:123:اسم:50]';
      const result = ResponseSanitizer.removePlaceholders(input);
      expect(result).not.toContain('[PRODUCT:');
    });

    test('should remove ID tokens', () => {
      const input = 'معرف [ID:123]';
      const result = ResponseSanitizer.removePlaceholders(input);
      expect(result).not.toContain('[ID:');
    });
  });

  describe('removeIncompleteSentences', () => {
    test('should remove sentences ending with "لأن" without completion', () => {
      const input = 'أرشح لك لأن';
      const result = ResponseSanitizer.removeIncompleteSentences(input);
      expect(result).toBe('');
    });

    test('should fix "بـ لأنه" pattern', () => {
      const input = 'تبدأ بـ لأنه يغطي';
      const result = ResponseSanitizer.removeIncompleteSentences(input);
      expect(result).toBe('تبدأ بكتاب لأنه يغطي');
    });

    test('should fix "تبدأ بـ لأنه" pattern', () => {
      const input = 'أنصحك أن تبدأ بـ لأنه يغطي';
      const result = ResponseSanitizer.removeIncompleteSentences(input);
      expect(result).toBe('أنصحك أن تبدأ بكتاب لأنه يغطي');
    });

    test('should not affect complete sentences', () => {
      const input = 'أرشح لك هذا الكتاب لأنه ممتاز.';
      const result = ResponseSanitizer.removeIncompleteSentences(input);
      expect(result).toBe('أرشح لك هذا الكتاب لأنه ممتاز.');
    });
  });

  describe('sanitize', () => {
    test('should clean response with BOOK tokens', () => {
      const input = 'أرشح لك [BOOK:123:تعافيت بك:أحمد:50:url] لأنه ممتاز';
      const books = [{ id: '123', title: 'تعافيت بك', author: 'أحمد' }];
      const result = ResponseSanitizer.sanitize(input, books);
      expect(result.isClean).toBe(true);
      expect(result.cleanedResponse).toContain('تعافيت بك');
      expect(result.cleanedResponse).not.toContain('[BOOK:');
    });

    test('should detect incomplete sentences', () => {
      const input = 'أرشح لك لأن';
      const result = ResponseSanitizer.sanitize(input, []);
      expect(result.isClean).toBe(false);
      expect(result.issues).toContain('Removed incomplete sentences');
    });

    test('should handle empty response', () => {
      const result = ResponseSanitizer.sanitize('', []);
      expect(result.isClean).toBe(false);
      expect(result.issues).toContain('Response is empty after cleaning');
    });

    test('should handle response with only BOOK tokens', () => {
      const input = '[BOOK:123:كتاب:مؤلف:50:url]';
      const books = [{ id: '123', title: 'كتاب', author: 'مؤلف' }];
      const result = ResponseSanitizer.sanitize(input, books);
      expect(result.cleanedResponse).toBe('كتاب');
    });
  });

  describe('generateFallbackResponse', () => {
    test('should generate fallback with book names', () => {
      const books = [
        { title: 'كتاب1' },
        { title: 'كتاب2' }
      ];
      const result = ResponseSanitizer.generateFallbackResponse(books);
      expect(result).toContain('كتاب1');
      expect(result).toContain('كتاب2');
      expect(result).toContain('بناءً على طلبك');
    });

    test('should generate fallback without books', () => {
      const result = ResponseSanitizer.generateFallbackResponse([]);
      expect(result).toContain('بناءً على طلبك');
      expect(result).toContain('يرجى محاولة صياغة طلبك');
    });

    test('should handle books without titles', () => {
      const books = [{ id: '123' }];
      const result = ResponseSanitizer.generateFallbackResponse(books);
      expect(result).toContain('كتاب');
    });
  });

  describe('checkArabicQuality', () => {
    test('should detect low Arabic content', () => {
      const input = 'Hello world test';
      const result = ResponseSanitizer.checkArabicQuality(input);
      expect(result).toContain('Low Arabic content');
    });

    test('should detect very short sentences', () => {
      const input = 'أنا.هو.هي.';
      const result = ResponseSanitizer.checkArabicQuality(input);
      expect(result).toContain('Very short sentences');
    });

    test('should detect repeated words', () => {
      const input = 'كتاب كتاب كتاب كتاب كتاب';
      const result = ResponseSanitizer.checkArabicQuality(input);
      expect(result).toContain('Repeated word');
    });

    test('should pass quality check for good Arabic text', () => {
      const input = 'أرشح لك هذا الكتاب لأنه ممتاز ومناسب لطلبك.';
      const result = ResponseSanitizer.checkArabicQuality(input);
      expect(result.length).toBe(0);
    });
  });

  describe('hasValidBookTokens', () => {
    test('should detect valid BOOK tokens', () => {
      const input = 'أرشح لك [BOOK:123:كتاب:مؤلف:50:url] و [BOOK:456:كتاب2:مؤلف2:60:url2]';
      const result = ResponseSanitizer.hasValidBookTokens(input);
      expect(result).toBe(true);
    });

    test('should return false for broken BOOK tokens', () => {
      const input = 'أرشح لك [BOOK:123';
      const result = ResponseSanitizer.hasValidBookTokens(input);
      expect(result).toBe(false);
    });

    test('should return false for no BOOK tokens', () => {
      const input = 'أرشح لك هذا الكتاب';
      const result = ResponseSanitizer.hasValidBookTokens(input);
      expect(result).toBe(false);
    });

    test('should handle BOOK tokens with extra spaces', () => {
      const input = 'أرشح لك [BOOK:123:كتاب:مؤلف:50:url]  ';
      const result = ResponseSanitizer.hasValidBookTokens(input);
      expect(result).toBe(true);
    });

    test('should handle BOOK tokens with newlines', () => {
      const input = 'أرشح لك\n[BOOK:123:كتاب:مؤلف:50:url]\nومناسب';
      const result = ResponseSanitizer.hasValidBookTokens(input);
      expect(result).toBe(true);
    });
  });

  describe('sanitizeWithRegeneration', () => {
    test('should not regenerate if response has valid BOOK tokens', async () => {
      const input = 'أرشح لك [BOOK:123:كتاب:مؤلف:50:url] لأنه ممتاز';
      const books = [{ id: '123', title: 'كتاب', author: 'مؤلف' }];
      const regenerateFunction = jest.fn().mockResolvedValue('regenerated response');
      
      const result = await ResponseSanitizer.sanitizeWithRegeneration(input, books, regenerateFunction);
      
      // Should not call regenerate function
      expect(regenerateFunction).not.toHaveBeenCalled();
      expect(result.cleanedResponse).toContain('كتاب');
    });

    test('should regenerate if response has no valid BOOK tokens', async () => {
      const input = 'أرشح لك كتاب';
      const books = [];
      const regenerateFunction = jest.fn().mockResolvedValue('أرشح لك [BOOK:123:كتاب:مؤلف:50:url]');
      
      const result = await ResponseSanitizer.sanitizeWithRegeneration(input, books, regenerateFunction);
      
      // Should call regenerate function once
      expect(regenerateFunction).toHaveBeenCalledTimes(1);
    });

    test('should use fallback if regeneration fails', async () => {
      const input = 'أرشح لك كتاب';
      const books = [{ id: '123', title: 'كتاب', author: 'مؤلف' }];
      const regenerateFunction = jest.fn().mockResolvedValue('فشل');
      
      const result = await ResponseSanitizer.sanitizeWithRegeneration(input, books, regenerateFunction);
      
      expect(result.cleanedResponse).toContain('بناءً على طلبك');
    });
  });

  describe('Integration Test - Full Sanitization', () => {
    test('should handle complex response with multiple issues', () => {
      const input = 'أرشح لك [BOOK:123:تعافيت بك:أحمد:50:url] لأنه ممتاز. وأيضاً [BOOK:456:كتاب2:مؤلف2:60:url2]';
      const books = [
        { id: '123', title: 'تعافيت بك', author: 'أحمد' },
        { id: '456', title: 'كتاب2', author: 'مؤلف2' }
      ];
      const result = ResponseSanitizer.sanitize(input, books);
      
      // Should not contain any BOOK tokens
      expect(result.cleanedResponse).not.toContain('[BOOK:');
      
      // Should contain book titles
      expect(result.cleanedResponse).toContain('تعافيت بك');
      expect(result.cleanedResponse).toContain('كتاب2');
      
      // Should not have incomplete sentences
      expect(result.issues).not.toContain('Removed incomplete sentences');
    });

    test('should handle response with broken BOOK token', () => {
      const input = 'أنصحك أن تبدأ بـ [BOOK:123:تعافيت بك:أحمد:50:url لأنه يغطي';
      const books = [{ id: '123', title: 'تعافيت بك', author: 'أحمد' }];
      const result = ResponseSanitizer.sanitize(input, books);
      
      // Should replace BOOK token with title
      expect(result.cleanedResponse).toContain('تعافيت بك');
      
      // Should fix the broken sentence pattern
      expect(result.cleanedResponse).not.toContain('بـ لأنه');
    });
  });
});
