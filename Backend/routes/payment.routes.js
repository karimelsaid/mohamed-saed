const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

router.post('/create-payment', paymentController.createPaymentSession);
router.post('/create-subscription-payment', paymentController.createSubscriptionPaymentSession);
router.get('/verify-payment', paymentController.verifyPayment);
router.get('/verify-order-payment', paymentController.verifyOrderPayment);

module.exports = router;
