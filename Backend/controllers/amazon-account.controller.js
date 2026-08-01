const AmazonAccount = require('../models/AmazonAccount.model');
const amazonAuthService = require('../services/amazon/amazon-auth.service');

class AmazonAccountController {
  /**
   * List all Amazon seller accounts
   */
  async listAccounts(req, res) {
    try {
      let accounts = await AmazonAccount.find().sort({ createdAt: -1 });

      // Auto-seed default account if database is empty
      if (accounts.length === 0) {
        try {
          const defaultAccount = new AmazonAccount({
            accountName: 'الحساب الرئيسي (.env)',
            sellerId: process.env.AMAZON_SP_API_SELLER_ID || process.env.SELLING_PARTNER_SELLER_ID || 'A1NLMXX19H764W',
            marketplaceId: process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ARBP9OOSHTCHU',
            region: process.env.AMAZON_SP_API_REGION || 'eu',
            clientId: process.env.SELLING_PARTNER_APP_CLIENT_ID || process.env.AMAZON_SP_API_CLIENT_ID || 'amzn1.application-oa2-client.default',
            clientSecret: process.env.SELLING_PARTNER_APP_CLIENT_SECRET || process.env.AMAZON_SP_API_CLIENT_SECRET || 'amzn1.oa2-cs.v1.default',
            refreshToken: process.env.AMAZON_SP_API_REFRESH_TOKEN || 'Atzr|default_token',
            isActive: true,
            connectionStatus: 'connected'
          });
          await defaultAccount.save();
          accounts = [defaultAccount];
          console.log('✅ Auto-seeded default Amazon account successfully');
        } catch (seedErr) {
          console.warn('⚠️ [AmazonAccount] Auto-seed default account failed:', seedErr.message);
        }
      }

      res.json({
        success: true,
        count: accounts.length,
        data: accounts
      });
    } catch (error) {
      console.error('Error listing Amazon accounts:', error);
      res.status(500).json({
        success: false,
        message: 'Error listing Amazon accounts',
        error: error.message
      });
    }
  }

  /**
   * Create a new Amazon seller account
   */
  async createAccount(req, res) {
    try {
      const {
        accountName,
        sellerId,
        marketplaceId,
        region,
        clientId,
        clientSecret,
        refreshToken,
        isActive
      } = req.body;

      if (!accountName || !sellerId || !clientId || !clientSecret || !refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Please provide all required fields: accountName, sellerId, clientId, clientSecret, refreshToken'
        });
      }

      // If set to active, deactivate all existing accounts first
      if (isActive) {
        await AmazonAccount.updateMany({}, { isActive: false });
      }

      // Check if this is the very first account, auto-activate if so
      const count = await AmazonAccount.countDocuments();
      const shouldBeActive = isActive || count === 0;

      const account = new AmazonAccount({
        accountName,
        sellerId,
        marketplaceId: marketplaceId || 'ARBP9OOSHTCHU',
        region: region || 'eu',
        clientId,
        clientSecret,
        refreshToken,
        isActive: shouldBeActive,
        connectionStatus: 'untested'
      });

      await account.save();

      // Reset dynamic client in Auth service so next call picks up active account
      amazonAuthService.resetClient();

      res.status(201).json({
        success: true,
        message: 'Amazon account created successfully',
        data: account
      });
    } catch (error) {
      console.error('Error creating Amazon account:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating Amazon account',
        error: error.message
      });
    }
  }

  /**
   * Update an existing Amazon account
   */
  async updateAccount(req, res) {
    try {
      const { id } = req.params;
      const updateFields = req.body;

      const account = await AmazonAccount.findById(id);
      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Amazon account not found'
        });
      }

      // If toggling isActive to true, deactivate other accounts
      if (updateFields.isActive === true && !account.isActive) {
        await AmazonAccount.updateMany({ _id: { $ne: id } }, { isActive: false });
      }

      Object.assign(account, updateFields);
      account.connectionStatus = 'untested'; // Reset tested status on key update
      await account.save();

      amazonAuthService.resetClient();

      res.json({
        success: true,
        message: 'Amazon account updated successfully',
        data: account
      });
    } catch (error) {
      console.error('Error updating Amazon account:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating Amazon account',
        error: error.message
      });
    }
  }

  /**
   * Activate target Amazon account (deactivates others)
   */
  async toggleActiveAccount(req, res) {
    try {
      const { id } = req.params;

      const account = await AmazonAccount.findById(id);
      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Amazon account not found'
        });
      }

      // Deactivate all accounts
      await AmazonAccount.updateMany({}, { isActive: false });

      // Activate target account
      account.isActive = true;
      await account.save();

      amazonAuthService.resetClient();

      res.json({
        success: true,
        message: `Account "${account.accountName}" activated successfully`,
        data: account
      });
    } catch (error) {
      console.error('Error activating Amazon account:', error);
      res.status(500).json({
        success: false,
        message: 'Error activating Amazon account',
        error: error.message
      });
    }
  }

  /**
   * Test connection for an Amazon account
   */
  async testAccountConnection(req, res) {
    try {
      const { id } = req.params;
      const account = await AmazonAccount.findById(id);
      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Amazon account not found'
        });
      }

      const testResult = await amazonAuthService.testSpecificAccount({
        region: account.region,
        refresh_token: account.refreshToken,
        client_id: account.clientId,
        client_secret: account.clientSecret
      });

      account.lastTestedAt = new Date();
      if (testResult.success) {
        account.connectionStatus = 'connected';
        account.lastError = null;
      } else {
        account.connectionStatus = 'error';
        account.lastError = testResult.error;
      }

      await account.save();

      res.json({
        success: testResult.success,
        message: testResult.success ? 'Connection test successful' : 'Connection test failed',
        error: testResult.error,
        data: account
      });
    } catch (error) {
      console.error('Error testing Amazon account connection:', error);
      res.status(500).json({
        success: false,
        message: 'Error testing Amazon account connection',
        error: error.message
      });
    }
  }

  /**
   * Delete an Amazon account
   */
  async deleteAccount(req, res) {
    try {
      const { id } = req.params;
      const account = await AmazonAccount.findByIdAndDelete(id);

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Amazon account not found'
        });
      }

      // If deleted account was active, pick the first remaining account and activate it
      if (account.isActive) {
        const remaining = await AmazonAccount.findOne();
        if (remaining) {
          remaining.isActive = true;
          await remaining.save();
        }
      }

      amazonAuthService.resetClient();

      res.json({
        success: true,
        message: 'Amazon account deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting Amazon account:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting Amazon account',
        error: error.message
      });
    }
  }
}

module.exports = new AmazonAccountController();
