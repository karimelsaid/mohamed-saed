const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/orders.controller');

// Submit new order
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

module.exports = router;
