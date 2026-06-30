const { AIOrchestratorClass } = require('./ai-orchestrator.service');

describe('AI Orchestrator Service', () => {
  let orchestrator;

  beforeEach(() => {
    // Create orchestrator instance with minimal mocking
    orchestrator = new AIOrchestratorClass();
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(orchestrator.config).toBeDefined();
      expect(orchestrator.providers).toBeDefined();
      expect(orchestrator.cache).toBeDefined();
    });
  });

  describe('getProvider', () => {
    it('should return provider instance', () => {
      const provider = orchestrator.getProvider('openai');
      expect(provider).toBeDefined();
    });

    it('should throw error for non-existent provider', () => {
      expect(() => {
        orchestrator.getProvider('invalid_provider');
      }).toThrow('Provider invalid_provider not initialized');
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent cache key', () => {
      const key1 = orchestrator.generateCacheKey('task1', { data: 'test' }, 'openai', 'gpt-4o-mini');
      const key2 = orchestrator.generateCacheKey('task1', { data: 'test' }, 'openai', 'gpt-4o-mini');

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different data', () => {
      const key1 = orchestrator.generateCacheKey('task1', { data: 'test1' }, 'openai', 'gpt-4o-mini');
      const key2 = orchestrator.generateCacheKey('task1', { data: 'test2' }, 'openai', 'gpt-4o-mini');

      expect(key1).not.toBe(key2);
    });
  });

  describe('extractDomainFromTask', () => {
    it('should extract domain from task name', () => {
      expect(orchestrator.extractDomainFromTask('generate_caption')).toBe('marketing');
      expect(orchestrator.extractDomainFromTask('sales_reply')).toBe('sales');
      expect(orchestrator.extractDomainFromTask('seo_content')).toBe('seo');
      expect(orchestrator.extractDomainFromTask('support_classification')).toBe('support');
      expect(orchestrator.extractDomainFromTask('analytics_analysis')).toBe('analytics');
      expect(orchestrator.extractDomainFromTask('embedding')).toBe('analytics');
    });

    it('should return general for unknown task', () => {
      expect(orchestrator.extractDomainFromTask('unknown_task')).toBe('general');
    });
  });

  describe('isNonRetryableError', () => {
    it('should identify non-retryable errors', () => {
      expect(orchestrator.isNonRetryableError('authentication failed')).toBe(true);
      expect(orchestrator.isNonRetryableError('authorization error')).toBe(true);
      expect(orchestrator.isNonRetryableError('invalid api key')).toBe(true);
      expect(orchestrator.isNonRetryableError('quota exceeded')).toBe(true);
      expect(orchestrator.isNonRetryableError('invalid request')).toBe(true);
    });

    it('should identify retryable errors', () => {
      expect(orchestrator.isNonRetryableError('network timeout')).toBe(false);
      expect(orchestrator.isNonRetryableError('server error')).toBe(false);
      expect(orchestrator.isNonRetryableError('rate limit')).toBe(false);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff', () => {
      const retryConfig = {
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 10000
      };

      expect(orchestrator.calculateRetryDelay(0, retryConfig)).toBe(1000);
      expect(orchestrator.calculateRetryDelay(1, retryConfig)).toBe(2000);
      expect(orchestrator.calculateRetryDelay(2, retryConfig)).toBe(4000);
      expect(orchestrator.calculateRetryDelay(10, retryConfig)).toBe(10000); // Max
    });

    it('should calculate linear backoff', () => {
      const retryConfig = {
        backoffStrategy: 'linear',
        initialDelay: 1000,
        maxDelay: 10000
      };

      expect(orchestrator.calculateRetryDelay(0, retryConfig)).toBe(1000);
      expect(orchestrator.calculateRetryDelay(1, retryConfig)).toBe(2000);
      expect(orchestrator.calculateRetryDelay(2, retryConfig)).toBe(3000);
    });
  });

  describe('clearCache', () => {
    it('should clear all cache entries', () => {
      orchestrator.cache.set('key1', 'value1');
      orchestrator.cache.set('key2', 'value2');

      expect(orchestrator.cache.size).toBe(2);

      orchestrator.clearCache();

      expect(orchestrator.cache.size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = orchestrator.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
    });
  });

  describe('healthCheck', () => {
    it('should return health status for all providers', async () => {
      const health = await orchestrator.healthCheck();

      expect(health).toHaveProperty('openai');
    });
  });
});
