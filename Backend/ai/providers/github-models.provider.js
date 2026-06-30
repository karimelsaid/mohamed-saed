const axios = require('axios');
const AIProvider = require('../base/provider.interface');

/**
 * GitHub Models Provider Adapter
 * Implements the AI Provider Interface for GitHub Models API
 * GitHub Models provides access to various AI models through Azure
 */
class GitHubModelsProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_API_KEY;
    this.baseURL = config.baseURL || 'https://models.inference.ai.azure.com';
    this.defaultModel = config.defaultModel || 'gpt-4.1-mini';
    this.timeout = config.timeout || 30000;
    
    // Pricing per 1M tokens (GitHub Models pricing varies by model)
    this.pricing = {
      'gpt-4.1-mini': { input: 0.15, output: 0.60 },
      'phi-4': { input: 0.10, output: 0.30 },
      'mistral-small': { input: 0.20, output: 0.60 },
      'llama-3.3-70b': { input: 0.10, output: 0.30 },
      'llama-3.1-70b': { input: 0.10, output: 0.30 }
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

      console.error('[GitHubModelsProvider] generateText Error:', error.message);
      console.error('[GitHubModelsProvider] Error details:', error.response?.data || error.response?.status || error);

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
   * Note: GitHub Models may not provide embedding API for all models
   */
  async generateEmbedding(params) {
    const {
      text,
      model = 'text-embedding-ada-002'
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

      const data = response.data.data[0];
      const usage = response.data.usage;

      return {
        success: true,
        embedding: data.embedding,
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

      // Filter for chat models
      const models = response.data.data
        .filter(model => 
          model.id.includes('gpt') || 
          model.id.includes('phi') ||
          model.id.includes('mistral') ||
          model.id.includes('llama')
        )
        .map(model => model.id);

      return models;
    } catch (error) {
      console.error('Error fetching GitHub Models:', error.message);
      // Return default models if API call fails
      return Object.keys(this.pricing);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('GitHub Models API key is required');
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
   * and checks if the token has the required 'models' permission
   */
  async healthCheck() {
    try {
      // Check if API key exists
      if (!this.apiKey) {
        console.error('[GitHubModelsProvider] API key is missing');
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
        console.error(`[GitHubModelsProvider] API returned status ${response.status}`);
        return false;
      }
      
      // Check if default model exists
      const models = response.data.data || [];
      const modelExists = models.some(m => m.id === this.defaultModel);
      
      if (!modelExists) {
        console.warn(`[GitHubModelsProvider] Default model ${this.defaultModel} not found in available models`);
        console.warn(`[GitHubModelsProvider] Available models: ${models.map(m => m.id).join(', ')}`);
        
        // Try to find a valid model
        const validModel = models.find(m => m.id.includes('gpt') || m.id.includes('phi') || m.id.includes('llama'));
        if (validModel) {
          console.warn(`[GitHubModelsProvider] Switching to available model: ${validModel.id}`);
          this.defaultModel = validModel.id;
        } else {
          console.error('[GitHubModelsProvider] No valid model found, provider will be excluded');
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
          console.error(`[GitHubModelsProvider] Test completion failed with status ${testResponse.status}`);
          return false;
        }
        
        return true;
      } catch (testError) {
        console.error('[GitHubModelsProvider] Test completion failed:', testError.message);
        return false;
      }
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          console.error('[GitHubModelsProvider] Authentication failed - Models permission required');
          console.error('[GitHubModelsProvider] GITHUB_MODELS_TOKEN needs "models" scope');
          console.error('[GitHubModelsProvider] See: https://docs.github.com/en/rest/models/models');
        } else if (status === 429) {
          console.error('[GitHubModelsProvider] Rate limit exceeded');
        } else {
          console.error(`[GitHubModelsProvider] Health check failed with status ${status}`);
        }
      } else {
        console.error('[GitHubModelsProvider] Health check failed:', error.message);
      }
      return false;
    }
  }
}

module.exports = GitHubModelsProvider;
