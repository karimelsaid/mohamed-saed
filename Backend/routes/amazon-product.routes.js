const express = require('express');
const router = express.Router();
const amazonProductController = require('../controllers/amazon-product.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

// Admin routes for Amazon product operations
router.post('/products/:id/amazon/publish', authMiddleware, amazonProductController.publish);
router.post('/products/:id/amazon/sync', authMiddleware, amazonProductController.sync);
router.get('/products/:id/amazon/status', authMiddleware, amazonProductController.status);
router.post('/products/:id/amazon/retry', authMiddleware, amazonProductController.retry);
router.get('/products', authMiddleware, amazonProductController.list);
router.get('/amazon/jobs/:jobId/progress', authMiddleware, amazonProductController.jobProgress);

// Public route for Amazon to download images as JPEG
router.get('/image-proxy', amazonProductController.imageProxy);
router.get('/image-proxy/:filename', amazonProductController.imageProxy);

module.exports = router;
