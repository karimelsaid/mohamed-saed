const Product = require('../models/Product.model');
const AnalyticsEvent = require('../models/AnalyticsEvent.model');
const { generateAmazonAffiliateLink, extractAsin } = require('../utils/amazonAffiliate');

/**
 * Controller for Amazon Affiliate Operations
 */

/**
 * POST /api/affiliate/track-click
 * Record an affiliate link click event in analytics
 */
exports.trackClick = async (req, res) => {
  try {
    const { productId, amazonAsin, merchantId, sellerId } = req.body;
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    const userId = req.user ? req.user._id : 'anonymous';

    let resolvedAsin = amazonAsin;
    let resolvedMerchantId = merchantId || sellerId;

    if (productId && (!resolvedAsin || !resolvedMerchantId)) {
      const product = await Product.findById(productId).select('amazonAsin merchantId').lean();
      if (product) {
        if (!resolvedAsin) resolvedAsin = product.amazonAsin;
        if (!resolvedMerchantId) resolvedMerchantId = product.merchantId?.toString();
      }
    }

    const cleanAsin = extractAsin(resolvedAsin);

    // Save analytics click event
    const event = await AnalyticsEvent.create({
      eventType: 'affiliate_click',
      productId: productId || null,
      userId: userId.toString(),
      metadata: {
        amazonAsin: cleanAsin,
        merchantId: resolvedMerchantId || null,
        affiliateTag: process.env.AMAZON_AFFILIATE_STORE_ID || 'knoozbook-21',
        userIp,
        userAgent,
        referrer: req.headers['referer'] || ''
      }
    });

    const affiliateUrl = cleanAsin ? generateAmazonAffiliateLink(cleanAsin) : '';

    return res.json({
      success: true,
      message: 'Affiliate click tracked successfully',
      eventId: event._id,
      affiliateUrl
    });
  } catch (error) {
    console.error('❌ [Affiliate Controller] Error tracking click:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to track affiliate click',
      error: error.message
    });
  }
};

/**
 * GET /api/affiliate/link/:productId
 * Get generated affiliate link and track click
 */
exports.getAffiliateLink = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const asin = extractAsin(product.amazonAsin);
    if (!asin) {
      return res.status(400).json({
        success: false,
        message: 'Product does not have a valid Amazon ASIN'
      });
    }

    const affiliateUrl = generateAmazonAffiliateLink(asin);
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    // Asynchronously log click event
    AnalyticsEvent.create({
      eventType: 'affiliate_click',
      productId: product._id.toString(),
      userId: req.user ? req.user._id.toString() : 'anonymous',
      metadata: {
        amazonAsin: asin,
        merchantId: product.merchantId ? product.merchantId.toString() : null,
        affiliateTag: process.env.AMAZON_AFFILIATE_STORE_ID || 'knoozbook-21',
        userIp,
        userAgent
      }
    }).catch(err => console.error('❌ Error logging click event:', err.message));

    return res.json({
      success: true,
      productId: product._id,
      asin,
      affiliateUrl,
      disclosure: 'بصفتنا مشاركين في برنامج Amazon Associates، فنحن نحصل على عمولة من عمليات الشراء المؤهلة التي تتم عبر روابطنا.'
    });
  } catch (error) {
    console.error('❌ [Affiliate Controller] Error getting link:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating affiliate link',
      error: error.message
    });
  }
};

/**
 * GET /api/affiliate/redirect/:productId
 * Log click event and HTTP 302 redirect directly to Amazon affiliate page
 */
exports.redirectAffiliateLink = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId).lean();

    if (!product || !product.amazonAsin) {
      return res.status(404).send('Product or Amazon ASIN not found');
    }

    const asin = extractAsin(product.amazonAsin);
    const affiliateUrl = generateAmazonAffiliateLink(asin);
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    // Log click event
    await AnalyticsEvent.create({
      eventType: 'affiliate_click',
      productId: product._id.toString(),
      userId: 'anonymous',
      metadata: {
        amazonAsin: asin,
        merchantId: product.merchantId ? product.merchantId.toString() : null,
        affiliateTag: process.env.AMAZON_AFFILIATE_STORE_ID || 'knoozbook-21',
        userIp,
        userAgent
      }
    }).catch(err => console.error('❌ Error logging redirect event:', err.message));

    return res.redirect(302, affiliateUrl);
  } catch (error) {
    console.error('❌ [Affiliate Controller] Error performing redirect:', error);
    return res.status(500).send('Error redirecting to affiliate link');
  }
};
