const express = require('express');
const router = express.Router();
const specialOffersController = require('../controllers/special-offers.controller');
const verifyToken = require('../middleware/auth.middleware');
const verifyAdmin = require('../middleware/admin.middleware');

// Public User Routes
router.get('/check', verifyToken, specialOffersController.checkMyOffer);
router.post('/acknowledge', verifyToken, specialOffersController.acknowledgeOffer);

// Admin Routes
router.get('/admin/all', verifyToken, verifyAdmin, specialOffersController.getAllOffers);
router.post('/admin/add', verifyToken, verifyAdmin, specialOffersController.addOffer);
router.delete('/admin/:id', verifyToken, verifyAdmin, specialOffersController.deleteOffer);

module.exports = router;
