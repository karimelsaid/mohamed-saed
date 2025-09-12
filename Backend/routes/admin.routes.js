const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authenticateAdmin = require('../middleware/admin.auth');

// Apply authentication to all admin routes
router.use(authenticateAdmin);

// Route to add new product with image upload
router.post('/add-product', adminController.upload.single('image'), adminController.addProduct);

// Route to list all products
router.get('/products', adminController.listProducts);

// Route to update product details
router.patch('/products/:barcode', adminController.updateProduct);

// Route to replace product image
router.post('/products/:barcode/image', adminController.upload.single('image'), adminController.replaceProductImage);

// Route to delete product
router.delete('/products/:barcode', adminController.deleteProduct);

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

module.exports = router;
