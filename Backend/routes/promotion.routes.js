const express = require('express');
const router = express.Router();
const promotionController = require('../controllers/promotion.controller');

// --- User routes ---
router.get('/active-theme', promotionController.getActivePromotion);
router.post('/wheel/spin', promotionController.spinLuckyWheel);
router.post('/calculate-offer', promotionController.getDynamicOffer);
router.post('/validate-coupon', promotionController.validateCoupon);

// --- Admin: Theme Management ---
router.get('/themes', promotionController.getAllThemes);
router.post('/themes', promotionController.createTheme);
router.put('/themes/:id', promotionController.updateTheme);
router.patch('/themes/:id/toggle', promotionController.toggleTheme);

// --- Admin: Coupon Management ---
router.get('/coupons', promotionController.getAllCoupons);
router.post('/coupons', promotionController.createCoupon);
router.put('/coupons/:id', promotionController.updateCoupon);
router.delete('/coupons/:id', promotionController.deleteCoupon);

// --- Admin: Package Management ---
router.get('/packages', promotionController.getAllPackages);
router.post('/packages', promotionController.createPackage);
router.delete('/packages/:id', promotionController.deletePackage);

// --- Admin: Wheel Config ---
router.get('/wheel-config', promotionController.getWheelConfig);
router.put('/wheel-config', promotionController.updateWheelConfig);

// --- Hero Slider Management ---
router.get('/hero-slides', promotionController.getHeroSlides);
router.post('/hero-slides', promotionController.createHeroSlide);
router.post('/hero-slides/upload', promotionController.uploadHeroImage);
router.delete('/hero-slides/:id', promotionController.deleteHeroSlide);
router.get('/hero-config', promotionController.getHeroConfig);
router.get('/hero-books', promotionController.getHeroBooks);

module.exports = router;
