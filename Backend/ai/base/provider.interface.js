/**
 * AI Provider Interface
 * Base class that all AI providers must implement
 * This follows the Adapter Pattern for easy provider switching
 */

class AIProvider {
  constructor(config) {
    this.config = config;
    this.providerName = this.constructor.name;
  }

  /**
   * Generate text completion
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - The prompt to generate from
   * @param {string[]} params.messages - Array of messages for chat completion
   * @param {number} params.temperature - Temperature for generation (0-1)
   * @param {number} params.maxTokens - Maximum tokens to generate
   * @param {string} params.model - Model to use
   * @returns {Promise<Object>} - Generated text with metadata
   */
  async generateText(params) {
    throw new Error('generateText() must be implemented by subclass');
  }

  /**
   * Generate JSON completion
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - The prompt to generate from
   * @param {string[]} params.messages - Array of messages for chat completion
   * @param {Object} params.schema - JSON schema for output validation
   * @param {number} params.temperature - Temperature for generation (0-1)
   * @param {number} params.maxTokens - Maximum tokens to generate
   * @param {string} params.model - Model to use
   * @returns {Promise<Object>} - Generated JSON with metadata
   */
  async generateJSON(params) {
    throw new Error('generateJSON() must be implemented by subclass');
  }

  /**
   * Generate embedding for text
   * @param {Object} params - Embedding parameters
   * @param {string} params.text - Text to embed
   * @param {string} params.model - Model to use for embedding
   * @returns {Promise<Object>} - Embedding vector with metadata
   */
  async generateEmbedding(params) {
    throw new Error('generateEmbedding() must be implemented by subclass');
  }

  /**
   * Get available models for this provider
   * @returns {Promise<string[]>} - Array of model names
   */
  async getAvailableModels() {
    throw new Error('getAvailableModels() must be implemented by subclass');
  }

  /**
   * Validate configuration
   * @returns {boolean} - True if configuration is valid
   */
  validateConfig() {
    throw new Error('validateConfig() must be implemented by subclass');
  }

  /**
   * Get provider name
   * @returns {string} - Provider name
   */
  getProviderName() {
    return this.providerName;
  }

  /**
   * Calculate cost based on token usage
   * @param {Object} usage - Token usage data
   * @param {number} usage.inputTokens - Input tokens
   * @param {number} usage.outputTokens - Output tokens
   * @param {string} model - Model used
   * @returns {number} - Estimated cost in USD
   */
  calculateCost(usage, model) {
    throw new Error('calculateCost() must be implemented by subclass');
  }

  /**
   * Health check for the provider
   * @returns {Promise<boolean>} - True if provider is healthy
   */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass');
  }
}

module.exports = AIProvider;
