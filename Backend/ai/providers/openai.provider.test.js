const OpenAIProvider = require('./openai.provider');
const axios = require('axios');

jest.mock('axios');

describe('OpenAI Provider', () => {
  let provider;
  const mockConfig = {
    apiKey: 'test-api-key',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    timeout: 30000
  };

  beforeEach(() => {
    provider = new OpenAIProvider(mockConfig);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(provider.apiKey).toBe('test-api-key');
      expect(provider.baseURL).toBe('https://api.openai.com/v1');
      expect(provider.defaultModel).toBe('gpt-4o-mini');
      expect(provider.timeout).toBe(30000);
    });

    it('should use environment variable if apiKey not in config', () => {
      process.env.OPENAI_API_KEY = 'env-api-key';
      const provider2 = new OpenAIProvider({});
      expect(provider2.apiKey).toBe('env-api-key');
      delete process.env.OPENAI_API_KEY;
    });

    it('should have pricing for models', () => {
      expect(provider.pricing['gpt-4o-mini']).toBeDefined();
      expect(provider.pricing['gpt-4o']).toBeDefined();
      expect(provider.pricing['gpt-3.5-turbo']).toBeDefined();
    });
  });

  describe('generateText', () => {
    it('should generate text successfully', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: { content: 'Generated text' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await provider.generateText({
        prompt: 'Test prompt',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 100
      });

      expect(result.success).toBe(true);
      expect(result.text).toBe('Generated text');
      expect(result.model).toBe('gpt-4o-mini');
      expect(result.tokens.input).toBe(10);
      expect(result.tokens.output).toBe(20);
      expect(result.tokens.total).toBe(30);
      expect(result.cost).toBeDefined();
      expect(result.executionTime).toBeDefined();
      expect(result.finishReason).toBe('stop');
    });

    it('should use system prompt if provided', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: { content: 'Generated text' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 20,
            total_tokens: 35
          }
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      await provider.generateText({
        prompt: 'Test prompt',
        systemPrompt: 'You are a helpful assistant',
        model: 'gpt-4o-mini'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system', content: 'You are a helpful assistant' })
          ])
        }),
        expect.any(Object)
      );
    });

    it('should handle API error', async () => {
      axios.post.mockRejectedValue(new Error('API Error'));

      const result = await provider.generateText({
        prompt: 'Test prompt',
        model: 'gpt-4o-mini'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
      expect(result.executionTime).toBeDefined();
    });

    it('should use messages array if provided', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: { content: 'Response' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 10,
            total_tokens: 30
          }
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      await provider.generateText({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' }
        ],
        model: 'gpt-4o-mini'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' }
          ]
        }),
        expect.any(Object)
      );
    });
  });

  describe('generateJSON', () => {
    it('should generate JSON successfully', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: { content: '{"result": "success"}' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await provider.generateJSON({
        prompt: 'Test prompt',
        model: 'gpt-4o-mini'
      });

      expect(result.success).toBe(true);
      expect(result.json).toEqual({ result: 'success' });
      expect(result.model).toBe('gpt-4o-mini');
      expect(result.tokens).toBeDefined();
      expect(result.cost).toBeDefined();
    });

    it('should handle invalid JSON response', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: { content: 'Invalid JSON' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await provider.generateJSON({
        prompt: 'Test prompt',
        model: 'gpt-4o-mini'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to parse JSON response');
      expect(result.rawText).toBe('Invalid JSON');
    });

    it('should use JSON response format', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: { content: '{"result": "success"}' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      await provider.generateJSON({
        prompt: 'Test prompt',
        model: 'gpt-4o-mini'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          response_format: { type: 'json_object' }
        }),
        expect.any(Object)
      );
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding successfully', async () => {
      const mockResponse = {
        data: {
          data: [{
            embedding: [0.1, 0.2, 0.3]
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 0,
            total_tokens: 10
          }
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await provider.generateEmbedding({
        text: 'Test text',
        model: 'text-embedding-3-small'
      });

      expect(result.success).toBe(true);
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('text-embedding-3-small');
      expect(result.tokens.input).toBe(10);
      expect(result.tokens.output).toBe(0);
      expect(result.cost).toBeDefined();
    });

    it('should handle API error', async () => {
      axios.post.mockRejectedValue(new Error('API Error'));

      const result = await provider.generateEmbedding({
        text: 'Test text',
        model: 'text-embedding-3-small'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });
  });

  describe('getAvailableModels', () => {
    it('should return available models from API', async () => {
      const mockResponse = {
        data: {
          data: [
            { id: 'gpt-4o-mini' },
            { id: 'gpt-4o' },
            { id: 'text-embedding-3-small' },
            { id: 'other-model' }
          ]
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const models = await provider.getAvailableModels();

      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('text-embedding-3-small');
      expect(models).not.toContain('other-model');
    });

    it('should return default models on API error', async () => {
      axios.get.mockRejectedValue(new Error('API Error'));

      const models = await provider.getAvailableModels();

      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-3.5-turbo');
    });
  });

  describe('validateConfig', () => {
    it('should return true for valid config', () => {
      const result = provider.validateConfig();
      expect(result).toBe(true);
    });

    it('should throw error for missing API key', () => {
      const provider2 = new OpenAIProvider({});
      expect(() => provider2.validateConfig()).toThrow('OpenAI API key is required');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for gpt-4o-mini', () => {
      const cost = provider.calculateCost(
        { inputTokens: 1000, outputTokens: 500 },
        'gpt-4o-mini'
      );

      // gpt-4o-mini: $0.15/1M input, $0.60/1M output
      // (1000/1M * 0.15) + (500/1M * 0.60) = 0.00015 + 0.0003 = 0.00045
      expect(cost).toBeCloseTo(0.00045, 6);
    });

    it('should calculate cost for gpt-4o', () => {
      const cost = provider.calculateCost(
        { inputTokens: 1000, outputTokens: 500 },
        'gpt-4o'
      );

      // gpt-4o: $2.50/1M input, $10.00/1M output
      // (1000/1M * 2.50) + (500/1M * 10.00) = 0.0025 + 0.005 = 0.0075
      expect(cost).toBeCloseTo(0.0075, 6);
    });

    it('should use default model pricing for unknown model', () => {
      const cost = provider.calculateCost(
        { inputTokens: 1000, outputTokens: 500 },
        'unknown-model'
      );

      // Should use gpt-4o-mini pricing
      expect(cost).toBeCloseTo(0.00045, 6);
    });
  });

  describe('healthCheck', () => {
    it('should return true on successful health check', async () => {
      axios.get.mockResolvedValue({ status: 200 });

      const health = await provider.healthCheck();

      expect(health).toBe(true);
    });

    it('should return false on failed health check', async () => {
      axios.get.mockRejectedValue(new Error('API Error'));

      const health = await provider.healthCheck();

      expect(health).toBe(false);
    });
  });

  describe('getProviderName', () => {
    it('should return provider name', () => {
      expect(provider.getProviderName()).toBe('OpenAIProvider');
    });
  });
});
