const User = require('../models/User.model');
const Product = require('../models/Product.model');

exports.submitOrder = async (req, res) => {
  try {
    const { userId, products, totalAmount, shippingCost, preparationTime: reqPreparationTime, merchantId } = req.body;

    if (!userId || !products || !totalAmount) {
      return res.status(400).json({ message: 'Missing required fields: userId, products, totalAmount' });
    }

    // Validate products array structure
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: 'Products must be a non-empty array' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const shippingAddress = {
      governorate: user.governorate,
      city: user.city,
      village: user.village,
      phone: user.phone
    };

    // Get preparationTime from request, or from merchant if merchantId provided
    let preparationTime = reqPreparationTime || 1;
    if (!reqPreparationTime && merchantId) {
      try {
        const merchant = await User.findById(merchantId);
        if (merchant && merchant.preparationTime) {
          preparationTime = merchant.preparationTime;
        }
      } catch (err) {
        console.warn('Error fetching merchant preparation time:', err.message);
      }
    }

    // Ensure products match schema structure
    const validatedProducts = products.map(product => ({
      bookId: product.bookId || product.book || '',
      bookName: product.bookName || product.book || '',
      quantity: product.quantity || 1,
      price: product.price || 0
    }));

    const newOrder = {
      date: new Date(),
      preparationTime,
      products: validatedProducts,
      totalAmount,
      shippingCost: shippingCost || 0,
      shippingAddress,
      status: 'قيد الإنتظار'
    };

    user.orders.push(newOrder);
    await user.save();

    // Get the _id of the newly added order subdocument
    const addedOrder = user.orders[user.orders.length - 1];

    res.status(201).json({
      message: 'Order submitted successfully',
      orderId: addedOrder._id
    });
  } catch (error) {
    console.error('Error submitting order:', error);
    res.status(500).json({
      message: 'حدث خطأ أثناء إتمام الشراء، يرجى المحاولة مرة أخرى',
      error: error.message
    });
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('orders');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Transform orders to replace product.book with product.bookName or product.bookId
    const transformedOrders = user.orders.map(order => {
      const transformedProducts = order.products.map(product => ({
        book: product.bookName ? product.bookName : product.book,
        bookId: product.bookId || '',  // Added bookId here for frontend
        quantity: product.quantity
      }));
      return {
        _id: order._id,
        products: transformedProducts,
        printProjects: order.printProjects || [], // Include printProjects in response
        status: order.status,
        orderDate: order.date,
        totalAmount: order.totalAmount,  // Added totalAmount here
      };
    });

    res.status(200).json(transformedOrders);
  } catch (error) {
    res.status(500).json({
      message: 'Error getting orders',
      error: error.message
    });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const { merchantId } = req.query;
    const users = await User.find().select('orders username email phone');
    let allOrders = [];
    users.forEach(user => {
      user.orders.forEach(order => {
        order.products.forEach(product => {
          allOrders.push({
            _id: order._id,
            book: product.bookName ? product.bookName : product.bookId,
            customerName: user.username,
            email: user.email,
            quantity: product.quantity,
            address: `${order.shippingAddress.governorate}, ${order.shippingAddress.city}, ${order.shippingAddress.village},Phone: ${order.shippingAddress.phone}`, // Add this line
            status: order.status,
            orderDate: order.date,
            totalAmount: order.totalAmount,  // Added totalAmount here
            isMerchantOrder: false // default
          });
        });
      });
    });

    // Always fetch products with merchantId to set isMerchantOrder
    const productsWithMerchant = await Product.find({ merchantId: { $exists: true, $ne: null } }).select('product_name product_image merchantId');

    allOrders.forEach(order => {
      const book = order.book;
      const product = productsWithMerchant.find(p => p.product_name === book || (p.product_image && p.product_image.replace('.webp', '') === book));
      if (product) {
        order.isMerchantOrder = true;
      }
    });

    res.status(200).json(allOrders);
  } catch (error) {
    res.status(500).json({
      message: 'Error getting all orders',
      error: error.message
    });
  }
};

// updateOrderStatus
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    // Find the user who has this order
    const user = await User.findOne({ 'orders._id': orderId });
    if (!user) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Update the order status
    const order = user.orders.id(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found in user orders' });
    }

    // Validate status value
    const validStatuses = ['قيد الإنتظار', 'تم الإلغاء', 'تم الشحن', 'تم الاستلام', 'تم التسليم'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    order.status = status;

    // Clear paymentSessionUrl if order is cancelled or completed
    if (status === 'تم الإلغاء' || status === 'تم التسليم') {
      order.paymentSessionUrl = null;
    }

    // Create notification message based on status
    let notificationMessage = '';
    switch (status) {
      case 'تم الشحن':
        notificationMessage = `تم شحن الطلب رقم ${orderId}`;
        break;
      case 'تم الاستلام':
        notificationMessage = `تم استلام الطلب رقم ${orderId} من التاجر`;
        break;
      case 'تم التسليم':
        notificationMessage = `تم تسليم الطلب رقم ${orderId}`;
        break;
      case 'تم الإلغاء':
        notificationMessage = `تم إلغاء الطلب رقم ${orderId}`;
        break;
      default:
        notificationMessage = `تم تحديث حالة الطلب رقم ${orderId} إلى ${status}`;
    }

    // Add notification to user
    user.notifications.push({
      message: notificationMessage,
      type: 'order',
      read: false,
      createdAt: new Date(),
      relatedId: orderId
    });

    await user.save({ validateBeforeSave: false });

    res.status(200).json({ message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Error updating order status:', error); // Detailed error logging
    res.status(500).json({
      message: 'Error updating order status',
      error: error.message
    });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Find the user who has this order
    const user = await User.findOne({ 'orders._id': orderId });
    if (!user) {
      console.error('User not found for order ID:', orderId); // Log for debugging
      return res.status(404).json({ message: 'Order not found' });
    }

    // Find the index of the order to be deleted
    const orderIndex = user.orders.findIndex(order => order._id.toString() === orderId);
    if (orderIndex === -1) {
      console.error('Order not found in user orders for order ID:', orderId); // Log for debugging
      return res.status(404).json({ message: 'Order not found in user orders' });
    }

    // Remove the order from the user's orders
    user.orders.splice(orderIndex, 1);
    await user.save();

    res.status(200).json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error); // Log the error for debugging
    res.status(500).json({
      message: 'Error deleting order',
      error: error.message
    });
  }
};
