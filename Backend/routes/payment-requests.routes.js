const express = require('express');
const router = express.Router();
const paymentRequestsController = require('../controllers/payment-requests.controller');

// User route to request payment
router.post('/request', paymentRequestsController.requestPayment);

// Admin route to get all payment requests
router.get('/', paymentRequestsController.getAllPaymentRequests);

// Admin route to update a payment request status
router.patch('/:requestId', paymentRequestsController.updatePaymentRequestStatus);

module.exports = router;
