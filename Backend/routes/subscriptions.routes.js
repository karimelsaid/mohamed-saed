const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');

// Middleware
const verifyToken = require('../middleware/auth.middleware');
const verifyAdmin = require('../middleware/admin.middleware');

// User routes
router.get('/status', verifyToken, subscriptionController.getSubscriptionStatus);
router.post('/subscribe', verifyToken, subscriptionController.subscribe);
router.post('/activate/:subscriptionId', verifyToken, subscriptionController.activateSubscription);
router.post('/renew', verifyToken, subscriptionController.renewSubscription);
router.post('/cancel', verifyToken, subscriptionController.cancelSubscription);

// Admin routes
router.get('/all', verifyToken, verifyAdmin, subscriptionController.getAllSubscriptions);

module.exports = router;
