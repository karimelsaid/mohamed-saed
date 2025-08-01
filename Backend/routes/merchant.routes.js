const express = require('express');
const router = express.Router();
const merchantController = require('../controllers/merchant.controller');

// Merchant registration route with logo upload
router.post('/register', merchantController.upload.single('logo'), merchantController.registerMerchant);

module.exports = router;
