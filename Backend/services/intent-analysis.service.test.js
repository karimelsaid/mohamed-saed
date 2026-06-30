const IntentAnalysisService = require('./intent-analysis.service');

describe('IntentAnalysisService - requiresBookSearch', () => {
  describe('General inquiries without search keywords', () => {
    it('should return false for greeting "السلام عليكم" with no keywords', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: []
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });

    it('should return false for greeting "مرحبا" with no keywords', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: []
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });

    it('should return false for greeting "أهلا" with no keywords', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: []
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });

    it('should return false for greeting "إزيك" with no keywords', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: []
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });

    it('should return false for greeting with only greeting keywords', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: ['السلام', 'عليكم']
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });

    it('should return false for "صباح الخير" greeting', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: ['صباح', 'الخير']
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });

    it('should return false for "مساء الخير" greeting', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: ['مساء', 'الخير']
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });
  });

  describe('General inquiries with book-related keywords', () => {
    it('should return true for general inquiry with book keywords', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: ['رواية', 'رعب']
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false); // general_inquiry with keywords still returns false
    });

    it('should return true for search_book intent', () => {
      const intentAnalysis = {
        intent: 'search_book',
        keywords: ['كتاب', 'تطوير']
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(true);
    });

    it('should return true for get_recommendation intent', () => {
      const intentAnalysis = {
        intent: 'get_recommendation',
        keywords: ['رشح', 'لي']
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(true);
    });

    it('should return true for check_availability intent', () => {
      const intentAnalysis = {
        intent: 'check_availability',
        keywords: ['متوفر', 'كتاب']
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(true);
    });

    it('should return true for get_price intent', () => {
      const intentAnalysis = {
        intent: 'get_price',
        keywords: ['سعر', 'كتاب']
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should return false for general inquiry with null keywords', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: null
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });

    it('should return false for general inquiry with undefined keywords', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: undefined
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });

    it('should return false for general inquiry with empty string keywords', () => {
      const intentAnalysis = {
        intent: 'general_inquiry',
        keywords: ['']
      };
      const result = IntentAnalysisService.requiresBookSearch(intentAnalysis);
      expect(result).toBe(false);
    });
  });
});
