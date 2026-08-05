const express = require('express');
const router = express.Router();
const amazonOAuthController = require('../controllers/amazon-oauth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

// Public callback endpoint registered with Amazon Seller Central Portal
router.get('/callback', (req, res) => amazonOAuthController.handleOAuthCallback(req, res));

// Admin protected endpoints
router.post('/auth-url', authMiddleware, (req, res) => amazonOAuthController.generateAuthUrl(req, res));
router.get('/merchants', authMiddleware, (req, res) => amazonOAuthController.getMerchantAccounts(req, res));
router.delete('/merchants/:id', authMiddleware, (req, res) => amazonOAuthController.unlinkMerchantAccount(req, res));

module.exports = router;
