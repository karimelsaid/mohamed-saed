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
  'أخرى': 'غير مصنف'
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

// Multer setup for logo upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1 MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PNG and JPG image files are allowed!'), false);
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

    // Return user data for auto-login (similar to login response)
    res.json({
      success: true,
      message: 'Merchant registered successfully. Awaiting admin approval.',
      token,
      merchant: {
        _id: merchant._id,
        merchantName: merchant.merchantName || merchant.username,
        name: merchant.username,
        email: merchant.email,
        phone: merchant.phone,
        governorate: merchant.governorate,
        city: merchant.city,
        village: merchant.village,
        taxNumber: merchant.taxNumber,
        logo: merchant.logo,
        approved: merchant.approved,
        suspended: merchant.suspended || false,
        role: 'merchant' // Add role property for frontend identification
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
  limits: { fileSize: 1024 * 1024 }, // 1 MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PNG and JPG image files are allowed!'), false);
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
    let { product_name, product_quantity, product_category, product_description, product_price, price_cost } = req.body;

    // Map merchant category to standard category
    product_category = merchantCategoryMap[product_category] || product_category;

    if (!product_name || !product_quantity || !product_category || !product_description || product_description.trim() === '') {
      return res.status(400).json({ success: false, message: 'Missing required fields or product description is empty' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }

    // Compress and save image using sharp
    const sanitizedUsername = req.merchant.username.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
    const imagePath = 'merchant_' + sanitizedUsername + '/' + barcode + '/' + barcode + '.webp';
    const uploadDir = getMerchantUploadDir(req.merchant.username, barcode);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filepath = path.join(uploadDir, barcode + '.webp');

    await sharp(req.file.buffer)
      .resize({ width: 800 }) // Resize width to max 800px, maintain aspect ratio
      .webp({ quality: 80 }) // Convert to webp with quality 80
      .toFile(filepath);

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
      product_image: imagePath,
      status: 'pending',
      merchantId: req.merchant._id,
      createdAt: new Date()
    });
    await newProduct.save();

    // Note: Product will be added to Excel only after admin approval
    // No Excel updates or sitemap generation for pending products

    res.json({ success: true, message: 'Product added successfully and pending admin approval', barcode });
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
        bio: merchant.bio,
        preparationTime: merchant.preparationTime,
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

    const products = await Product.find({ merchantId }).sort({ createdAt: -1 });
    res.json({ success: true, products });
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

          // Transform the order to match the expected format
          merchantOrders.push({
            _id: order._id,
            customerName: user.username,
            email: user.email,
            phone: user.phone,
            address: `${order.shippingAddress.governorate}, ${order.shippingAddress.city}, ${order.shippingAddress.village}`,
            products: transformedProducts,
            status: order.status,
            totalAmount: merchantTotalAmount,
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
      updatedProduct: updateData,
      status: 'pending'
    });

    await updateRequest.save();

    res.json({ success: true, message: 'Update request submitted successfully' });
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

    // Delete product image if exists
    if (product.product_image) {
      const uploadDir = path.join(__dirname, 'uploads/books');
      const imagePath = path.join(uploadDir, product.product_image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
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

    // Delete product images
    for (const product of products) {
      if (product.product_image) {
        const uploadDir = path.join(__dirname, 'uploads/books');
        const imagePath = path.join(uploadDir, product.product_image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
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
        bio: merchant.bio,
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
    }).sort({ createdAt: -1 });

    res.json({ success: true, products });
  } catch (error) {
    console.error('Error in getProductsByMerchantId:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function updateMerchantProfile(req, res) {
  try {
    const merchantId = req.merchant._id;
    const { name, phone, taxNumber, bio, preparationTime } = req.body;

    // Removed console logs for cleaner output
    // console.log('🔄 Starting updateMerchantProfile for merchant:', merchantId);
    // console.log('📝 Request body:', { name, phone, taxNumber, bio, preparationTime });
    // console.log('📁 File received:', req.file ? 'YES' : 'NO');
    // if (req.file) {
    //   console.log('📁 File details:', { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size });
    // }

    // Find the merchant
    const merchant = await User.findById(merchantId);
    if (!merchant) {
      // console.log('❌ Merchant not found:', merchantId);
      return res.status(404).json({ success: false, message: 'Merchant not found' });
    }

    // console.log('👤 Current merchant logo:', merchant.logo);

    // Handle logo upload if provided
    let logoPath = undefined; // Don't set logo by default
    if (req.file) {
      // console.log('🖼️ Processing logo upload...');
      // console.log('📁 File details:', {
      //   fieldname: req.file.fieldname,
      //   originalname: req.file.originalname,
      //   encoding: req.file.encoding,
      //   mimetype: req.file.mimetype,
      //   size: req.file.size,
      //   bufferLength: req.file.buffer ? req.file.buffer.length : 'NO BUFFER'
      // });

      // Sanitize merchant name for folder name
      const sanitizedUsername = (name || merchant.username).replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      // console.log('📁 Sanitized username:', sanitizedUsername);

      // Save logo image in uploads/books/merchant_username/logo/ folder
      const uploadDir = path.join(__dirname, '../uploads/books', 'merchant_' + sanitizedUsername, 'logo');
      // console.log('📁 Upload directory:', uploadDir);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        // console.log('📁 Created upload directory');
      }

      const filename = `logo.webp`;
      const filepath = path.join(uploadDir, filename);
      // console.log('📁 File path:', filepath);

      try {
        // console.log('🔄 Starting Sharp processing...');
        await sharp(req.file.buffer)
          .resize({ width: 300 }) // Resize logo width to max 300px
          .webp({ quality: 80 })
          .toFile(filepath);
        // console.log('✅ Logo processed and saved successfully');
      } catch (sharpError) {
        // console.error('❌ Sharp processing error:', sharpError);
        // Try to save the original file as fallback
        try {
          // console.log('🔄 Trying to save original file as fallback...');
          fs.writeFileSync(filepath.replace('.webp', '.jpg'), req.file.buffer);
          logoPath = `merchant_${sanitizedUsername}/logo/logo.jpg`;
          // console.log('✅ Original file saved as JPG fallback');
        } catch (fallbackError) {
          // console.error('❌ Fallback save also failed:', fallbackError);
          throw sharpError; // Re-throw the original error
        }
      }

      logoPath = `merchant_${sanitizedUsername}/logo/logo.webp`; // Store path relative to uploads/books/
      // console.log('🖼️ Logo path set to:', logoPath);

      // Delete old logo file if exists
      if (merchant.logo) {
        const oldLogoPath = path.join(__dirname, 'uploads/books', merchant.logo);
        // console.log('🗑️ Checking old logo path:', oldLogoPath);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
          // console.log('🗑️ Deleted old logo file');
        } else {
          // console.log('🗑️ Old logo file not found');
        }
      }
    } else {
      // console.log('🖼️ No logo file provided');
    }

    // Update merchant data
    // console.log('📝 Updating merchant data...');
    merchant.username = name || merchant.username;
    merchant.merchantName = name || merchant.merchantName;
    merchant.phone = phone || merchant.phone;
    merchant.taxNumber = taxNumber || merchant.taxNumber;
    merchant.bio = bio || merchant.bio;
    if (logoPath !== undefined) {
      // console.log('🖼️ Setting new logo path:', logoPath);
      merchant.logo = logoPath;
    } else {
      // console.log('🖼️ Logo path not changed');
    }
    merchant.preparationTime = preparationTime || merchant.preparationTime || 1;

    // console.log('💾 Saving merchant...');
    await merchant.save();
    // console.log('✅ Merchant saved successfully');

    // console.log('📤 Sending response...');
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
        bio: merchant.bio,
        preparationTime: merchant.preparationTime,
        approved: merchant.approved,
        suspended: merchant.suspended || false,
        createdAt: merchant.createdAt
      }
    });
    // console.log('✅ Response sent successfully');
  } catch (error) {
    console.error('❌ Error in updateMerchantProfile:', error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Logo file size exceeds 1 MB limit' });
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
  getProductsByMerchantId,
  updateMerchantProfile
};
