const crypto = require('crypto');
const AmazonAccount = require('../models/AmazonAccount.model');
const AmazonOAuthState = require('../models/AmazonOAuthState.model');
const User = require('../models/User.model');
const Merchant = require('../models/Merchant.model');
const { encryptToken } = require('../utils/crypto.util');
const amazonAuthService = require('../services/amazon/amazon-auth.service');

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const DEFAULT_CONSENT_BASE = process.env.AMAZON_OAUTH_CONSENT_BASE_URL || 'https://sellercentral-europe.amazon.com/apps/authorize/consent';

class AmazonOAuthController {
  /**
   * Generate Amazon SP-API Consent OAuth URL for a specific Merchant
   */
  async generateAuthUrl(req, res) {
    try {
      const { merchantId } = req.body;
      if (!merchantId) {
        return res.status(400).json({
          success: false,
          message: 'يرجى تحديد التاجر المراد ربط حسابه'
        });
      }

      let merchant = await User.findById(merchantId);
      if (!merchant) {
        merchant = await Merchant.findById(merchantId);
      }

      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'التاجر غير موجود في النظام'
        });
      }

      const merchantName = merchant.merchantName || merchant.name || merchant.username || 'تاجر';

      // Generate cryptographically secure state token (32 bytes hex)
      const stateToken = crypto.randomBytes(32).toString('hex');

      // Save state in DB with 10-minute expiration
      await AmazonOAuthState.create({
        state: stateToken,
        merchantId: merchant._id
      });

      const appId = process.env.AMAZON_SP_API_APP_ID || process.env.SELLING_PARTNER_APP_CLIENT_ID;
      if (!appId) {
        return res.status(400).json({
          success: false,
          message: 'يرجى إضافة AMAZON_SP_API_APP_ID في ملف .env (يبدأ بـ amzn1.sp.solution....)'
        });
      }

      if (appId.startsWith('amzn1.application-oa2-client.')) {
        console.warn('⚠️ [Amazon OAuth] Using LWA Client ID as appId. SP-API OAuth requires amzn1.sp.solution.xxxx App ID.');
      }

      // Strictly force version=production
      const authUrl = `${DEFAULT_CONSENT_BASE}?application_id=${encodeURIComponent(appId)}&state=${encodeURIComponent(stateToken)}&version=production`;

      res.json({
        success: true,
        data: {
          authUrl,
          state: stateToken,
          merchantName
        }
      });
    } catch (error) {
      console.error('Error generating Amazon OAuth URL:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ أثناء إنشاء رابط الموافقة من أمازون',
        error: error.message
      });
    }
  }

  /**
   * Public OAuth Callback Endpoint from Amazon Seller Central
   * Amazon redirects here with: ?spapi_oauth_code=xxx&selling_partner_id=yyy&state=zzz
   */
  async handleOAuthCallback(req, res) {
    try {
      const { spapi_oauth_code, selling_partner_id, state } = req.query;

      console.log('🔄 [Amazon OAuth Callback] Received callback with query:', req.query);

      if (!state || !spapi_oauth_code || !selling_partner_id) {
        return res.status(400).send(`
          <div style="font-family: sans-serif; text-align: center; padding: 40px; dir: rtl;">
            <h2 style="color: #e53e3e;">❌ خطأ في عملية التفويض</h2>
            <p>معلمات غير مكتملة من أمازون (مطلوب state, spapi_oauth_code, selling_partner_id)</p>
          </div>
        `);
      }

      // Step 1: Validate State Token & Expiration
      const oauthStateRecord = await AmazonOAuthState.findOne({ state });

      if (!oauthStateRecord) {
        console.warn('❌ [Amazon OAuth Callback] Invalid or expired state token:', state);
        return res.status(403).send(`
          <div style="font-family: sans-serif; text-align: center; padding: 40px; dir: rtl;">
            <h2 style="color: #e53e3e;">❌ انتهاء صلاحية الجلسة أو طلب غير مصرح به (CSRF Violation)</h2>
            <p>رمز الاتصال انتهت صلاحيته (صالح لمدة 10 دقائق فقط) أو تم استخدامه سابقاً. يرجى البدء من لوحة التحكم مجدداً.</p>
          </div>
        `);
      }

      const merchantId = oauthStateRecord.merchantId;

      // Step 2: Delete state token immediately to enforce SINGLE-USE security
      await AmazonOAuthState.deleteOne({ _id: oauthStateRecord._id });

      const clientId = process.env.SELLING_PARTNER_APP_CLIENT_ID || process.env.AMAZON_SP_API_CLIENT_ID;
      const clientSecret = process.env.SELLING_PARTNER_APP_CLIENT_SECRET || process.env.AMAZON_SP_API_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).send('❌ LWA Credentials not set in server configuration.');
      }

      // Step 3: Exchange spapi_oauth_code for LWA Refresh Token
      console.log('🔑 [Amazon OAuth Callback] Exchanging LWA code for Refresh Token...');
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: spapi_oauth_code,
        client_id: clientId,
        client_secret: clientSecret
      });

      const response = await fetch(LWA_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: params.toString()
      });

      const tokenData = await response.json();

      if (!response.ok || !tokenData.refresh_token) {
        console.error('❌ [Amazon OAuth Callback] Token exchange failed:', tokenData);
        return res.status(400).send(`
          <div style="font-family: sans-serif; text-align: center; padding: 40px; dir: rtl;">
            <h2 style="color: #e53e3e;">❌ فشل استبدال الكود بـ Refresh Token من أمازون</h2>
            <p>${tokenData.error_description || tokenData.error || 'خطأ غير معروف'}</p>
          </div>
        `);
      }

      const plainRefreshToken = tokenData.refresh_token;
      console.log('✅ [Amazon OAuth Callback] Successfully acquired LWA Refresh Token');

      // Step 4: Encrypt Refresh Token with AES-256-GCM
      const encryptedRefreshToken = encryptToken(plainRefreshToken);

      // Step 5: Save or update AmazonAccount for this Merchant
      let merchant = await User.findById(merchantId);
      if (!merchant) {
        merchant = await Merchant.findById(merchantId);
      }
      const merchantName = merchant ? (merchant.merchantName || merchant.name || merchant.username) : 'تاجر مستقل';

      let account = await AmazonAccount.findOne({ merchantId });
      if (!account) {
        account = new AmazonAccount({
          accountName: `متجر أمازون - ${merchantName}`,
          merchantId: merchantId,
          accountType: 'merchant_oauth',
          sellerId: selling_partner_id,
          marketplaceId: process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ARBP9OOSHTCHU',
          region: process.env.AMAZON_SP_API_REGION || 'eu',
          clientId: clientId,
          clientSecret: clientSecret,
          refreshToken: encryptedRefreshToken,
          isEncrypted: true,
          isActive: false, // Default to inactive until enabled
          connectionStatus: 'connected',
          lastTestedAt: new Date()
        });
      } else {
        account.sellerId = selling_partner_id;
        account.refreshToken = encryptedRefreshToken;
        account.isEncrypted = true;
        account.connectionStatus = 'connected';
        account.lastTestedAt = new Date();
        account.lastError = null;
      }

      await account.save();
      amazonAuthService.resetClient();

      console.log(`✅ [Amazon OAuth Callback] Saved encrypted Amazon account for merchant ${merchantId} (SellerID: ${selling_partner_id})`);

      // HTML Success Redirect / Message
      res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px; background-color: #f0fdf4; dir: rtl;">
          <h1 style="color: #15803d; font-size: 28px;">✅ تم ربط حساب أمازون بنجاح!</h1>
          <p style="font-size: 16px; color: #166534;">تم ربط المتجر (Merchant ID: <strong>${selling_partner_id}</strong>) للتاجر <strong>${merchantName}</strong> وتشفير المفاتيح بأمان.</p>
          <p style="margin-top: 30px;">
            <a href="/admin?view=merchantAmazonLink" style="background-color: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              العودة إلى لوحة التحكم
            </a>
          </p>
        </div>
      `);

    } catch (error) {
      console.error('❌ [Amazon OAuth Callback] Exception:', error);
      res.status(500).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 40px; dir: rtl;">
          <h2 style="color: #e53e3e;">❌ حدث خطأ داخلي في الخادم</h2>
          <p>${error.message}</p>
        </div>
      `);
    }
  }

  /**
   * List all Linked Merchant Amazon Accounts
   */
  async getMerchantAccounts(req, res) {
    try {
      const accounts = await AmazonAccount.find({ accountType: 'merchant_oauth' })
        .populate('merchantId', 'merchantName name username email phone governorate city')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        count: accounts.length,
        data: accounts
      });
    } catch (error) {
      console.error('Error fetching merchant accounts:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في جلب حسابات التجار المربوطة',
        error: error.message
      });
    }
  }

  /**
   * Unlink a Merchant Amazon Account
   */
  async unlinkMerchantAccount(req, res) {
    try {
      const { id } = req.params;
      const account = await AmazonAccount.findByIdAndDelete(id);

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'حساب أمازون غير موجود'
        });
      }

      amazonAuthService.resetClient();

      res.json({
        success: true,
        message: 'تم إلغاء ربط حساب أمازون للتاجر بنجاح'
      });
    } catch (error) {
      console.error('Error unlinking merchant account:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ أثناء إلغاء ربط الحساب',
        error: error.message
      });
    }
  }
}

module.exports = new AmazonOAuthController();
