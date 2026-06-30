const axios = require('axios');
const AIProvider = require('../base/provider.interface');

/**
 * Mistral AI Provider Adapter
 * Implements the AI Provider Interface for Mistral AI API
 * Mistral provides high-quality models with generous free tier
 */
class MistralProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.MISTRAL_API_KEY;
    this.baseURL = config.baseURL || 'https://api.mistral.ai/v1';
    this.defaultModel = config.defaultModel || 'mistral-large-latest';
    this.timeout = config.timeout || 30000;
    
    // Circuit Breaker for rate limits
    this.circuitBreaker = {
      isOpen: false,
      retryAfter: null,
      lastRateLimitTime: null
    };
    
    // Pricing per 1M tokens (Mistral pricing)
    this.pricing = {
      'mistral-large-latest': { input: 2, output: 6 },
      'mistral-medium-latest': { input: 0.27, output: 0.27 },
      'mistral-small-latest': { input: 0.01, output: 0.01 },
      'open-mistral-7b': { input: 0.07, output: 0.07 },
      'open-mixtral-8x7b': { input: 0.27, output: 0.27 },
      'open-mixtral-8x22b': { input: 2, output: 6 }
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
      console.log('[MistralProvider] Circuit breaker reset, provider available again');
      return false;
    }
    
    return true;
  }

  /**
   * Extract retry after time from error message
   */
  extractRetryAfterTime(errorMessage) {
    // Mistral error format: "Rate limit exceeded. Please try again in X seconds"
    const secondsMatch = errorMessage.match(/try again in (\d+) seconds/i);
    if (secondsMatch) {
      const seconds = parseInt(secondsMatch[1], 10);
      return Date.now() + (seconds * 1000);
    }
    
    const minutesMatch = errorMessage.match(/try again in (\d+) minutes/i);
    if (minutesMatch) {
      const minutes = parseInt(minutesMatch[1], 10);
      return Date.now() + (minutes * 60 * 1000);
    }
    
    // Default to 1 minute if not found
    return Date.now() + (60 * 1000);
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
      console.warn('[MistralProvider] Circuit breaker is open, skipping request');
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
        console.error('[MistralProvider] Rate limit exceeded:', errorMessage);
        
        // Extract retry after time and open circuit breaker
        this.circuitBreaker.retryAfter = this.extractRetryAfterTime(errorMessage);
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.lastRateLimitTime = Date.now();
        
        const retrySeconds = Math.ceil((this.circuitBreaker.retryAfter - Date.now()) / 1000);
        console.warn(`[MistralProvider] Circuit breaker opened, will retry after ${retrySeconds} seconds`);
      }

      console.error('[MistralProvider] generateText Error:', error.message);
      console.error('[MistralProvider] Error details:', error.response?.data || error.response?.status || error);

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
   * Note: Mistral provides embedding API
   */
  async generateEmbedding(params) {
    const {
      text,
      model = 'mistral-embed'
    } = params;

    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${this.baseURL}/embeddings`,
        {
          model,
          input: text
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

      const embedding = response.data.data[0].embedding;
      const usage = response.data.usage;

      return {
        success: true,
        embedding,
        model,
        tokens: {
          input: usage.prompt_tokens,
          output: 0,
          total: usage.prompt_tokens
        },
        cost: this.calculateCost(
          {
            inputTokens: usage.prompt_tokens,
            outputTokens: 0
          },
          model
        ),
        executionTime,
        provider: this.getProviderName()
      };
    } catch (error) {
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      console.error('[MistralProvider] generateEmbedding Error:', error.message);
      console.error('[MistralProvider] Error details:', error.response?.data || error.response?.status || error);

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
      console.error('Error fetching Mistral models:', error.message);
      // Return default models if API call fails
      return Object.keys(this.pricing);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('Mistral API key is required');
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
        console.error('[MistralProvider] API key is missing');
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
        console.error(`[MistralProvider] API returned status ${response.status}`);
        return false;
      }
      
      // Check if default model exists
      const models = response.data.data || [];
      const modelExists = models.some(m => m.id === this.defaultModel);
      
      if (!modelExists) {
        console.warn(`[MistralProvider] Default model ${this.defaultModel} not found in available models`);
      }
      
      return true;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          console.error('[MistralProvider] Authentication failed');
        } else if (status === 429) {
          console.error('[MistralProvider] Rate limit exceeded');
        } else {
          console.error(`[MistralProvider] Health check failed with status ${status}`);
        }
      } else {
        console.error('[MistralProvider] Health check failed:', error.message);
      }
      return false;
    }
  }
}

module.exports = MistralProvider;
