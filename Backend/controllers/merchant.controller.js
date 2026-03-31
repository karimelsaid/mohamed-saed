const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const User = require('../models/User.model');
const Product = require('../models/Product.model');
const Order = require('../models/Order.model');
const bcrypt = require('bcrypt');
const { addProductToExcel, categoryMap, downloadAndConvertExcel, updateExcelFromJson } = require('../services/excel.service');
const sitemapService = require('../services/sitemap.service');

// Mapping for merchant categories to standard categories
const merchantCategoryMap = {
  'أعمال وإدارة': 'أعمال وتسويق ومالية',
  'تنمية بشرية': 'تطوير الذات وعلم النفس',
  'فنون وثقافة': 'فنون وحرف',
  'تربية وتعليم': 'تربية وأطفال',
  'أدوات مكتبية': 'أدوات مكتبية',
  'إلكترونيات': 'إلكترونيات',
  'ملابس': 'ملابس',
  'أخرى': 'غير مصنف',
  'رواية': 'روايات وقصص',
  'ديني': 'كتب دينية',
  'قاموس': 'قواميس ومراجع',
  'صحة': 'صحة وطب وعلوم',
  'اعمال': 'أعمال وتسويق ومالية',
  'فن': 'فنون وحرف',
  'تاريخ': 'تاريخ وسير ذاتية',
  'تربية': 'تربية وأطفال',
  'ادوات': 'أدوات مكتبية',
  'تجميل': 'التجميل والعناية الشخصية',
  'احذية': 'الأحذية',
  'اثاث': 'أثاث وديكور المنزل',
  'العاب': 'هداية وألعاب',
  'أقمشة': 'أقمشة',
  'أثاث': 'أثاث وديكور المنزل',
  'ألعاب': 'هدية وألعاب',
  'أقمشة': 'أقمشة',
};

// Reverse categoryMap for mapping full names to short keys
const reverseCategoryMap = {};
for (const [key, value] of Object.entries(categoryMap)) {
  reverseCategoryMap[value] = key;
}

// Helper function to generate random barcode string
function generateRandomBarcode(length = 12) {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper function to get merchant upload directory
function getMerchantUploadDir(merchantUsername, barcode) {
  const sanitizedUsername = merchantUsername.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
  return path.join(__dirname, '../uploads/books', 'merchant_' + sanitizedUsername, barcode);
}

// Multer setup for logo and cover uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG and WEBP image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Register a new merchant - updated to use User collection only
async function registerMerchant(req, res) {
  try {
    const { name, email, phone, governorate, city, village, taxNumber, password } = req.body;
    if (!name || !name.trim() || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if user with email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    let logoPath = '';
    if (req.file) {
      // Sanitize merchant name for folder name, allowing Arabic letters
      const sanitizedUsername = req.body.name.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      // Save logo image in uploads/books/merchant_username/logo/ folder
      const uploadDir = path.join(__dirname, '../uploads/books', 'merchant_' + sanitizedUsername, 'logo');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filename = `logo.webp`;
      const filepath = path.join(uploadDir, filename);

      await sharp(req.file.buffer)
        .resize({ width: 300 }) // Resize logo width to max 300px
        .webp({ quality: 80 })
        .toFile(filepath);

      logoPath = `merchant_${sanitizedUsername}/logo/logo.webp`; // Store path relative to uploads/books/
    }

    const userPassword = password || 'defaultPassword123';
    const hashedPassword = await bcrypt.hash(userPassword, 12);

    const merchantData = {
      username: name,
      email,
      password: hashedPassword,
      phone,
      governorate,
      city,
      village,
      role: 'merchant',
      taxNumber,
      approved: false,
      merchantName: name
    };

    // Only set logo if a file was uploaded
    if (logoPath) {
      merchantData.logo = logoPath;
    }

    const merchant = new User(merchantData);

    await merchant.save();

    // Generate JWT token for auto-login
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { merchantId: merchant._id, email: merchant.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Push Notification to Admins
    try {
      const pushService = require('../services/push-notification.service');
      pushService.sendToAdmins({
        title: 'تسجيل تاجر جديد 🏪',
        body: `التاجر ${name} قام بالتسجيل وينتظر التفعيل`,
        url: '/admin/merchants',
        data: { type: 'new_merchant_registration' }
      }).catch(err => console.error('Admin Push Error:', err));
    } catch (pushErr) {
      console.error('Push Service Error:', pushErr);
    }

    return res.status(201).json({
      success: true,
      message: 'Merchant registered successfully. Please wait for admin approval.',
      token,
      merchant: {
        _id: merchant._id,
        name: merchant.merchantName,
        email: merchant.email,
        logo: merchant.logo
      }
    });
  } catch (error) {
    console.error('Error in registerMerchant:', error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Logo file size exceeds 1 MB limit' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Multer setup for product image upload
const productUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB limit for each file (matching merchant requirements)
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG and WEBP image files are allowed!'), false);
    }
    cb(null, true);
  }
});

async function addProduct(req, res) {
  try {
    // Check if merchant is approved
    if (!req.merchant.approved) {
      return res.status(403).json({ success: false, message: 'حسابك قيد المراجعة. يرجى الانتظار حتى يتم الموافقة عليه من قبل الإدارة.' });
    }

    // Check if merchant is suspended
    if (req.merchant.suspended) {
      return res.status(403).json({ success: false, message: 'حسابك موقوف مؤقتاً. لا يمكنك إضافة منتجات جديدة.' });
    }

    // Generate barcode if not present
    const barcode = generateRandomBarcode();
    let { product_name, product_quantity, product_category, product_description, product_price, price_cost, copyType, condition, weight, length, width, height } = req.body;

    // Map merchant category to standard category
    product_category = merchantCategoryMap[product_category] || product_category;

    if (!product_name || !product_quantity || !product_category || !product_description || product_description.trim() === '' || weight === undefined || weight === null || weight === '') {
      return res.status(400).json({ success: false, message: 'Missing required fields or product description is empty (including weight)' });
    }

    const files = req.files || (req.file ? [req.file] : []);
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one image file is required' });
    }

    // Compress and save images using sharp
    const sanitizedUsername = req.merchant.username.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
    const uploadDir = getMerchantUploadDir(req.merchant.username, barcode);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const savedImages = [];
    for (let i = 0; i < Math.min(files.length, 3); i++) {
      const file = files[i];
      const suffix = i === 0 ? '' : `_${i}`;
      const filename = `${barcode}${suffix}.webp`;
      const filepath = path.join(uploadDir, filename);

      await sharp(file.buffer)
        .resize({ width: 800 }) // Resize width to max 800px, maintain aspect ratio
        .webp({ quality: 80 }) // Convert to webp with quality 80
        .toFile(filepath);

      savedImages.push(filename);
    }

    // Determine category prefix based on categoryMap keys
    let categoryPrefix = '';
    let shortKey = reverseCategoryMap[product_category] || product_category;
    if (categoryMap.hasOwnProperty(shortKey)) {
      categoryPrefix = shortKey + '-';
    }

    // Prepare product data
    const productData = {
      barcode,
      product_name,
      product_quantity: parseInt(product_quantity, 10),
      product_category,
      product_description,
      categoryPrefix,
      product_price: parseFloat(product_price) || 0,
      price_cost: parseFloat(price_cost) || 0,
      createdAt: new Date().toISOString() // Add createdAt field with current timestamp
    };

    // Save product to MongoDB with status 'pending' and merchantId
    const Product = require('../models/Product.model');
    const newProduct = new Product({
      product_name,
      product_quantity: parseInt(product_quantity, 10),
      product_category,
      product_description,
      product_price: parseFloat(product_price) || 0,
      price_cost: parseFloat(price_cost) || 0,
      weight: parseFloat(weight) || 0,
      length: parseFloat(length) || '',
      width: parseFloat(width) || '',
      height: parseFloat(height) || '',
      products_id: barcode, // حفظ الباركود الرقمي فقط
      product_image: barcode, // حفظ الباركود الرقمي فقط
      images: savedImages,
      copyType: copyType || '',
      condition: condition || '',
      status: 'pending',
      merchantId: req.merchant._id,
      createdAt: new Date()
    });
    await newProduct.save();

    // Note: Product will be added to Excel only after admin approval
    // No Excel updates or sitemap generation for pending products

    res.json({ success: true, message: 'Product added successfully and pending admin approval', barcode });

    // Push Notification to Admins - New Product Added
    try {
      const pushService = require('../services/push-notification.service');
      pushService.sendToAdmins({
        title: 'منتج جديد ينتظر الموافقة 📦',
        body: `التاجر ${req.merchant.username} أضاف منتج: ${product_name}`,
        url: '/admin/merchant-products',
        data: { type: 'new_merchant_product', productId: newProduct._id }
      }).catch(err => console.error('Admin Push Error:', err));
    } catch (pushErr) {
      console.error('Push Service Error:', pushErr);
    }
  } catch (error) {
    console.error('Error in addProduct:', error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Image file size exceeds 1 MB limit' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getCurrentMerchant(req, res) {
  try {
    const merchant = req.merchant;

    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    // Return merchant data regardless of approval status, but include approval flag
    res.json({
      success: true,
      merchant: {
        _id: merchant._id,
        merchantName: merchant.merchantName || merchant.username,
        name: merchant.username,
        email: merchant.email,
        phone: merchant.phone,
        taxNumber: merchant.taxNumber,
        logo: merchant.logo,
        coverPhoto: merchant.coverPhoto,
        bio: merchant.bio,
        preparationTime: merchant.preparationTime,
        merchantShippingMethod: merchant.merchantShippingMethod || 'knoozbook',
        shippingRates: merchant.shippingRates || [],
        approved: merchant.approved,
        isApproved: merchant.approved,
        suspended: merchant.suspended || false,
        createdAt: merchant.createdAt
      }
    });
  } catch (error) {
    console.error('Error in getCurrentMerchant:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading merchant data'
    });
  }
}

async function getMerchantProducts(req, res) {
  try {
    const merchantId = req.merchant._id;
    const Product = require('../models/Product.model');

    const products = await Product.find({ merchantId }).sort({ createdAt: -1 }).lean();

    // Ensure products_id is present for each product
    const enrichedProducts = products.map(p => ({
      ...p,
      products_id: p.products_id || p._id.toString(),
      shippingMethod: req.merchant.merchantShippingMethod || 'knoozbook'
    }));

    res.json({ success: true, products: enrichedProducts });
  } catch (error) {
    console.error('❌ Error in getMerchantProducts:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getMerchantOrders(req, res) {
  try {
    const merchantId = req.merchant._id;

    // Find all products that belong to this merchant
    const Product = require('../models/Product.model');
    const merchantProducts = await Product.find({ merchantId }).select('_id product_image');

    if (merchantProducts.length === 0) {
      return res.json({ success: true, orders: [] });
    }

    // Get product IDs and barcodes
    const productIds = merchantProducts.map(p => p._id.toString());
    const productBarcodes = merchantProducts.map(p => p.product_image ? p.product_image.split('/').pop().replace('.webp', '') : '');

    // Find all users and their orders
    const users = await User.find().select('orders username email phone');
    let merchantOrders = [];

    users.forEach(user => {
      user.orders.forEach(order => {
        // Check if any product in the order belongs to this merchant
        const hasMerchantProduct = order.products.some(product => {
          const bookId = product.bookId || product.book;
          return productIds.includes(bookId) || productBarcodes.includes(bookId);
        });

        if (hasMerchantProduct) {
          // Transform products to show product names instead of barcodes
          const transformedProducts = order.products.map(product => {
            // Find the corresponding product to get the image
            const merchantProduct = merchantProducts.find(mp => {
              const bookId = product.bookId || product.book;
              return mp._id.toString() === bookId || mp.product_image?.split('/').pop().replace('.webp', '') === bookId;
            });

            return {
              book: product.bookName ? product.bookName : product.book,
              bookId: product.bookId || '',
              quantity: product.quantity,
              price: product.price || 0,
              product_image: merchantProduct?.product_image || ''
            };
          });

          // Calculate total amount for merchant's products only
          const merchantTotalAmount = transformedProducts.reduce((sum, product) => sum + (product.price * product.quantity), 0);

          // Construct robust address
          let orderAddress = order.address || '';
          if (order.shippingAddress) {
            const parts = [
              order.shippingAddress.governorate,
              order.shippingAddress.city,
              order.shippingAddress.village,
              order.shippingAddress.address
            ].filter(Boolean);
            if (parts.length > 0) orderAddress = parts.join(', ');
          }

          // Transform the order to match the expected format
          merchantOrders.push({
            _id: order._id,
            customerName: user.username,
            email: user.email,
            phone: order.shippingAddress?.phone || user.phone,
            address: orderAddress,
            products: transformedProducts,
            status: order.status,
            totalAmount: merchantTotalAmount,
            shippingMethod: order.shippingMethod || 'knoozbook', // Include order specific shipping method
            orderDate: order.date,
            preparationTime: order.preparationTime || 1, // Use saved preparation time
            createdAt: order.date
          });
        }
      });
    });

    // Sort by creation date (most recent first)
    merchantOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, orders: merchantOrders });
  } catch (error) {
    console.error('Error in getMerchantOrders:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function deleteMerchantOrder(req, res) {
  try {
    const { orderId } = req.params;
    const merchantId = req.merchant._id;

    // Find all products that belong to this merchant
    const Product = require('../models/Product.model');
    const merchantProducts = await Product.find({ merchantId }).select('_id product_image');

    if (merchantProducts.length === 0) {
      return res.status(404).json({ success: false, message: 'No products found for this merchant' });
    }

    // Get product IDs and barcodes
    const productIds = merchantProducts.map(p => p._id.toString());
    const productBarcodes = merchantProducts.map(p => p.product_image ? p.product_image.split('/').pop().replace('.webp', '') : '');

    // Find the user who has this order
    const user = await User.findOne({ 'orders._id': orderId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Find the order in the user's orders array
    const orderIndex = user.orders.findIndex(order => order._id.toString() === orderId);
    if (orderIndex === -1) {
      return res.status(404).json({ success: false, message: 'Order not found in user orders' });
    }

    const order = user.orders[orderIndex];

    // Check if any product in the order belongs to this merchant
    const hasMerchantProduct = order.products.some(product => {
      const bookId = product.bookId || product.book;
      return productIds.includes(bookId) || productBarcodes.includes(bookId);
    });

    if (!hasMerchantProduct) {
      return res.status(403).json({ success: false, message: 'Order does not contain your products' });
    }

    // Only allow deletion of cancelled orders
    if (order.status !== 'تم الإلغاء') {
      return res.status(400).json({ success: false, message: 'Only cancelled orders can be deleted' });
    }

    // Remove the order from the user's orders array
    user.orders.splice(orderIndex, 1);
    await user.save();

    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error in deleteMerchantOrder:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function submitProductUpdateRequest(req, res) {
  try {
    const { productId } = req.params;
    const updateData = req.body;
    const merchantId = req.merchant._id;

    const Product = require('../models/Product.model');
    const product = await Product.findOne({ _id: productId, merchantId });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Only approved products can be updated' });
    }

    // Create a new ProductUpdateRequest
    const ProductUpdateRequest = require('../models/ProductUpdateRequest.model');
    const updateRequest = new ProductUpdateRequest({
      productId,
      merchantId,
      originalProduct: {
        product_name: product.product_name,
        product_quantity: product.product_quantity,
        product_category: product.product_category,
        product_description: product.product_description,
        product_price: product.product_price,
        price_cost: product.price_cost,
        copyType: product.copyType || '',
        condition: product.condition || '',
        weight: product.weight || 0,
        length: product.length || '',
        width: product.width || '',
        height: product.height || '',
        images: product.images || []
      },
      updatedProduct: {
        product_name: updateData.product_name,
        product_quantity: parseInt(updateData.product_quantity, 10),
        product_category: updateData.product_category,
        product_description: updateData.product_description,
        product_price: parseFloat(updateData.product_price) || 0,
        price_cost: parseFloat(updateData.price_cost) || 0,
        copyType: updateData.copyType || '',
        condition: updateData.condition || '',
        weight: parseFloat(updateData.weight) || 0,
        length: parseFloat(updateData.length) || '',
        width: parseFloat(updateData.width) || '',
        height: parseFloat(updateData.height) || '',
        images: updateData.images || []
      },
      status: 'pending'
    });

    await updateRequest.save();

    res.json({ success: true, message: 'Update request submitted successfully' });

    // Push Notification to Admins - Product Update Request
    try {
      const pushService = require('../services/push-notification.service');
      pushService.sendToAdmins({
        title: 'طلب تعديل منتج 📝',
        body: `التاجر ${req.merchant.username} يطلب تعديل منتج: ${product.product_name}`,
        url: '/admin/product-update-requests',
        data: { type: 'product_update_request', requestId: updateRequest._id }
      }).catch(err => console.error('Admin Push Error:', err));
    } catch (pushErr) {
      console.error('Push Service Error:', pushErr);
    }
  } catch (error) {
    console.error('Error in submitProductUpdateRequest:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getMerchantUpdateRequests(req, res) {
  try {
    const merchantId = req.merchant._id;
    const ProductUpdateRequest = require('../models/ProductUpdateRequest.model');

    const requests = await ProductUpdateRequest.find({ merchantId })
      .populate('productId')
      .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (error) {
    console.error('Error in getMerchantUpdateRequests:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function deleteProduct(req, res) {
  try {
    const { productId } = req.params;
    const merchantId = req.merchant._id;

    const Product = require('../models/Product.model');
    const product = await Product.findOne({ _id: productId, merchantId });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found or does not belong to you' });
    }

    // Delete product folder if exists
    if (product.product_image) {
      const sanitizedUsername = req.merchant.username.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      const barcode = product.product_image ? product.product_image.split('/').pop().replace('.webp', '') : productId;
      const uploadDir = path.join(__dirname, '../uploads/books');
      const productFolder = `merchant_${sanitizedUsername}/${barcode}`;
      const folderPath = path.join(uploadDir, productFolder);
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
    }

    // If product was approved, remove from Excel and update Google Drive
    if (product.status === 'approved') {
      const barcode = product.product_image ? product.product_image.split('/').pop().replace('.webp', '') : productId;
      const fileId = process.env.GOOGLE_DRIVE_FILE_ID;

      if (fileId) {
        const client = await require('../config/drive').auth.getClient();
        const drive = require('googleapis').google.drive({ version: 'v3', auth: client });

        const resDrive = await drive.files.get({
          fileId,
          alt: 'media',
        }, { responseType: 'arraybuffer' });

        const buffer = Buffer.from(resDrive.data);
        const xlsx = require('xlsx');
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        let json = xlsx.utils.sheet_to_json(sheet);

        // Find and remove product by barcode
        const productIndex = json.findIndex(p => {
          if (!p.products_id) return false;
          const pId = String(p.products_id).trim();
          const bId = String(barcode).trim();
          return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
        });
        if (productIndex !== -1) {
          json.splice(productIndex, 1);

          // Convert JSON back to sheet
          const newSheet = xlsx.utils.json_to_sheet(json);
          workbook.Sheets[sheetName] = newSheet;

          // Write workbook to buffer
          const wbout = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

          // Upload updated Excel file back to Google Drive
          await drive.files.update({
            fileId,
            media: {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              body: wbout
            }
          });

          // Update output.json
          await downloadAndConvertExcel(fileId);
          await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update);
        }
      }

      // Update sitemap
      sitemapService.generateSitemap();
    }

    // Delete the product from database
    await Product.findByIdAndDelete(productId);

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error in deleteProduct:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function bulkDeleteProducts(req, res) {
  try {
    const { productIds } = req.body;
    const merchantId = req.merchant._id;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Product IDs array is required' });
    }

    const Product = require('../models/Product.model');
    const products = await Product.find({ _id: { $in: productIds }, merchantId });

    if (products.length !== productIds.length) {
      return res.status(404).json({ success: false, message: 'Some products not found or do not belong to you' });
    }

    // Delete product folders
    for (const product of products) {
      if (product.product_image) {
        const sanitizedUsername = req.merchant.username.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        const barcode = product.product_image ? product.product_image.split('/').pop().replace('.webp', '') : product._id;
        const uploadDir = path.join(__dirname, '../uploads/books');
        const productFolder = `merchant_${sanitizedUsername}/${barcode}`;
        const folderPath = path.join(uploadDir, productFolder);
        if (fs.existsSync(folderPath)) {
          fs.rmSync(folderPath, { recursive: true, force: true });
        }
      }
    }

    // Handle approved products - remove from Excel and update Google Drive
    const approvedProducts = products.filter(p => p.status === 'approved');
    if (approvedProducts.length > 0) {
      const fileId = process.env.GOOGLE_DRIVE_FILE_ID;

      if (fileId) {
        const client = await require('../config/drive').auth.getClient();
        const drive = require('googleapis').google.drive({ version: 'v3', auth: client });

        const resDrive = await drive.files.get({
          fileId,
          alt: 'media',
        }, { responseType: 'arraybuffer' });

        const buffer = Buffer.from(resDrive.data);
        const xlsx = require('xlsx');
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        let json = xlsx.utils.sheet_to_json(sheet);

        // Remove all approved products from Excel
        for (const product of approvedProducts) {
          const barcode = product.product_image ? product.product_image.split('/').pop().replace('.webp', '') : product._id;
          const productIndex = json.findIndex(p => {
            if (!p.products_id) return false;
            const pId = String(p.products_id).trim();
            const bId = String(barcode).trim();
            return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
          });
          if (productIndex !== -1) {
            json.splice(productIndex, 1);
          }
        }

        // Convert JSON back to sheet
        const newSheet = xlsx.utils.json_to_sheet(json);
        workbook.Sheets[sheetName] = newSheet;

        // Write workbook to buffer
        const wbout = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Upload updated Excel file back to Google Drive
        await drive.files.update({
          fileId,
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: wbout
          }
        });

        // Update output.json
        await downloadAndConvertExcel(fileId);
        await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update);
      }

      // Update sitemap
      sitemapService.generateSitemap();
    }

    // Delete products from database
    await Product.deleteMany({ _id: { $in: productIds }, merchantId });

    res.json({ success: true, message: 'Products deleted successfully' });
  } catch (error) {
    console.error('Error in bulkDeleteProducts:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getMerchantById(req, res) {
  try {
    const { id } = req.params;

    const merchant = await User.findById(id);

    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    // Only return approved merchants and basic public information
    if (!merchant.approved) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    res.json({
      success: true,
      merchant: {
        _id: merchant._id,
        merchantName: merchant.merchantName || merchant.username,
        name: merchant.username,
        email: merchant.email,
        phone: merchant.phone,
        governorate: merchant.governorate,
        city: merchant.city,
        village: merchant.village,
        logo: merchant.logo,
        coverPhoto: merchant.coverPhoto,
        bio: merchant.bio,
        shippingRates: merchant.shippingRates || [],
        preparationTime: merchant.preparationTime,
        merchantShippingMethod: merchant.merchantShippingMethod || 'knoozbook',
        createdAt: merchant.createdAt
      }
    });
  } catch (error) {
    console.error('Error in getMerchantById:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading merchant data'
    });
  }
}

async function getMerchantByUsername(req, res) {
  try {
    const rawUsername = req.params.username ? req.params.username.trim() : '';

    // Guard: ignore lookups that appear to be static assets (ending in common extensions)
    const fileExtensions = /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|map|ttf|woff|woff2)$/i;
    if (fileExtensions.test(rawUsername)) {
      return res.status(404).json({ success: false, message: 'Invalid merchant name' });
    }

    // Support slugged URLs: convert dashes to spaces for lookup
    const usernameWithSpaces = rawUsername.replace(/-/g, ' ');

    // Use regex for flexible matching (case-insensitive, ignore surrounding spaces, handle Arabic variations)
    const nameRegex = (name) => {
      let pattern = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Normalize Arabic characters in the regex pattern
      pattern = pattern
        .replace(/[أإآا]/g, '[أإآا]')
        .replace(/[ةه]/g, '[ةه]')
        .replace(/[ىي]/g, '[ىي]');
      return { $regex: new RegExp('^\\s*' + pattern + '\\s*$', 'i') };
    };

    const searchQuery = {
      role: 'merchant',
      $or: [
        { username: nameRegex(rawUsername) },
        { username: nameRegex(usernameWithSpaces) },
        { merchantName: nameRegex(rawUsername) },
        { merchantName: nameRegex(usernameWithSpaces) }
      ]
    };

    // Reduced noise: only log if we actually perform a real lookup (not an obvious asset request)
    // console.log('🔍 [DEBUG] Merchant Lookup Request for:', rawUsername);

    const merchant = await User.findOne(searchQuery);

    if (!merchant) {
      // Silenced: console.log('❌ [DEBUG] No merchant document matched the query.');
      // Let's also check if the user exists but has a different role
      const anyUser = await User.findOne({
        $or: [
          { username: rawUsername },
          { username: usernameWithSpaces },
          { merchantName: rawUsername },
          { merchantName: usernameWithSpaces }
        ]
      });
      if (anyUser) {
        // Silenced: console.log('⚠️ [DEBUG] Found a user but role is:', anyUser.role, 'Approved:', anyUser.approved);
      } else {
        // Silenced: console.log('❌ [DEBUG] Absolutely no user found with these names.');
      }
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    // Only return approved merchants and basic public information
    if (!merchant.approved) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found or not approved'
      });
    }

    res.json({
      success: true,
      merchant: {
        _id: merchant._id,
        merchantName: merchant.merchantName || merchant.username,
        name: merchant.merchantName || merchant.username,
        email: merchant.email,
        phone: merchant.phone,
        governorate: merchant.governorate,
        city: merchant.city,
        village: merchant.village,
        logo: merchant.logo,
        coverPhoto: merchant.coverPhoto,
        bio: merchant.bio,
        role: merchant.role,
      }
    });
  } catch (error) {
    console.error('Error in getMerchantByUsername:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading merchant data'
    });
  }
}

async function getProductsByMerchantId(req, res) {
  try {
    const { id } = req.params;

    // Check if merchant exists and is approved
    const merchant = await User.findById(id);
    if (!merchant || !merchant.approved) {
      return res.status(404).json({ success: false, message: 'Merchant not found' });
    }

    const Product = require('../models/Product.model');

    // Only return approved products for public viewing
    const products = await Product.find({
      merchantId: id,
      status: 'approved'
    }).sort({ createdAt: -1 }).lean();

    // Ensure products_id is present — use product_image (barcode) as fallback, NOT _id
    const enrichedProducts = products.map(p => ({
      ...p,
      products_id: p.products_id || p.product_image || p._id.toString(),
      shippingMethod: merchant.merchantShippingMethod || 'knoozbook'
    }));

    res.json({ success: true, products: enrichedProducts });
  } catch (error) {
    console.error('Error in getProductsByMerchantId:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function updateMerchantProfile(req, res) {
  try {
    const merchantId = req.merchant._id;
    const { name, phone, taxNumber, bio, preparationTime, merchantShippingMethod } = req.body;

    // Find the merchant
    const merchant = await User.findById(merchantId);
    if (!merchant) {
      return res.status(404).json({ success: false, message: 'Merchant not found' });
    }

    // Handle logo upload if provided
    let logoPath = undefined;
    const logoFile = req.files && req.files['logo'] ? req.files['logo'][0] : null;
    const sanitizedUsername = (name || merchant.username).replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');

    if (logoFile) {
      // Save logo image in uploads/books/merchant_username/logo/ folder
      const logoDir = path.join(__dirname, '../uploads/books', 'merchant_' + sanitizedUsername, 'logo');
      if (!fs.existsSync(logoDir)) {
        fs.mkdirSync(logoDir, { recursive: true });
      }

      const logoFilename = `logo.webp`;
      const logoFilepath = path.join(logoDir, logoFilename);

      try {
        await sharp(logoFile.buffer)
          .resize({ width: 400 }) // Resize logo width
          .webp({ quality: 85 })
          .toFile(logoFilepath);
        logoPath = `merchant_${sanitizedUsername}/logo/logo.webp`;
      } catch (sharpError) {
        console.error('Sharp error processing logo:', sharpError);
        // Fallback to original
        fs.writeFileSync(logoFilepath.replace('.webp', '.jpg'), logoFile.buffer);
        logoPath = `merchant_${sanitizedUsername}/logo/logo.jpg`;
      }
    }

    // Handle cover photo upload if provided
    let coverPhotoPath = undefined;
    const coverFile = req.files && req.files['coverPhoto'] ? req.files['coverPhoto'][0] : null;

    if (coverFile) {
      const coverDir = path.join(__dirname, '../uploads/books', 'merchant_' + sanitizedUsername, 'cover');
      if (!fs.existsSync(coverDir)) {
        fs.mkdirSync(coverDir, { recursive: true });
      }

      const coverFilename = `cover.webp`;
      const coverFilepath = path.join(coverDir, coverFilename);

      try {
        await sharp(coverFile.buffer)
          .resize({ width: 1920, height: 1080, fit: 'cover', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(coverFilepath);
        coverPhotoPath = `merchant_${sanitizedUsername}/cover/cover.webp`;
      } catch (sharpError) {
        console.error('Sharp error processing cover photo:', sharpError);
        fs.writeFileSync(coverFilepath.replace('.webp', '.jpg'), coverFile.buffer);
        coverPhotoPath = `merchant_${sanitizedUsername}/cover/cover.jpg`;
      }
    }

    // Update merchant data
    merchant.username = name || merchant.username;
    merchant.merchantName = name || merchant.merchantName;
    merchant.phone = phone || merchant.phone;
    merchant.taxNumber = taxNumber || merchant.taxNumber;
    merchant.bio = bio || merchant.bio;
    if (logoPath !== undefined) {
      merchant.logo = logoPath;
    }
    if (coverPhotoPath !== undefined) {
      merchant.coverPhoto = coverPhotoPath;
    }
    merchant.preparationTime = preparationTime || merchant.preparationTime || 1;
    if (merchantShippingMethod) {
      merchant.merchantShippingMethod = merchantShippingMethod;
    }

    await merchant.save();
    res.json({
      success: true,
      message: 'Profile updated successfully',
      merchant: {
        _id: merchant._id,
        merchantName: merchant.merchantName || merchant.username,
        name: merchant.username,
        email: merchant.email,
        phone: merchant.phone,
        taxNumber: merchant.taxNumber,
        logo: merchant.logo,
        coverPhoto: merchant.coverPhoto,
        bio: merchant.bio,
        preparationTime: merchant.preparationTime,
        merchantShippingMethod: merchant.merchantShippingMethod,
        approved: merchant.approved,
        suspended: merchant.suspended || false,
        createdAt: merchant.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Error in updateMerchantProfile:', error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'حجم ملف الصورة كبير جداً (الحد الأقصى 5 ميجابايت)' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getRecentOrdersForMerchant(req, res) {
  try {
    const merchantId = req.merchant._id;
    // Find all products that belong to this merchant
    const Product = require('../models/Product.model');
    const merchantProducts = await Product.find({ merchantId }).select('_id');

    if (merchantProducts.length === 0) {
      return res.json({ success: true, orders: [] });
    }

    const productIds = merchantProducts.map(p => p._id.toString());

    // Find orders that contain these products
    const orders = await Order.find({ 'products.productId': { $in: productIds } })
      .sort({ orderDate: -1 })
      .limit(5)
      .lean();

    // Calculate expected delivery date for each order using saved preparationTime
    const ordersWithDeliveryDate = orders.map(order => {
      const preparationTime = order.preparationTime || 1;
      const deliveryDate = new Date(order.orderDate);
      deliveryDate.setDate(deliveryDate.getDate() + preparationTime);
      return {
        ...order,
        expectedDeliveryDate: deliveryDate
      };
    });

    res.json({ success: true, orders: ordersWithDeliveryDate });
  } catch (error) {
    console.error('Error fetching recent orders:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function updateShippingRates(req, res) {
    const booksController = require('./books.controller');
    try {
        const { shippingRates, merchantShippingMethod } = req.body;
        const merchantId = req.merchant._id;
        
        console.log(`[MERCHANT-SHIPPING] Updating settings for merchant ${merchantId}. Method: ${merchantShippingMethod}, First rate:`, shippingRates ? shippingRates[0] : 'N/A');
        const merchant = await User.findById(merchantId);
        if (!merchant) {
            return res.status(404).json({ message: 'Merchant not found' });
        }

        if (shippingRates) {
            merchant.shippingRates = shippingRates;
        }
        
        if (merchantShippingMethod) {
            merchant.merchantShippingMethod = merchantShippingMethod;
        }

        await merchant.save();
        console.log(`[MERCHANT-SHIPPING] Successfully saved settings for ${merchantId}. Method is now: ${merchant.merchantShippingMethod}`);
        
        // Clear books cache so changes reflect in checkout immediately
        booksController.clearBooksCache();

        res.status(200).json({
            message: 'Shipping rates updated successfully',
            shippingRates: merchant.shippingRates,
            merchant: {
                _id: merchant._id,
                merchantName: merchant.merchantName || merchant.username,
                name: merchant.username,
                email: merchant.email,
                phone: merchant.phone,
                taxNumber: merchant.taxNumber,
                logo: merchant.logo,
                coverPhoto: merchant.coverPhoto,
                bio: merchant.bio,
                preparationTime: merchant.preparationTime,
                merchantShippingMethod: merchant.merchantShippingMethod,
                shippingRates: merchant.shippingRates,
                approved: merchant.approved,
                suspended: merchant.suspended || false,
                createdAt: merchant.createdAt
            }
        });
    } catch (error) {
        console.error('Error updating shipping rates:', error);
        res.status(500).json({ message: 'Error updating shipping rates', error: error.message });
    }
}

module.exports = {
  upload,
  registerMerchant,
  productUpload,
  addProduct,
  getCurrentMerchant,
  getMerchantProducts,
  getMerchantOrders,
  getRecentOrdersForMerchant,
  deleteMerchantOrder,
  submitProductUpdateRequest,
  getMerchantUpdateRequests,
  deleteProduct,
  bulkDeleteProducts,
  getMerchantById,
  getMerchantByUsername,
  getProductsByMerchantId,
  updateMerchantProfile,
  updateShippingRates
};
