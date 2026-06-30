const AIConfig = require('./ai.config');

describe('AI Configuration System', () => {
  let config;

  beforeEach(() => {
    // Reset config to default state before each test
    config = new AIConfig();
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      expect(config.config).toBeDefined();
      expect(config.config.defaultProvider).toBe('openai');
      expect(config.config.providers).toBeDefined();
      expect(config.config.tasks).toBeDefined();
    });

    it('should have openai provider configured', () => {
      const openaiConfig = config.getProviderConfig('openai');
      expect(openaiConfig).toBeDefined();
      expect(openaiConfig.enabled).toBe(true);
      expect(openaiConfig.defaultModel).toBe('gpt-4o-mini');
    });

    it('should have task configurations', () => {
      const taskConfig = config.getTaskConfig('generate_caption');
      expect(taskConfig).toBeDefined();
      expect(taskConfig.provider).toBe('openai');
      expect(taskConfig.model).toBe('gpt-4o-mini');
    });
  });

  describe('getTaskConfig', () => {
    it('should return task configuration for valid task', () => {
      const taskConfig = config.getTaskConfig('generate_caption');
      expect(taskConfig.provider).toBe('openai');
      expect(taskConfig.model).toBe('gpt-4o-mini');
      expect(taskConfig.temperature).toBe(0.8);
      expect(taskConfig.maxTokens).toBe(500);
    });

    it('should return default configuration for unknown task', () => {
      const taskConfig = config.getTaskConfig('unknown_task');
      expect(taskConfig.provider).toBe(config.config.defaultProvider);
      expect(taskConfig.model).toBe('gpt-4o-mini');
      expect(taskConfig.temperature).toBe(0.7);
      expect(taskConfig.maxTokens).toBe(500);
    });
  });

  describe('getProviderConfig', () => {
    it('should return provider configuration for valid provider', () => {
      const providerConfig = config.getProviderConfig('openai');
      expect(providerConfig.enabled).toBe(true);
      expect(providerConfig.apiKey).toBeDefined();
      expect(providerConfig.baseURL).toBe('https://api.openai.com/v1');
    });

    it('should throw error for invalid provider', () => {
      expect(() => {
        config.getProviderConfig('invalid_provider');
      }).toThrow('Provider invalid_provider not found in configuration');
    });
  });

  describe('getEnabledProviders', () => {
    it('should return only enabled providers', () => {
      const enabledProviders = config.getEnabledProviders();
      expect(enabledProviders).toContain('openai');
      expect(enabledProviders).not.toContain('claude');
      expect(enabledProviders).not.toContain('gemini');
    });

    it('should return providers sorted by priority', () => {
      config.config.providers.openai.priority = 2;
      config.config.providers.claude.enabled = true;
      config.config.providers.claude.priority = 1;

      const enabledProviders = config.getEnabledProviders();
      expect(enabledProviders[0]).toBe('claude');
      expect(enabledProviders[1]).toBe('openai');
    });
  });

  describe('getDefaultProvider', () => {
    it('should return default provider', () => {
      expect(config.getDefaultProvider()).toBe('openai');
    });
  });

  describe('setDefaultProvider', () => {
    it('should set default provider', () => {
      config.setDefaultProvider('claude');
      expect(config.getDefaultProvider()).toBe('claude');
    });

    it('should throw error for invalid provider', () => {
      expect(() => {
        config.setDefaultProvider('invalid_provider');
      }).toThrow('Provider invalid_provider not found');
    });
  });

  describe('updateProviderConfig', () => {
    it('should update provider configuration', () => {
      config.updateProviderConfig('openai', {
        timeout: 60000,
        defaultModel: 'gpt-4o'
      });

      const providerConfig = config.getProviderConfig('openai');
      expect(providerConfig.timeout).toBe(60000);
      expect(providerConfig.defaultModel).toBe('gpt-4o');
    });

    it('should throw error for invalid provider', () => {
      expect(() => {
        config.updateProviderConfig('invalid_provider', { timeout: 60000 });
      }).toThrow('Provider invalid_provider not found');
    });
  });

  describe('updateTaskConfig', () => {
    it('should update existing task configuration', () => {
      config.updateTaskConfig('generate_caption', {
        temperature: 0.5,
        maxTokens: 1000
      });

      const taskConfig = config.getTaskConfig('generate_caption');
      expect(taskConfig.temperature).toBe(0.5);
      expect(taskConfig.maxTokens).toBe(1000);
    });

    it('should create new task configuration', () => {
      config.updateTaskConfig('new_task', {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.7
      });

      const taskConfig = config.getTaskConfig('new_task');
      expect(taskConfig.provider).toBe('openai');
      expect(taskConfig.model).toBe('gpt-4o-mini');
    });
  });

  describe('setProviderEnabled', () => {
    it('should enable provider', () => {
      config.setProviderEnabled('claude', true);
      const enabledProviders = config.getEnabledProviders();
      expect(enabledProviders).toContain('claude');
    });

    it('should disable provider', () => {
      config.setProviderEnabled('openai', false);
      const enabledProviders = config.getEnabledProviders();
      expect(enabledProviders).not.toContain('openai');
    });

    it('should throw error for invalid provider', () => {
      expect(() => {
        config.setProviderEnabled('invalid_provider', true);
      }).toThrow('Provider invalid_provider not found');
    });
  });

  describe('getRetryConfig', () => {
    it('should return retry configuration', () => {
      const retryConfig = config.getRetryConfig();
      expect(retryConfig.enabled).toBe(true);
      expect(retryConfig.maxRetries).toBe(3);
      expect(retryConfig.backoffStrategy).toBe('exponential');
    });
  });

  describe('getFallbackConfig', () => {
    it('should return fallback configuration', () => {
      const fallbackConfig = config.getFallbackConfig();
      expect(fallbackConfig.enabled).toBe(false);
      expect(fallbackConfig.fallbackProviders).toContain('claude');
      expect(fallbackConfig.fallbackProviders).toContain('gemini');
    });
  });

  describe('getCacheConfig', () => {
    it('should return cache configuration', () => {
      const cacheConfig = config.getCacheConfig();
      expect(cacheConfig.enabled).toBe(true);
      expect(cacheConfig.ttl).toBe(3600000);
      expect(cacheConfig.maxSize).toBe(1000);
    });
  });

  describe('getMonitoringConfig', () => {
    it('should return monitoring configuration', () => {
      const monitoringConfig = config.getMonitoringConfig();
      expect(monitoringConfig.enabled).toBe(true);
      expect(monitoringConfig.logLevel).toBe('info');
      expect(monitoringConfig.trackCosts).toBe(true);
    });
  });

  describe('getRateLimitConfig', () => {
    it('should return rate limit configuration', () => {
      const rateLimitConfig = config.getRateLimitConfig();
      expect(rateLimitConfig.enabled).toBe(true);
      expect(rateLimitConfig.requestsPerMinute).toBe(100);
      expect(rateLimitConfig.requestsPerHour).toBe(1000);
    });
  });

  describe('getConfig', () => {
    it('should return full configuration', () => {
      const fullConfig = config.getConfig();
      expect(fullConfig).toBeDefined();
      expect(fullConfig.defaultProvider).toBeDefined();
      expect(fullConfig.providers).toBeDefined();
      expect(fullConfig.tasks).toBeDefined();
    });
  });

  describe('loadConfig', () => {
    it('should load configuration from object', () => {
      const newConfig = {
        defaultProvider: 'claude',
        providers: {
          claude: {
            enabled: true,
            apiKey: 'test-key'
          }
        }
      };

      config.loadConfig(newConfig);
      expect(config.getDefaultProvider()).toBe('claude');
    });
  });

  describe('validateConfig', () => {
    it('should return valid for correct configuration', () => {
      const validation = config.validateConfig();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should return invalid for missing default provider', () => {
      config.config.defaultProvider = 'invalid_provider';
      const validation = config.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should return invalid for enabled provider without API key', () => {
      config.config.providers.openai.apiKey = '';
      const validation = config.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('API key'))).toBe(true);
    });

    it('should return invalid for task referencing unknown provider', () => {
      config.config.tasks.generate_caption.provider = 'invalid_provider';
      const validation = config.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('unknown provider'))).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle switching providers at runtime', () => {
      const originalProvider = config.getDefaultProvider();
      config.setDefaultProvider('claude');
      expect(config.getDefaultProvider()).toBe('claude');
      config.setDefaultProvider(originalProvider);
    });

    it('should handle updating task-specific settings', () => {
      config.updateTaskConfig('sales_reply', {
        temperature: 0.9,
        maxTokens: 400
      });

      const taskConfig = config.getTaskConfig('sales_reply');
      expect(taskConfig.temperature).toBe(0.9);
      expect(taskConfig.maxTokens).toBe(400);
    });

    it('should handle enabling/disabling monitoring', () => {
      config.config.monitoring.enabled = false;
      const monitoringConfig = config.getMonitoringConfig();
      expect(monitoringConfig.enabled).toBe(false);
    });
  });
});
