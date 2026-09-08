const User = require('../models/User.model');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product.model');
const Referral = require('../models/Referral.model');
const shippingService = require('../services/shipping/shipping.service');
const Coupon = require('../models/Coupon.model');
const Auction = require('../models/Auction.model');
const BookSwap = require('../models/BookSwap.model');
const axios = require('axios');
const isProduction = process.env.NODE_ENV === 'production';

exports.pingOrders = (req, res) => {
  res.json({ success: true, message: 'Orders API is reachable', version: 'V3-DEBUG' });
};

exports.submitOrder = async (req, res) => {
  console.log('📦 [SubmitOrder] Request received:', { 
    userId: req.body.userId, 
    referralCode: req.body.referralCode,
    productsCount: req.body.products?.length 
  });
  try {
    const { userId, products, totalAmount, shippingCost, preparationTime: reqPreparationTime, merchantId, isPickup, pickupLocation, isPostOffice, referralCode, bookId, address, bourseOfferId } = req.body;

    if (!userId || !products || (totalAmount === undefined || totalAmount === null)) {
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

    // Get preparationTime and shippingMethod from merchant if merchantId provided
    let preparationTime = reqPreparationTime || 1;
    let shippingMethod = 'knoozbook';
    if (merchantId) {
      try {
        const merchant = await User.findById(merchantId);
        if (merchant) {
          if (!reqPreparationTime && merchant.preparationTime) {
            preparationTime = merchant.preparationTime;
          }
          if (merchant.merchantShippingMethod) {
            shippingMethod = merchant.merchantShippingMethod;
          }
        }
      } catch (err) {
        console.warn('Error fetching merchant settings:', err.message);
      }
    }

    // Ensure products match schema structure
    const validatedProducts = products.map(product => ({
      bookId: product.bookId || product.book || product._id || '',
      bookName: product.bookName || product.book || '',
      quantity: product.quantity || 1,
      price: product.price || 0,
      isBourseItem: product.isBourseItem || false
    }));

    // COMPLIANCE SAFEGUARD: Block local checkout for affiliate products
    for (const item of validatedProducts) {
      if (item.bookId && mongoose.Types.ObjectId.isValid(item.bookId)) {
        const dbProd = await Product.findById(item.bookId).select('productType amazonAsin').lean();
        if (dbProd && (dbProd.productType === 'affiliate' || (dbProd.amazonAsin && dbProd.amazonAsin.trim()))) {
          return res.status(400).json({
            success: false,
            code: 'AFFILIATE_CHECKOUT_BLOCKED',
            message: 'منتجات أفلييت أمازون لا يمكن شراؤها مباشرة عبر المنصة. يرجى الشراء عبر رابط أمازون الرسمي.'
          });
        }
      }
    }

    // Bourse Offer Validation
    if (bourseOfferId) {
      const BourseOffer = require('../models/BourseOffer.model');
      const offer = await BourseOffer.findById(bourseOfferId);
      if (!offer) {
        return res.status(400).json({ message: 'عرض البورصة غير موجود.' });
      }
      
      const now = new Date();
      if (now < offer.startTime || now > offer.endTime) {
        return res.status(400).json({ message: 'لقد انتهى وقت العرض الخاص بالبورصة. يرجى مسح السلة والمحاولة مرة أخرى.' });
      }

      // Check quantities
      for (let p of validatedProducts) {
        if (p.isBourseItem) {
          const offerBook = offer.books.find(b => b.bookId === p.bookId);
          if (!offerBook || (offerBook.quantityAvailable - offerBook.quantitySold) < p.quantity) {
             return res.status(400).json({ message: `الكمية المتاحة من كتاب ${p.bookName} في عرض البورصة قد نفدت.` });
          }
        }
      }

      // Update sold quantities
      for (let p of validatedProducts) {
        if (p.isBourseItem) {
          const offerBook = offer.books.find(b => b.bookId === p.bookId);
          if (offerBook) {
            offerBook.quantitySold += p.quantity;
          }
        }
      }
      await offer.save();
    }

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
      status: 'قيد الإنتظار',
      shippingMethod: shippingMethod, // Save the merchant's preference
      paymentMethod: req.body.paymentMethod || 'online',
      codFee: req.body.codFee || 0,
      statusLog: [{
        status: 'قيد الإنتظار',
        updatedAt: new Date(),
        updatedBy: 'النظام (إنشاء الطلب)',
        role: 'system'
      }]
    };

    // --- Marketer Attribution ---
    console.log('🚀 [MARKETER_DEBUG_START] referralCode field value:', referralCode);
    if (referralCode) {
      console.log(`🔍 [SubmitOrder] Searching for marketer with: ${referralCode}`);
      
      // Try finding by referralCode OR _id (in case frontend sends ID)
      let query = { referralCode: { $regex: new RegExp('^' + referralCode + '$', 'i') } };
      if (mongoose.Types.ObjectId.isValid(referralCode)) {
        query = { $or: [query, { _id: referralCode }] };
      }

      const marketer = await User.findOne(query);
      
      if (marketer) {
        console.log(`👤 [SubmitOrder] Found marketer: ${marketer.username} (${marketer._id})`);
        if (marketer._id.toString() === userId.toString()) {
           console.warn(`⚠️ [SubmitOrder] Attribution skipped: User is the marketer themselves.`);
        } else {
           // Ensure marketer object and role are set correctly
           if (!marketer.marketer) marketer.marketer = { isMarketer: true };
           
           newOrder.referredByMarketer = marketer._id;
           
           // Use subTotal (items price) for commission if available, else totalAmount
           const commissionBase = totalAmount - (shippingCost || 0);
           const rate = (marketer.marketer && marketer.marketer.commissionRate) || 10;
           newOrder.marketerCommission = (commissionBase * rate) / 100;
           
           console.log(`💰 [SubmitOrder] Calculated Commission: ${newOrder.marketerCommission} (Base: ${commissionBase}, Rate: ${rate}%)`);

           // Update marketer stats
           if (!marketer.marketer.ordersCount) marketer.marketer.ordersCount = 0;
           marketer.marketer.ordersCount += 1;
           
           await marketer.save();
           console.log(`✅ [SubmitOrder] Marketer stats updated. New Order Count: ${marketer.marketer.ordersCount}`);
        }
      } else {
        console.error(`❌ [SubmitOrder] Marketer NOT found for code: ${referralCode}`);
      }
    } else {
      console.log(`ℹ️ [SubmitOrder] No referralCode in request body.`);
    }

    user.orders.push(newOrder);
    // Clear user cart after successful order placement
    user.cart = [];
    await user.save();
    console.log('✅ [SubmitOrder] User saved successfully. Order count:', user.orders.length);

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

    // Handle coupon usage tracking
    if (req.body.couponCode) {
      try {
        const normalizedCode = req.body.couponCode.trim().toUpperCase();
        const coupon = await Coupon.findOne({ code: normalizedCode });
        if (coupon) {
          coupon.uses = (coupon.uses || 0) + 1;

          // Track per-user usage
          const userUsageIndex = coupon.usedBy.findIndex(u => u.userId && u.userId.toString() === userId.toString());
          if (userUsageIndex !== -1) {
            coupon.usedBy[userUsageIndex].count += 1;
          } else {
            coupon.usedBy.push({ userId: userId, count: 1 });
          }

          await coupon.save();
          console.log(`[Order Submit] Coupon ${normalizedCode} usage updated for user ${userId}`);
        }
      } catch (couponError) {
        console.error('[Order Submit] Error updating coupon usage:', couponError);
      }
    }

    res.status(201).json({
      message: 'Order submitted successfully',
      orderId: addedOrder._id
    });

    // Trigger book recommendation workflow for purchase events
    try {
      // Get the first bookId from the order
      const firstBookId = validatedProducts[0]?.bookId;
      if (firstBookId) {
        await axios.post('https://n8n.knoozbook.com/webhook/book-recommendation', {
          userId: userId.toString(),
          eventType: 'purchase',
          bookId: firstBookId.toString()
        });
        console.log('[SubmitOrder] Book recommendation workflow triggered for user:', userId);
      }
    } catch (webhookError) {
      console.error('[SubmitOrder] Failed to trigger book recommendation workflow:', webhookError.message);
      // Don't fail the order if webhook fails
    }

    // --- PUSH NOTIFICATIONS (Wrapped to prevent crashing order) ---
    try {
      const pushService = require('../services/push-notification.service');

      // 1. Notify User (Confirmation)
      const userPayload = {
        title: 'تم تأكيد طلبك! 🎉',
        body: `شكراً لتسوقك معنا. طلبك رقم ${addedOrder._id} قيد المراجعة الآن.`,
        url: '/my-orders',
        data: { orderId: addedOrder._id.toString(), type: 'order_received' }
      };
      
      // Async without blocking
      pushService.sendToUser(userId, userPayload, { important: true }).catch(err => console.error('User Push Error:', err));

      // 2. Notify Admins
      const adminPayload = {
        title: 'طلب جديد وصل! 🚀',
        body: `طلب جديد بقيمة ${finalTotalAmount} ج.م من ${user.username}.`,
        url: '/admin/orders',
        data: { orderId: addedOrder._id.toString(), type: 'admin_new_order' }
      };
      pushService.sendToAdmins(adminPayload, { important: true }).catch(err => console.error('Admin Push Error:', err));

      // 3. Notify Merchants
      const bookIds = validatedProducts.map(p => p.bookId);
      const merchantProducts = await Product.find({ 
        $or: [
          { _id: { $in: bookIds.filter(id => mongoose.Types.ObjectId.isValid(id)) } },
          { products_id: { $in: bookIds } }
        ],
        merchantId: { $exists: true, $ne: null }
      }).select('merchantId');

      const merchantIds = [...new Set(merchantProducts.map(p => p.merchantId.toString()))];

      for (const mId of merchantIds) {
        pushService.sendToUser(mId, {
          title: 'طلب جديد لمتجرك! 🏪',
          body: `وصلك طلب جديد يحتوي على منتجات من متجرك. رقم الطلب: ${addedOrder._id}`,
          url: '/merchant/orders',
          data: { orderId: addedOrder._id.toString(), type: 'merchant_new_order' }
        }).catch(err => console.error('Merchant Push Error:', err));
      }
    } catch (pushErr) {
      console.error('⚠️ [SubmitOrder] Push notification non-critical error:', pushErr.message);
    }
  } catch (error) {
    console.error('🔥 [SubmitOrder Error]:', error);
    res.setHeader('X-Backend-Version', 'ANTIGRAVITY-DEBUG-V3');
    res.status(500).json({
      message: 'حدث خطأ أثناء إتمام الشراء، يرجى المحاولة مرة أخرى',
      error: error.message,
      debug: {
        msg: error.message,
        stack: error.stack,
        v: 'V3-ALERT-READY'
      }
    });
  }
};

exports.shipOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await shippingService.shipOrder(orderId);
    res.json({ success: true, message: 'تم إنشاء الشحنة بنجاح', data: order });
  } catch (error) {
    console.error('Ship Order Error:', error);
    res.status(500).json({ success: false, message: error.message });
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
          isCommunityItem: order.isCommunityItem || false,
          communityItemId: order.communityItemId || null,
          address: order.address || '',
          shippingAddress: order.shippingAddress || null,
          isPickup: order.isPickup || false,
          pickupLocation: order.pickupLocation || null
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

let merchantProductsCache = {
  merchants: null,
  products: null,
  expiresAt: 0
};

async function getMerchantProductsCache() {
  if (merchantProductsCache.merchants && merchantProductsCache.products && merchantProductsCache.expiresAt > Date.now()) {
    return merchantProductsCache;
  }
  try {
    const merchants = await User.find({ role: { $in: ['merchant', 'admin'] } }).select('_id role').lean();
    const merchantIds = merchants.filter(m => m.role === 'merchant').map(m => m._id);

    // Only query products belonging to actual merchants (exclude admin-owned products)
    const products = await Product.find({ merchantId: { $in: merchantIds } })
      .select('product_name product_image merchantId')
      .lean();
    
    merchantProductsCache = {
      merchants,
      products,
      expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes cache
    };
  } catch (err) {
    console.error('Error fetching merchant products mapping cache:', err);
    if (!merchantProductsCache.merchants) {
      merchantProductsCache.merchants = [];
      merchantProductsCache.products = [];
    }
  }
  return merchantProductsCache;
}

exports.getAllOrders = async (req, res) => {
  try {
    const startTime = Date.now();
    const { merchantId, includeArchived, page, limit } = req.query;

    // Retrieve cached merchants and products mapping
    const cache = await getMerchantProductsCache();
    const merchants = cache.merchants;
    const productsWithMerchant = cache.products;

    const userRoleMap = new Map();
    merchants.forEach(m => userRoleMap.set(m._id.toString(), m.role));

    // Build lookup maps for products
    const merchantProductMap = new Map();
    productsWithMerchant.forEach(p => {
      if (p.merchantId) {
        const mIdStr = p.merchantId.toString();
        const role = userRoleMap.get(mIdStr) || 'merchant';
        const val = { merchantId: mIdStr, role };
        if (p.product_name) merchantProductMap.set(p.product_name, val);
        if (p.product_image) merchantProductMap.set(p.product_image.replace('.webp', ''), val);
      }
    });

    const getProductInfo = (productName) => {
      if (productName && merchantProductMap.has(productName)) {
        return merchantProductMap.get(productName);
      }
      return { merchantId: '69d11b07df78621a8d7b1559', role: 'admin' }; // default admin ID
    };

    // Determine if we should filter by merchantId (only filter if requester is NOT admin or staff)
    const requesterRole = merchantId ? userRoleMap.get(merchantId.toString()) : null;
    const shouldFilterMerchant = merchantId && requesterRole !== 'admin' && requesterRole !== 'staff';

    let merchantBookNames = [];
    if (shouldFilterMerchant) {
      productsWithMerchant.forEach(p => {
        if (p.merchantId && p.merchantId.toString() === merchantId.toString()) {
          if (p.product_name) merchantBookNames.push(p.product_name);
          if (p.product_image) merchantBookNames.push(p.product_image.replace('.webp', ''));
        }
      });
    }

    // Build the aggregation pipeline
    const pipeline = [
      { $match: { 'orders.0': { $exists: true } } },
      { $unwind: '$orders' }
    ];

    if (includeArchived !== 'true') {
      pipeline.push({
        $match: { 'orders.status': { $ne: 'مؤرشف' } }
      });
    }

    pipeline.push({ $unwind: '$orders.products' });

    if (shouldFilterMerchant) {
      pipeline.push({
        $match: {
          $or: [
            { 'orders.products.bookName': { $in: merchantBookNames } },
            { 'orders.products.book': { $in: merchantBookNames } }
          ]
        }
      });
    }

    pipeline.push({
      $project: {
        _id: 0,
        username: '$username',
        email: '$email',
        phone: '$phone',
        governorate: '$governorate',
        city: '$city',
        village: '$village',
        
        orderId: '$orders._id',
        orderDate: '$orders.date',
        orderStatus: '$orders.status',
        totalAmount: '$orders.totalAmount',
        paymentStatus: '$orders.paymentStatus',
        isPickup: '$orders.isPickup',
        pickupLocation: '$orders.pickupLocation',
        postOffice: '$orders.postOffice',
        shippingAddress: '$orders.shippingAddress',
        address: '$orders.address',
        isCommunityItem: '$orders.isCommunityItem',
        communityItemId: '$orders.communityItemId',
        communityOwnerId: '$orders.communityOwnerId',
        communityOwnerName: '$orders.communityOwnerName',
        communityOwnerPhone: '$orders.communityOwnerPhone',
        communityOwnerAddress: '$orders.communityOwnerAddress',
        shippingMethod: '$orders.shippingMethod',
        statusLog: '$orders.statusLog',
        
        bookId: '$orders.products.bookId',
        bookName: '$orders.products.bookName',
        book: '$orders.products.book',
        quantity: '$orders.products.quantity'
      }
    });

    pipeline.push({
      $sort: { orderDate: -1 }
    });

    let hasPagination = !!page;
    let paginatedResult;
    let totalCount = 0;

    if (hasPagination) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 50;
      const skipNum = (pageNum - 1) * limitNum;

      pipeline.push({
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skipNum }, { $limit: limitNum }]
        }
      });

      const aggregationRes = await User.aggregate(pipeline);
      const metadata = aggregationRes[0]?.metadata || [];
      totalCount = metadata[0]?.total || 0;
      paginatedResult = aggregationRes[0]?.data || [];
    } else {
      // In case no pagination is requested, limit to 5000 to protect server memory
      pipeline.push({ $limit: 5000 });
      paginatedResult = await User.aggregate(pipeline);
    }

    // Warning if approaching 5000 limit
    if (paginatedResult.length >= 4500) {
      console.warn(`⚠️ [getAllOrders] Website orders (${paginatedResult.length}) approaching 5000 limit. Consider optimizing with DB-level pagination.`);
    }

    // Map aggregated results to final order entry structure
    let allOrders = paginatedResult.map(doc => {
      const prodName = doc.bookName || doc.book || '';
      const prodInfo = getProductInfo(prodName);

      let baseAddress = '';
      if (doc.isPickup) {
        baseAddress = `استلام من المكتبة: ${doc.pickupLocation || ''}`;
      } else if (doc.postOffice && doc.postOffice.governorate) {
        baseAddress = `شحن عبر مكاتب البريد: ${doc.postOffice.governorate}, ${doc.postOffice.city}, ${doc.postOffice.address || ''}${doc.postOffice.name ? ' - اسم المكتب: ' + doc.postOffice.name : ''}`;
      } else { // delivery
        const parts = [
          doc.shippingAddress?.governorate,
          doc.shippingAddress?.city,
          doc.shippingAddress?.village
        ].filter(Boolean);
        baseAddress = parts.length > 0 ? parts.join(', ') : '';
      }
      const finalAddress = baseAddress + (doc.phone ? ' - ' + doc.phone : '');

      return {
        _id: doc.orderId,
        book: doc.bookName || doc.book || doc.bookId || '',
        customerName: doc.username || '',
        email: doc.email || '',
        phone: doc.shippingAddress?.phone || doc.phone || '',
        quantity: doc.quantity,
        address: doc.address || finalAddress,
        status: doc.orderStatus,
        orderDate: doc.orderDate,
        totalAmount: doc.totalAmount,
        paymentStatus: doc.paymentStatus,
        isMerchantOrder: prodInfo.role === 'merchant',
        isCommunityItem: doc.isCommunityItem || !!doc.communityItemId || false,
        communityItemId: doc.communityItemId || null,
        communityOwnerId: doc.communityOwnerId || null,
        communityOwnerName: doc.communityOwnerName || null,
        communityOwnerPhone: doc.communityOwnerPhone || null,
        communityOwnerAddress: doc.communityOwnerAddress || null,
        shippingAddress: doc.shippingAddress || null,
        shippingMethod: doc.shippingMethod || 'knoozbook',
        statusLog: (doc.statusLog || []).map(log => ({
          status: log.status,
          timestamp: log.updatedAt || log.timestamp || new Date(),
          actor: log.updatedBy || log.actor || '',
          role: log.role || '',
          note: log.note || ''
        }))
      };
    });

    // BATCH LOOKUP: Populate missing owner details for community orders
    const communityItemIds = [];
    allOrders.forEach(order => {
      if (order.isCommunityItem && (!order.communityOwnerName || !order.communityOwnerAddress) && order.communityItemId) {
        communityItemIds.push(order.communityItemId);
      }
    });

    if (communityItemIds.length > 0) {
      const validIds = communityItemIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      
      const [auctions, swaps] = await Promise.all([
        Auction.find({ _id: { $in: validIds } }).populate('userId', 'username email phone governorate city village').lean(),
        BookSwap.find({ _id: { $in: validIds } }).populate('userId', 'username email phone governorate city village').lean()
      ]);

      const communityOwnerMap = new Map();
      auctions.forEach(a => {
        if (a.userId) {
          communityOwnerMap.set(a._id.toString(), {
            ownerId: a.userId._id.toString(),
            ownerName: a.userId.username || a.userId.email,
            ownerPhone: a.userId.phone || '',
            ownerAddress: [a.userId.governorate, a.userId.city, a.userId.village].filter(Boolean).join(', ')
          });
        }
      });
      swaps.forEach(s => {
        if (s.userId && !communityOwnerMap.has(s._id.toString())) {
          communityOwnerMap.set(s._id.toString(), {
            ownerId: s.userId._id.toString(),
            ownerName: s.userId.username || s.userId.email,
            ownerPhone: s.userId.phone || '',
            ownerAddress: [s.userId.governorate, s.userId.city, s.userId.village].filter(Boolean).join(', ')
          });
        }
      });

      allOrders.forEach(order => {
        if (order.isCommunityItem && (!order.communityOwnerName || !order.communityOwnerAddress) && order.communityItemId) {
          const owner = communityOwnerMap.get(order.communityItemId.toString());
          if (owner) {
            order.communityOwnerId = owner.ownerId;
            order.communityOwnerName = owner.ownerName;
            order.communityOwnerPhone = owner.ownerPhone;
            order.communityOwnerAddress = owner.ownerAddress;
          }
        }
      });
    }

    // === FETCH AMAZON ORDERS (Admin Only) ===
    const Order = require('../models/Order.model');
    let amazonOrders = [];

    // Only fetch Amazon orders if requester is admin or staff (not merchant)
    if (!shouldFilterMerchant) {
      try {
        const amazonQuery = Order.find({ source: 'amazon' });

        // Apply includeArchived filter
        if (includeArchived !== 'true') {
          amazonQuery.where('status').ne('cancelled');
        }

        const rawAmazonOrders = await amazonQuery.sort({ orderDate: -1 }).lean();

        // Convert Amazon orders to match website order structure (keep products as array)
        amazonOrders = rawAmazonOrders.map(order => ({
          _id: order._id,
          book: order.products.length > 0 ? order.products[0].product_name : 'Amazon Product',
          customerName: order.customerName || 'Amazon Customer',
          email: order.email || '',
          phone: order.phone || '',
          address: order.address || '',
          status: order.status,
          orderDate: order.orderDate,
          totalAmount: order.totalAmount,
          paymentStatus: 'completed', // Amazon orders are always paid
          isMerchantOrder: false,
          isCommunityItem: false,
          communityItemId: null,
          communityOwnerId: null,
          communityOwnerName: null,
          communityOwnerPhone: null,
          communityOwnerAddress: null,
          shippingAddress: null,
          shippingMethod: order.shippingMethod || 'knoozbook',
          statusLog: [],
          source: 'amazon',
          amazonOrderId: order.amazonOrderId,
          hasStockIssues: order.hasStockIssues || false,
          stockIssueDetails: order.stockIssueDetails || [],
          products: order.products.map(p => ({
            product_name: p.product_name || 'Amazon Product',
            product_quantity: p.product_quantity,
            isMerchantOrder: false,
            isCommunityItem: false
          }))
        }));

        console.log(`✅ [getAllOrders] Fetched ${amazonOrders.length} Amazon orders`);
      } catch (error) {
        console.error('❌ [getAllOrders] Error fetching Amazon orders:', error.message);
        // Continue with website orders even if Amazon fetch fails
      }
    }

    // === MERGE AMAZON AND WEBSITE ORDERS ===
    // Add source field to website orders
    allOrders.forEach(order => {
      order.source = 'website';
      order.amazonOrderId = null;
      order.hasStockIssues = false;
      order.stockIssueDetails = [];
    });

    // Merge and sort by orderDate
    const mergedOrders = [...allOrders, ...amazonOrders].sort((a, b) => {
      const dateA = new Date(a.orderDate || 0);
      const dateB = new Date(b.orderDate || 0);
      return dateB - dateA; // Descending order
    });

    // Apply pagination to merged results if requested
    let finalOrders = mergedOrders;
    let finalTotal = mergedOrders.length;

    if (hasPagination) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 50;
      const skipNum = (pageNum - 1) * limitNum;

      // Memory protection: cap total at 1000 for display
      const maxResults = 1000;
      finalTotal = Math.min(mergedOrders.length, maxResults);

      // Apply skip/limit with cap
      finalOrders = mergedOrders.slice(skipNum, Math.min(skipNum + limitNum, maxResults));

      if (mergedOrders.length > maxResults) {
        console.warn(`⚠️ [getAllOrders] Total orders (${mergedOrders.length}) exceeds display limit (${maxResults}), showing first ${maxResults}`);
      }

      res.status(200).json({
        success: true,
        orders: finalOrders,
        total: finalTotal,
        page: pageNum,
        pages: Math.ceil(finalTotal / limitNum)
      });
    } else {
      // No pagination: limit to 1000 to protect server memory
      const maxResults = 1000;
      if (mergedOrders.length > maxResults) {
        console.warn(`⚠️ [getAllOrders] Total orders (${mergedOrders.length}) exceeds memory limit (${maxResults}), truncating`);
        finalOrders = mergedOrders.slice(0, maxResults);
      }
      res.status(200).json(finalOrders);
    }
  } catch (error) {
    console.error('❌ [getAllOrders] Error:', error);
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
    const validStatuses = ['قيد الإنتظار', 'قيد المعالجة', 'تم الإلغاء', 'تم الشحن', 'تم الاستلام', 'تم التسليم', 'مؤرشف', 'ارسال الاستلام'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const oldStatus = order.status;
    
    // Auto-Shipment Integration
    if (status === 'تم الشحن' && oldStatus !== 'تم الشحن') {
      try {
        const shippingService = require('../services/shipping/shipping.service');
        await shippingService.shipOrder(orderId);
        
        // Re-fetch user since shippingService saved it
        const freshUser = await User.findOne({ 'orders._id': orderId });
        const freshOrder = freshUser.orders.id(orderId);
        
        const updatedBy = req.body.updatedBy || (req.user ? req.user.username || req.user.email : 'مستخدم');
        const updatedRole = req.body.role || (req.user ? req.user.role : 'user');
        
        freshOrder.statusLog.push({
          status: status,
          updatedAt: new Date(),
          updatedBy: updatedBy,
          role: updatedRole,
          note: req.body.note || 'تم إنشاء بوليصة الشحن آلياً'
        });
        
        await freshUser.save();
        return res.json({ message: 'Order status updated and shipped successfully via active carrier', order: freshOrder });
      } catch (shippingError) {
        if (shippingError.message === 'No active shipping carrier configured' || shippingError.message === 'Unsupported carrier') {
           console.log('[Shipping] Fallback to manual status update because no carrier is active.');
        } else {
           console.error('[Shipping API Error]', shippingError.message);
           return res.status(500).json({ message: 'فشل إنشاء بوليصة الشحن عبر الشركة: ' + shippingError.message });
        }
      }
    }

    order.status = status;

    // Push to status log
    const updatedBy = req.body.updatedBy || (req.user ? req.user.username || req.user.email : 'مستخدم');
    const updatedRole = req.body.role || (req.user ? req.user.role : 'user');
    
    order.statusLog.push({
      status: status,
      updatedAt: new Date(),
      updatedBy: updatedBy,
      role: updatedRole,
      note: req.body.note || ''
    });

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

    // --- Marketer Commission Payout ---
    console.log(`🔍 [MARKETER_PAYOUT_DEBUG] Checking payout for Order: ${orderId}, Status: ${status}`);
    if ((status === 'تم الاستلام' || status === 'تم التسليم') && order.referredByMarketer && order.marketerCommission > 0) {
      console.log(`🎯 [MARKETER_PAYOUT_DEBUG] Order is referred by: ${order.referredByMarketer}, Commission: ${order.marketerCommission}`);
      const marketer = await User.findById(order.referredByMarketer);
      
      if (marketer) {
        console.log(`👤 [MARKETER_PAYOUT_DEBUG] Found marketer: ${marketer.email}, Current Balance: ${marketer.marketer?.balance}`);
      } else {
        console.error(`❌ [MARKETER_PAYOUT_DEBUG] Marketer not found in DB: ${order.referredByMarketer}`);
      }

      // Payout if marketer exists and has marketer config enabled
      if (marketer && marketer.marketer && (marketer.marketer.isMarketer || marketer.role === 'marketer')) {
        // Prevent double payout if already delivered
        const alreadyPaid = order.statusLog.some(log => 
          (log.status === 'تم الاستلام' || log.status === 'تم التسليم') && 
          log.updatedAt < new Date(new Date().getTime() - 2000) // Increased buffer for safety
        );

        if (!alreadyPaid) {
          console.log(`💰 [MARKETER_PAYOUT_DEBUG] Crediting ${order.marketerCommission} to ${marketer.username}...`);
          marketer.marketer.balance = (marketer.marketer.balance || 0) + order.marketerCommission;
          marketer.marketer.totalEarnings = (marketer.marketer.totalEarnings || 0) + order.marketerCommission;
          marketer.marketer.points = (marketer.marketer.points || 0) + 10;
          
          if (marketer.marketer.tasks) {
            marketer.marketer.tasks.forEach(task => {
              if (task.status === 'active') {
                task.current += 1;
                if (task.current >= task.target) {
                  task.status = 'completed';
                  marketer.marketer.balance += task.reward || 0;
                  console.log(`🏆 [MARKETER_PAYOUT_DEBUG] Task completed! Reward: ${task.reward}`);
                }
              }
            });
          }

          await marketer.save();
          console.log(`✅ [MARKETER_PAYOUT_DEBUG] Final Balance for ${marketer.username}: ${marketer.marketer.balance}`);
        } else {
          console.warn(`⚠️ [MARKETER_PAYOUT_DEBUG] Payout skipped: Already paid according to status log.`);
        }
      } else {
        console.warn(`⚠️ [MARKETER_PAYOUT_DEBUG] Payout skipped: Marketer config missing or not a marketer role.`);
      }
    } else {
       if (!order.referredByMarketer) console.log(`ℹ️ [MARKETER_PAYOUT_DEBUG] No marketer attributed to this order.`);
       if (!(order.marketerCommission > 0)) console.log(`ℹ️ [MARKETER_PAYOUT_DEBUG] Commission is 0 or less: ${order.marketerCommission}`);
    }

    // Create notification message based on status
    let notificationMessage = '';
    const bookName = order.products.length > 0 ? (order.products[0].bookName || order.products[0].book || 'كتاب') : 'طلبك';
    const productSummary = order.products.length > 1 ? `${bookName} و ${order.products.length - 1} كتب أخرى` : bookName;

    switch (status) {
      case 'تم الشحن':
        notificationMessage = `خبر سعيد! 🚚 تم شحن ${productSummary}. سيصلك قريباً.`;
        break;
      case 'تم الاستلام':
        notificationMessage = `خطوة جديدة! 📦 تم استلام ${productSummary} وهي الآن في طريقها إليك.`;
        break;
      case 'تم التسليم':
        notificationMessage = `مبروك! 🎉 تم تسليم ${productSummary} بنجاح. نتمنى لك قراءة ممتعة!`;
        break;
      case 'تم الإلغاء':
        notificationMessage = `للأسف، تم إلغاء طلبك لـ ${productSummary}. 😔`;
        break;
      case 'ارسال الاستلام':
        notificationMessage = `جاري التنسيق! 🤝 تم البدء في إجراءات استلام ${productSummary} من صاحبها. سنقوم بشحنها إليك فور استلامنا لها.`;
        break;
      default:
        notificationMessage = `تحديث في طلبك: ${productSummary} أصبح الآن في حالة: ${status}`;
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

    // Trigger book recommendation workflow when order is delivered (COD payment completed)
    if (status === 'تم التسليم' || status === 'تم الاستلام') {
      try {
        const firstBookId = order.products && order.products[0] 
          ? (order.products[0].book || order.products[0].bookId || order.products[0].products_id)
          : null;
        
        if (firstBookId) {
          await axios.post('https://n8n.knoozbook.com/webhook/book-recommendation', {
            userId: user._id.toString(),
            eventType: 'purchase',
            bookId: firstBookId.toString()
          });
          console.log('[updateOrderStatus] Book recommendation workflow triggered for user:', user._id, 'on status:', status);
        }
      } catch (webhookError) {
        console.error('[updateOrderStatus] Failed to trigger book recommendation workflow:', webhookError.message);
        // Don't fail the status update if webhook fails
      }
    }

    res.status(200).json({ message: 'Order status updated successfully' });

    // Send Push Notification
    const pushService = require('../services/push-notification.service');
    const pushPayload = {
      title: 'تحديث في طلبك 🔔',
      body: notificationMessage,
      url: '/my-orders',
      data: { orderId: orderId, type: 'order_status_update' }
    };
    pushService.sendToUser(user._id, pushPayload, { important: true }).catch(err => console.error('Push Error:', err));
    console.log(`[Order Status Update] Notification sent to customer ${user._id} for status: ${status}`);
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

// Create order from Amazon (n8n integration)
exports.createOrderFromAmazon = async (req, res) => {
  try {
    const {
      amazonOrderId,
      customerName,
      email,
      phone,
      address,
      products,
      totalAmount,
      orderDate
    } = req.body;

    console.log('📦 [CreateOrderFromAmazon] Request received:', { amazonOrderId, productsCount: products?.length });

    // === VALIDATION ===
    if (!amazonOrderId || typeof amazonOrderId !== 'string' || amazonOrderId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid amazonOrderId'
      });
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid products array'
      });
    }

    if (!totalAmount || typeof totalAmount !== 'number' || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid totalAmount'
      });
    }

    // Validate each product
    for (const product of products) {
      const quantity = product.product_quantity || product.quantity;
      if (!quantity || typeof quantity !== 'number' || quantity <= 0 || !Number.isInteger(quantity)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product quantity: must be a positive integer'
        });
      }

      const price = product.product_price || product.price;
      if (!price || typeof price !== 'number' || price <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product price: must be a positive number'
        });
      }

      const name = product.product_name || product.bookName;
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Invalid product name: must be a non-empty string'
        });
      }
    }

    // Validate optional fields
    if (customerName && typeof customerName !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid customerName'
      });
    }

    if (email && typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid email'
      });
    }

    if (phone && typeof phone !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone'
      });
    }

    if (address && typeof address !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid address'
      });
    }

    if (orderDate && isNaN(Date.parse(orderDate))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid orderDate'
      });
    }

    // === IDEMPOTENCY (with race condition protection) ===
    const Order = require('../models/Order.model');

    // First check: quick lookup
    const existingOrder = await Order.findOne({ amazonOrderId });
    if (existingOrder) {
      console.log(`⚠️ [CreateOrderFromAmazon] Order ${amazonOrderId} already exists (quick check), skipping`);
      return res.status(200).json({
        success: true,
        message: 'Order already exists',
        orderId: existingOrder._id
      });
    }

    // Create new order in Order collection
    const newOrder = new Order({
      merchantId: null, // Amazon orders don't have a merchant
      customerName: customerName || 'Amazon Customer',
      email: email || 'amazon@customer.com',
      phone: phone || '',
      address: address || '',
      products: products.map(p => ({
        product_name: p.product_name || p.bookName || 'Product',
        product_quantity: p.product_quantity || p.quantity || 1,
        product_price: p.product_price || p.price || 0
      })),
      status: 'pending',
      totalAmount: totalAmount,
      orderDate: orderDate ? new Date(orderDate) : new Date(),
      preparationTime: 1,
      shippingMethod: 'knoozbook',
      source: 'amazon',
      amazonOrderId: amazonOrderId
    });

    let savedOrder;
    try {
      savedOrder = await newOrder.save();
      console.log(`✅ [CreateOrderFromAmazon] Order ${amazonOrderId} created successfully`);
    } catch (saveError) {
      // Handle duplicate key error (race condition protection)
      if (saveError.code === 11000 && saveError.keyPattern && saveError.keyPattern.amazonOrderId) {
        console.log(`⚠️ [CreateOrderFromAmazon] Duplicate key error for ${amazonOrderId} (race condition), fetching existing order`);
        const duplicateOrder = await Order.findOne({ amazonOrderId });
        return res.status(200).json({
          success: true,
          message: 'Order already exists (race condition)',
          orderId: duplicateOrder._id
        });
      }
      // Re-throw other errors
      throw saveError;
    }

    // === UPDATE PRODUCT QUANTITIES (with negative stock protection) ===
    const Product = require('../models/Product.model');
    const stockUpdateResults = [];
    const stockIssues = [];

    for (const product of products) {
      try {
        const productId = product.productId || product.bookId;
        const quantity = product.product_quantity || product.quantity || 1;

        if (productId) {
          // Use findOneAndUpdate with condition to prevent negative stock
          const updatedProduct = await Product.findOneAndUpdate(
            {
              _id: productId,
              product_quantity: { $gte: quantity }
            },
            {
              $inc: { product_quantity: -quantity },
              $set: { lastStockUpdate: new Date() }
            },
            { new: true }
          );

          if (updatedProduct) {
            console.log(`📉 [CreateOrderFromAmazon] Updated quantity for product ${productId}: ${updatedProduct.product_quantity}`);
            stockUpdateResults.push({
              productId,
              success: true,
              newQuantity: updatedProduct.product_quantity
            });
          } else {
            // Product not found or insufficient stock
            console.warn(`⚠️ [CreateOrderFromAmazon] Insufficient stock or product not found for ${productId}`);
            stockUpdateResults.push({
              productId,
              success: false,
              reason: 'Insufficient stock or product not found'
            });
            stockIssues.push({
              productId,
              requestedQty: quantity,
              reason: 'Insufficient stock or product not found'
            });
          }
        } else {
          console.warn(`⚠️ [CreateOrderFromAmazon] Product missing productId/bookId`);
          stockUpdateResults.push({
            success: false,
            reason: 'Missing productId/bookId'
          });
          stockIssues.push({
            productId: 'unknown',
            requestedQty: quantity,
            reason: 'Missing productId/bookId'
          });
        }
      } catch (error) {
        console.error(`❌ [CreateOrderFromAmazon] Error updating quantity for product:`, error.message);
        stockUpdateResults.push({
          productId: product.productId || product.bookId,
          success: false,
          reason: error.message
        });
        stockIssues.push({
          productId: product.productId || product.bookId || 'unknown',
          requestedQty: product.product_quantity || product.quantity || 1,
          reason: error.message
        });
        // Continue with other products even if one fails
      }
    }

    // Update order with stock issues if any
    if (stockIssues.length > 0) {
      savedOrder.hasStockIssues = true;
      savedOrder.stockIssueDetails = stockIssues;
      await savedOrder.save();
      console.warn(`⚠️ [CreateOrderFromAmazon] Order ${amazonOrderId} has stock issues: ${stockIssues.length} products`);
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      orderId: savedOrder._id,
      stockUpdateResults
    });
  } catch (error) {
    console.error('❌ [CreateOrderFromAmazon] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order from Amazon',
      error: error.message
    });
  }
};
