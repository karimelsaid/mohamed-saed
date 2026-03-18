const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const authenticateMerchant = require('../middleware/merchant.auth');

// Public tracking routes (can be called by anyone visiting the site)
router.post('/track/product/:productId', analyticsController.trackProductView);
router.post('/track/store/:merchantId', analyticsController.trackStoreVisit);
router.post('/search', analyticsController.trackSearchTerm);

// Protected analytics routes (for the merchant dashboard)
router.get('/merchant-stats', authenticateMerchant, analyticsController.getMerchantAnalytics);

module.exports = router;
