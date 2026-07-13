const express = require('express');
const router = express.Router();
console.log('✅ [OrdersRoutes] File loaded and router initialized');
const ordersController = require('../controllers/orders.controller');
const { verifyN8nToken } = require('../middleware/auth.middleware');

// Submit new order
router.get('/ping-test', ordersController.pingOrders);
router.post('/submit', ordersController.submitOrder);

// Get user orders
router.get('/user-orders/:userId', ordersController.getUserOrders);

// Get all orders (admin)
router.get('/all', ordersController.getAllOrders);

 // Delete order by ID
router.delete('/delete/:orderId', ordersController.deleteOrder);

// Bulk delete orders
router.delete('/bulk-delete', ordersController.bulkDeleteOrders);

// Update order status by ID
router.patch('/update-status/:orderId', ordersController.updateOrderStatus);

// Internal endpoint for Amazon integration
router.post('/from-amazon', verifyN8nToken, ordersController.createOrderFromAmazon);

module.exports = router;
