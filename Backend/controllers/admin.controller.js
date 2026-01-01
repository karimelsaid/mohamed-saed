const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { addProductToExcel, categoryMap, reverseCategoryMap, downloadAndConvertExcel, updateExcelFromJson } = require('../services/excel.service');

// Mapping from Arabic short keys to English enum values used in Ebook model
const englishCategoryMap = {
  'رواية': 'Novels-stories',
  'تنمية': 'Self-development-psychology',
  'ديني': 'Islamic',
  'صحة': 'HealthMedicineScience',
  'اعمال': 'Business-Marketing-Finance',
  'فن': 'Arts-crafts',
  'تاريخ': 'History-Biographies',
  'تربية': 'Education-children',
  'قاموس': 'Dictionaries-References',
  // add other mappings as needed
};
const sitemapService = require('../services/sitemap.service');

const PromotionDate = require('../models/PromotionDate.model');
const PaymentRequest = require('../models/PaymentRequest.model');
const Referral = require('../models/Referral.model');
const Ebook = require('../models/Ebook.model');
const Donation = require('../models/Donation.model');
const { createMiniEpub } = require('../services/epub.service');

// Helper function to generate random barcode string
function generateRandomBarcode(length = 12) {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper function to get admin upload directory
function getAdminUploadDir(adminUsername, barcode) {
  const sanitizedUsername = adminUsername.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(__dirname, '../uploads/books', 'admin_' + sanitizedUsername, barcode);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    // Accept image files
    if (file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }

    // Accept EPUB files (strict mime or fallback to extension)
    // Common MIME types for EPUB: application/epub+zip, application/epub, application/zip, application/octet-stream
    const isEpubMime = file.mimetype === 'application/epub+zip' || file.mimetype === 'application/epub' || file.mimetype === 'application/zip' || file.mimetype === 'application/octet-stream';
    const isEpubExt = file.originalname.toLowerCase().endsWith('.epub');

    if (isEpubMime && isEpubExt) {
      cb(null, true);
    } else if (file.mimetype === 'application/epub+zip' || file.mimetype === 'application/epub') {
      cb(null, true);
    } else {
      console.log('Rejected file:', file.originalname, 'Mime:', file.mimetype);
      cb(new Error('Only image and EPUB files are allowed!'), false);
    }
  }
});

async function addProduct(req, res) {
  try {
    // Generate barcode if not present
    if (!req.generatedBarcode) {
      req.generatedBarcode = generateRandomBarcode();
    }
    const barcode = req.generatedBarcode;
    const {
      product_name,
      product_quantity,
      product_category,
      product_description,
      product_price,
      price_cost,
      author, publisher, pages, coverType, language, publishYear, // Book fields
      stationeryType, material, color, size, brand, // Stationery fields
      electronicsType, model, specs, warranty, // Electronics fields
      clothingType, season, originCountry, // Clothing fields
      cosmeticsType, sizeWeight, ingredients, suitableFor, // Cosmetics fields
      shoeType, // Shoe fields
      furnitureType, height, deliveryMethod, // Furniture fields
      toyType, ageGroup, safety, // Toy fields
      fabricType, width, length, usage, // Fabric fields
      suggestedCategory // Unclassified fields
    } = req.body;

    if (!product_name || !product_quantity || !product_category) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }

    // Compress and save image in multiple formats using sharp
    const uploadDir = getAdminUploadDir(req.admin.username, barcode);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const imageFiles = req.files.filter(f => f.mimetype.startsWith('image/'));
    const epubFile = req.files.find(f => f.mimetype === 'application/epub+zip');

    if (imageFiles.length === 0) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }



    const isMultiple = imageFiles.length > 1;
    const filenames = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const suffix = isMultiple ? (i === 0 ? '' : '_' + i) : '';

      // WebP
      const webpPath = path.join(uploadDir, barcode + suffix + '.webp');
      await sharp(file.buffer)
        .resize({ width: 800 }) // Resize width to max 800px, maintain aspect ratio
        .webp({ quality: 80 })
        .toFile(webpPath);

      filenames.push(barcode + suffix + '.webp');
    }

    const filename = filenames[0];

    // Handle EPUB upload if present
    let linkedEbookId = null;
    let epubFilePath = '';
    let miniEpubFilePath = '';

    if (epubFile) {
      const sanitizedTitle = product_name.replace(/[^a-zA-Z0-9]/g, '_');

      const fileExt = '.epub';
      const newFileName = `${sanitizedTitle}_${barcode}${fileExt}`; // Use barcode for uniqueness
      const ebooksDir = path.join(__dirname, '../uploads/ebooks');
      if (!fs.existsSync(ebooksDir)) {
        fs.mkdirSync(ebooksDir, { recursive: true });
      }
      const newPath = path.join(ebooksDir, newFileName);

      // Write buffer to file
      fs.writeFileSync(newPath, epubFile.buffer);

      const relativePath = path.join('uploads', 'ebooks', newFileName);
      epubFilePath = relativePath;

      // Create Ebook record
      const ebook = await Ebook.create({
        title: product_name,
        author: author || 'Unknown',
        description: product_description,
        coverImage: filename, // Use the product image as cover
        epubFilePath: epubFilePath,
        // miniEpubFilePath: miniEpubFilePath, // Removed Mini Version
        fileSize: epubFile.size,
        category: product_category,
        pages: pages || 0,
        price: parseFloat(product_price) || 0,
        availableForSubscription: true // Default to true
      });

      linkedEbookId = ebook._id;
    }

    // Convert full category name to short key if necessary
    const shortCategoryKey = reverseCategoryMap[product_category] || product_category;

    // Determine category prefix based on categoryMap keys
    let categoryPrefix = '';
    if (categoryMap.hasOwnProperty(shortCategoryKey)) {
      if (shortCategoryKey === 'رواية') {
        categoryPrefix = 'رواية-';
      } else if (shortCategoryKey === 'تنمية') {
        categoryPrefix = 'تنمية-';
      } else if (shortCategoryKey === 'ديني') {
        categoryPrefix = 'ديني-';
      } else if (shortCategoryKey === 'قاموس') {
        categoryPrefix = 'قاموس-';
      } else if (shortCategoryKey === 'صحة') {
        categoryPrefix = 'صحة-';
      } else if (shortCategoryKey === 'اعمال') {
        categoryPrefix = 'اعمال-';
      } else if (shortCategoryKey === 'فن') {
        categoryPrefix = 'فن-';
      } else if (shortCategoryKey === 'تاريخ') {
        categoryPrefix = 'تاريخ-';
      } else if (shortCategoryKey === 'تربية') {
        categoryPrefix = 'تربية-';
      } else if (shortCategoryKey === 'ادوات') {
        categoryPrefix = 'ادوات-';
      } else if (shortCategoryKey === 'الكترونيات') {
        categoryPrefix = 'الكترونيات-';
      } else if (shortCategoryKey === 'ملابس') {
        categoryPrefix = 'ملابس-';
      } else if (shortCategoryKey === 'تجميل') {
        categoryPrefix = 'تجميل-';
      } else if (shortCategoryKey === 'احذية') {
        categoryPrefix = 'احذية-';
      } else if (shortCategoryKey === 'اثاث') { // without hamza
        categoryPrefix = 'اثاث-';
      } else if (shortCategoryKey === 'العاب') { // without hamza
        categoryPrefix = 'العاب-';
      } else if (shortCategoryKey === 'أقمشة') {
        categoryPrefix = 'أقمشة-';
      } else if (shortCategoryKey === 'اخرى') {
        categoryPrefix = 'اخرى-';
      }
    }

    // Prepare product data
    const adminName = req.admin.username.replace(/[^a-zA-Z0-9-_]/g, '_');
    const image_path = '/uploads/books/admin_' + adminName + '/' + barcode + '/' + filename;
    const productData = {
      barcode,
      product_name,
      product_quantity: parseInt(product_quantity, 10),
      product_category: shortCategoryKey,
      product_description,
      categoryPrefix,
      product_price: parseFloat(product_price) || 0,
      price_cost: parseFloat(price_cost) || 0,
      image_path,
      product_image: filename,
      author: author || '',
      publisher: publisher || '',
      pages: pages || '',
      coverType: coverType || '',
      language: language || '',
      publishYear: publishYear || '',
      stationeryType: stationeryType || '',
      material: material || '',
      color: color || '',
      size: size || '',
      brand: brand || '',
      electronicsType: electronicsType || '',
      model: model || '',
      specs: specs || '',
      warranty: warranty || '',
      clothingType: clothingType || '',
      season: season || '',
      originCountry: originCountry || '',
      cosmeticsType: cosmeticsType || '',
      sizeWeight: sizeWeight || '',
      ingredients: ingredients || '',
      suitableFor: suitableFor || '',
      shoeType: shoeType || '',
      furnitureType: furnitureType || '',
      height: height || '',
      deliveryMethod: deliveryMethod || '',
      toyType: toyType || '',
      ageGroup: ageGroup || '',
      safety: safety || '',
      fabricType: fabricType || '',
      width: width || '',
      length: length || '',
      usage: usage || '',
      suggestedCategory: suggestedCategory || '',
      suggestedCategory: suggestedCategory || '',
      linkedEbookId: linkedEbookId ? linkedEbookId.toString() : '',
      epubFilePath: epubFilePath || '',
      miniEpubFilePath: miniEpubFilePath || '',
      createdAt: new Date().toISOString() // Add createdAt field with current timestamp
    };

    // Call service to add product to Excel
    await addProductToExcel(productData);

    // Update Excel file after product addition
    // await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_ID); // Redundant: addProductToExcel already updates the file
    // Then update the update file to keep in sync
    // await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update); // Optimized: Background this or remove if possible, but for now just commenting the main redundant one.
    // Removed second update to main file
    // await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_ID);

    // Update sitemap.xml after product addition
    sitemapService.generateSitemap();

    res.json({ success: true, message: 'Product added successfully', barcode });
  } catch (error) {
    console.error('Error in addProduct:', error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Image file size exceeds 3 MB limit' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// New API to list all products
async function listProducts(req, res) {
  try {
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(__dirname, '..', 'output.json');
    const ebookMappingsPath = path.join(__dirname, '..', 'ebook-mappings.json');
    let products;

    // Check if output.json exists and is less than 5 minutes old
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const now = new Date().getTime();
      const fileTime = stats.mtime.getTime();
      const fiveMinutes = 5 * 60 * 1000;
      if (now - fileTime < fiveMinutes) {
        // Read from cache
        products = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      } else {
        // File is old, try to download fresh
        try {
          products = await downloadAndConvertExcel(process.env.GOOGLE_DRIVE_FILE_ID);
        } catch (downloadError) {
          console.error('Error refreshing product list from Google Drive:', downloadError.message);
          console.warn('Falling back to cached output.json due to download failure.');
          // Fallback to cache if download fails
          products = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
          // Optionally append a warning flag to the response?
        }
      }
    } else {
      // File doesn't exist, must download
      products = await downloadAndConvertExcel(process.env.GOOGLE_DRIVE_FILE_ID);
    }

    // Merge linkedEbookId from persistent ebook-mappings.json
    if (fs.existsSync(ebookMappingsPath)) {
      try {
        let ebookMappings = JSON.parse(fs.readFileSync(ebookMappingsPath, 'utf-8'));
        let mappingsChanged = false;

        // Get all valid Ebook IDs from DB
        const Ebook = require('../models/Ebook.model');
        const validEbookIds = await Ebook.find({}, '_id').lean();
        const validEbookIdSet = new Set(validEbookIds.map(e => e._id.toString()));

        products.forEach(product => {
          const barcode = String(product.products_id).trim();
          if (ebookMappings[barcode]) {
            const mappedId = ebookMappings[barcode];
            if (validEbookIdSet.has(mappedId)) {
              product.linkedEbookId = mappedId;
            } else {
              // Found a stale mapping, remove it
              delete ebookMappings[barcode];
              mappingsChanged = true;
              // Also clear it from the product if it was somehow already there
              delete product.linkedEbookId;
            }
          }
        });

        if (mappingsChanged) {
          fs.writeFileSync(ebookMappingsPath, JSON.stringify(ebookMappings, null, 2));
          console.log('🧹 Cleaned up stale ebook mappings');
        }

        console.log('📚 Merged linkedEbookId from ebook-mappings.json');
      } catch (e) {
        console.error('Error reading ebook-mappings.json:', e);
      }
    }

    // Do not map product_category back to short keys, send as is
    res.json({ success: true, products });
  } catch (error) {
    console.error('Error in listProducts:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// New API to update product details
async function updateProduct(req, res) {
  try {
    const { barcode } = req.params;
    const { product_name, product_quantity, product_category, product_description, product_price, price_cost } = req.body;

    if (!barcode) {
      return res.status(400).json({ success: false, message: 'Missing product barcode' });
    }

    // Download current Excel file
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    if (!fileId) {
      return res.status(500).json({ success: false, message: 'Missing Google Drive file ID' });
    }

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

    // Find product by barcode and update fields
    const productIndex = json.findIndex(p => {
      if (!p.products_id) return false;
      const pId = String(p.products_id).trim();
      const bId = String(barcode).trim();
      return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
    });
    if (productIndex === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product_name !== undefined) json[productIndex].product_name = product_name;
    if (product_quantity !== undefined) json[productIndex].product_quantity = product_quantity;
    if (product_category !== undefined) json[productIndex].product_category = product_category;
    if (product_description !== undefined) json[productIndex].product_description = product_description;
    if (product_price !== undefined) json[productIndex].product_price = product_price;
    if (price_cost !== undefined) json[productIndex].price_cost = price_cost;

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

    // Update output.json by re-running downloadAndConvertExcel
    await downloadAndConvertExcel(fileId);

    // Update Excel file after product update
    await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update);
    // Removed additional update to main file as per user request
    // await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_ID);

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error in updateProduct:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// New API to batch update multiple products
async function batchUpdateProducts(req, res) {
  try {
    const products = req.body.products;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: 'No products provided for batch update' });
    }

    // Download current Excel file
    const fileId = process.env.GOOGLE_DRIVE_FILE_update;
    if (!fileId) {
      return res.status(500).json({ success: false, message: 'Missing Google Drive file ID' });
    }

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

    // Update products in JSON
    products.forEach(update => {
      const productIndex = json.findIndex(p => {
        if (!p.products_id) return false;
        const pId = String(p.products_id).trim();
        const bId = String(update.products_id).trim();
        return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
      });
      if (productIndex !== -1) {
        if (update.product_name !== undefined) json[productIndex].product_name = update.product_name;
        if (update.product_quantity !== undefined) json[productIndex].product_quantity = update.product_quantity;
        if (update.product_category !== undefined) json[productIndex].product_category = update.product_category;
        if (update.product_description !== undefined) json[productIndex].product_description = update.product_description;
        if (update.product_price !== undefined) json[productIndex].product_price = update.product_price;
        if (update.price_cost !== undefined) json[productIndex].price_cost = update.price_cost;
      }
    });

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

    // Update output.json by re-running downloadAndConvertExcel
    await downloadAndConvertExcel(fileId);

    // Update Excel file after batch update
    await updateExcelFromJson(fileId);

    res.json({ success: true, message: 'Batch update of products successful' });
  } catch (error) {
    console.error('Error in batchUpdateProducts:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// New API to replace product image
async function replaceProductImage(req, res) {
  try {
    const { barcode } = req.params;
    if (!barcode) {
      return res.status(400).json({ success: false, message: 'Missing product barcode' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }

    const uploadDir = getAdminUploadDir(req.admin.username, barcode);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filename = barcode + '.webp';
    const filepath = path.join(uploadDir, filename);

    // Compress and save image using sharp
    await sharp(req.file.buffer)
      .resize({ width: 800 }) // Resize width to max 800px, maintain aspect ratio
      .webp({ quality: 80 }) // Convert to webp with quality 80
      .toFile(filepath);

    res.json({ success: true, message: 'Product image replaced successfully' });
  } catch (error) {
    console.error('Error in replaceProductImage:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// New API to replace product EPUB
async function replaceProductEpub(req, res) {
  try {
    const { barcode } = req.params;
    if (!barcode) {
      return res.status(400).json({ success: false, message: 'Missing product barcode' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'EPUB file is required' });
    }

    // Find product to get details (like name)
    const outputPath = path.join(__dirname, '..', 'output.json');
    const products = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const product = products.find(p => String(p.products_id).trim() === String(barcode).trim());

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const sanitizedTitle = product.product_name.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');

    // Check if Ebook exists
    let ebook;
    if (product.linkedEbookId) {
      ebook = await Ebook.findById(product.linkedEbookId);
    }

    if (!ebook) {
      // Map Arabic category (short or full) to English enum value
      let englishCategory = englishCategoryMap[product.product_category];
      if (!englishCategory) {
        // If product_category is a full Arabic name, get its short key via reverseCategoryMap
        const shortKey = reverseCategoryMap[product.product_category] || product.product_category;
        // Then map the short key to English enum
        englishCategory = englishCategoryMap[shortKey] || 'Novels-stories';
      }

      // Auto-detect language from product name
      const hasEnglishChars = /[a-zA-Z]/.test(product.product_name);
      const hasArabicChars = /[\u0600-\u06FF]/.test(product.product_name);
      const detectedLanguage = hasEnglishChars && !hasArabicChars ? 'English' : 'العربية';

      // Create new Ebook if not existing
      ebook = new Ebook({
        title: product.product_name,
        author: product.author || 'Unknown',
        description: product.product_description,
        coverImage: product.product_image, // Will be updated after copying cover image
        category: englishCategory,
        language: detectedLanguage,
        pages: product.pages || 0,
        price: parseFloat(product.product_price) || 0,
        relatedProductId: product.products_id || product.barcode, // Store product ID (or barcode) for linking
        availableForSubscription: true
      });
    }

    const fileExt = '.epub';
    const newFileName = `${sanitizedTitle}_${ebook._id}${fileExt}`;
    const miniFileName = `${sanitizedTitle}_${ebook._id}_mini${fileExt}`;
    const ebooksDir = path.join(__dirname, '../uploads/ebooks');
    if (!fs.existsSync(ebooksDir)) {
      fs.mkdirSync(ebooksDir, { recursive: true });
    }
    const newPath = path.join(ebooksDir, newFileName);

    // Write buffer to file
    // Write buffer to file
    // Check if updating existing ebook, delete old files if name changed
    if (ebook.epubFilePath && ebook.epubFilePath !== `uploads/ebooks/${newFileName}`) {
      const oldPath = path.join(__dirname, '..', ebook.epubFilePath);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
          console.log('🗑️ Deleted old EPUB file:', oldPath);
        } catch (err) {
          console.error('Error deleting old EPUB:', err);
        }
      }
    }
    if (ebook.miniEpubFilePath && ebook.miniEpubFilePath !== `uploads/ebooks/${miniFileName}`) {
      const oldMiniPath = path.join(__dirname, '..', ebook.miniEpubFilePath);
      if (fs.existsSync(oldMiniPath)) {
        try {
          fs.unlinkSync(oldMiniPath);
          console.log('🗑️ Deleted old Mini EPUB file:', oldMiniPath);
        } catch (err) { console.error('Error deleting old Mini EPUB:', err); }
      }
    }

    fs.writeFileSync(newPath, req.file.buffer);

    // Use forward slashes for DB storage to avoid OS-specific path issues
    const relativePath = `uploads/ebooks/${newFileName}`;
    ebook.epubFilePath = relativePath;
    ebook.fileSize = req.file.size;



    // Copy product cover image to ebooks directory with bookName_ebookId.webp format
    const productImagePath = path.join(__dirname, '../uploads/books/admin__karim_mohamed__', barcode, `${barcode}.webp`);
    const coverFileName = `${sanitizedTitle}_${ebook._id}.webp`;
    const coverPath = path.join(ebooksDir, coverFileName);

    if (fs.existsSync(productImagePath)) {
      try {
        fs.copyFileSync(productImagePath, coverPath);
        // Store with forward slashes
        ebook.coverImage = `uploads/ebooks/${coverFileName}`;
        console.log(`✅ Cover image copied: ${coverFileName}`);
      } catch (copyError) {
        console.error('Error copying cover image:', copyError);
        // Keep original product_image as fallback
      }
    } else {
      console.log(`⚠️ Product image not found at: ${productImagePath}`);
      // Keep original product_image as fallback
    }

    // Generate Mini Version (REMOVED)
    // const miniPath = path.join(ebooksDir, miniFileName);
    // const miniCreated = await createMiniEpub(newPath, miniPath);
    // if (miniCreated) { ebook.miniEpubFilePath = `uploads/ebooks/${miniFileName}`; }

    // Explicitly clear mini path if it was set
    ebook.miniEpubFilePath = null;

    // Ensure relatedProductId is updated/set (prioritize barcode for linking)
    // Use product.barcode from Excel, or fallback to the requested barcode, or products_id
    ebook.relatedProductId = product.barcode || req.body.barcode || product.products_id;

    await ebook.save();

    // Update product with linkedEbookId
    console.log('💾 Saving linkedEbookId:', ebook._id.toString(), 'for product:', barcode);

    // Save to persistent ebook-mappings.json (survives Excel refresh)
    const ebookMappingsPath = path.join(__dirname, '..', 'ebook-mappings.json');
    let ebookMappings = {};
    if (fs.existsSync(ebookMappingsPath)) {
      try {
        ebookMappings = JSON.parse(fs.readFileSync(ebookMappingsPath, 'utf-8'));
      } catch (e) {
        ebookMappings = {};
      }
    }
    ebookMappings[barcode] = ebook._id.toString();
    fs.writeFileSync(ebookMappingsPath, JSON.stringify(ebookMappings, null, 2));
    console.log('✅ linkedEbookId saved to ebook-mappings.json');

    // Update local JSON array - always update to ensure it's saved
    const productIndex = products.findIndex(p => String(p.products_id).trim() === String(barcode).trim());
    if (productIndex !== -1) {
      products[productIndex].linkedEbookId = ebook._id.toString();
      fs.writeFileSync(outputPath, JSON.stringify(products, null, 2));
      console.log('✅ linkedEbookId saved to output.json for product index:', productIndex);

      // Sync to Excel (commented out to prevent Google Drive timeout errors)
      // await updateExcelFromJson();
    } else {
      console.log('❌ Product not found in products array for barcode:', barcode);
    }

    res.json({ success: true, message: 'Product EPUB replaced successfully', linkedEbookId: ebook._id });
  } catch (error) {
    console.error('Error in replaceProductEpub:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function deleteProduct(req, res) {
  const { barcode } = req.params;
  if (!barcode) {
    return res.status(400).json({ success: false, message: 'Missing product barcode' });
  }

  try {
    // Find the product in the output.json to determine if it's an admin or merchant product
    const outputPath = path.join(__dirname, '..', 'output.json');
    const products = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const productInfo = products.find(p => String(p.products_id).trim() === String(barcode).trim());

    if (productInfo && productInfo.merchantId) {
      // It's a merchant product, find the merchant to build the correct path
      const merchantUser = await User.findById(productInfo.merchantId);
      if (merchantUser) {
        const merchantUploadDir = path.join(__dirname, '../uploads/books', 'merchant_' + merchantUser.username.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_'), barcode);
        if (fs.existsSync(merchantUploadDir)) {
          fs.rmSync(merchantUploadDir, { recursive: true, force: true });
        }
      }
    } else {
      // It's an admin product
      const adminUploadDir = getAdminUploadDir(req.admin.username, barcode);
      if (fs.existsSync(adminUploadDir)) {
        fs.rmSync(adminUploadDir, { recursive: true, force: true });
      }
    }

    // Download current Excel file
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    if (!fileId) {
      return res.status(500).json({ success: false, message: 'Missing Google Drive file ID' });
    }

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

    // Find product by barcode and remove it with flexible comparison
    const productIndex = json.findIndex(p => {
      if (!p.products_id) return false;
      const pId = String(p.products_id).trim();
      const bId = String(barcode).trim();
      return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
    });
    if (productIndex === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    // Get product data before removing
    const productData = json[productIndex];
    json.splice(productIndex, 1);

    // Convert JSON back to sheet
    const newSheet = xlsx.utils.json_to_sheet(json);
    workbook.Sheets[sheetName] = newSheet;

    // Write workbook to buffer
    const wbout = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Upload updated Excel file back to Google Drive
    try {
      await drive.files.update({
        fileId,
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.from(wbout)
        }
      });
    } catch (uploadError) {
      console.error('Error uploading updated Excel file:', uploadError);
      return res.status(500).json({ success: false, message: 'Error uploading updated Excel file' });
    }

    // Update output.json by re-running downloadAndConvertExcel
    try {
      await require('../services/excel.service').downloadAndConvertExcel(fileId);
    } catch (updateError) {
      console.error('Error updating output.json after Excel update:', updateError);
      return res.status(500).json({ success: false, message: 'Error updating output.json after Excel update' });
    }

    // Delete from Product model (covers both admin and merchant products)
    await require('../models/Product.model').deleteMany({ product_image: { $regex: barcode } });

    res.json({ success: true, message: 'Product deleted successfully from admin and merchant' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function bulkDeleteProducts(req, res) {
  try {
    const { barcodes } = req.body;
    if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
      return res.status(400).json({ success: false, message: 'Barcodes array is required and must not be empty' });
    }

    // Delete product folders if they exist
    for (const barcode of barcodes) {
      const uploadDir = getAdminUploadDir(req.admin.username, barcode);
      if (fs.existsSync(uploadDir)) {
        fs.rmSync(uploadDir, { recursive: true, force: true });
      }
    }

    // Download current Excel file
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    if (!fileId) {
      return res.status(500).json({ success: false, message: 'Missing Google Drive file ID' });
    }

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

    // Remove products by barcodes
    let deletedCount = 0;
    for (const barcode of barcodes) {
      const productIndex = json.findIndex(p => {
        if (!p.products_id) return false;
        const pId = String(p.products_id).trim();
        const bId = String(barcode).trim();
        return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
      });
      if (productIndex !== -1) {
        json.splice(productIndex, 1);
        deletedCount++;
      }
    }

    if (deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'No products found to delete' });
    }

    // Convert JSON back to sheet
    const newSheet = xlsx.utils.json_to_sheet(json);
    workbook.Sheets[sheetName] = newSheet;

    // Write workbook to buffer
    const wbout = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Upload updated Excel file back to Google Drive
    try {
      await drive.files.update({
        fileId,
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.from(wbout)
        }
      });
    } catch (uploadError) {
      console.error('Error uploading updated Excel file:', uploadError);
      return res.status(500).json({ success: false, message: 'Error uploading updated Excel file' });
    }

    // Update output.json by re-running downloadAndConvertExcel
    try {
      await require('../services/excel.service').downloadAndConvertExcel(fileId);
    } catch (updateError) {
      console.error('Error updating output.json after Excel update:', updateError);
      return res.status(500).json({ success: false, message: 'Error updating output.json after Excel update' });
    }

    // Delete from Product model for each barcode (admin products)
    for (const bc of barcodes) {
      await Product.deleteMany({ product_image: bc + '.webp' });
    }

    // Now delete from merchant's products and uploads folders
    const User = require('../models/User.model');
    const ProductModel = require('../models/Product.model');

    // Find all merchant products that match the barcodes
    const merchantProducts = await ProductModel.find({ product_image: { $in: barcodes.map(bc => new RegExp(bc)) } });

    for (const product of merchantProducts) {
      const merchantId = product.merchantId;
      if (merchantId) {
        // Find merchant username
        const merchantUser = await User.findById(merchantId);
        if (merchantUser && merchantUser.username) {
          const merchantUsername = merchantUser.username;
          const barcode = product.product_image ? product.product_image.split('/').pop().replace('.webp', '') : product._id;
          // Construct merchant upload directory path
          const merchantUploadDir = path.join(__dirname, '../uploads/books', 'merchant_' + merchantUsername.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_'), barcode);
          if (fs.existsSync(merchantUploadDir)) {
            fs.rmSync(merchantUploadDir, { recursive: true, force: true });
          }
        }
      }
    }

    // Delete the merchant products from database
    await ProductModel.deleteMany({ product_image: { $in: barcodes.map(bc => new RegExp(bc)) } });

    res.json({ success: true, message: `${deletedCount} products deleted successfully from admin and merchant` });
  } catch (error) {
    console.error('Error in bulkDeleteProducts:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

const { uploadExcelFromJson } = require('../services/excel.service');

async function syncJsonToExcel(req, res) {
  try {
    // Check if query param createCopy is set to true
    const createCopy = req.query.createCopy === 'true';
    const result = await uploadExcelFromJson(createCopy);
    if (createCopy) {
      res.json({ success: true, message: 'New Excel copy created on Google Drive.', file: result });
    } else {
      res.json({ success: true, message: 'Excel file updated from output.json and uploaded to Google Drive.' });
    }
  } catch (error) {
    console.error('Error in syncJsonToExcel:', error);
    res.status(500).json({ success: false, message: 'Failed to update Excel file from output.json.' });
  }
}

async function batchUpdateProductsMain(req, res) {
  try {
    const products = req.body.products;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: 'No products provided for batch update' });
    }

    // Download current Excel file
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    if (!fileId) {
      return res.status(500).json({ success: false, message: 'Missing Google Drive file ID' });
    }

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

    // Update products in JSON
    products.forEach(update => {
      const productIndex = json.findIndex(p => {
        if (!p.products_id) return false;
        const pId = String(p.products_id).trim();
        const bId = String(update.products_id).trim();
        return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
      });
      if (productIndex !== -1) {
        if (update.product_name !== undefined) json[productIndex].product_name = update.product_name;
        if (update.product_quantity !== undefined) json[productIndex].product_quantity = update.product_quantity;
        if (update.product_category !== undefined) json[productIndex].product_category = update.product_category;
        if (update.product_description !== undefined) json[productIndex].product_description = update.product_description;
        if (update.product_price !== undefined) json[productIndex].product_price = update.product_price;
        if (update.price_cost !== undefined) json[productIndex].price_cost = update.price_cost;
      }
    });

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

    // Update output.json by re-running downloadAndConvertExcel
    await downloadAndConvertExcel(fileId);

    res.json({ success: true, message: 'Batch update of products in main file successful' });
  } catch (error) {
    console.error('Error in batchUpdateProductsMain:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getPromotionDates(req, res) {
  try {
    let promotionDate = await PromotionDate.findOne().sort({ createdAt: -1 }).exec();
    if (!promotionDate) {
      // If no promotion dates found, return default dates
      promotionDate = {
        startDate: new Date(),
        endDate: new Date()
      };
    }
    res.json({
      success: true,
      startDate: promotionDate.startDate,
      endDate: promotionDate.endDate
    });
  } catch (error) {
    console.error('Error in getPromotionDates:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function updatePromotionDates(req, res) {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Missing startDate or endDate' });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }
    if (end <= start) {
      return res.status(400).json({ success: false, message: 'endDate must be after startDate' });
    }

    // Atomically update the latest promotion date document or create if none exists
    const promotionDateDoc = await PromotionDate.findOneAndUpdate(
      {},
      { startDate: start, endDate: end },
      { sort: { createdAt: -1 }, upsert: true, new: true }
    );

    // Update output.json by re-running downloadAndConvertExcel with new dates
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    if (fileId) {
      await downloadAndConvertExcel(fileId, startDate, endDate);
    }

    res.json({ success: true, message: 'Promotion dates updated successfully' });
  } catch (error) {
    console.error('Error in updatePromotionDates:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

const FreeShippingRule = require('../models/FreeShippingRule.model');

async function getFreeShippingRules(req, res) {
  try {
    let rules = await FreeShippingRule.findOne().sort({ createdAt: -1 }).exec();
    if (!rules) {
      // Return default rules if none found
      rules = {
        minQuantity: 3,
        minOrderValue: 0,
        userGroups: [],
        includedProducts: [],
        includedCategories: [],
        includedGovernorates: [],
        freeShippingEnabled: true
      };
    }
    res.json({ success: true, rules });
  } catch (error) {
    console.error('Error in getFreeShippingRules:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function saveFreeShippingRules(req, res) {
  try {
    const {
      minQuantity,
      minOrderValue,
      userGroups,
      includedProducts,
      includedCategories,
      includedGovernorates,
      freeShippingEnabled
    } = req.body;

    const updatedRules = await FreeShippingRule.findOneAndUpdate(
      {},
      {
        minQuantity,
        minOrderValue,
        userGroups,
        includedProducts,
        includedCategories,
        includedGovernorates,
        freeShippingEnabled
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, message: 'Free shipping rules saved successfully', rules: updatedRules });
  } catch (error) {
    console.error('Error in saveFreeShippingRules:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

const User = require('../models/User.model');
const Product = require('../models/Product.model');

// Admin: List all merchants
async function listMerchants(req, res) {
  try {
    const merchants = await User.find({ role: 'merchant' }).sort({ createdAt: -1 });
    // Map to match frontend interface
    const mappedMerchants = merchants.map(merchant => ({
      _id: merchant._id,
      name: merchant.merchantName || merchant.username,
      email: merchant.email,
      logo: merchant.logo,
      approved: merchant.approved,
      suspended: merchant.suspended || false,
      createdAt: merchant.createdAt
    }));
    res.json({ success: true, merchants: mappedMerchants });
  } catch (error) {
    console.error('Error in listMerchants:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin: Approve or reject merchant
async function updateMerchantApproval(req, res) {
  try {
    const { merchantId } = req.params;
    const { approved } = req.body;
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Approved must be boolean' });
    }
    const merchant = await User.findById(merchantId);
    if (!merchant || merchant.role !== 'merchant') {
      return res.status(404).json({ success: false, message: 'Merchant not found' });
    }
    merchant.approved = approved;
    await merchant.save();
    res.json({ success: true, message: `Merchant ${approved ? 'approved' : 'rejected'} successfully` });
  } catch (error) {
    console.error('Error in updateMerchantApproval:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin: List all merchant products (including pending)
async function listMerchantProducts(req, res) {
  try {
    const products = await Product.find().populate('merchantId', 'username email').sort({ createdAt: -1 });

    // Remove any potential duplicates based on barcode (normalized from product_image)
    const uniqueProducts = [];
    const seen = new Set();
    for (const product of products) {
      const barcode = product.product_image ? product.product_image.replace('.webp', '') : product._id.toString();
      if (!seen.has(barcode)) {
        seen.add(barcode);
        uniqueProducts.push(product);
      }
    }

    res.json({ success: true, products: uniqueProducts });
  } catch (error) {
    console.error('Error in listMerchantProducts:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin: Approve or reject product
const ProductUpdateRequest = require('../models/ProductUpdateRequest.model');

async function updateProductApproval(req, res) {
  try {
    const { productId } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
    }
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Extract barcode from product image filename (remove .webp extension)
    const barcode = product.product_image ? product.product_image.replace('.webp', '') : productId;

    if (status === 'rejected') {
      // Remove product from Excel file if rejected
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

        // Find and remove product by barcode (not MongoDB ID)
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

          // Update output.json by re-running downloadAndConvertExcel
          await downloadAndConvertExcel(fileId);

          // Update the update file to keep in sync
          await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update);
        }
      }

      // Delete product image if exists
      const uploadDir = path.join(__dirname, '../uploads/books');
      const imagePath = path.join(uploadDir, product.product_image || (barcode + '.webp'));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    product.status = status;
    await product.save();

    if (status === 'approved') {
      // Determine category prefix
      let categoryPrefix = '';
      if (categoryMap.hasOwnProperty(product.product_category)) {
        if (product.product_category === 'رواية') {
          categoryPrefix = 'رواية-';
        } else if (product.product_category === 'تنمية') {
          categoryPrefix = 'تنمية-';
        } else if (product.product_category === 'ديني') {
          categoryPrefix = 'ديني-';
        } else if (product.product_category === 'قاموس') {
          categoryPrefix = 'قاموس-';
        } else if (product.product_category === 'صحة') {
          categoryPrefix = 'صحة-';
        } else if (product.product_category === 'اعمال') {
          categoryPrefix = 'اعمال-';
        } else if (product.product_category === 'فن') {
          categoryPrefix = 'فن-';
        } else if (product.product_category === 'تاريخ') {
          categoryPrefix = 'تاريخ-';
        } else if (product.product_category === 'تربية') {
          categoryPrefix = 'تربية-';
        }
      }

      // Prepare product data
      const productData = {
        barcode,
        product_name: product.product_name,
        product_quantity: product.product_quantity,
        product_category: product.product_category,
        product_description: product.product_description,
        categoryPrefix, // Pass category prefix
        product_price: product.product_price,
        price_cost: product.price_cost,
        createdAt: product.createdAt.toISOString(),
        merchantId: product.merchantId // Pass merchantId to be used by excel service
      };

      // Add product to Excel
      await addProductToExcel(productData, product.merchantId);

      // Update Excel files
      await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_ID);
      await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update);
    }

    // If product is approved, update the product status in the Product collection
    // This is crucial for the enrichment process later.
    if (status === 'approved') {
      product.status = 'approved';
      await product.save();
    }

    // Update sitemap after approval/rejection
    sitemapService.generateSitemap();

    // If approved, check for any pending update requests and reject them automatically
    if (status === 'approved') {
      const pendingRequests = await ProductUpdateRequest.find({ productId, status: 'pending' });
      for (const request of pendingRequests) {
        request.status = 'rejected';
        request.reviewedAt = new Date();
        await request.save();
      }
    }

    res.json({ success: true, message: `Product ${status} successfully` });
  } catch (error) {
    console.error('Error in updateProductApproval:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin: Get products for a specific merchant
async function getMerchantProductsByMerchant(req, res) {
  try {
    const { merchantId } = req.params;
    const products = await Product.find({ merchantId }).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (error) {
    console.error('Error in getMerchantProductsByMerchant:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin: Suspend or activate merchant account
async function updateMerchantSuspension(req, res) {
  try {
    const { merchantId } = req.params;
    const { suspended } = req.body;
    if (typeof suspended !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Suspended must be boolean' });
    }
    const merchant = await User.findById(merchantId);
    if (!merchant || merchant.role !== 'merchant') {
      return res.status(404).json({ success: false, message: 'Merchant not found' });
    }
    merchant.suspended = suspended;
    await merchant.save();
    res.json({ success: true, message: `Merchant account ${suspended ? 'suspended' : 'activated'} successfully` });
  } catch (error) {
    console.error('Error in updateMerchantSuspension:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin: Get all product update requests
async function getProductUpdateRequests(req, res) {
  try {
    const ProductUpdateRequest = require('../models/ProductUpdateRequest.model');

    const requests = await ProductUpdateRequest.find()
      .populate('productId')
      .populate('merchantId', 'username email')
      .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (error) {
    console.error('Error in getProductUpdateRequests:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin: Approve or reject product update request
async function updateProductUpdateRequest(req, res) {
  try {
    const { requestId } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
    }

    const ProductUpdateRequest = require('../models/ProductUpdateRequest.model');
    const Product = require('../models/Product.model');

    const request = await ProductUpdateRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Update request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request has already been processed' });
    }

    if (status === 'approved') {
      // Update the product with new data
      const product = await Product.findById(request.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      // Update product fields
      product.product_name = request.updatedProduct.product_name;
      product.product_quantity = request.updatedProduct.product_quantity;
      product.product_category = request.updatedProduct.product_category;
      product.product_description = request.updatedProduct.product_description;
      product.product_price = request.updatedProduct.product_price;
      product.price_cost = request.updatedProduct.price_cost;

      await product.save();

      // Update Excel file
      const barcode = product.product_image ? product.product_image.replace('.webp', '') : product._id;
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

        // Find and update product in Excel
        const productIndex = json.findIndex(p => {
          if (!p.products_id) return false;
          const pId = String(p.products_id).trim();
          const bId = String(barcode).trim();
          return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
        });
        if (productIndex !== -1) {
          json[productIndex].product_name = product.product_name;
          json[productIndex].product_quantity = product.product_quantity;
          json[productIndex].product_category = product.product_category;
          json[productIndex].product_description = product.product_description;
          json[productIndex].product_price = product.product_price;
          json[productIndex].price_cost = product.price_cost;

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

      // Remove the approved update request from the list by deleting it
      await ProductUpdateRequest.findByIdAndDelete(requestId);
    } else {
      // If rejected, just update the request status and save
      request.status = status;
      request.reviewedAt = new Date();
      request.reviewedBy = req.admin ? req.admin._id : null;
      await request.save();
    }

    res.json({ success: true, message: `Product update request ${status} successfully` });
  } catch (error) {
    console.error('Error in updateProductUpdateRequest:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin: Get products for a specific merchant
async function getMerchantProducts(req, res) {
  try {
    const { merchantId } = req.params;
    const Product = require('../models/Product.model');

    const products = await Product.find({ merchantId }).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (error) {
    console.error('Error in getMerchantProducts:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getPaymentRequests(req, res) {
  try {
    const usersWithRequests = await User.find({ 'paymentRequests.0': { $exists: true } })
      .select('username email phone paymentRequests')
      .lean();

    const requests = usersWithRequests.flatMap(user =>
      user.paymentRequests.map(req => ({
        ...req,
        userId: {
          _id: user._id,
          username: user.username,
          email: user.email,
          phone: user.phone,
        }
      }))
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, requests });
  } catch (error) {
    console.error('Error fetching payment requests:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function updatePaymentRequestStatus(req, res) {
  try {
    const { requestId } = req.params;
    const { status } = req.body; // 'completed' or 'rejected'

    const user = await User.findOne({ 'paymentRequests._id': requestId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User or request not found' });
    }

    const request = user.paymentRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request already processed' });
    }

    request.status = status;
    request.processedAt = new Date();

    // If rejected, refund the wallet balance
    if (status === 'rejected') {
      user.quranProgress.walletBalance += request.amount;
    }

    await user.save();

    // Also update the global PaymentRequest model if it exists/is used
    const globalRequest = await PaymentRequest.findById(requestId);
    if (globalRequest) {
      globalRequest.status = status;
      globalRequest.processedAt = new Date();
      await globalRequest.save();
    }

    res.json({ success: true, message: `Payment request ${status} successfully` });
  } catch (error) {
    console.error('Error updating payment request status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getDonationStats(req, res) {
  try {
    const totalDonations = await Donation.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const donorsCount = await Donation.distinct('userId', { status: 'completed' });

    res.json({
      success: true,
      totalAmount: totalDonations.length > 0 ? totalDonations[0].total : 0,
      donorsCount: donorsCount.length
    });
  } catch (error) {
    console.error('Error fetching donation stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function userHierarchy(req, res) {
  try {
    const users = await User.find({}, 'username email phone governorate city village referralCode referralBalance role createdAt');
    const referrals = await Referral.find({}).populate('referrerId', 'username');

    const referralMap = new Map();
    referrals.forEach(ref => {
      referralMap.set(ref.referredId.toString(), ref.referrerId);
    });

    // Get counts for each user
    const userIds = users.map(u => u._id);
    const Order = require('../models/Order.model');

    const ordersCounts = await Order.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } }
    ]);

    const favoritesCounts = await User.aggregate([
      { $match: { _id: { $in: userIds } } },
      { $project: { favoritesCount: { $size: '$favorites' } } }
    ]);

    const ordersMap = new Map(ordersCounts.map(o => [o._id.toString(), o.count]));
    const favoritesMap = new Map(favoritesCounts.map(f => [f._id.toString(), f.favoritesCount]));

    const usersWithReferredBy = users.map(user => {
      const referrer = referralMap.get(user._id.toString());
      return {
        _id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        governorate: user.governorate,
        city: user.city,
        village: user.village,
        referralCode: user.referralCode,
        referralBalance: user.referralBalance,
        role: user.role,
        createdAt: user.createdAt,
        ordersCount: ordersMap.get(user._id.toString()) || 0,
        favoritesCount: favoritesMap.get(user._id.toString()) || 0,
        referredBy: (referrer && user.role !== 'admin') ? { _id: referrer._id, username: referrer.username } : null
      };
    });

    res.json(usersWithReferredBy);
  } catch (error) {
    console.error('Error in userHierarchy:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getStats(req, res) {
  try {
    // Get total users
    const totalUsers = await User.countDocuments();

    // Get total products from output.json
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(__dirname, '..', 'output.json');
    let totalProducts = 0;
    if (fs.existsSync(outputPath)) {
      const products = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      totalProducts = products.length;
    }

    // Calculate total orders
    const ordersResult = await User.aggregate([
      { $project: { ordersSize: { $size: '$orders' } } },
      { $group: { _id: null, total: { $sum: '$ordersSize' } } }
    ]);
    const totalOrders = ordersResult.length > 0 ? ordersResult[0].total : 0;

    // Calculate total likes (favorites)
    const likesResult = await User.aggregate([
      { $project: { favoritesSize: { $size: '$favorites' } } },
      { $group: { _id: null, total: { $sum: '$favoritesSize' } } }
    ]);
    const totalLikes = likesResult.length > 0 ? likesResult[0].total : 0;

    // Calculate total cart items
    const cartItemsResult = await User.aggregate([
      { $project: { cartSize: { $size: '$cart' } } },
      { $group: { _id: null, total: { $sum: '$cartSize' } } }
    ]);
    const totalCartItems = cartItemsResult.length > 0 ? cartItemsResult[0].total : 0;

    // Calculate total coins
    const coinsResult = await User.aggregate([
      { $match: { 'gamification.coins': { $exists: true } } },
      { $group: { _id: null, total: { $sum: '$gamification.coins' } } }
    ]);
    const totalCoins = coinsResult.length > 0 ? coinsResult[0].total : 0;

    // Calculate total referrals
    const totalReferrals = await Referral.countDocuments();

    // Calculate total merchant orders
    const merchantOrdersResult = await User.aggregate([
      { $unwind: '$orders' },
      { $match: { 'orders.isMerchantOrder': true } },
      { $group: { _id: null, total: { $sum: 1 } } }
    ]);
    const totalMerchantOrders = merchantOrdersResult.length > 0 ? merchantOrdersResult[0].total : 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalLikes,
        totalCartItems,
        totalCoins,
        totalReferrals,
        totalMerchantOrders
      }
    });
  } catch (error) {
    console.error('Error in getStats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function getAllUrgencyRequests(req, res) {
  try {
    const usersWithRequests = await User.find({ 'urgencyRequests.0': { $exists: true } })
      .select('username urgencyRequests')
      .lean();

    const urgencyRequests = usersWithRequests.flatMap(user =>
      user.urgencyRequests.map(req => ({
        _id: req._id,
        bookId: req.bookId,
        bookName: req.bookName,
        merchantId: req.merchantId,
        merchantName: req.merchantName,
        userId: user._id,
        username: user.username,
        requestedAt: req.requestedAt,
        fulfilled: req.fulfilled
      }))
    ).sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    res.json({ success: true, urgencyRequests });
  } catch (error) {
    console.error('Error fetching urgency requests:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function updateUrgencyRequestStatus(req, res) {
  try {
    const { requestId } = req.params;
    const { fulfilled } = req.body;

    const user = await User.findOne({ 'urgencyRequests._id': requestId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Urgency request not found' });
    }

    const request = user.urgencyRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Urgency request not found' });
    }

    request.fulfilled = fulfilled;

    // If fulfilled, update product quantity in Excel and delete the request
    if (fulfilled) {
      const barcode = request.bookId;
      if (barcode) {
        // Download current Excel file
        const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
        if (!fileId) {
          return res.status(500).json({ success: false, message: 'Missing Google Drive file ID' });
        }

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

        // Find product by barcode and increase quantity by 5
        const productIndex = json.findIndex(p => {
          if (!p.products_id) return false;
          const pId = String(p.products_id).trim();
          const bId = String(barcode).trim();
          return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
        });

        if (productIndex !== -1) {
          const currentQuantity = parseInt(json[productIndex].product_quantity, 10) || 0;
          json[productIndex].product_quantity = currentQuantity + 5;

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

          // Update output.json by re-running downloadAndConvertExcel
          await downloadAndConvertExcel(fileId);

          // Update the update file to keep in sync
          await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update);
        }
      }

      // Delete the urgency request after fulfilling
      user.urgencyRequests.pull(requestId);
    }

    await user.save();

    res.json({ success: true, message: 'Urgency request status updated successfully' });
  } catch (error) {
    console.error('Error updating urgency request status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function deleteUrgencyRequest(req, res) {
  try {
    const { requestId } = req.params;

    const user = await User.findOne({ 'urgencyRequests._id': requestId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Urgency request not found' });
    }

    user.urgencyRequests.pull(requestId);
    await user.save();

    res.json({ success: true, message: 'Urgency request deleted successfully' });
  } catch (error) {
    console.error('Error deleting urgency request:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function updateProductQuantity(req, res) {
  try {
    const { barcode } = req.params;
    const { product_quantity } = req.body;

    if (!barcode) {
      return res.status(400).json({ success: false, message: 'Missing product barcode' });
    }

    if (product_quantity === undefined || product_quantity < 0) {
      return res.status(400).json({ success: false, message: 'Invalid product quantity' });
    }

    // Download current Excel file
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    if (!fileId) {
      return res.status(500).json({ success: false, message: 'Missing Google Drive file ID' });
    }

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

    // Find product by barcode and update quantity
    const productIndex = json.findIndex(p => {
      if (!p.products_id) return false;
      const pId = String(p.products_id).trim();
      const bId = String(barcode).trim();
      return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
    });
    if (productIndex === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    json[productIndex].product_quantity = product_quantity;

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

    // Update output.json by re-running downloadAndConvertExcel
    await downloadAndConvertExcel(fileId);

    // Update the update file to keep in sync
    await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update);

    res.json({ success: true, message: 'Product quantity updated successfully' });
  } catch (error) {
    console.error('Error in updateProductQuantity:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = {
  upload,
  addProduct,
  listProducts,
  updateProduct,
  replaceProductImage,
  replaceProductEpub,
  deleteProduct,
  bulkDeleteProducts,
  syncJsonToExcel,
  batchUpdateProducts,
  batchUpdateProductsMain,
  getPromotionDates,
  updatePromotionDates,
  getFreeShippingRules,
  saveFreeShippingRules,
  listMerchants,
  updateMerchantApproval,
  listMerchantProducts,
  updateProductApproval,
  updateMerchantSuspension,
  getProductUpdateRequests,
  updateProductUpdateRequest,
  getMerchantProducts,
  getMerchantProductsByMerchant,
  getPaymentRequests,
  userHierarchy,
  getStats,
  getAllUrgencyRequests,
  updateUrgencyRequestStatus,
  deleteUrgencyRequest,
  updateProductQuantity,
  updatePaymentRequestStatus,
  getDonationStats
};

async function updateUrgencyRequestStatus(req, res) {
  try {
    const { requestId } = req.params;
    const { fulfilled } = req.body;

    const user = await User.findOne({ 'urgencyRequests._id': requestId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Urgency request not found' });
    }

    const request = user.urgencyRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Urgency request not found' });
    }

    request.fulfilled = fulfilled;

    // If fulfilled, update product quantity in Excel and delete the request
    if (fulfilled) {
      const barcode = request.bookId;
      if (barcode) {
        // Download current Excel file
        const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
        if (!fileId) {
          return res.status(500).json({ success: false, message: 'Missing Google Drive file ID' });
        }

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

        // Find product by barcode and increase quantity by 5
        const productIndex = json.findIndex(p => {
          if (!p.products_id) return false;
          const pId = String(p.products_id).trim();
          const bId = String(barcode).trim();
          return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
        });

        if (productIndex !== -1) {
          const currentQuantity = parseInt(json[productIndex].product_quantity, 10) || 0;
          json[productIndex].product_quantity = currentQuantity + 5;

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

          // Update output.json by re-running downloadAndConvertExcel
          await downloadAndConvertExcel(fileId);

          // Update the update file to keep in sync
          await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update);
        }
      }

      // Delete the urgency request after fulfilling
      user.urgencyRequests.pull(requestId);
    }

    await user.save();

    res.json({ success: true, message: 'Urgency request status updated successfully' });
  } catch (error) {
    console.error('Error updating urgency request status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function deleteUrgencyRequest(req, res) {
  try {
    const { requestId } = req.params;

    const user = await User.findOne({ 'urgencyRequests._id': requestId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Urgency request not found' });
    }

    user.urgencyRequests.pull(requestId);
    await user.save();

    res.json({ success: true, message: 'Urgency request deleted successfully' });
  } catch (error) {
    console.error('Error deleting urgency request:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function updateProductQuantity(req, res) {
  try {
    const { barcode } = req.params;
    const { product_quantity } = req.body;

    if (!barcode) {
      return res.status(400).json({ success: false, message: 'Missing product barcode' });
    }

    if (product_quantity === undefined || product_quantity < 0) {
      return res.status(400).json({ success: false, message: 'Invalid product quantity' });
    }

    // Download current Excel file
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    if (!fileId) {
      return res.status(500).json({ success: false, message: 'Missing Google Drive file ID' });
    }

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

    // Find product by barcode and update quantity
    const productIndex = json.findIndex(p => {
      if (!p.products_id) return false;
      const pId = String(p.products_id).trim();
      const bId = String(barcode).trim();
      return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
    });
    if (productIndex === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    json[productIndex].product_quantity = product_quantity;

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

    // Update output.json by re-running downloadAndConvertExcel
    await downloadAndConvertExcel(fileId);

    // Update the update file to keep in sync
    await updateExcelFromJson(process.env.GOOGLE_DRIVE_FILE_update);

    res.json({ success: true, message: 'Product quantity updated successfully' });
  } catch (error) {
    console.error('Error in updateProductQuantity:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
