const express = require('express');
const router = express.Router();
const printController = require('../controllers/print.controller');

// POST /api/print/upload
router.post('/upload', printController.uploadPrintProjects);

// GET /api/print/all-print-orders
router.get('/all-print-orders', printController.getAllPrintOrders);

// New route to download a file associated with a print order
router.get('/download-file/:userId/:orderId/:fileIndex', printController.downloadPrintFile);

// New route to update print order status
router.patch('/update-status/:userId/:orderId', printController.updatePrintOrderStatus);

// Route to update final price of a print order project
router.patch('/update-final-price/:userId/:orderId/:projectIndex', printController.updateFinalPrice);

module.exports = router;
