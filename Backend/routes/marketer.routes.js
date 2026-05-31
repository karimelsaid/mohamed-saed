const express = require('express');
const router = express.Router();
const marketerController = require('../controllers/marketer.controller');
const auth = require('../middleware/auth.middleware');
const verifyAdmin = require('../middleware/admin.middleware');

router.get('/p/:shortCode', marketerController.redirectShortLink);

router.get('/dashboard', auth, marketerController.getDashboardStats);
router.post('/apply', auth, marketerController.submitApplication);
router.get('/search-products', auth, marketerController.searchProducts);
router.post('/generate-link', auth, marketerController.generateLink);
router.get('/earnings', auth, marketerController.getEarningsHistory);
router.get('/opportunities', auth, marketerController.getMarketingOpportunities);
router.post('/prizes/:prizeId/claim', auth, marketerController.claimPrize);

// Admin Routes
router.get('/applications', auth, verifyAdmin, marketerController.getPendingApplications);
router.post('/applications/process', auth, verifyAdmin, marketerController.processApplication);

module.exports = router;
