const SellingPartner = require('amazon-sp-api');
const logger = require('./amazon-logger.service');
const AmazonAccount = require('../../models/AmazonAccount.model');
const { decryptToken } = require('../../utils/crypto.util');

class AmazonAuthService {
  constructor() {
    this.client = null;
    this.activeAccount = null;
  }

  /**
   * Reset client instance (called when accounts are updated or switched)
   */
  resetClient() {
    this.client = null;
    this.activeAccount = null;
  }

  /**
   * Get active Amazon seller account from database or fallback to .env
   */
  async getActiveAccount() {
    // TEMPORARILY DISABLED: Reverting to .env only until OAuth is approved
    /*
    try {
      const dbAccount = await AmazonAccount.findOne({ isActive: true });
      if (dbAccount) {
        this.activeAccount = dbAccount;
        return dbAccount;
      }
    } catch (err) {
      console.warn('⚠️ [Amazon Auth] Error fetching active account from DB, falling back to .env:', err.message);
    }
    */

    // Fallback to .env
    return {
      accountName: 'Default (.env)',
      sellerId: process.env.AMAZON_SP_API_SELLER_ID || 'A1NLMXX19H764W',
      marketplaceId: process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ARBP9OOSHTCHU',
      region: process.env.AMAZON_SP_API_REGION || 'eu',
      clientId: process.env.AMAZON_SP_API_CLIENT_ID,
      clientSecret: process.env.AMAZON_SP_API_CLIENT_SECRET,
      refreshToken: process.env.AMAZON_SP_API_REFRESH_TOKEN
    };
  }

  /**
   * Initialize Amazon SP-API client
   */
  async getClient() {
    if (!this.client) {
      const account = await this.getActiveAccount();
      const plainRefreshToken = decryptToken(account.refreshToken);
      console.log(`🔑 [Amazon Auth] Initializing SP-API client for store: "${account.accountName}"`);
      console.log('🔑 [Amazon Auth] Region:', account.region || 'eu');
      console.log('🔑 [Amazon Auth] Refresh token:', plainRefreshToken ? 'SET' : 'MISSING');
      
      const config = {
        region: account.region || 'eu',
        refresh_token: plainRefreshToken
      };

      if (account.clientId && account.clientSecret) {
        config.credentials = {
          SELLING_PARTNER_APP_CLIENT_ID: account.clientId,
          SELLING_PARTNER_APP_CLIENT_SECRET: account.clientSecret
        };
      }

      this.client = new SellingPartner(config);
      console.log('✅ [Amazon Auth] SP-API client initialized successfully');
    }

    return this.client;
  }

  /**
   * Test connection for specific credentials
   */
  async testSpecificAccount(creds) {
    try {
      const plainRefreshToken = decryptToken(creds.refresh_token);
      const config = {
        region: creds.region || 'eu',
        refresh_token: plainRefreshToken
      };

      if (creds.client_id && creds.client_secret) {
        config.credentials = {
          SELLING_PARTNER_APP_CLIENT_ID: creds.client_id,
          SELLING_PARTNER_APP_CLIENT_SECRET: creds.client_secret
        };
      }

      const tempClient = new SellingPartner(config);
      const result = await tempClient.callAPI({
        operation: 'getMarketplaceParticipations',
        endpoint: 'sellers'
      });

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test connection to Amazon SP-API for active client
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
   * Get marketplace ID from active account or environment
   */
  async getMarketplaceId() {
    const account = await this.getActiveAccount();
    return account.marketplaceId || process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ARBP9OOSHTCHU';
  }

  /**
   * Get seller ID from active account or environment
   */
  async getSellerId() {
    const account = await this.getActiveAccount();
    return account.sellerId || process.env.AMAZON_SP_API_SELLER_ID || 'A1NLMXX19H764W';
  }

  /**
   * Get endpoint URL
   */
  async getEndpointUrl() {
    const account = await this.getActiveAccount();
    const region = account.region || process.env.AMAZON_SP_API_REGION || 'eu';
    return `https://sellingpartnerapi-${region}.amazon.com`;
  }
}

module.exports = new AmazonAuthService();
