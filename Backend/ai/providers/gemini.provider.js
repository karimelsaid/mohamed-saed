const axios = require('axios');
const AIProvider = require('../base/provider.interface');

/**
 * Gemini Provider Adapter
 * Implements the AI Provider Interface for Google Gemini API
 */
class GeminiProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    this.baseURL = config.baseURL || 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = config.defaultModel || 'gemini-1.5-flash';
    this.timeout = config.timeout || 30000;
    
    // Pricing per 1M tokens (as of 2024)
    // Gemini 2.5 Flash: Free for now (pricing may change)
    // Gemini 2.5 Pro: $3.50 input / $10.50 output per 1M tokens
    this.pricing = {
      'gemini-2.5-flash': { input: 0, output: 0 },
      'gemini-2.5-pro': { input: 3.50, output: 10.50 },
      'gemini-2.0-flash': { input: 0, output: 0 },
      'gemini-1.5-flash': { input: 0, output: 0 },
      'gemini-1.5-pro': { input: 3.50, output: 10.50 },
      'gemini-1.0-pro': { input: 0.50, output: 1.50 },
      'gemini-embedding-001': { input: 0.02, output: 0 },
      'gemini-embedding-2': { input: 0.02, output: 0 },
      'text-embedding-004': { input: 0.02, output: 0 }
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
      // Prepare content for Gemini API
      let content = [];
      
      if (systemPrompt) {
        content.push({ role: 'user', parts: [{ text: systemPrompt }] });
      }
      
      if (messages && messages.length > 0) {
        // Convert OpenAI-style messages to Gemini format
        messages.forEach(msg => {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          content.push({ role, parts: [{ text: msg.content }] });
        });
      } else if (prompt) {
        content.push({ role: 'user', parts: [{ text: prompt }] });
      }

      const response = await axios.post(
        `${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`,
        {
          contents: content,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            candidateCount: 1
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      const candidate = response.data.candidates[0];
      const usage = response.data.usageMetadata || {};

      return {
        success: true,
        text: candidate.content.parts[0].text,
        model,
        tokens: {
          input: usage.promptTokenCount || 0,
          output: usage.candidatesTokenCount || 0,
          total: usage.totalTokenCount || 0
        },
        cost: this.calculateCostGemini(usage, model),
        executionTime,
        provider: this.getProviderName(),
        finishReason: candidate.finishReason
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
      // Prepare content for Gemini API
      let content = [];
      
      // Add system prompt if provided
      if (systemPrompt) {
        content.push({ role: 'user', parts: [{ text: systemPrompt }] });
      }
      
      // Add messages or prompt
      if (messages && messages.length > 0) {
        messages.forEach(msg => {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          content.push({ role, parts: [{ text: msg.content }] });
        });
      } else if (prompt) {
        content.push({ role: 'user', parts: [{ text: prompt }] });
      }

      // Add instruction to output JSON
      content.push({ 
        role: 'user', 
        parts: [{ text: 'IMPORTANT: Respond with valid JSON only. No additional text or explanation.' }] 
      });

      const requestBody = {
        contents: content,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          candidateCount: 1,
          responseMimeType: 'application/json'
        }
      };

      // Add schema if provided
      if (schema) {
        requestBody.generationConfig.responseSchema = schema;
      }

      const response = await axios.post(
        `${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      const candidate = response.data.candidates[0];
      const usage = response.data.usageMetadata || {};

      let jsonResult;
      try {
        jsonResult = JSON.parse(candidate.content.parts[0].text);
      } catch (parseError) {
        return {
          success: false,
          error: 'Failed to parse JSON response',
          rawText: candidate.content.parts[0].text,
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
          input: usage.promptTokenCount || 0,
          output: usage.candidatesTokenCount || 0,
          total: usage.totalTokenCount || 0
        },
        cost: this.calculateCostGemini(usage, model),
        executionTime,
        provider: this.getProviderName(),
        finishReason: candidate.finishReason
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
   */
  async generateEmbedding(params) {
    const {
      text,
      model = 'text-embedding-004'
    } = params;

    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${this.baseURL}/models/${model}:embedContent?key=${this.apiKey}`,
        {
          content: {
            parts: [{ text }]
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      const embedding = response.data.embedding.values;
      const usage = response.data.usageMetadata || {};

      return {
        success: true,
        embedding,
        model,
        tokens: {
          input: usage.promptTokenCount || 0,
          output: 0,
          total: usage.promptTokenCount || 0
        },
        cost: this.calculateCostGemini(usage, model),
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
        `${this.baseURL}/models?key=${this.apiKey}`,
        {
          timeout: this.timeout
        }
      );

      // Filter for generative models
      const models = response.data.models
        .filter(model => 
          model.name.includes('gemini') || 
          model.name.includes('embedding')
        )
        .map(model => {
          // Extract model name from full path
          const parts = model.name.split('/');
          return parts[parts.length - 1];
        });

      return models;
    } catch (error) {
      console.error('Error fetching Gemini models:', error.message);
      // Return default models if API call fails
      return Object.keys(this.pricing);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('Gemini API key is required');
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
   * Calculate cost based on token usage (Gemini specific)
   */
  calculateCostGemini(usage, model) {
    const pricing = this.pricing[model] || this.pricing[this.defaultModel];
    
    const inputCost = (usage.promptTokenCount / 1_000_000) * pricing.input;
    const outputCost = (usage.candidatesTokenCount / 1_000_000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Health check for the provider
   */
  async healthCheck() {
    try {
      // Check if API key exists
      if (!this.apiKey) {
        console.error('[GeminiProvider] API key is missing');
        return false;
      }
      
      // Check API connectivity and authentication
      const response = await axios.get(
        `${this.baseURL}/models?key=${this.apiKey}`,
        {
          timeout: 5000
        }
      );
      
      if (response.status !== 200) {
        console.error(`[GeminiProvider] API returned status ${response.status}`);
        return false;
      }
      
      // Check if default model exists
      const models = response.data.models || [];
      const modelExists = models.some(m => m.name.includes(this.defaultModel));
      
      if (!modelExists) {
        console.warn(`[GeminiProvider] Default model ${this.defaultModel} not found in available models`);
        // Still return true as provider is reachable, just model might be wrong
      }
      
      return true;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          console.error('[GeminiProvider] Authentication failed');
        } else if (status === 429) {
          console.error('[GeminiProvider] Rate limit exceeded');
        } else {
          console.error(`[GeminiProvider] Health check failed with status ${status}`);
        }
      } else {
        console.error('[GeminiProvider] Health check failed:', error.message);
      }
      return false;
    }
  }
}

module.exports = GeminiProvider;
