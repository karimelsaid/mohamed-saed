const axios = require('axios');
const AIProvider = require('../base/provider.interface');

/**
 * SambaNova Provider Adapter
 * Implements the AI Provider Interface for SambaNova API
 * SambaNova provides high-quality models with strict limits (20 requests/day)
 * IMPORTANT: Free tier expires after 30 days - monitor usage closely
 */
class SambaNovaProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.SAMBANOVA_API_KEY;
    this.baseURL = config.baseURL || 'https://api.sambanova.ai/v1';
    this.defaultModel = config.defaultModel || 'Meta-Llama-3.3-70B-Instruct';
    this.timeout = config.timeout || 30000;
    
    // Circuit Breaker for rate limits
    this.circuitBreaker = {
      isOpen: false,
      retryAfter: null,
      lastRateLimitTime: null
    };
    
    // Daily rate limiting: 20 requests per day (SambaNova strict limit)
    this.dailyRateLimiter = {
      requestsToday: 0,
      dayStart: new Date().setHours(0, 0, 0, 0),
      maxRequestsPerDay: 20
    };
    
    // Pricing per 1M tokens (SambaNova pricing may change)
    this.pricing = {
      'Meta-Llama-3.3-70B-Instruct': { input: 0, output: 0 },
      'Meta-Llama-3.1-70B-Instruct': { input: 0, output: 0 }
    };
    
    // Track free tier expiration (30 days from first use)
    this.freeTierExpiration = null;
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
      console.log('[SambaNovaProvider] Circuit breaker reset, provider available again');
      return false;
    }
    
    return true;
  }

  /**
   * Check if daily rate limit allows request (20 requests per day)
   */
  isDailyRateLimitAllowed() {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    // Reset counter if new day started
    if (now - this.dailyRateLimiter.dayStart >= dayInMs) {
      this.dailyRateLimiter.requestsToday = 0;
      this.dailyRateLimiter.dayStart = new Date().setHours(0, 0, 0, 0);
      console.log('[SambaNovaProvider] Daily rate limit counter reset');
    }
    
    // Check if we've exceeded the limit
    if (this.dailyRateLimiter.requestsToday >= this.dailyRateLimiter.maxRequestsPerDay) {
      console.warn('[SambaNovaProvider] Daily rate limit exceeded (20 requests per day), skipping request');
      return false;
    }
    
    // Increment counter
    this.dailyRateLimiter.requestsToday++;
    console.log(`[SambaNovaProvider] Daily requests: ${this.dailyRateLimiter.requestsToday}/${this.dailyRateLimiter.maxRequestsPerDay}`);
    
    // Set free tier expiration on first use
    if (!this.freeTierExpiration) {
      this.freeTierExpiration = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
      const expirationDate = new Date(this.freeTierExpiration).toLocaleDateString('en-US');
      console.warn(`[SambaNovaProvider] Free tier will expire on ${expirationDate} - please renew or upgrade before then`);
    }
    
    // Check if free tier is expiring soon (7 days warning)
    const daysUntilExpiration = Math.ceil((this.freeTierExpiration - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysUntilExpiration <= 7 && daysUntilExpiration > 0) {
      console.warn(`[SambaNovaProvider] FREE TIER EXPIRING IN ${daysUntilExpiration} DAYS - ACTION REQUIRED`);
    } else if (daysUntilExpiration <= 0) {
      console.error('[SambaNovaProvider] FREE TIER EXPIRED - Provider will not work without renewal');
      return false;
    }
    
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
      console.warn('[SambaNovaProvider] Circuit breaker is open, skipping request');
      return {
        success: false,
        error: 'Circuit breaker is open due to rate limit',
        model,
        executionTime: 0,
        provider: this.getProviderName()
      };
    }

    // Check daily rate limit (20 requests per day)
    if (!this.isDailyRateLimitAllowed()) {
      return {
        success: false,
        error: 'Daily rate limit exceeded (20 requests per day)',
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
        console.error('[SambaNovaProvider] Rate limit exceeded:', errorMessage);
        
        // Open circuit breaker for 1 day
        this.circuitBreaker.retryAfter = Date.now() + (24 * 60 * 60 * 1000);
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.lastRateLimitTime = Date.now();
        
        console.warn('[SambaNovaProvider] Circuit breaker opened for 1 day due to rate limit');
      }

      console.error('[SambaNovaProvider] generateText Error:', error.message);
      console.error('[SambaNovaProvider] Error details:', error.response?.data || error.response?.status || error);

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
   * Note: SambaNova doesn't provide embedding API
   */
  async generateEmbedding(params) {
    return {
      success: false,
      error: 'SambaNova does not support embedding generation',
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

      const models = response.data.data || [];
      return models.map(model => model.id);
    } catch (error) {
      console.error('Error fetching SambaNova models:', error.message);
      // Return default models if API call fails
      return Object.keys(this.pricing);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('SambaNova API key is required');
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
   */
  async healthCheck() {
    try {
      // Check if API key exists
      if (!this.apiKey) {
        console.error('[SambaNovaProvider] API key is missing');
        return false;
      }
      
      // Check if free tier has expired
      if (this.freeTierExpiration && Date.now() > this.freeTierExpiration) {
        console.error('[SambaNovaProvider] Free tier has expired');
        return false;
      }
      
      // Check API connectivity and authentication
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
        console.error(`[SambaNovaProvider] API returned status ${response.status}`);
        return false;
      }
      
      // Check if default model exists
      const models = response.data.data || [];
      const modelExists = models.some(m => m.id === this.defaultModel);
      
      if (!modelExists) {
        console.warn(`[SambaNovaProvider] Default model ${this.defaultModel} not found in available models`);
      }
      
      return true;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          console.error('[SambaNovaProvider] Authentication failed');
        } else if (status === 429) {
          console.error('[SambaNovaProvider] Rate limit exceeded');
        } else {
          console.error(`[SambaNovaProvider] Health check failed with status ${status}`);
        }
      } else {
        console.error('[SambaNovaProvider] Health check failed:', error.message);
      }
      return false;
    }
  }
}

module.exports = SambaNovaProvider;
