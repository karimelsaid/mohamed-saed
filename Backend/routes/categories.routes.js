const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categories.controller');
const verifyAdmin = require('../middleware/admin.middleware');
const verifyToken = require('../middleware/auth.middleware');

// Public route to get all categories
router.get('/', categoriesController.getAllCategories);

// Admin routes for category management
router.post('/', verifyToken, verifyAdmin, categoriesController.createCategory);
router.put('/:id', verifyToken, verifyAdmin, categoriesController.updateCategory);
router.delete('/:id', verifyToken, verifyAdmin, categoriesController.deleteCategory);

module.exports = router;
