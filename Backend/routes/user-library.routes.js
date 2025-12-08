const express = require('express');
const router = express.Router();
const userLibraryController = require('../controllers/user-library.controller');

// Middleware
const verifyToken = require('../middleware/auth.middleware');

// Public route for preview access (no authentication required)
router.get('/public-check-access/:ebookId', userLibraryController.checkPublicAccess);

// All routes below require authentication
router.get('/', verifyToken, userLibraryController.getUserLibrary);
router.post('/add', verifyToken, userLibraryController.addToLibrary);
router.get('/check-access/:ebookId', verifyToken, userLibraryController.checkAccess);
router.delete('/:ebookId', verifyToken, userLibraryController.removeFromLibrary);

module.exports = router;
