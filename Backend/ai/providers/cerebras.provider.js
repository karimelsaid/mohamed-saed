const axios = require('axios');
const AIProvider = require('../base/provider.interface');

/**
 * Cerebras Provider Adapter
 * Implements the AI Provider Interface for Cerebras API
 * Cerebras provides ultra-fast inference with open-source models
 */
class CerebrasProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.CEREBRAS_API_KEY;
    this.baseURL = config.baseURL || 'https://api.cerebras.ai/v1';
    this.defaultModel = config.defaultModel || process.env.CEREBRAS_DEFAULT_MODEL || 'llama3.1-70b';
    this.timeout = config.timeout || 30000;
    
    // Circuit Breaker for rate limits
    this.circuitBreaker = {
      isOpen: false,
      retryAfter: null,
      lastRateLimitTime: null
    };
    
    // Rate limiting: 5 requests per minute (Cerebras strict limit)
    this.rateLimiter = {
      requestsThisMinute: 0,
      minuteStart: Date.now(),
      maxRequestsPerMinute: 5
    };
    
    // Pricing per 1M tokens (Cerebras is free for now, pricing may change)
    this.pricing = {
      'llama3.1-70b': { input: 0, output: 0 },
      'llama3.1-8b': { input: 0, output: 0 },
      'llama3-70b': { input: 0, output: 0 },
      'llama3-8b': { input: 0, output: 0 },
      'mixtral-8x7b': { input: 0, output: 0 },
      'gpt-oss-120b': { input: 0, output: 0 },
      'zai-glm-4.7': { input: 0, output: 0 }
    };
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen() {
    if (!this.circuitBreaker.isOpen) {
      return false;
    }
    
    // Check if retry after time has passed
    if (this.circuitBreaker.retryAfter && Date.now() > this.circuitBreaker.retryAfter) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.retryAfter = null;
      console.log('[CerebrasProvider] Circuit breaker reset, provider available again');
      return false;
    }
    
    return true;
  }

  /**
   * Check if rate limit allows request (5 requests per minute)
   */
  isRateLimitAllowed() {
    const now = Date.now();
    const minuteInMs = 60 * 1000;
    
    // Reset counter if new minute started
    if (now - this.rateLimiter.minuteStart >= minuteInMs) {
      this.rateLimiter.requestsThisMinute = 0;
      this.rateLimiter.minuteStart = now;
    }
    
    // Check if we've exceeded the limit
    if (this.rateLimiter.requestsThisMinute >= this.rateLimiter.maxRequestsPerMinute) {
      console.warn('[CerebrasProvider] Rate limit exceeded (5 requests per minute), skipping request');
      return false;
    }
    
    // Increment counter
    this.rateLimiter.requestsThisMinute++;
    return true;
  }

  /**
   * Generate text completion
   */
  async generateText(params) {
    const {
      prompt,
      messages = [],
      temperature = 0.7,
      maxTokens = 500,
      model = this.defaultModel,
      systemPrompt = null
    } = params;

    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      console.warn('[CerebrasProvider] Circuit breaker is open, skipping request');
      return {
        success: false,
        error: 'Circuit breaker is open due to rate limit',
        model,
        executionTime: 0,
        provider: this.getProviderName()
      };
    }

    // Check rate limit (5 requests per minute)
    if (!this.isRateLimitAllowed()) {
      return {
        success: false,
        error: 'Rate limit exceeded (5 requests per minute)',
        model,
        executionTime: 0,
        provider: this.getProviderName()
      };
    }

    const startTime = Date.now();

    try {
      // Prepare messages
      let apiMessages = [];
      
      if (systemPrompt) {
        apiMessages.push({ role: 'system', content: systemPrompt });
      }
      
      if (messages && messages.length > 0) {
        apiMessages = apiMessages.concat(messages);
      } else if (prompt) {
        apiMessages.push({ role: 'user', content: prompt });
      }

      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model,
          messages: apiMessages,
          temperature,
          max_tokens: maxTokens
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      const choice = response.data.choices[0];
      const usage = response.data.usage;

      return {
        success: true,
        text: choice.message.content,
        model,
        tokens: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
          total: usage.total_tokens
        },
        cost: this.calculateCost(
          {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens
          },
          model
        ),
        executionTime,
        provider: this.getProviderName(),
        finishReason: choice.finish_reason
      };
    } catch (error) {
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Check for rate limit (429)
      if (error.response?.status === 429) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        console.error('[CerebrasProvider] Rate limit exceeded:', errorMessage);
        
        // Open circuit breaker for 1 minute
        this.circuitBreaker.retryAfter = Date.now() + (60 * 1000);
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.lastRateLimitTime = Date.now();
        
        console.warn('[CerebrasProvider] Circuit breaker opened for 1 minute due to rate limit');
      }

      console.error('[CerebrasProvider] generateText Error:', error.message);
      console.error('[CerebrasProvider] Error details:', error.response?.data || error.response?.status || error);

      return {
        success: false,
        error: error.message,
        model,
        executionTime,
        provider: this.getProviderName()
      };
    }
  }

  /**
   * Generate JSON completion
   */
  async generateJSON(params) {
    const {
      prompt,
      messages = [],
      schema = null,
      temperature = 0.7,
      maxTokens = 500,
      model = this.defaultModel,
      systemPrompt = null
    } = params;

    const startTime = Date.now();

    try {
      // Prepare messages
      let apiMessages = [];
      
      if (systemPrompt) {
        apiMessages.push({ role: 'system', content: systemPrompt });
      }
      
      if (messages && messages.length > 0) {
        apiMessages = apiMessages.concat(messages);
      } else if (prompt) {
        apiMessages.push({ role: 'user', content: prompt });
      }

      const requestBody = {
        model,
        messages: apiMessages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      };

      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      const choice = response.data.choices[0];
      const usage = response.data.usage;

      let jsonResult;
      try {
        jsonResult = JSON.parse(choice.message.content);
      } catch (parseError) {
        return {
          success: false,
          error: 'Failed to parse JSON response',
          rawText: choice.message.content,
          model,
          executionTime,
          provider: this.getProviderName()
        };
      }

      return {
        success: true,
        json: jsonResult,
        model,
        tokens: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
          total: usage.total_tokens
        },
        cost: this.calculateCost(
          {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens
          },
          model
        ),
        executionTime,
        provider: this.getProviderName(),
        finishReason: choice.finish_reason
      };
    } catch (error) {
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      return {
        success: false,
        error: error.message,
        model,
        executionTime,
        provider: this.getProviderName()
      };
    }
  }

  /**
   * Generate embedding for text
   * Note: Cerebras doesn't provide embedding API, so this will fail
   */
  async generateEmbedding(params) {
    return {
      success: false,
      error: 'Cerebras does not support embedding generation',
      model: params.model,
      executionTime: 0,
      provider: this.getProviderName()
    };
  }

  /**
   * Get available models for this provider
   */
  async getAvailableModels() {
    try {
      const response = await axios.get(
        `${this.baseURL}/models`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: this.timeout
        }
      );

      // Filter for chat models
      const models = response.data.data
        .filter(model => 
          model.id.includes('llama') || 
          model.id.includes('mixtral')
        )
        .map(model => model.id);

      return models;
    } catch (error) {
      console.error('Error fetching Cerebras models:', error.message);
      // Return default models if API call fails
      return Object.keys(this.pricing);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('Cerebras API key is required');
    }
    return true;
  }

  /**
   * Calculate cost based on token usage
   */
  calculateCost(usage, model) {
    const pricing = this.pricing[model] || this.pricing[this.defaultModel];
    
    const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Health check for the provider
   * Performs a real test completion to verify the provider is working
   */
  async healthCheck() {
    try {
      // Check if API key exists
      if (!this.apiKey) {
        console.error('[CerebrasProvider] API key is missing');
        return false;
      }
      
      // Check API connectivity and get available models
      const response = await axios.get(
        `${this.baseURL}/models`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 5000
        }
      );
      
      if (response.status !== 200) {
        console.error(`[CerebrasProvider] API returned status ${response.status}`);
        return false;
      }
      
      // Check if default model exists
      const models = response.data.data || [];
      const modelExists = models.some(m => m.id === this.defaultModel);
      
      if (!modelExists) {
        console.warn(`[CerebrasProvider] Default model ${this.defaultModel} not found in available models`);
        console.warn(`[CerebrasProvider] Available models: ${models.map(m => m.id).join(', ')}`);
        
        // Try to find a valid llama model
        const validModel = models.find(m => m.id.includes('llama'));
        if (validModel) {
          console.warn(`[CerebrasProvider] Switching to available model: ${validModel.id}`);
          this.defaultModel = validModel.id;
        } else {
          console.error('[CerebrasProvider] No valid llama model found, provider will be excluded');
          return false;
        }
      }
      
      // Perform a real test completion to verify the provider is working
      try {
        const testResponse = await axios.post(
          `${this.baseURL}/chat/completions`,
          {
            model: this.defaultModel,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        
        if (testResponse.status !== 200) {
          console.error(`[CerebrasProvider] Test completion failed with status ${testResponse.status}`);
          return false;
        }
        
        return true;
      } catch (testError) {
        console.error('[CerebrasProvider] Test completion failed:', testError.message);
        return false;
      }
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          console.error('[CerebrasProvider] Authentication failed');
        } else if (status === 429) {
          console.error('[CerebrasProvider] Rate limit exceeded');
        } else {
          console.error(`[CerebrasProvider] Health check failed with status ${status}`);
        }
      } else {
        console.error('[CerebrasProvider] Health check failed:', error.message);
      }
      return false;
    }
  }
}

module.exports = CerebrasProvider;
