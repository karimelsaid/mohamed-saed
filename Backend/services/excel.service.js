const { google } = require('googleapis');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { auth } = require('../config/drive');

// تصنيفات الكتب والمنتجات الأخرى
const categoryMap = {
  'رواية': 'روايات وقصص',
  'تنمية': 'تطوير الذات وعلم النفس',
  'ديني': 'كتب دينية',
  'قاموس': 'قواميس ومراجع',
  'صحة': 'صحة وطب وعلوم',
  'اعمال': 'أعمال وتسويق ومالية',
  'فن': 'فنون وحرف',
  'تاريخ': 'تاريخ وسير ذاتية',
  'تربية': 'تربية وأطفال',
  'ادوات': 'أدوات مكتبية',
  'الكترونيات': 'إلكترونيات',
  'ملابس': 'ملابس',
  'تجميل': 'التجميل والعناية الشخصية',
  'احذية': 'الأحذية',
  'اثاث': 'أثاث وديكور المنزل',
  'العاب': 'هدية وألعاب',
  'أقمشة': 'أقمشة',
  'اخرى': 'غير مصنف (أخرى)'
};

// Reverse categoryMap for mapping full names to short keys
const reverseCategoryMap = {};
for (const [key, value] of Object.entries(categoryMap)) {
  reverseCategoryMap[value] = key;
}

function roundUpToNearestFive(num) {
  return Math.ceil(num / 5) * 5;
}

async function downloadAndConvertExcel(fileId, promotionStartDateStr, promotionEndDateStr) {
  const client = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: client });

  // Always fetch latest promotion dates from MongoDB
  const PromotionDate = require('../models/PromotionDate.model');
  let promotionStartDate;
  let promoEndDate;
  try {
    const promotionDateDoc = await PromotionDate.findOne().sort({ createdAt: -1 }).exec();
    if (promotionDateDoc) {
      promotionStartDate = promotionDateDoc.startDate;
      promoEndDate = promotionDateDoc.endDate;
    } else {
      promotionStartDate = new Date();
      promoEndDate = new Date();
    }
  } catch (error) {
    console.error('Error fetching promotion dates from MongoDB:', error);
    promotionStartDate = new Date();
    promoEndDate = new Date();
  }

  const res = await drive.files.get({
    fileId,
    alt: 'media',
  }, { responseType: 'arraybuffer' });

  const buffer = Buffer.from(res.data);
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  let json = xlsx.utils.sheet_to_json(sheet);

  // Filter out products with product_quantity less than 0
  const filteredJson = json.filter(product => {
    return !(product.product_quantity < 0);
  });

  // Preload all merchant products and merchants for fast lookup
  const Product = require('../models/Product.model');
  const User = require('../models/User.model');
  const allMerchants = await User.find({ role: 'merchant' }, '_id username logo');
  // Create a map from merchantId to username for quick lookup
  const merchantMap = new Map(allMerchants.map(m => [m._id.toString(), { username: m.username, logo: m.logo }]));

  const updatedData = [];
  for (const product of filteredJson) {
    const product_id = product.products_id;
    let name = product.product_name || '';
    // Prefer product_category field if valid
    let category = null;
    if (product.product_category && Object.values(categoryMap).includes(product.product_category)) {
      category = product.product_category;
    } else {
      let categoryKey = name.split('-')[0].trim();
      category = categoryMap[categoryKey] || 'غير مصنف';
    }
    product.product_category = category;

    if (name.includes('-')) {
      product.product_name = name.split('-').slice(1).join('-').trim();
    }

    product.product_image = product_id;

    // Check if the product has a merchantId directly from the Excel data
    const merchantId = product.merchantId ? product.merchantId.toString() : null;

    if (merchantId) {
      const merchantData = merchantMap.get(merchantId);
      if (merchantData) {
        const sanitizedUsername = merchantData.username.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        product.image_path = `/uploads/books/merchant_${sanitizedUsername}/${product_id}/${product_id}.webp`;
        product.merchantName = merchantData.username; // Add merchant name to the product data
        product.merchantLogo = merchantData.logo; // Add merchant logo to the product data
      } else {
        // Merchant not found, fallback to admin path
        product.image_path = `/uploads/books/admin__karim_mohamed__/${product_id}/${product_id}.webp`;
      }
    } else {
      // This is an admin product
      product.image_path = `/uploads/books/admin__karim_mohamed__/${product_id}/${product_id}.webp`;
    }

    // Add promotionEndDate property for frontend countdown
    product.promotionEndDate = promoEndDate.toISOString();

    // Adjust product_price according to the clarified rule
    let price = 0;
    if (typeof product.product_price === 'string') {
      price = parseFloat(product.product_price);
    } else {
      price = product.product_price;
    }

    // First increase price by 175%
    price = price * 2.75;

    // Save increased price before discount for comparison
    let increasedPrice = price;

    // Round up if decimal part exists for increasedPrice
    if (increasedPrice % 1 !== 0) {
      increasedPrice = Math.ceil(increasedPrice);
    }

    const increasedOriginalPrice = increasedPrice;
    const increasedLastDigit = increasedPrice % 10;

    let increasedAdjustedPrice = 0;
    if (increasedLastDigit === 0) {
      increasedAdjustedPrice = increasedPrice - 1; // decrease by 1 if last digit is 0
      // no addition of 10 in this case
    } else {
      increasedAdjustedPrice = increasedPrice - increasedLastDigit + 9; // replace last digit with 9

      // If adjusted price is less than original, add 10
      if (increasedAdjustedPrice < increasedOriginalPrice) {
        increasedAdjustedPrice += 10;
      }
    }

    product.product_price_before_discount = increasedAdjustedPrice;

    // Add rival property: true if in promotion period, else false
    const today = new Date();
    // Ensure promoEndDate is after promotionStartDate
    if (promoEndDate.getTime() <= promotionStartDate.getTime()) {
      product.rival = false;
    } else {
      product.rival = today.getTime() >= promotionStartDate.getTime() && today.getTime() <= promoEndDate.getTime();
    }

    // If current date is within promotion period, discount price by dividing by 2.75
    if (today >= promotionStartDate && today <= promoEndDate) {
      price = price / 2.75;
      // Ensure price after discount is not less than original price before increase
      if (price < product.product_price) {
        price = product.product_price;
      }
    }

    // Round up if decimal part exists
    if (price % 1 !== 0) {
      price = Math.ceil(price);
    }

    const originalPrice = price;
    const lastDigit = price % 10;

    let adjustedPrice = 0;
    if (lastDigit === 0) {
      adjustedPrice = price - 1; // decrease by 1 if last digit is 0
      // no addition of 10 in this case
    } else {
      adjustedPrice = price - lastDigit + 9; // replace last digit with 9

      // If adjusted price is less than original, add 10
      if (adjustedPrice < originalPrice) {
        adjustedPrice += 10;
      }
    }

    product.product_price = adjustedPrice;

    // Calculate discount percentage and round up to nearest 5
    let discountPercent = 0;
    if (product.product_price_before_discount > 0) {
      discountPercent = ((product.product_price_before_discount - product.product_price) / product.product_price_before_discount) * 100;
    }
    product.product_discount_percent = roundUpToNearestFive(discountPercent);

    updatedData.push(product);
  }

  console.log('✅ Excel data updated with image, category, and discount percent.');
  fs.writeFileSync(path.join(__dirname, '..', 'output.json'), JSON.stringify(updatedData, null, 2));
  return updatedData;
}

// New function to add product to Excel file and update output.json
async function addProductToExcel(productData, merchantId = null) {
  try {
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    if (!fileId) {
      throw new Error('Missing required environment variable: GOOGLE_DRIVE_FILE_ID');
    }
    const client = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: client });

    // Download current Excel file
    const res = await drive.files.get({
      fileId,
      alt: 'media',
    }, { responseType: 'arraybuffer' });

    const buffer = Buffer.from(res.data);
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert sheet to JSON
    let json = xlsx.utils.sheet_to_json(sheet);

    // Prepare new product row
    const newRow = {
      products_id: productData.barcode,
      product_name: productData.categoryPrefix ? productData.categoryPrefix + productData.product_name : productData.product_name,
      product_quantity: productData.product_quantity,
      product_category: productData.product_category,
      product_description: productData.product_description || '',
      product_price: productData.product_price || 0,
      price_cost: productData.price_cost || 0,
      merchantId: productData.merchantId ? productData.merchantId.toString() : '' // Add merchantId to the new row
    };

    // Add new row to JSON
    json.push(newRow);

    // Convert JSON back to sheet
    const newSheet = xlsx.utils.json_to_sheet(json);

    // Replace sheet in workbook
    workbook.Sheets[sheetName] = newSheet;

    // Write workbook to buffer
    const wbout = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Save updated Excel file locally (optional)
    // fs.writeFileSync('updated_products.xlsx', wbout); // Disabled for security reasons

    // Upload updated Excel file back to Google Drive
    await drive.files.update({
      fileId,
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: wbout // Upload directly from buffer without saving locally
      }
    });

    // Update output.json by re-running downloadAndConvertExcel
    await downloadAndConvertExcel(fileId);

    console.log('✅ Product added to Excel and output.json updated.');
    return true;
  } catch (error) {
    console.error('❌ Error adding product to Excel:', error);
    throw error;
  }
}

// New function to upload Excel file from output.json to Google Drive
async function uploadExcelFromJson(createCopy = false) {
  try {
    const fileId = process.env.GOOGLE_DRIVE_FILE_update;
    if (!fileId) {
      throw new Error('Missing required environment variable: GOOGLE_DRIVE_FILE_update');
    }

    // Read output.json
    const jsonData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'output.json'), 'utf-8'));

    // Convert JSON to sheet
    const worksheet = xlsx.utils.json_to_sheet(jsonData);

    // Create new workbook and append sheet
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // Write workbook to buffer
    const wbout = xlsx.write(workbook, { type: 'buffer', bookType: 'xls' });

    const client = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: client });

    if (createCopy) {
      // Create a new file on Google Drive as a copy
      const fileMetadata = {
        name: `Copy_of_output_${Date.now()}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      const media = {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: wbout
      };
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name'
      });
      console.log(`✅ New Excel copy created on Google Drive with ID: ${response.data.id}`);
      return response.data;
    } else {
      // Update existing file
      await drive.files.update({
        fileId,
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: wbout
        }
      });
      console.log('✅ Excel file uploaded from output.json to Google Drive.');
      return true;
    }
  } catch (error) {
    console.error('❌ Error uploading Excel from JSON:', error);
    throw error;
  }
}

// New function to update Excel file from output.json using Google Drive file ID
async function updateExcelFromJson(fileId) {
  try {
    if (!fileId) {
      throw new Error('Missing required file ID for Excel update');
    }

    // Read output.json
    const jsonData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'output.json'), 'utf-8'));

    const client = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: client });
    const xlsx = require('xlsx');

    // Convert JSON to sheet
    const worksheet = xlsx.utils.json_to_sheet(jsonData);

    // Create new workbook and append sheet
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

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

    console.log('✅ Excel file updated from output.json on Google Drive.');
    return true;
  } catch (error) {
    console.error('❌ Error updating Excel from JSON:', error);
    throw error;
  }
}

module.exports = {
  downloadAndConvertExcel,
  categoryMap,
  reverseCategoryMap,
  addProductToExcel,
  uploadExcelFromJson,
  updateExcelFromJson
};
