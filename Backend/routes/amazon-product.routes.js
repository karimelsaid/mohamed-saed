const express = require('express');
const router = express.Router();
const amazonProductController = require('../controllers/amazon-product.controller');
const amazonCatalogController = require('../controllers/amazon-product-catalog.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

// Admin routes for Amazon product operations
router.post('/products/:id/amazon/publish', authMiddleware, amazonProductController.publish);
router.post('/products/:id/amazon/sync', authMiddleware, amazonProductController.sync);
router.get('/products/:id/amazon/status', authMiddleware, amazonProductController.status);
router.post('/products/:id/amazon/retry', authMiddleware, amazonProductController.retry);
router.get('/products', authMiddleware, amazonProductController.list);
router.get('/amazon/jobs/:jobId/progress', authMiddleware, amazonProductController.jobProgress);

// Catalog routes for Amazon product management
router.get('/catalog', authMiddleware, amazonCatalogController.getCatalog);
router.put('/products/:id/update', authMiddleware, amazonCatalogController.updateProductData);
router.post('/products/:id/republish', authMiddleware, amazonCatalogController.republishProduct);
router.post('/products/:id/repair', authMiddleware, amazonCatalogController.repairAndReactivate);
router.get('/products/:id/details', authMiddleware, amazonCatalogController.getProductDetails);
router.post('/products/bulk/status', authMiddleware, amazonCatalogController.bulkUpdateStatus);
router.post('/products/bulk/sync', authMiddleware, amazonCatalogController.syncAll);
router.post('/products/bulk/price', authMiddleware, amazonCatalogController.bulkUpdatePrice);
router.post('/catalog/sync-deleted', authMiddleware, amazonCatalogController.syncDeletedListings);
router.post('/catalog/remove/:id', authMiddleware, amazonCatalogController.removeFromCatalog);

// Public route for Amazon to download images as JPEG
router.get('/image-proxy', amazonProductController.imageProxy);
router.get('/image-proxy/:filename', amazonProductController.imageProxy);

module.exports = router;
