const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');

// Public route to get VAPID key (needed for frontend subscription)
router.get('/public-key', notificationController.getPublicKey);

// Library content for Admin
router.get('/library', [authMiddleware, adminMiddleware], notificationController.getLibrary);

// Protected User Routes
router.post('/subscribe', authMiddleware, notificationController.subscribe);
router.post('/unsubscribe', authMiddleware, notificationController.unsubscribe);

// Admin Routes
router.post('/admin/send', [authMiddleware, adminMiddleware], notificationController.sendAdminNotification);

module.exports = router;
