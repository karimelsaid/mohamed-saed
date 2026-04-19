const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authenticateAdmin = require('../middleware/admin.auth');

// Publicly accessible stats (no admin auth required)
router.get('/donation-stats', adminController.getDonationStats);
router.get('/stats', adminController.getStats);

// Apply authentication to all other admin routes
router.use(authenticateAdmin);

// Route to get global platform analytics
router.get('/analytics', adminController.getAdminGlobalAnalytics);

// Route to get all urgency requests
router.get('/urgency-requests', adminController.getAllUrgencyRequests);

// Route to update urgency request status
router.patch('/urgency-requests/:requestId', adminController.updateUrgencyRequestStatus);

// Route to delete urgency request
router.delete('/urgency-requests/:requestId', adminController.deleteUrgencyRequest);

// Route to add new product with image upload
router.post('/add-product', adminController.upload.array('image', 3), adminController.addProduct);

// Route to list all products
router.get('/products', adminController.listProducts);

// Route to update product details
router.patch('/products/:barcode', adminController.updateProduct);

// Route to replace product image
router.post('/products/:barcode/image', adminController.upload.single('image'), adminController.replaceProductImage);

// Route to replace product EPUB
router.post('/products/:barcode/epub', adminController.upload.single('epub'), adminController.replaceProductEpub);

// Route to delete product
router.delete('/products/:barcode', adminController.deleteProduct);

// Route to bulk delete products
router.delete('/products', adminController.bulkDeleteProducts);

// Route to sync output.json to Excel and upload to Google Drive
router.post('/sync-json-to-excel', adminController.syncJsonToExcel);

// New route to sync output.json to Google Sheets
router.post('/sync-json-to-google-sheets', async (req, res) => {
  try {
    await adminController.updateGoogleSheetFromJson();
    res.json({ success: true, message: 'Google Sheets updated from output.json.' });
  } catch (error) {
    console.error('Error syncing JSON to Google Sheets:', error);
    res.status(500).json({ success: false, message: 'Failed to update Google Sheets from output.json.' });
  }
});

// New route for batch update products
router.post('/products/batch-update', adminController.batchUpdateProducts);

// New route to import products from Google Sheets to MongoDB
router.post('/import-products-from-sheets', adminController.importProductsFromSheets);

// New route to export existing customers to Google Sheets
router.post('/export-users-to-sheets', adminController.exportUsersToSheets);



// New route for bulk price adjustment
router.post('/products/bulk-adjust', adminController.bulkAdjustPrices);

// New route to update promotion start and end dates and update Excel/output.json
router.post('/update-promotion-dates', adminController.updatePromotionDates);

// New route to get current promotion dates
router.get('/promotion-dates', adminController.getPromotionDates);

router.get('/merchants', adminController.listMerchants);
router.patch('/merchants/:merchantId/approval', adminController.updateMerchantApproval);
router.patch('/merchants/:merchantId/suspension', adminController.updateMerchantSuspension);
router.get('/merchants/:merchantId/products', adminController.getMerchantProductsByMerchant);
router.get('/merchant-products', adminController.listMerchantProducts);
router.patch('/products/:productId/approval', adminController.updateProductApproval);

router.get('/free-shipping-rules', adminController.getFreeShippingRules);
router.post('/free-shipping-rules', adminController.saveFreeShippingRules);

router.get('/product-update-requests', adminController.getProductUpdateRequests);
router.patch('/product-update-requests/:requestId', adminController.updateProductUpdateRequest);

// Route to get all payment requests
router.get('/payment-requests', adminController.getPaymentRequests);
router.patch('/payment-requests/:requestId', adminController.updatePaymentRequestStatus);

// Route to get user hierarchy
router.get('/user-hierarchy', adminController.userHierarchy);

// 🛒 Manual Sales & Inventory Recording
router.post('/register-sale', adminController.registerSale);
router.get('/sales-history', adminController.getSalesHistory);
router.delete('/sales-history/:saleId', adminController.deleteSale);

// 📊 Shortages & Reports
router.get('/shortage-settings', adminController.getShortageSettings);
router.get('/shortages-report', adminController.getShortagesReport);
router.patch('/shortage-settings', adminController.updateShortageSettings);
router.get('/economy-settings', adminController.getEconomySettings);
router.patch('/economy-settings', adminController.updateEconomySettings);

module.exports = router;
