const express = require('express');
const router = express.Router();
const quickActionsController = require('../controllers/quick-actions.controller');

/**
 * Quick Actions Routes
 * Provides smart quick actions to reduce AI token consumption
 */

// Get all quick actions (default + categories + personalized)
router.get('/all', quickActionsController.getAllQuickActions);

// Get personalized quick actions for user
router.get('/personalized', quickActionsController.getPersonalizedActions);

// Get all categories from MongoDB
router.get('/categories', quickActionsController.getCategories);

// Get top selling books (MongoDB direct)
router.get('/top-selling', quickActionsController.getTopSelling);

// Get newest books (MongoDB direct)
router.get('/newest', quickActionsController.getNewestBooks);

// Search books by category (MongoDB direct)
router.get('/category/:category', quickActionsController.searchByCategory);

// Smart search (MongoDB direct)
router.get('/search', quickActionsController.smartSearch);

module.exports = router;
