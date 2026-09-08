const express = require('express');
const router = express.Router();
const partnerController = require('../controllers/partnerController');
const authMiddleware = require('../middleware/auth.middleware');

// Public route to get current partnership terms
router.get('/settings', partnerController.getSettings);

// Protected routes (requires user to be logged in)
router.use(authMiddleware);

router.post('/apply', partnerController.applyForPartnership);
router.get('/dashboard', partnerController.getMyDashboard);

module.exports = router;
