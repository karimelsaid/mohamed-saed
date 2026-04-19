const express = require('express');
const router = express.Router();
const automationController = require('../controllers/automation.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware'); // Assuming these exist

// Admin facing routes (Dashboard)
// router.get('/dashboard', verifyToken, isAdmin, automationController.getDashboardData);
// router.patch('/settings', verifyToken, isAdmin, automationController.updateSettings);
// router.get('/logs', verifyToken, isAdmin, automationController.getLogs);

// Temporary routes without auth for initial testing with n8n (need to secure later)
router.get('/dashboard', automationController.getDashboardData);
router.patch('/settings', automationController.updateSettings);
router.get('/logs', automationController.getLogs);

// n8n bridge routes
// receive logging from n8n
router.post('/log', automationController.receiveLog);
// n8n fetches random product
router.get('/random-product', automationController.getRandomProduct);

module.exports = router;
