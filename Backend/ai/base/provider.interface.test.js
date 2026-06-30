const AIProvider = require('./provider.interface');

describe('AIProvider Interface', () => {
  let provider;

  beforeEach(() => {
    // Create a mock provider for testing
    class MockProvider extends AIProvider {
      constructor(config) {
        super(config);
      }

      async generateText(params) {
        return {
          success: true,
          text: 'Mock response',
          model: params.model,
          tokens: { input: 10, output: 20, total: 30 },
          cost: 0.001,
          executionTime: 100
        };
      }

      async generateJSON(params) {
        return {
          success: true,
          json: { result: 'mock' },
          model: params.model,
          tokens: { input: 10, output: 20, total: 30 },
          cost: 0.001,
          executionTime: 100
        };
      }

      async generateEmbedding(params) {
        return {
          success: true,
          embedding: [0.1, 0.2, 0.3],
          model: params.model,
          tokens: { input: 10, output: 0, total: 10 },
          cost: 0.0005,
          executionTime: 50
        };
      }

      async getAvailableModels() {
        return ['model-1', 'model-2', 'model-3'];
      }

      validateConfig() {
        return this.config.apiKey ? true : false;
      }

      calculateCost(usage, model) {
        return (usage.inputTokens * 0.00001) + (usage.outputTokens * 0.00002);
      }

      async healthCheck() {
        return true;
      }
    }

    provider = new MockProvider({ apiKey: 'test-key' });
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(provider.config).toBeDefined();
      expect(provider.providerName).toBe('MockProvider');
    });

    it('should set provider name correctly', () => {
      expect(provider.getProviderName()).toBe('MockProvider');
    });
  });

  describe('generateText', () => {
    it('should throw error if not implemented', async () => {
      const baseProvider = new AIProvider({});
      
      await expect(baseProvider.generateText({})).rejects.toThrow(
        'generateText() must be implemented by subclass'
      );
    });

    it('should return text generation result', async () => {
      const result = await provider.generateText({
        prompt: 'Test prompt',
        model: 'model-1'
      });

      expect(result.success).toBe(true);
      expect(result.text).toBe('Mock response');
      expect(result.model).toBe('model-1');
      expect(result.tokens).toBeDefined();
      expect(result.cost).toBeDefined();
      expect(result.executionTime).toBeDefined();
    });
  });

  describe('generateJSON', () => {
    it('should throw error if not implemented', async () => {
      const baseProvider = new AIProvider({});
      
      await expect(baseProvider.generateJSON({})).rejects.toThrow(
        'generateJSON() must be implemented by subclass'
      );
    });

    it('should return JSON generation result', async () => {
      const result = await provider.generateJSON({
        prompt: 'Test prompt',
        model: 'model-1'
      });

      expect(result.success).toBe(true);
      expect(result.json).toEqual({ result: 'mock' });
      expect(result.model).toBe('model-1');
      expect(result.tokens).toBeDefined();
      expect(result.cost).toBeDefined();
    });
  });

  describe('generateEmbedding', () => {
    it('should throw error if not implemented', async () => {
      const baseProvider = new AIProvider({});
      
      await expect(baseProvider.generateEmbedding({})).rejects.toThrow(
        'generateEmbedding() must be implemented by subclass'
      );
    });

    it('should return embedding result', async () => {
      const result = await provider.generateEmbedding({
        text: 'Test text',
        model: 'model-1'
      });

      expect(result.success).toBe(true);
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('model-1');
      expect(result.tokens).toBeDefined();
    });
  });

  describe('getAvailableModels', () => {
    it('should throw error if not implemented', async () => {
      const baseProvider = new AIProvider({});
      
      await expect(baseProvider.getAvailableModels()).rejects.toThrow(
        'getAvailableModels() must be implemented by subclass'
      );
    });

    it('should return available models', async () => {
      const models = await provider.getAvailableModels();

      expect(models).toEqual(['model-1', 'model-2', 'model-3']);
    });
  });

  describe('validateConfig', () => {
    it('should throw error if not implemented', () => {
      const baseProvider = new AIProvider({});
      
      expect(() => baseProvider.validateConfig()).toThrow(
        'validateConfig() must be implemented by subclass'
      );
    });

    it('should return true for valid config', () => {
      const result = provider.validateConfig();
      expect(result).toBe(true);
    });
  });

  describe('calculateCost', () => {
    it('should throw error if not implemented', () => {
      const baseProvider = new AIProvider({});
      
      expect(() => baseProvider.calculateCost({}, 'model')).toThrow(
        'calculateCost() must be implemented by subclass'
      );
    });

    it('should calculate cost correctly', () => {
      const cost = provider.calculateCost(
        { inputTokens: 100, outputTokens: 200 },
        'model-1'
      );

      expect(cost).toBe(0.005); // (100 * 0.00001) + (200 * 0.00002)
    });
  });

  describe('healthCheck', () => {
    it('should throw error if not implemented', async () => {
      const baseProvider = new AIProvider({});
      
      await expect(baseProvider.healthCheck()).rejects.toThrow(
        'healthCheck() must be implemented by subclass'
      );
    });

    it('should return health status', async () => {
      const health = await provider.healthCheck();
      expect(health).toBe(true);
    });
  });

  describe('getProviderName', () => {
    it('should return provider name', () => {
      expect(provider.getProviderName()).toBe('MockProvider');
    });
  });
});
