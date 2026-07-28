const SellingPartner = require('amazon-sp-api');
const logger = require('./amazon-logger.service');

class AmazonAuthService {
  constructor() {
    this.client = null;
  }

  /**
   * Initialize Amazon SP-API client
   * The library handles access token management automatically
   */
  async getClient() {
    if (!this.client) {
      console.log('🔑 [Amazon Auth] Initializing SP-API client...');
      console.log('🔑 [Amazon Auth] Region:', process.env.AMAZON_SP_API_REGION || 'eu');
      console.log('🔑 [Amazon Auth] Refresh token:', process.env.AMAZON_SP_API_REFRESH_TOKEN ? 'SET' : 'MISSING');
      
      this.client = new SellingPartner({
        region: process.env.AMAZON_SP_API_REGION || 'eu',
        refresh_token: process.env.AMAZON_SP_API_REFRESH_TOKEN
      });
      
      console.log('✅ [Amazon Auth] SP-API client initialized successfully');
    }

    return this.client;
  }

  /**
   * Test connection to Amazon SP-API
   */
  async testConnection() {
    try {
      const client = await this.getClient();
      const result = await client.callAPI({
        operation: 'getMarketplaceParticipations',
        endpoint: 'sellers'
      });
      
      console.log('✅ [Amazon Auth] Connection test successful');
      logger.logSuccess('Connection Test', { marketplaces: result });
      return { success: true, data: result };
    } catch (error) {
      console.error('❌ [Amazon Auth] Connection test failed:', error.message);
      logger.logError('Connection Test', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get marketplace ID from environment or system settings
   */
  getMarketplaceId() {
    return process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ARBP9OOSHTCHU';
  }

  /**
   * Get seller ID from environment or fallback
   */
  async getSellerId() {
    if (process.env.AMAZON_SP_API_SELLER_ID) {
      return process.env.AMAZON_SP_API_SELLER_ID;
    }
    return 'A1NLMXX19H764W';
  }

  /**
   * Get endpoint URL
   */
  getEndpointUrl() {
    const region = process.env.AMAZON_SP_API_REGION || 'eu';
    return `https://sellingpartnerapi-${region}.amazon.com`;
  }
}

module.exports = new AmazonAuthService();
