const express = require('express');
const router = express.Router();
const amazonOrdersController = require('../controllers/amazon-orders.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

// All Amazon order routes require authentication
router.use(authMiddleware);

// Orders List & Sync
router.get('/', amazonOrdersController.getOrders);
router.post('/sync', amazonOrdersController.syncOrders);

// Single Order Operations
router.get('/:id', amazonOrdersController.getOrderDetails);
router.post('/:id/handover-slots', amazonOrdersController.getHandoverSlots);
router.post('/:id/schedule', amazonOrdersController.scheduleOrder);
router.post('/:id/confirm-shipment', amazonOrdersController.confirmShipment);
router.get('/:id/label', amazonOrdersController.getLabel);

module.exports = router;
