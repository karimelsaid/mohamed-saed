const express = require('express');
const router = express.Router();
const shippingSettingController = require('../controllers/shipping-setting.controller');
// Assume verifyToken or similar middleware exists in the project
// const { verifyToken, isAdmin } = require('../middleware/auth'); 

router.get('/', shippingSettingController.getSettings);
router.post('/', shippingSettingController.updateSettings);

module.exports = router;
