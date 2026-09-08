const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authenticateAdmin = require('../middleware/admin.auth');
const verifyStaffPermission = require('../middleware/staff-permissions.middleware');

// Publicly accessible stats (no admin auth required)
router.get('/donation-stats', adminController.getDonationStats);
router.get('/stats', adminController.getStats);

// Apply authentication to all other admin routes
router.use(authenticateAdmin);

// Route to get global platform analytics
router.get('/analytics', verifyStaffPermission('userIntelligence'), adminController.getAdminGlobalAnalytics);

// Route to get all urgency requests
router.get('/urgency-requests', verifyStaffPermission('orders'), adminController.getAllUrgencyRequests);

// Route to update urgency request status
router.patch('/urgency-requests/:requestId', verifyStaffPermission('orders'), adminController.updateUrgencyRequestStatus);

// Route to delete urgency request
router.delete('/urgency-requests/:requestId', verifyStaffPermission('orders'), adminController.deleteUrgencyRequest);

// Route to add new product with image upload
router.post('/add-product', verifyStaffPermission('addProduct'), adminController.upload.array('image', 3), adminController.addProduct);

// Route to bulk add products from Excel
router.post('/bulk-add-products', verifyStaffPermission('addProduct'), adminController.upload.single('publisherImage'), adminController.bulkAddProducts);

// Route to list all products
router.get('/products', verifyStaffPermission('products'), adminController.listProducts);

// Route to get all filter options (publishers, categories, merchants) from the full product list
router.get('/filter-options', adminController.getFilterOptions);

// New route for batch update products (must come before :barcode route)
router.post('/products/batch-update', verifyStaffPermission('products'), adminController.batchUpdateProducts);

// New route for bulk update products by IDs (must come before :barcode route)
router.patch('/products/bulk-update', verifyStaffPermission('products'), adminController.bulkUpdateProductsByIds);

// Route to update product details
router.patch('/products/:barcode', verifyStaffPermission('products'), adminController.updateProduct);

// Route to replace product image
router.post('/products/:barcode/image', verifyStaffPermission('products'), adminController.upload.single('image'), adminController.replaceProductImage);

// Route to replace product EPUB and Cover
router.post('/products/:barcode/epub', verifyStaffPermission('products'), adminController.upload.fields([
  { name: 'epub', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]), adminController.replaceProductEpub);

// Route to create a new digital book (Product + Ebook)
router.post('/create-digital-book', verifyStaffPermission('ebooks'), adminController.upload.fields([
  { name: 'epub', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]), adminController.createDigitalBook);

// Route to delete product
router.delete('/products/:barcode', verifyStaffPermission('products'), adminController.deleteProduct);

// Route to bulk delete products
router.delete('/products', verifyStaffPermission('products'), adminController.bulkDeleteProducts);

// Route to sync output.json to Excel and upload to Google Drive
router.post('/sync-json-to-excel', verifyStaffPermission('products'), adminController.syncJsonToExcel);

// New route to sync output.json to Google Sheets
router.post('/sync-json-to-google-sheets', verifyStaffPermission('products'), async (req, res) => {
  try {
    await adminController.updateGoogleSheetFromJson();
    res.json({ success: true, message: 'Google Sheets updated from output.json.' });
  } catch (error) {
    console.error('Error syncing JSON to Google Sheets:', error);
    res.status(500).json({ success: false, message: 'Failed to update Google Sheets from output.json.' });
  }
});

// New route to import products from Google Sheets to MongoDB
router.post('/import-products-from-sheets', verifyStaffPermission('products'), adminController.importProductsFromSheets);

// New route to export existing customers to Google Sheets
router.post('/export-users-to-sheets', verifyStaffPermission('userIntelligence'), adminController.exportUsersToSheets);



// New route for bulk price adjustment
router.post('/products/bulk-adjust', verifyStaffPermission('products'), adminController.bulkAdjustPrices);

// New route to update promotion start and end dates and update Excel/output.json
router.post('/update-promotion-dates', verifyStaffPermission('promotionDates'), adminController.updatePromotionDates);

// New route to get current promotion dates
router.get('/promotion-dates', verifyStaffPermission('promotionDates'), adminController.getPromotionDates);

router.get('/merchants', verifyStaffPermission('merchants'), adminController.listMerchants);
router.patch('/merchants/:merchantId/approval', verifyStaffPermission('merchants'), adminController.updateMerchantApproval);
router.patch('/merchants/:merchantId/suspension', verifyStaffPermission('merchants'), adminController.updateMerchantSuspension);
router.get('/merchants/:merchantId/products', verifyStaffPermission('merchants'), adminController.getMerchantProductsByMerchant);
router.get('/merchant-products', verifyStaffPermission('merchants'), adminController.listMerchantProducts);
router.patch('/products/:productId/approval', verifyStaffPermission('productApproval'), adminController.updateProductApproval);

router.get('/free-shipping-rules', verifyStaffPermission('freeShippingRules'), adminController.getFreeShippingRules);
router.post('/free-shipping-rules', verifyStaffPermission('freeShippingRules'), adminController.saveFreeShippingRules);

router.get('/product-update-requests', verifyStaffPermission('productApproval'), adminController.getProductUpdateRequests);
router.patch('/product-update-requests/:requestId', verifyStaffPermission('productApproval'), adminController.updateProductUpdateRequest);

// Route to get all payment requests
router.get('/payment-requests', verifyStaffPermission('paymentRequests'), adminController.getPaymentRequests);
router.patch('/payment-requests/:requestId', verifyStaffPermission('paymentRequests'), adminController.updatePaymentRequestStatus);

// Route to get user hierarchy
router.get('/user-hierarchy', verifyStaffPermission('userHierarchy'), adminController.userHierarchy);

// 🛒 Manual Sales & Inventory Recording
router.post('/register-sale', verifyStaffPermission('salesRegistration'), adminController.registerSale);
router.get('/sales-history', verifyStaffPermission('salesHistory'), adminController.getSalesHistory);
router.delete('/sales-history/:saleId', verifyStaffPermission('salesHistory'), adminController.deleteSale);

// 📊 Shortages & Reports
router.get('/shortage-settings', verifyStaffPermission('shortagesReport'), adminController.getShortageSettings);
router.get('/shortages-report', verifyStaffPermission('shortagesReport'), adminController.getShortagesReport);
router.patch('/shortage-settings', verifyStaffPermission('shortagesReport'), adminController.updateShortageSettings);
router.get('/economy-settings', verifyStaffPermission('gamificationControl'), adminController.getEconomySettings);
router.patch('/economy-settings', verifyStaffPermission('gamificationControl'), adminController.updateEconomySettings);
router.get('/staff', adminController.listStaff);
router.post('/staff/promote', adminController.promoteToStaff);
router.post('/staff/demote', adminController.demoteFromStaff);
router.patch('/staff/permissions', adminController.updateStaffPermissions);
// Marketers
router.get('/marketers', verifyStaffPermission('marketers'), adminController.listMarketers);
router.post('/marketers/promote', adminController.promoteToMarketer);
router.patch('/marketers/:userId/config', verifyStaffPermission('marketers'), adminController.updateMarketerConfig);
router.post('/marketers/:userId/tasks', verifyStaffPermission('marketers'), adminController.assignMarketerTask);
router.post('/marketers/prizes/add', verifyStaffPermission('marketers'), adminController.addMarketerPrize);
router.post('/marketers/prizes/remove', verifyStaffPermission('marketers'), adminController.removeMarketerPrize);

// Global Prizes for all marketers
router.get('/marketers/global-prizes', verifyStaffPermission('marketers'), adminController.getGlobalPrizes);
router.post('/marketers/global-prizes/add', verifyStaffPermission('marketers'), adminController.addGlobalPrize);
router.delete('/marketers/global-prizes/:prizeId', verifyStaffPermission('marketers'), adminController.removeGlobalPrize);

module.exports = router;
