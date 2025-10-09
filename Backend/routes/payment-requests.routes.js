const express = require('express');
const router = express.Router();
const paymentRequestsController = require('../controllers/payment-requests.controller');

// Admin route to update a payment request status
router.patch('/:requestId', paymentRequestsController.updatePaymentRequestStatus);

module.exports = router;
