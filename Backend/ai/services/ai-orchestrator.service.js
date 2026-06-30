const AIConfig = require('../config/ai.config');
const promptManager = require('./prompt-manager.service');
const healthMonitor = require('./health-monitor.service');
const logger = require('../../services/logger.service');
const OpenAIProvider = require('../providers/openai.provider');
const GeminiProvider = require('../providers/gemini.provider');
const GroqProvider = require('../providers/groq.provider');
const CerebrasProvider = require('../providers/cerebras.provider');
const GitHubModelsProvider = require('../providers/github-models.provider');
const OpenRouterProvider = require('../providers/openrouter.provider');
const DeepSeekProvider = require('../providers/deepseek.provider');
const SambaNovaProvider = require('../providers/sambanova.provider');
const MistralProvider = require('../providers/mistral.provider');

/**
 * AI Orchestrator Service
 * Central service for all AI operations
 * Routes tasks to appropriate providers and models
 * Handles retry, fallback, caching, and monitoring
 */
class AIOrchestrator {
  constructor() {
    this.config = AIConfig;
    this.providers = new Map();
    this.cache = new Map();
    
    // Initialize providers
    this.initializeProviders();
    
    // Start health monitoring
    healthMonitor.startMonitoring(this);
  }

  /**
   * Initialize AI providers
   * Priority order: groq -> deepseek -> mistral -> gemini -> cerebras -> openrouter -> github_models -> sambanova
   */
  initializeProviders() {
    // Initialize Groq provider (fastest, highest quality)
    const groqConfig = this.config.getProviderConfig('groq');
    if (groqConfig.enabled) {
      this.providers.set('groq', new GroqProvider(groqConfig));
    }

    // Initialize DeepSeek provider (large quota: 5M tokens, good Arabic support)
    const deepseekConfig = this.config.getProviderConfig('deepseek');
    if (deepseekConfig.enabled) {
      this.providers.set('deepseek', new DeepSeekProvider(deepseekConfig));
    }

    // Initialize Mistral provider (high quality models with generous free tier)
    const mistralConfig = this.config.getProviderConfig('mistral');
    if (mistralConfig.enabled) {
      this.providers.set('mistral', new MistralProvider(mistralConfig));
    }

    // Initialize Gemini provider (backup, often rate limited)
    const geminiConfig = this.config.getProviderConfig('gemini');
    if (geminiConfig.enabled) {
      this.providers.set('gemini', new GeminiProvider(geminiConfig));
    }

    // Initialize Cerebras provider (large quota: 1M/day, but strict 5 req/min limit)
    const cerebrasConfig = this.config.getProviderConfig('cerebras');
    if (cerebrasConfig.enabled) {
      this.providers.set('cerebras', new CerebrasProvider(cerebrasConfig));
    }

    // Initialize OpenRouter provider (general backup)
    const openrouterConfig = this.config.getProviderConfig('openrouter');
    if (openrouterConfig.enabled) {
      this.providers.set('openrouter', new OpenRouterProvider(openrouterConfig));
    }

    // Initialize GitHub Models provider (after fixing token scope)
    const githubModelsConfig = this.config.getProviderConfig('github_models');
    if (githubModelsConfig.enabled) {
      this.providers.set('github_models', new GitHubModelsProvider(githubModelsConfig));
    }

    // Initialize SambaNova provider (last resort: 20 req/day limit)
    const sambanovaConfig = this.config.getProviderConfig('sambanova');
    if (sambanovaConfig.enabled) {
      this.providers.set('sambanova', new SambaNovaProvider(sambanovaConfig));
    }

    // Initialize OpenAI provider (if configured)
    const openaiConfig = this.config.getProviderConfig('openai');
    if (openaiConfig.enabled) {
      this.providers.set('openai', new OpenAIProvider(openaiConfig));
    }
  }

  /**
   * Get provider instance
   * @param {string} providerName - Provider name
   * @returns {AIProvider} - Provider instance
   */
  getProvider(providerName) {
    const provider = this.providers.get(providerName);
    
    if (!provider) {
      throw new Error(`Provider ${providerName} not initialized`);
    }
    
    return provider;
  }

  /**
   * Execute AI task
   * @param {string} task - Task name
   * @param {Object} data - Task data
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Task result
   */
  async execute(task, data, options = {}) {
    const startTime = Date.now();
    
    try {
      // Get task configuration
      const taskConfig = this.config.getTaskConfig(task);
      
      // Override with options if provided
      const providerName = options.provider || taskConfig.provider;
      
      // Get provider-specific model
      let model;
      if (options.model) {
        model = options.model;
      } else if (taskConfig.models && taskConfig.models[providerName]) {
        model = taskConfig.models[providerName];
      } else if (taskConfig.model) {
        // Fallback to old model field for backward compatibility
        model = taskConfig.model;
      } else {
        // Use provider's default model
        const providerConfig = this.config.getProviderConfig(providerName);
        model = providerConfig.defaultModel;
      }
      
      // Skip provider if model is null (not supported)
      if (model === null) {
        return {
          success: false,
          error: `Provider ${providerName} does not support this task`,
          provider: providerName,
          model: null
        };
      }
      
      const temperature = options.temperature !== undefined ? options.temperature : taskConfig.temperature;
      const maxTokens = options.maxTokens !== undefined ? options.maxTokens : taskConfig.maxTokens;
      const timeout = options.timeout || taskConfig.timeout;
      
      // Get provider
      const provider = this.getProvider(providerName);
      
      // Check cache if enabled
      const cacheConfig = this.config.getCacheConfig();
      if (cacheConfig.enabled && !options.skipCache) {
        const cacheKey = this.generateCacheKey(task, data, providerName, model);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          return {
            ...cached,
            cached: true,
            executionTime: Date.now() - startTime
          };
        }
      }
      
      // Get prompt if task requires it
      let prompt = options.prompt;
      let systemPrompt = options.systemPrompt;
      let messages = options.messages;
      
      if (!prompt && !messages && task.includes('generate')) {
        // Extract domain from task name
        const domain = this.extractDomainFromTask(task);
        const taskName = task.replace(`${domain}_`, '');
        
        // Get full prompt from prompt manager
        const fullPrompt = promptManager.getFullPrompt(domain, taskName, data);
        systemPrompt = fullPrompt.system;
        prompt = fullPrompt.user;
      }
      
      // Execute based on task type
      let result;
      
      if (task.includes('json') || options.returnJSON) {
        result = await provider.generateJSON({
          prompt,
          messages,
          systemPrompt,
          schema: options.schema,
          temperature,
          maxTokens,
          model,
          timeout
        });
      } else if (task.includes('embedding')) {
        result = await provider.generateEmbedding({
          text: data.text || prompt,
          model,
          timeout
        });
      } else {
        result = await provider.generateText({
          prompt,
          messages,
          systemPrompt,
          temperature,
          maxTokens,
          model,
          timeout
        });
      }
      
      // Cache result if enabled and successful
      if (cacheConfig.enabled && result.success && !options.skipCache) {
        const cacheKey = this.generateCacheKey(task, data, providerName, model);
        this.cache.set(cacheKey, result);
        
        // Enforce cache size limit
        if (this.cache.size > cacheConfig.maxSize) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
      }
      
      // Add metadata
      result.task = task;
      result.provider = providerName;
      result.model = model;
      result.executionTime = Date.now() - startTime;
      result.cached = false;
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      
      return {
        success: false,
        error: error.message,
        task,
        executionTime: endTime - startTime,
        provider: options.provider || this.config.getDefaultProvider()
      };
    }
  }

  /**
   * Execute task with retry
   * @param {string} task - Task name
   * @param {Object} data - Task data
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Task result
   */
  async executeWithRetry(task, data, options = {}) {
    const retryConfig = this.config.getRetryConfig();
    
    if (!retryConfig.enabled || options.skipRetry) {
      return this.execute(task, data, options);
    }
    
    const maxRetries = options.maxRetries || retryConfig.maxRetries;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.execute(task, data, options);
        
        if (result.success) {
          return result;
        }
        
        lastError = result.error;
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(result.error)) {
          return result;
        }
        
        // Wait before retry
        if (attempt < maxRetries) {
          const delay = this.calculateRetryDelay(attempt, retryConfig);
          await this.sleep(delay);
        }
      } catch (error) {
        lastError = error.message;
        
        if (attempt < maxRetries) {
          const delay = this.calculateRetryDelay(attempt, retryConfig);
          await this.sleep(delay);
        }
      }
    }
    
    return {
      success: false,
      error: lastError || 'Max retries exceeded',
      task,
      retries: maxRetries
    };
  }

  /**
   * Execute task with fallback
   * @param {string} task - Task name
   * @param {Object} data - Task data
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Task result
   */
  async executeWithFallback(task, data, options = {}) {
    const fallbackConfig = this.config.getFallbackConfig();
    
    if (!fallbackConfig.enabled || options.skipFallback) {
      return this.executeWithRetry(task, data, options);
    }
    
    const taskConfig = this.config.getTaskConfig(task);
    const primaryProvider = options.provider || taskConfig.provider;
    
    // Get enabled providers sorted by priority
    const enabledProviders = this.config.getEnabledProviders();
    
    // Filter out unhealthy providers
    const healthyProviders = healthMonitor.getHealthyProviders(enabledProviders);
    
    if (healthyProviders.length === 0) {
      logger.warn('No healthy providers available, using all enabled providers');
    }
    
    const providersToTry = healthyProviders.length > 0 ? healthyProviders : enabledProviders;
    
    // Sort providers by health status (healthy first, then by priority)
    const sortedProviders = providersToTry.sort((a, b) => {
      const aHealthy = healthMonitor.isProviderHealthy(a);
      const bHealthy = healthMonitor.isProviderHealthy(b);
      
      if (aHealthy && !bHealthy) return -1;
      if (!aHealthy && bHealthy) return 1;
      
      // If both have same health status, use original priority order
      return enabledProviders.indexOf(a) - enabledProviders.indexOf(b);
    });
    
    // Try each provider in sorted order
    let lastError = null;
    let lastProvider = null;
    
    for (const providerName of sortedProviders) {
      try {
        // Get provider-specific model
        const taskConfig = this.config.getTaskConfig(task);
        let model;
        if (taskConfig.models && taskConfig.models[providerName]) {
          model = taskConfig.models[providerName];
        } else if (taskConfig.model) {
          model = taskConfig.model;
        } else {
          const providerConfig = this.config.getProviderConfig(providerName);
          model = providerConfig.defaultModel;
        }
        
        // Skip if model is null
        if (model === null) {
          logger.debug(`Skipping ${providerName}: model not supported for this task`);
          continue;
        }
        
        // Log provider switch
        if (lastProvider) {
          logger.info(`Trying provider: ${providerName}`);
          logger.debug(`Model: ${model}`);
          logger.debug(`Reason previous provider failed: ${lastError}`);
          logger.debug('Switching...');
        } else {
          logger.info(`Trying provider: ${providerName}`);
          logger.debug(`Model: ${model}`);
        }
        
        const startTime = Date.now();
        const result = await this.executeWithRetry(task, data, {
          ...options,
          provider: providerName
        });
        const timeSpent = Date.now() - startTime;
        
        if (result.success) {
          if (providerName !== primaryProvider) {
            result.fallbackUsed = true;
            result.originalProvider = primaryProvider;
          }
          logger.info(`Success with provider: ${providerName} in ${timeSpent}ms`);
          return result;
        }
        
        lastError = result.error;
        lastProvider = providerName;
        logger.warn(`Provider ${providerName} failed: ${result.error} (${timeSpent}ms)`);
      } catch (error) {
        lastError = error.message;
        lastProvider = providerName;
        logger.error(`Provider ${providerName} error: ${error.message}`);
      }
    }
    
    logger.error('All providers failed');
    return {
      success: false,
      error: 'All providers failed',
      task,
      attemptedProviders: providersToTry
    };
  }

  /**
   * Generate cache key
   * @param {string} task - Task name
   * @param {Object} data - Task data
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @returns {string} - Cache key
   */
  generateCacheKey(task, data, provider, model) {
    const dataStr = JSON.stringify(data);
    return `${task}:${provider}:${model}:${dataStr}`;
  }

  /**
   * Extract domain from task name
   * @param {string} task - Task name
   * @returns {string} - Domain name
   */
  extractDomainFromTask(task) {
    const domainMap = {
      'generate_caption': 'marketing',
      'generate_hashtags': 'marketing',
      'sales_reply': 'sales',
      'analyze_intent': 'sales',
      'seo_content': 'seo',
      'support_classification': 'support',
      'analytics_analysis': 'analytics',
      'embedding': 'analytics'
    };
    
    return domainMap[task] || 'general';
  }

  /**
   * Check if error is non-retryable
   * @param {string} error - Error message
   * @returns {boolean} - True if non-retryable
   */
  isNonRetryableError(error) {
    const errorLower = error.toLowerCase();
    
    // Check for HTTP status codes that should not be retried
    if (errorLower.includes('401') || errorLower.includes('unauthorized')) {
      return true; // Authentication error
    }
    if (errorLower.includes('402') || errorLower.includes('payment required') || errorLower.includes('insufficient balance')) {
      return true; // Payment required / Insufficient balance - permanent error
    }
    if (errorLower.includes('403') || errorLower.includes('forbidden')) {
      return true; // Authorization error
    }
    if (errorLower.includes('404') || errorLower.includes('not found')) {
      return true; // Resource not found
    }
    if (errorLower.includes('429') || errorLower.includes('too many requests')) {
      return true; // Rate limit - skip to next provider
    }
    
    // Check for other non-retryable error messages
    const nonRetryableErrors = [
      'authentication',
      'authorization',
      'invalid api key',
      'invalid request',
      'model does not exist',
      'permission required'
    ];
    
    return nonRetryableErrors.some(e => errorLower.includes(e));
  }

  /**
   * Calculate retry delay
   * @param {number} attempt - Attempt number
   * @param {Object} retryConfig - Retry configuration
   * @returns {number} - Delay in milliseconds
   */
  calculateRetryDelay(attempt, retryConfig) {
    if (retryConfig.backoffStrategy === 'exponential') {
      return Math.min(
        retryConfig.initialDelay * Math.pow(2, attempt),
        retryConfig.maxDelay
      );
    } else if (retryConfig.backoffStrategy === 'linear') {
      return Math.min(
        retryConfig.initialDelay * (attempt + 1),
        retryConfig.maxDelay
      );
    }
    
    return retryConfig.initialDelay;
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Duration in milliseconds
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.getCacheConfig().maxSize
    };
  }

  /**
   * Get health status for all providers
   * @returns {Promise<Object>} - Health status
   */
  async getHealthStatus() {
    return await healthMonitor.checkAllProviders();
  }

  /**
   * Get health statistics
   * @returns {Object} - Health statistics
   */
  getHealthStats() {
    return healthMonitor.getHealthStats();
  }

  /**
   * Get available models for a provider
   * @param {string} providerName - Provider name
   * @returns {Promise<string[]>} - Available models
   */
  async getAvailableModels(providerName) {
    const provider = this.getProvider(providerName);
    return provider.getAvailableModels();
  }

  /**
   * Get all available models
   * @returns {Promise<Object>} - Available models by provider
   */
  async getAllAvailableModels() {
    const models = {};
    
    for (const [name, provider] of this.providers) {
      models[name] = await provider.getAvailableModels();
    }
    
    return models;
  }
}

// Singleton instance
const aiOrchestrator = new AIOrchestrator();

// Export both class and singleton for testing
module.exports = aiOrchestrator;
module.exports.AIOrchestratorClass = AIOrchestrator;
