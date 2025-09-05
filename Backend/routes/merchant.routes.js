const express = require('express');
const router = express.Router();
const merchantController = require('../controllers/merchant.controller');
const merchantAuthController = require('../controllers/merchant.auth.controller');
const authenticateMerchant = require('../middleware/merchant.auth');

// Public routes
router.post('/register', merchantController.upload.single('logo'), merchantController.registerMerchant);
router.post('/login', merchantAuthController.loginMerchant);
router.post('/logout', merchantAuthController.logoutMerchant);

// Protected routes
router.get('/current', authenticateMerchant, merchantController.getCurrentMerchant);
router.get('/products', authenticateMerchant, merchantController.getMerchantProducts);
router.get('/orders', authenticateMerchant, merchantController.getMerchantOrders);
router.post('/products', authenticateMerchant, merchantController.productUpload.single('product_image'), merchantController.addProduct);

module.exports = router;
