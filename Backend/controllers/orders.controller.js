const User = require('../models/User.model');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product.model');
const Referral = require('../models/Referral.model');

exports.submitOrder = async (req, res) => {
  try {
    const { userId, products, totalAmount, shippingCost, preparationTime: reqPreparationTime, merchantId, isPickup, pickupLocation, isPostOffice, referralCode, bookId, address } = req.body;

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

    const postOffice = isPostOffice ? {
      governorate: req.body.postOfficeGovernorate,
      city: req.body.postOfficeCity,
      address: req.body.postOfficeAddress,
      name: req.body.postOfficeName
    } : null;

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

    // Wallet Discount Logic
    let walletDiscount = 0;
    let finalTotalAmount = totalAmount;

    if (req.body.useWallet && user.referralBalance > 0) {
      walletDiscount = Math.min(totalAmount, user.referralBalance);
      finalTotalAmount = totalAmount - walletDiscount;

      // Deduct from balance
      user.referralBalance -= walletDiscount;
    }

    const newOrder = {
      date: new Date(),
      preparationTime,
      products: validatedProducts,
      totalAmount: finalTotalAmount, // Final amount to pay
      subTotal: totalAmount, // Original amount (Items + Shipping)
      walletDiscount,
      shippingCost: shippingCost || 0,
      isPickup: isPickup || false,
      pickupLocation: isPickup ? pickupLocation : null,
      shippingAddress: isPickup ? null : shippingAddress,
      postOffice: isPostOffice ? postOffice : null,
      address: address ? address + ' - ' + user.phone : null,
      status: 'قيد الإنتظار'
    };

    user.orders.push(newOrder);
    await user.save();

    // Get the _id of the newly added order subdocument
    const addedOrder = user.orders[user.orders.length - 1];

    // Handle referral creation for this specific order
    if (referralCode && bookId) {
      const referrer = await User.findOne({ referralCode });
      // Ensure user is not referring themselves
      if (referrer && referrer._id.toString() !== userId.toString()) {

        let product;
        // Try finding by MongoDB's _id first (for merchant products)
        if (mongoose.Types.ObjectId.isValid(bookId)) {
          product = await Product.findById(bookId);
        }

        // If not found, try finding by products_id (for main excel products)
        if (!product) {
          product = await Product.findOne({ products_id: bookId });
        }

        // If still not found, check the output.json file
        if (!product) {
          try {
            const productsData = fs.readFileSync(path.join(__dirname, '..', 'output.json'), 'utf-8');
            const allProducts = JSON.parse(productsData);
            product = allProducts.find(p => p.products_id === bookId);
          } catch (fileError) {
            console.error('[Referral Submit] Error reading output.json:', fileError);
          }
        }
        if (!product) {
          // Continue without creating a referral, but don't block the order.
        } else {
          const newReferral = new Referral({
            referrerId: referrer._id,
            referredId: userId,
            bookId: product.products_id || bookId, // Use the original bookId (products_id)
            orderId: addedOrder._id, // Link referral to this specific order
            status: 'pending',
            earned: 0
          });
          await newReferral.save();
        }
      } else if (!referrer) {
        // console.log(`[Referral Submit] No referrer found for code: ${referralCode}`);
      } else {
      }
    }

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
    const { includeArchived } = req.query;
    const user = await User.findById(userId).select('orders');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Transform orders to replace product.book with product.bookName or product.bookId, filter out archived unless requested
    const transformedOrders = user.orders
      .filter(order => includeArchived === 'true' || order.status !== 'مؤرشف')
      .map(order => {
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
          paymentStatus: order.paymentStatus, // Added paymentStatus
        };
      });

    res.status(200).json(transformedOrders);
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({
      message: 'Error getting orders',
      error: error.message
    });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const { merchantId, includeArchived } = req.query;
    const users = await User.find().select('orders username email phone');
    let allOrders = [];
    users.forEach(user => {
      user.orders.forEach(order => {
        // Filter out archived orders unless explicitly requested
        if (includeArchived !== 'true' && order.status === 'مؤرشف') {
          return;
        }
        // Handle book products
        if (order.products && order.products.length > 0) {
          order.products.forEach(product => {
            allOrders.push({
              _id: order._id,
              book: product.bookName ? product.bookName : product.bookId,
              customerName: user.username,
              email: user.email,
              quantity: product.quantity,
              address: order.address || (() => {
                let baseAddress = '';
                if (order.isPickup) {
                  baseAddress = `استلام من المكتبة: ${order.pickupLocation}`;
                } else if (order.postOffice && order.postOffice.governorate) {
                  baseAddress = `شحن عبر مكاتب البريد: ${order.postOffice.governorate}, ${order.postOffice.city}, ${order.postOffice.address || ''}${order.postOffice.name ? ' - اسم المكتب: ' + order.postOffice.name : ''}`;
                } else { // delivery
                  const parts = [
                    order.shippingAddress?.governorate,
                    order.shippingAddress?.city,
                    order.shippingAddress?.village
                  ].filter(Boolean);
                  baseAddress = parts.length > 0 ? parts.join(', ') : '';
                }
                return baseAddress + (user.phone ? ' - ' + user.phone : '');
              })(),
              status: order.status,
              orderDate: order.date,
              totalAmount: order.totalAmount,
              paymentStatus: order.paymentStatus, // Added paymentStatus
              isMerchantOrder: false // default
            });
          });
        }
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
    const validStatuses = ['قيد الإنتظار', 'تم الإلغاء', 'تم الشحن', 'تم الاستلام', 'تم التسليم', 'مؤرشف'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const oldStatus = order.status;
    order.status = status;

    // Clear paymentSessionUrl if order is cancelled or completed
    if (status === 'تم الإلغاء' || status === 'تم التسليم') {
      order.paymentSessionUrl = null;
    }

    // Refund Wallet Balance if Cancelled
    // Only refund if the previous status was NOT cancelled to avoid double refunds
    if (status === 'تم الإلغاء' && oldStatus !== 'تم الإلغاء' && order.walletDiscount > 0) {
      user.referralBalance = (user.referralBalance || 0) + order.walletDiscount;
      console.log(`[Order Refund] Refunded ${order.walletDiscount} to user ${user._id}`);
    }

    // Handle referral completion if order is received or delivered
    if (status === 'تم الاستلام' || status === 'تم التسليم') {
      // Find a pending referral for this user. Ideally, this should be more specific
      // if a user can be referred multiple times. We now find it by the exact orderId.
      const referral = await Referral.findOne({ orderId: orderId, status: 'pending' });
      if (referral) {
        // Find the specific product in the order that was referred
        const referredProduct = order.products.find(p => p.bookId === referral.bookId);

        if (!referredProduct) {
          console.error(`[Referral Error] Referred product with bookId ${referral.bookId} not found in order ${orderId}`);
          // If the product isn't found, we can't calculate commission. Skip for now.
        } else {
          const commission = referredProduct.price * 0.05;

          referral.status = 'completed';
          referral.earned = commission; // Save the earned amount to the referral record
          await referral.save();

          // Add balance to referrer
          const referrer = await User.findById(referral.referrerId);
          if (referrer) {
            console.log(`[Referral Update] Found referrer ${referrer.username} to update balance. Current balance: ${referrer.referralBalance}`);
            referrer.referralBalance = (referrer.referralBalance || 0) + commission;
            await referrer.save();
          }
        }
      }
    }

    // Create notification message based on status
    let notificationMessage = '';
    const bookName = order.products.length > 0 ? (order.products[0].bookName || order.products[0].book || 'كتاب') : 'طلبك';
    const productSummary = order.products.length > 1 ? `${bookName} و ${order.products.length - 1} كتب أخرى` : bookName;

    switch (status) {
      case 'تم الشحن':
        notificationMessage = `تم شحن ${productSummary} (طلب رقم ${orderId})`;
        break;
      case 'تم الاستلام':
        notificationMessage = `تم استلام ${productSummary} من التاجر`;
        break;
      case 'تم التسليم':
        notificationMessage = `تم تسليم ${productSummary} بنجاح`;
        break;
      case 'تم الإلغاء':
        notificationMessage = `تم إلغاء طلب ${productSummary}`;
        break;
      default:
        notificationMessage = `تحديث حالة طلب ${productSummary}: ${status}`;
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

    // Send Push Notification
    const pushService = require('../services/push-notification.service');
    const pushPayload = {
      title: 'تحديث الطلب',
      body: notificationMessage,
      url: '/my-orders',
      data: { orderId: orderId, type: 'order' }
    };
    pushService.sendToUser(user._id, pushPayload, { important: true }).catch(err => console.error('Push Error:', err));
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


    // Refund Wallet Balance if Deleted
    const orderToDelete = user.orders[orderIndex];
    // Check if wallet was used AND if it wasn't already refunded via cancellation AND wasn't delivered
    if (orderToDelete.walletDiscount > 0 && orderToDelete.status !== 'تم الإلغاء' && orderToDelete.status !== 'تم التسليم') {
      user.referralBalance = (user.referralBalance || 0) + orderToDelete.walletDiscount;
      console.log(`[Order Delete] Refunded ${orderToDelete.walletDiscount} to user ${user._id}`);
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

// Bulk delete orders
exports.bulkDeleteOrders = async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'orderIds must be a non-empty array' });
    }

    // Group orderIds by user to avoid multiple saves per user
    const userOrderMap = new Map();

    // Find users for each orderId and group orders by user
    for (const orderId of orderIds) {
      const user = await User.findOne({ 'orders._id': orderId });
      if (user) {
        if (!userOrderMap.has(user._id.toString())) {
          userOrderMap.set(user._id.toString(), { user, orderIds: [] });
        }
        userOrderMap.get(user._id.toString()).orderIds.push(orderId);
      }
    }

    // Delete orders per user and save once per user
    const results = [];
    for (const [userId, { user, orderIds: userOrderIds }] of userOrderMap) {
      // Refund for deleted orders
      userOrderIds.forEach(id => {
        const order = user.orders.id(id);
        if (order && order.walletDiscount > 0 && order.status !== 'تم الإلغاء' && order.status !== 'تم التسليم') {
          user.referralBalance = (user.referralBalance || 0) + order.walletDiscount;
        }
      });

      // Remove orders from user's orders array
      user.orders = user.orders.filter(order => !userOrderIds.includes(order._id.toString()));
      await user.save();
      results.push({ userId, deletedCount: userOrderIds.length });
    }

    const totalDeleted = results.reduce((sum, result) => sum + result.deletedCount, 0);

    res.status(200).json({
      message: `Successfully deleted ${totalDeleted} orders`,
      results
    });
  } catch (error) {
    console.error('Error bulk deleting orders:', error);
    res.status(500).json({
      message: 'Error bulk deleting orders',
      error: error.message
    });
  }
};
