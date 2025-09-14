const express = require('express');
const router = express.Router();
const merchantController = require('../controllers/merchant.controller');
const merchantAuthController = require('../controllers/merchant.auth.controller');
const authenticateMerchant = require('../middleware/merchant.auth');

// Public routes
router.post('/register', merchantController.upload.single('logo'), merchantController.registerMerchant);
router.post('/login', merchantAuthController.loginMerchant);
router.post('/logout', merchantAuthController.logoutMerchant);

// Protected routes (must come before parameterized routes)
router.get('/current', authenticateMerchant, merchantController.getCurrentMerchant);
router.put('/profile', authenticateMerchant, merchantController.upload.single('logo'), merchantController.updateMerchantProfile);
router.get('/products', authenticateMerchant, merchantController.getMerchantProducts);
router.get('/orders', authenticateMerchant, merchantController.getMerchantOrders);
router.post('/products', authenticateMerchant, merchantController.productUpload.single('image'), merchantController.addProduct);
router.delete('/products/:productId', authenticateMerchant, merchantController.deleteProduct);
router.post('/products/:productId/update-request', authenticateMerchant, merchantController.submitProductUpdateRequest);
router.get('/update-requests', authenticateMerchant, merchantController.getMerchantUpdateRequests);

// Parameterized routes (must come last)
router.get('/:id/products', merchantController.getProductsByMerchantId);
router.get('/:id', merchantController.getMerchantById);

module.exports = router;
