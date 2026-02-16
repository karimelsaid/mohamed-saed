const express = require('express');
const router = express.Router();
const readingProgressController = require('../controllers/reading-progress.controller');

// Middleware
const verifyToken = require('../middleware/auth.middleware');

// All routes require authentication
router.get('/:ebookId', verifyToken, readingProgressController.getProgress);
router.put('/:ebookId', verifyToken, readingProgressController.updateProgress);
router.put('/:ebookId/settings', verifyToken, readingProgressController.updateSettings);

// Bookmarks
router.get('/:ebookId/bookmarks', verifyToken, readingProgressController.getBookmarks);
router.post('/:ebookId/bookmarks', verifyToken, readingProgressController.addBookmark);
router.delete('/:ebookId/bookmarks/:bookmarkId', verifyToken, readingProgressController.removeBookmark);

// Highlights
router.get('/:ebookId/highlights', verifyToken, readingProgressController.getHighlights);
router.post('/:ebookId/highlights', verifyToken, readingProgressController.addHighlight);
router.delete('/:ebookId/highlights/:highlightId', verifyToken, readingProgressController.removeHighlight);

module.exports = router;
