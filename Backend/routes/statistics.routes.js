const express = require('express');
const router = express.Router();
const Order = require('../models/Order.model');
const Product = require('../models/Product.model');
const User = require('../models/User.model');
const fs = require('fs');
const path = require('path');

// GET /api/statistics
// Get platform statistics for the premium achievements section
router.get('/', async (req, res) => {
  try {
    // 1. Get database order counts
    // Count all Order documents (excluding cancelled)
    const dbOrdersCount = await Order.countDocuments({ status: { $ne: 'cancelled' } });
    
    // Count all orders inside User documents
    const users = await User.find({}, 'orders').lean();
    let userOrdersCount = 0;
    let userOrdersQuantitySold = 0;
    users.forEach(user => {
      if (user.orders && Array.isArray(user.orders)) {
        userOrdersCount += user.orders.length;
        user.orders.forEach(order => {
          if (order.products && Array.isArray(order.products)) {
            order.products.forEach(p => {
              userOrdersQuantitySold += parseInt(p.quantity || p.product_quantity, 10) || 0;
            });
          }
        });
      }
    });

    // Count all items in Order documents
    const dbOrders = await Order.find({ status: { $ne: 'cancelled' } }, 'products').lean();
    let dbOrdersQuantitySold = 0;
    dbOrders.forEach(order => {
      if (order.products && Array.isArray(order.products)) {
        order.products.forEach(p => {
          dbOrdersQuantitySold += parseInt(p.product_quantity || p.quantity, 10) || 0;
        });
      }
    });

    // 2. Read sales_history.json safely
    const salesHistoryPath = path.join(__dirname, '..', 'sales_history.json');
    let salesHistory = [];
    if (fs.existsSync(salesHistoryPath)) {
      try {
        salesHistory = JSON.parse(fs.readFileSync(salesHistoryPath, 'utf-8'));
      } catch (e) {
        console.error('Error reading sales history file inside statistics route:', e.message);
      }
    }

    const historyOrdersCount = salesHistory.length;
    let historyQuantitySold = 0;
    const uniqueHistoryCustomers = new Set();
    let guestCustomerCount = 0;

    salesHistory.forEach(sale => {
      // Quantity sold
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach(item => {
          historyQuantitySold += parseInt(item.quantity, 10) || 0;
        });
      }

      // Unique customer calculation
      const phone = (sale.customerPhone || '').trim();
      const name = (sale.customerName || '').trim();
      if (phone && phone !== 'غير مسجل' && phone !== '01000000000') {
        uniqueHistoryCustomers.add(phone);
      } else if (name && name !== 'زبون نقدي' && name !== 'عميل خارجي') {
        uniqueHistoryCustomers.add(name);
      } else {
        guestCustomerCount++;
      }
    });

    const historyCustomersCount = uniqueHistoryCustomers.size + guestCustomerCount;

    // 3. Get database products count
    const productsCount = await Product.countDocuments();

    // 4. Get database customers count
    const dbCustomersCount = await User.countDocuments({ 
      $or: [
        { 'orders.0': { $exists: true } },
        { role: 'customer' }
      ]
    });

    // Calculate average rating from products
    const productsWithRatings = await Product.find({ 
      rating: { $exists: true, $ne: null, $ne: 0 }
    }).select('rating');
    
    let averageRating = 4.9; // Default rating
    if (productsWithRatings.length > 0) {
      const totalRating = productsWithRatings.reduce((sum, product) => sum + (product.rating || 0), 0);
      averageRating = (totalRating / productsWithRatings.length).toFixed(1);
    }

    // 5. Calculate cumulative stats adding base numbers
    const totalOrders = 4827 + dbOrdersCount + userOrdersCount + historyOrdersCount;
    const totalCustomers = 3500 + dbCustomersCount + historyCustomersCount;
    // products count increases with both catalog additions and sold products
    const totalProducts = 12000 + productsCount + historyQuantitySold + dbOrdersQuantitySold + userOrdersQuantitySold;

    const statistics = {
      orders: totalOrders,
      products: totalProducts,
      customers: totalCustomers,
      rating: parseFloat(averageRating),
      since: 2025
    };
    
    res.json(statistics);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.json({
      orders: 4827,
      products: 12000,
      customers: 3500,
      rating: 4.9,
      since: 2025
    });
  }
});

module.exports = router;
