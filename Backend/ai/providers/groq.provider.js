const axios = require('axios');
const AIProvider = require('../base/provider.interface');

/**
 * Groq Provider Adapter
 * Implements the AI Provider Interface for Groq API
 * Groq provides fast inference with open-source models
 */
class GroqProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.GROQ_API_KEY;
    this.baseURL = config.baseURL || 'https://api.groq.com/openai/v1';
    this.defaultModel = config.defaultModel || 'llama-3.3-70b-versatile';
    this.timeout = config.timeout || 30000;
    
    // Circuit Breaker for rate limits
    this.circuitBreaker = {
      isOpen: false,
      retryAfter: null,
      lastRateLimitTime: null
    };
    
    // Pricing per 1M tokens (Groq is free for now, pricing may change)
    this.pricing = {
      'llama-3.3-70b-versatile': { input: 0, output: 0 },
      'llama-3.1-8b-instant': { input: 0, output: 0 },
      'llama-3.1-70b-versatile': { input: 0, output: 0 },
      'mixtral-8x7b-32768': { input: 0, output: 0 },
      'gemma-7b-it': { input: 0, output: 0 },
      'gemma2-9b-it': { input: 0, output: 0 }
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
      console.log('[GroqProvider] Circuit breaker reset, provider available again');
      return false;
    }
    
    return true;
  }

  /**
   * Extract retry after time from error message
   */
  extractRetryAfterTime(errorMessage) {
    // Groq error format: "Please try again in Xm"
    const match = errorMessage.match(/try again in (\d+)m/i);
    if (match) {
      const minutes = parseInt(match[1], 10);
      return Date.now() + (minutes * 60 * 1000);
    }
    
    // Default to 1 hour if not found
    return Date.now() + (60 * 60 * 1000);
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
      console.warn('[GroqProvider] Circuit breaker is open, skipping request');
      return {
        success: false,
        error: 'Circuit breaker is open due to rate limit',
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
        console.error('[GroqProvider] Rate limit exceeded:', errorMessage);
        
        // Extract retry after time and open circuit breaker
        this.circuitBreaker.retryAfter = this.extractRetryAfterTime(errorMessage);
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.lastRateLimitTime = Date.now();
        
        const retryMinutes = Math.ceil((this.circuitBreaker.retryAfter - Date.now()) / (60 * 1000));
        console.warn(`[GroqProvider] Circuit breaker opened, will retry after ${retryMinutes} minutes`);
      }

      console.error('[GroqProvider] generateText Error:', error.message);
      console.error('[GroqProvider] Error details:', error.response?.data || error.response?.status || error);

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
   * Note: Groq doesn't provide embedding API, so this will fail
   */
  async generateEmbedding(params) {
    return {
      success: false,
      error: 'Groq does not support embedding generation',
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
          model.id.includes('mixtral') ||
          model.id.includes('gemma')
        )
        .map(model => model.id);

      return models;
    } catch (error) {
      console.error('Error fetching Groq models:', error.message);
      // Return default models if API call fails
      return Object.keys(this.pricing);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('Groq API key is required');
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
        console.error('[GroqProvider] API key is missing');
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
        console.error(`[GroqProvider] API returned status ${response.status}`);
        return false;
      }
      
      // Check if default model exists
      const models = response.data.data || [];
      const modelExists = models.some(m => m.id === this.defaultModel);
      
      if (!modelExists) {
        console.warn(`[GroqProvider] Default model ${this.defaultModel} not found in available models`);
      }
      
      return true;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          console.error('[GroqProvider] Authentication failed');
        } else if (status === 429) {
          console.error('[GroqProvider] Rate limit exceeded');
        } else {
          console.error(`[GroqProvider] Health check failed with status ${status}`);
        }
      } else {
        console.error('[GroqProvider] Health check failed:', error.message);
      }
      return false;
    }
  }
}

module.exports = GroqProvider;
