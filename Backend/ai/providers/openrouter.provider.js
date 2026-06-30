const axios = require('axios');
const AIProvider = require('../base/provider.interface');

/**
 * OpenRouter Provider Adapter
 * Implements the AI Provider Interface for OpenRouter API
 * OpenRouter provides access to multiple AI models from different providers
 * This implementation only supports FREE models
 */
class OpenRouterProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
    this.baseURL = config.baseURL || 'https://openrouter.ai/api/v1';
    this.defaultModel = config.defaultModel || 'google/gemma-3-27b-it:free';
    this.timeout = config.timeout || 30000;
    
    // Pricing per 1M tokens (FREE models only)
    this.pricing = {
      'google/gemma-3-27b-it:free': { input: 0, output: 0 },
      'google/gemma-3-12b-it:free': { input: 0, output: 0 },
      'mistralai/mistral-small-3.2-24b-instruct:free': { input: 0, output: 0 },
      'meta-llama/llama-3.3-70b-instruct:free': { input: 0, output: 0 },
      'deepseek/deepseek-chat-v3:free': { input: 0, output: 0 },
      'google/gemma-2-9b-it:free': { input: 0, output: 0 },
      'meta-llama/llama-3-8b-instruct:free': { input: 0, output: 0 }
    };
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

    const startTime = Date.now();

    try {
      // Validate that model is free
      if (!model.includes(':free')) {
        console.warn(`[OpenRouterProvider] Model ${model} is not free. Only free models are supported.`);
        return {
          success: false,
          error: `Model ${model} is not free. Only free models are supported.`,
          model,
          executionTime: 0,
          provider: this.getProviderName()
        };
      }

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
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://knoozbook.com',
            'X-Title': 'KnoozBook'
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

      console.error('[OpenRouterProvider] generateText Error:', error.message);
      console.error('[OpenRouterProvider] Error details:', error.response?.data || error.response?.status || error);

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
      // Validate that model is free
      if (!model.includes(':free')) {
        console.warn(`[OpenRouterProvider] Model ${model} is not free. Only free models are supported.`);
        return {
          success: false,
          error: `Model ${model} is not free. Only free models are supported.`,
          model,
          executionTime: 0,
          provider: this.getProviderName()
        };
      }

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
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://knoozbook.com',
            'X-Title': 'KnoozBook'
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
   * Note: OpenRouter doesn't provide embedding API
   */
  async generateEmbedding(params) {
    return {
      success: false,
      error: 'OpenRouter does not support embedding generation',
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

      // Filter for FREE models only
      const models = response.data.data
        .filter(model => model.id.includes(':free'))
        .map(model => model.id);

      return models;
    } catch (error) {
      console.error('Error fetching OpenRouter models:', error.message);
      // Return default free models if API call fails
      return Object.keys(this.pricing);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required');
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
        console.error('[OpenRouterProvider] API key is missing');
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
        console.error(`[OpenRouterProvider] API returned status ${response.status}`);
        return false;
      }
      
      // Check if default model exists (free model)
      const models = response.data.data || [];
      const modelExists = models.some(m => m.id === this.defaultModel);
      
      if (!modelExists) {
        console.warn(`[OpenRouterProvider] Default model ${this.defaultModel} not found in available models`);
      }
      
      return true;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          console.error('[OpenRouterProvider] Authentication failed');
        } else if (status === 429) {
          console.error('[OpenRouterProvider] Rate limit exceeded');
        } else {
          console.error(`[OpenRouterProvider] Health check failed with status ${status}`);
        }
      } else {
        console.error('[OpenRouterProvider] Health check failed:', error.message);
      }
      return false;
    }
  }
}

module.exports = OpenRouterProvider;
