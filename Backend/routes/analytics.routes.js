const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const authenticateMerchant = require('../middleware/merchant.auth');

// Public tracking routes
router.post('/track', analyticsController.trackEvent);  // ← جديد
router.post('/track/product/:productId', analyticsController.trackProductView);
router.post('/track/store/:merchantId', analyticsController.trackStoreVisit);
router.post('/search', analyticsController.trackSearchTerm);

// Protected analytics routes
router.get('/merchant-stats', authenticateMerchant, analyticsController.getMerchantAnalytics);

module.exports = router;