const express = require('express');
const router = express.Router();
const bourseController = require('../controllers/bourse.controller');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');

// Public endpoints
router.get('/current', bourseController.getCurrentOffer);
router.get('/active', bourseController.getCurrentOffer);

// Admin endpoints
router.get('/settings', authMiddleware, adminMiddleware, bourseController.getBourseSettings);
router.post('/settings', authMiddleware, adminMiddleware, bourseController.updateBourseSettings);
router.get('/today', authMiddleware, adminMiddleware, bourseController.getTodayOffersAdmin);

module.exports = router;
