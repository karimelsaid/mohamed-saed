const express = require('express');
const router = express.Router();
const affiliateController = require('../controllers/affiliate.controller');

// Affiliate click tracking & link generation endpoints
router.post('/track-click', affiliateController.trackClick);
router.get('/link/:productId', affiliateController.getAffiliateLink);
router.get('/redirect/:productId', affiliateController.redirectAffiliateLink);

module.exports = router;
