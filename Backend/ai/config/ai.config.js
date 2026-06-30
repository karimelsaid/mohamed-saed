/**
 * AI Configuration System
 * Manages AI provider and model configurations
 * Allows runtime configuration changes without code deployment
 */

class AIConfig {
  constructor() {
    // Default configuration
    this.config = {
      // Default provider settings
      defaultProvider: 'groq', // Changed to groq as it's the fastest
      
      // Provider configurations
      providers: {
        groq: {
          enabled: true,
          apiKey: process.env.GROQ_API_KEY || '',
          baseURL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
          defaultModel: 'llama-3.3-70b-versatile',
          timeout: 30000,
          priority: 1 // Highest priority - fastest
        },
        deepseek: {
          enabled: true,
          apiKey: process.env.DEEPSEEK_API_KEY || '',
          baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
          defaultModel: 'deepseek-chat',
          timeout: 30000,
          priority: 2 // Large quota (5M tokens), good Arabic support
        },
        mistral: {
          enabled: true,
          apiKey: process.env.MISTRAL_API_KEY || '',
          baseURL: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
          defaultModel: 'mistral-large-latest',
          timeout: 30000,
          priority: 3 // High quality models with generous free tier
        },
        gemini: {
          enabled: true,
          apiKey: process.env.GEMINI_API_KEY || '',
          baseURL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
          defaultModel: 'gemini-2.5-flash',
          timeout: 30000,
          priority: 4 // Backup, often rate limited
        },
        cerebras: {
          enabled: true,
          apiKey: process.env.CEREBRAS_API_KEY || '',
          baseURL: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
          defaultModel: process.env.CEREBRAS_DEFAULT_MODEL || 'llama3.1-70b',
          timeout: 30000,
          priority: 5 // Large quota (1M/day), but strict 5 req/min limit
        },
        openrouter: {
          enabled: true,
          apiKey: process.env.OPENROUTER_API_KEY || '',
          baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
          defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
          timeout: 30000,
          priority: 6 // General backup
        },
        github_models: {
          enabled: true,
          apiKey: process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_API_KEY || '',
          baseURL: process.env.GITHUB_MODELS_BASE_URL || 'https://models.inference.ai.azure.com',
          defaultModel: 'gpt-4o-mini',
          timeout: 30000,
          priority: 7 // After fixing token scope
        },
        sambanova: {
          enabled: true,
          apiKey: process.env.SAMBANOVA_API_KEY || '',
          baseURL: process.env.SAMBANOVA_BASE_URL || 'https://api.sambanova.ai/v1',
          defaultModel: 'Meta-Llama-3.3-70B-Instruct',
          timeout: 30000,
          priority: 8 // Last resort: 20 req/day limit
        },
        openai: {
          enabled: false,
          apiKey: process.env.OPENAI_API_KEY || '',
          baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o-mini',
          timeout: 30000,
          priority: 9
        },
        claude: {
          enabled: false,
          apiKey: process.env.CLAUDE_API_KEY || '',
          baseURL: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com/v1',
          defaultModel: 'claude-3-haiku-20240307',
          timeout: 30000,
          priority: 10
        },
        ollama: {
          enabled: false,
          apiKey: '',
          baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api',
          defaultModel: 'llama2',
          timeout: 60000,
          priority: 11
        }
      },
      
      // Task-specific configurations
      tasks: {
        generate_caption: {
          provider: 'groq',
          models: {
            groq: 'llama-3.3-70b-versatile',
            deepseek: 'deepseek-chat',
            mistral: 'mistral-large-latest',
            gemini: 'gemini-2.5-flash',
            cerebras: 'llama3.1-70b',
            openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
            github_models: 'gpt-4o-mini',
            sambanova: 'Meta-Llama-3.3-70B-Instruct'
          },
          temperature: 0.8,
          maxTokens: 500,
          timeout: 30000
        },
        generate_hashtags: {
          provider: 'groq',
          models: {
            groq: 'llama-3.3-70b-versatile',
            deepseek: 'deepseek-chat',
            mistral: 'mistral-large-latest',
            gemini: 'gemini-2.5-flash',
            cerebras: 'llama3.1-70b',
            openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
            github_models: 'gpt-4o-mini',
            sambanova: 'Meta-Llama-3.3-70B-Instruct'
          },
          temperature: 0.7,
          maxTokens: 200,
          timeout: 30000
        },
        sales_reply: {
          provider: 'groq',
          models: {
            groq: 'llama-3.3-70b-versatile',
            deepseek: 'deepseek-chat',
            mistral: 'mistral-large-latest',
            gemini: 'gemini-2.5-flash',
            cerebras: 'llama3.1-70b',
            openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
            github_models: 'gpt-4o-mini',
            sambanova: 'Meta-Llama-3.3-70B-Instruct'
          },
          temperature: 0.7,
          maxTokens: 300,
          timeout: 30000
        },
        analyze_intent: {
          provider: 'groq',
          models: {
            groq: 'llama-3.3-70b-versatile',
            deepseek: 'deepseek-chat',
            mistral: 'mistral-large-latest',
            gemini: 'gemini-2.5-flash',
            cerebras: 'llama3.1-70b',
            openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
            github_models: 'gpt-4o-mini',
            sambanova: 'Meta-Llama-3.3-70B-Instruct'
          },
          temperature: 0.3,
          maxTokens: 150,
          timeout: 30000
        },
        seo_content: {
          provider: 'groq',
          models: {
            groq: 'llama-3.3-70b-versatile',
            deepseek: 'deepseek-chat',
            mistral: 'mistral-large-latest',
            gemini: 'gemini-2.5-flash',
            cerebras: 'llama3.1-70b',
            openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
            github_models: 'gpt-4o-mini',
            sambanova: 'Meta-Llama-3.3-70B-Instruct'
          },
          temperature: 0.5,
          maxTokens: 400,
          timeout: 30000
        },
        support_classification: {
          provider: 'groq',
          models: {
            groq: 'llama-3.3-70b-versatile',
            deepseek: 'deepseek-chat',
            mistral: 'mistral-large-latest',
            gemini: 'gemini-2.5-flash',
            cerebras: 'llama3.1-70b',
            openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
            github_models: 'gpt-4o-mini',
            sambanova: 'Meta-Llama-3.3-70B-Instruct'
          },
          temperature: 0.3,
          maxTokens: 200,
          timeout: 30000
        },
        // Analytics analysis task
        analytics_analysis: {
          provider: 'groq',
          models: {
            groq: 'llama-3.3-70b-versatile',
            deepseek: 'deepseek-chat',
            mistral: 'mistral-large-latest',
            gemini: 'gemini-2.5-flash',
            cerebras: 'llama3.1-70b',
            openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
            github_models: 'gpt-4o-mini',
            sambanova: 'Meta-Llama-3.3-70B-Instruct'
          },
          temperature: 0.5,
          maxTokens: 500,
          timeout: 30000
        },
        sales_chat: {
          provider: 'groq',
          models: {
            groq: 'llama-3.3-70b-versatile',
            deepseek: 'deepseek-chat',
            mistral: 'mistral-large-latest',
            gemini: 'gemini-2.5-flash',
            cerebras: 'llama3.1-70b',
            openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
            github_models: 'gpt-4o-mini',
            sambanova: 'Meta-Llama-3.3-70B-Instruct'
          },
          temperature: 0.7,
          maxTokens: 1000,
          timeout: 30000
        },
        // Embedding task
        embedding: {
          provider: 'gemini',
          models: {
            gemini: 'gemini-embedding-001',
            mistral: 'mistral-embed',
            deepseek: null, // DeepSeek doesn't support embeddings
            groq: null, // Groq doesn't support embeddings
            cerebras: null, // Cerebras doesn't support embeddings
            github_models: 'text-embedding-ada-002',
            openrouter: null, // OpenRouter doesn't support embeddings
            sambanova: null // SambaNova doesn't support embeddings
          },
          temperature: 0,
          maxTokens: 0,
          timeout: 30000
        }
      },
      
      // Retry configuration
      retry: {
        enabled: true,
        maxRetries: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 10000
      },
      
      // Fallback configuration
      fallback: {
        enabled: true,
        fallbackProviders: ['groq', 'deepseek', 'mistral', 'gemini', 'cerebras', 'openrouter', 'github_models', 'sambanova'],
        fallbackThreshold: 1 // Number of failures before fallback
      },
      
      // Cache configuration
      cache: {
        enabled: true,
        ttl: 3600000, // 1 hour in milliseconds
        maxSize: 1000
      },
      
      // Monitoring configuration
      monitoring: {
        enabled: true,
        logLevel: 'info',
        trackCosts: true,
        trackTokens: true,
        trackExecutionTime: true
      },
      
      // Rate limiting
      rateLimit: {
        enabled: true,
        requestsPerMinute: 100,
        requestsPerHour: 1000
      }
    };
  }

  /**
   * Get configuration for a specific task
   * @param {string} taskName - Task name
   * @returns {Object} - Task configuration
   */
  getTaskConfig(taskName) {
    const taskConfig = this.config.tasks[taskName];
    
    if (!taskConfig) {
      // Return default configuration if task not found
      return {
        provider: this.config.defaultProvider,
        model: this.config.providers[this.config.defaultProvider].defaultModel,
        temperature: 0.7,
        maxTokens: 500,
        timeout: 30000
      };
    }
    
    return taskConfig;
  }

  /**
   * Get provider configuration
   * @param {string} providerName - Provider name
   * @returns {Object} - Provider configuration
   */
  getProviderConfig(providerName) {
    const providerConfig = this.config.providers[providerName];
    
    if (!providerConfig) {
      throw new Error(`Provider ${providerName} not found in configuration`);
    }
    
    return providerConfig;
  }

  /**
   * Get all enabled providers
   * @returns {Array} - Array of enabled provider names
   */
  getEnabledProviders() {
    return Object.keys(this.config.providers)
      .filter(provider => this.config.providers[provider].enabled)
      .sort((a, b) => this.config.providers[a].priority - this.config.providers[b].priority);
  }

  /**
   * Get default provider
   * @returns {string} - Default provider name
   */
  getDefaultProvider() {
    return this.config.defaultProvider;
  }

  /**
   * Set default provider
   * @param {string} providerName - Provider name
   */
  setDefaultProvider(providerName) {
    if (!this.config.providers[providerName]) {
      throw new Error(`Provider ${providerName} not found`);
    }
    
    this.config.defaultProvider = providerName;
  }

  /**
   * Update provider configuration
   * @param {string} providerName - Provider name
   * @param {Object} updates - Configuration updates
   */
  updateProviderConfig(providerName, updates) {
    if (!this.config.providers[providerName]) {
      throw new Error(`Provider ${providerName} not found`);
    }
    
    this.config.providers[providerName] = {
      ...this.config.providers[providerName],
      ...updates
    };
  }

  /**
   * Update task configuration
   * @param {string} taskName - Task name
   * @param {Object} updates - Configuration updates
   */
  updateTaskConfig(taskName, updates) {
    if (!this.config.tasks[taskName]) {
      this.config.tasks[taskName] = {};
    }
    
    this.config.tasks[taskName] = {
      ...this.config.tasks[taskName],
      ...updates
    };
  }

  /**
   * Enable or disable a provider
   * @param {string} providerName - Provider name
   * @param {boolean} enabled - Enable or disable
   */
  setProviderEnabled(providerName, enabled) {
    if (!this.config.providers[providerName]) {
      throw new Error(`Provider ${providerName} not found`);
    }
    
    this.config.providers[providerName].enabled = enabled;
  }

  /**
   * Get retry configuration
   * @returns {Object} - Retry configuration
   */
  getRetryConfig() {
    return this.config.retry;
  }

  /**
   * Get fallback configuration
   * @returns {Object} - Fallback configuration
   */
  getFallbackConfig() {
    return this.config.fallback;
  }

  /**
   * Get cache configuration
   * @returns {Object} - Cache configuration
   */
  getCacheConfig() {
    return this.config.cache;
  }

  /**
   * Get monitoring configuration
   * @returns {Object} - Monitoring configuration
   */
  getMonitoringConfig() {
    return this.config.monitoring;
  }

  /**
   * Get rate limit configuration
   * @returns {Object} - Rate limit configuration
   */
  getRateLimitConfig() {
    return this.config.rateLimit;
  }

  /**
   * Get full configuration
   * @returns {Object} - Full configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Load configuration from object
   * @param {Object} config - Configuration object
   */
  loadConfig(config) {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * Validate configuration
   * @returns {Object} - { valid: boolean, errors: Array }
   */
  validateConfig() {
    const errors = [];
    
    // Validate default provider
    if (!this.config.providers[this.config.defaultProvider]) {
      errors.push(`Default provider ${this.config.defaultProvider} not found`);
    }
    
    // Validate enabled providers have API keys
    for (const [providerName, providerConfig] of Object.entries(this.config.providers)) {
      if (providerConfig.enabled && !providerConfig.apiKey && providerName !== 'ollama') {
        errors.push(`Provider ${providerName} is enabled but missing API key`);
      }
    }
    
    // Validate task configurations
    for (const [taskName, taskConfig] of Object.entries(this.config.tasks)) {
      if (!this.config.providers[taskConfig.provider]) {
        errors.push(`Task ${taskName} references unknown provider ${taskConfig.provider}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Singleton instance
const aiConfig = new AIConfig();

module.exports = aiConfig;
