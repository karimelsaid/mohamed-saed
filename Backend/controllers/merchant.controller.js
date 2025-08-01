const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const Merchant = require('../models/Merchant.model');

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

// Register a new merchant
async function registerMerchant(req, res) {
  try {
    const { name, email, phone, governorate, city, village, taxNumber } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if merchant with email already exists
    const existingMerchant = await Merchant.findOne({ email });
    if (existingMerchant) {
      return res.status(400).json({ success: false, message: 'Merchant with this email already exists' });
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

    const merchant = new Merchant({
      name,
      email,
      phone,
      governorate,
      city,
      village,
      taxNumber,
      logo: logoPath,
      approved: false
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


module.exports = {
  upload,
  registerMerchant
};
