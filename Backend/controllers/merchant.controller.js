const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const User = require('../models/User.model');
const bcrypt = require('bcrypt');

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
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if user with email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    let logoPath = '';
    if (req.file) {
      // Sanitize merchant name for folder name
      const merchantName = req.body.name.replace(/[^a-zA-Z0-9-_]/g, '_');
      // Save logo image in merchant folder inside uploads/books
      const uploadDir = path.join(__dirname, '../uploads/books', merchantName);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filename = `merchant_logo_${Date.now()}.webp`;
      const filepath = path.join(uploadDir, filename);

      await sharp(req.file.buffer)
        .resize({ width: 300 }) // Resize logo width to max 300px
        .webp({ quality: 80 })
        .toFile(filepath);

      logoPath = path.join(merchantName, filename);
    }

    const userPassword = password || 'defaultPassword123';
    const hashedPassword = await bcrypt.hash(userPassword, 12);

    const merchant = new User({
      username: name,
      email,
      password: hashedPassword,
      phone,
      governorate,
      city,
      village,
      role: 'merchant',
      taxNumber,
      logo: logoPath,
      approved: false,
      merchantName: name
    });

    await merchant.save();

    res.json({ success: true, message: 'Merchant registered successfully. Awaiting admin approval.' });
  } catch (error) {
    console.error('Error in registerMerchant:', error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Logo file size exceeds 1 MB limit' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
}


const Product = require('../models/Product.model'); // Assuming there is a Product model

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
    console.log('Received addProduct request body:', req.body);
    console.log('Received addProduct request file:', req.file);

    const { product_name, product_quantity, product_category, product_description, product_price, price_cost, merchantId } = req.body;
    if (!product_name || !product_quantity || !product_category || !product_description || !product_price || !price_cost || !merchantId) {
      return res.status(400).json({ success: false, message: 'All product fields are required' });
    }

    let productImagePath = '';
    if (req.file) {
      // Save product image in uploads/products folder
      const uploadDir = path.join(__dirname, '../uploads/products');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filename = `product_image_${Date.now()}.webp`;
      const filepath = path.join(uploadDir, filename);

      await sharp(req.file.buffer)
        .resize({ width: 600 }) // Resize product image width to max 600px
        .webp({ quality: 80 })
        .toFile(filepath);

      productImagePath = filename;
    }

    const product = new Product({
      product_name,
      product_quantity,
      product_category,
      product_description,
      product_price,
      price_cost,
      product_image: productImagePath,
      status: 'pending', // Mark product as pending admin approval
      merchantId
    });

    await product.save();

    res.json({ success: true, message: 'Product added successfully and pending admin approval' });
  } catch (error) {
    console.error('Error in addProduct:', error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Product image file size exceeds 1 MB limit' });
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
        ...merchant.toObject(),
        isApproved: merchant.approved
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
    console.error('Error in getMerchantProducts:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getMerchantOrders(req, res) {
  try {
    const merchantId = req.merchant._id;
    const Order = require('../models/Order.model');

    const orders = await Order.find({ merchantId }).sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Error in getMerchantOrders:', error);
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
  getMerchantOrders
};
