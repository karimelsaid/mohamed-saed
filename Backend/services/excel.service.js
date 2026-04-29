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
  'أدوات مكتبية': 'أدوات مكتبية',
  'إلكترونيات': 'إلكترونيات',
  'ملابس': 'ملابس',
  'تجميل': 'التجميل والعناية الشخصية',
  'احذية': 'الأحذية',
  'اثاث': 'أثاث وديكور المنزل',
  'العاب': 'هدية وألعاب',
  'أقمشة': 'أقمشة',
  'غير مصنف': 'غير مصنف'
};

// خريطة الحقول الخاصة بكل فئة
const categoryFieldsMap = {
  'روايات وقصص': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
  'تطوير الذات وعلم النفس': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
  'كتب دينية': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
  'قواميس ومراجع': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
  'صحة وطب وعلوم': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
  'أعمال وتسويق ومالية': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
  'فنون وحرف': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
  'تاريخ وسير ذاتية': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
  'تربية وأطفال': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
  'أدوات مكتبية': ['stationeryType', 'material', 'color', 'size', 'brand'],
  'إلكترونيات': ['electronicsType', 'model', 'specs', 'warranty'],
  'ملابس': ['clothingType', 'season', 'originCountry'],
  'التجميل والعناية الشخصية': ['cosmeticsType', 'sizeWeight', 'ingredients', 'suitableFor'],
  'الأحذية': ['shoeType'],
  'أثاث وديكور المنزل': ['furnitureType', 'length', 'width', 'height', 'deliveryMethod'],
  'هدية وألعاب': ['toyType', 'ageGroup', 'safety'],
  'أقمشة': ['fabricType', 'width', 'length', 'usage'],
  'غير مصنف': ['suggestedCategory']
};

// Reverse categoryMap for mapping full names to short keys
const reverseCategoryMap = {};
for (const [key, value] of Object.entries(categoryMap)) {
  if (value !== 'غير مصنف') { // Avoid overwriting 'غير مصنف'
    reverseCategoryMap[value] = key;
  }
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

  // Save raw data for local-first updates if needed
  fs.writeFileSync(path.join(__dirname, '..', 'output_raw.json'), JSON.stringify(filteredJson, null, 2));

  // Preload all merchant products and merchants for fast lookup
  const User = require('../models/User.model');
  const allMerchants = await User.find({ role: 'merchant' }, '_id username logo');
  // Create a map from merchantId to username for quick lookup
  const merchantMap = new Map(allMerchants.map(m => [m._id.toString(), { username: m.username, logo: m.logo }]));

  return processAndSaveData(filteredJson, promotionStartDate, promoEndDate, merchantMap);
}

// Separate function for processing data and saving output.json
async function processAndSaveData(filteredJson, promotionStartDate, promoEndDate, merchantMap = null) {
  if (!merchantMap) {
    const User = require('../models/User.model');
    const allMerchants = await User.find({ role: 'merchant' }, '_id username logo');
    merchantMap = new Map(allMerchants.map(m => [m._id.toString(), { username: m.username, logo: m.logo }]));
  }

  // Ensure promoEndDate/promotionStartDate are Dates if they came from JSON
  promotionStartDate = new Date(promotionStartDate);
  promoEndDate = new Date(promoEndDate);

  const updatedData = [];
  for (const product of filteredJson) {
    const product_id = product.products_id;
    const isAlreadyProcessed = product.is_processed === true;

    // Map Barcode column (handle case sensitivity)
    if (product['Barcode']) {
      product.barcode = String(product['Barcode']).trim();
    } else if (product['barcode']) {
      product.barcode = String(product['barcode']).trim();
    } else {
      // Fallback: Use products_id as barcode (User Request)
      product.barcode = String(product_id).trim();
    }

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

    // PRESERVE existing image_path if it was manually updated (contains ?v= cache buster)
    // Only rebuild image_path if it doesn't exist or doesn't start with /uploads/
    const existingImagePath = product.image_path || '';
    const hasCustomImagePath = existingImagePath.includes('?v=') || 
                                (existingImagePath.startsWith('/uploads/books/') && existingImagePath !== `/uploads/books/admin__karim_mohamed__/${product_id}/${product_id}.webp`);

    if (!hasCustomImagePath) {
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
    } else {
      // Preserve the existing image_path but still set merchant info if needed
      if (merchantId) {
        const merchantData = merchantMap.get(merchantId);
        if (merchantData) {
          product.merchantName = merchantData.username;
          product.merchantLogo = merchantData.logo;
        }
      }
    }

    // Add promotionEndDate property for frontend countdown
    product.promotionEndDate = promoEndDate.toISOString();

    // Check if this is a merchant product (has merchantId)
    const isMerchantProduct = !!merchantId;

    if (isMerchantProduct) {
      // === MERCHANT PRODUCTS: Use the exact price, add 20% markup for crossed-out price (marketing) ===
      let merchantPrice = product.product_price;
      if (typeof merchantPrice === 'string') {
        merchantPrice = parseFloat(merchantPrice);
      }
      product.product_price = merchantPrice;
      // Add 20% markup as "before discount" price for marketing
      product.product_price_before_discount = Math.ceil(merchantPrice * 1.20);
      // Calculate discount percentage
      product.product_discount_percent = 20;
      product.rival = false; // Merchant products don't participate in admin promotions
      product.is_processed = true;
      updatedData.push(product);
      continue; // Skip to next product
    }

    // === ADMIN PRODUCTS: Apply price manipulation as before ===

    // Adjust product_price ONLY if not already processed to avoid double multiplication (fallback scenarios)
    if (!isAlreadyProcessed) {
      if (typeof product.product_price === 'string') {
        price = parseFloat(product.product_price);
      } else {
        price = product.product_price;
      }

      // First increase price by 175%
      price = price * 2.75;
    } else {
      // Already processed, use the price as is (it's already adjusted)
      price = product.product_price;
    }

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

    if (!isAlreadyProcessed) {
      product.product_price_before_discount = increasedAdjustedPrice;
    }

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

    if (!isAlreadyProcessed) {
      product.product_price = adjustedPrice;
    }

    // Calculate discount percentage and round up to nearest 5
    let discountPercent = 0;
    if (product.product_price_before_discount > 0) {
      discountPercent = ((product.product_price_before_discount - product.product_price) / product.product_price_before_discount) * 100;
    }
    product.product_discount_percent = roundUpToNearestFive(discountPercent);

    product.is_processed = true; // Mark as processed for idempotency
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
    // Try to get data from Drive, fallback to local if needed
    let json;
    let workbook;
    let sheetName;
    let driveObj;

    try {
      const client = await auth.getClient();
      driveObj = google.drive({ version: 'v3', auth: client });

      // Download current Excel file
      const res = await driveObj.files.get({
        fileId,
        alt: 'media',
      }, { responseType: 'arraybuffer' });

      const buffer = Buffer.from(res.data);
      workbook = xlsx.read(buffer, { type: 'buffer' });
      sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert sheet to JSON
      json = xlsx.utils.sheet_to_json(sheet);
    } catch (driveErr) {
      console.warn('⚠️ Could not download Excel from Drive, falling back to local output_raw.json:', driveErr.message);
      try {
        const rawDataPath = path.join(__dirname, '..', 'output_raw.json');
        if (fs.existsSync(rawDataPath)) {
          json = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'));
        } else {
          // If no raw data, try output.json (might be processed but better than nothing as a base)
          const outputPath = path.join(__dirname, '..', 'output.json');
          if (fs.existsSync(outputPath)) {
            json = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
          } else {
            json = [];
          }
        }
      } catch (localErr) {
        console.error('❌ Failed to read local data fallback:', localErr.message);
        json = [];
      }
    }

    // Prepare new product row with all fields including category-specific ones
    const newRow = {
      products_id: productData.products_id || productData.barcode, // Use provided ID or fallback to barcode if needed
      barcode: productData.barcode || '',
      product_name: productData.categoryPrefix ? productData.categoryPrefix + productData.product_name : productData.product_name,
      product_quantity: productData.product_quantity,
      product_category: productData.product_category,
      product_description: productData.product_description || '',
      product_price: productData.product_price || 0,
      price_cost: productData.price_cost || 0,
      merchantId: productData.merchantId ? productData.merchantId.toString() : '',
      author: productData.author || '',
      publisher: productData.publisher || '',
      pages: productData.pages || '',
      coverType: productData.coverType || '',
      language: productData.language || '',
      publishYear: productData.publishYear || '',
      stationeryType: productData.stationeryType || '',
      material: productData.material || '',
      color: productData.color || '',
      size: productData.size || '',
      brand: productData.brand || '',
      electronicsType: productData.electronicsType || '',
      model: productData.model || '',
      specs: productData.specs || '',
      warranty: productData.warranty || '',
      clothingType: productData.clothingType || '',
      season: productData.season || '',
      originCountry: productData.originCountry || '',
      cosmeticsType: productData.cosmeticsType || '',
      sizeWeight: productData.sizeWeight || '',
      ingredients: productData.ingredients || '',
      suitableFor: productData.suitableFor || '',
      shoeType: productData.shoeType || '',
      furnitureType: productData.furnitureType || '',
      height: productData.height || '',
      deliveryMethod: productData.deliveryMethod || '',
      toyType: productData.toyType || '',
      ageGroup: productData.ageGroup || '',
      safety: productData.safety || '',
      fabricType: productData.fabricType || '',
      width: productData.width || '',
      length: productData.length || '',
      usage: productData.usage || '',
      suggestedCategory: productData.suggestedCategory || '',
      linkedEbookId: productData.linkedEbookId || '',
      createdAt: productData.createdAt || new Date().toISOString()
    };

    // Add new row to JSON
    json.push(newRow);

    // Write raw data locally immediately
    const rawDataPath = path.join(__dirname, '..', 'output_raw.json');
    fs.writeFileSync(rawDataPath, JSON.stringify(json, null, 2));

    // Process and Update output.json locally immediately
    try {
      // Fetch latest promotion dates for processing
      const PromotionDate = require('../models/PromotionDate.model');
      const promoDoc = await PromotionDate.findOne().sort({ createdAt: -1 }).exec();
      const pStart = promoDoc ? promoDoc.startDate : new Date();
      const pEnd = promoDoc ? promoDoc.endDate : new Date();

      await processAndSaveData(json, pStart, pEnd);
      console.log('✅ Local data (output.json) updated successfully.');
    } catch (procErr) {
      console.warn('⚠️ Failed to process local data update:', procErr.message);
    }

    // Attempt to upload back to Google Drive (even if drive download failed initially)
    if (driveObj) {
      try {
        const xlsx = require('xlsx');

        if (!workbook) {
          workbook = xlsx.utils.book_new();
          sheetName = 'Sheet1';
          const newSheet = xlsx.utils.json_to_sheet(json);
          xlsx.utils.book_append_sheet(workbook, newSheet, sheetName);
        } else {
          const newSheet = xlsx.utils.json_to_sheet(json);
          workbook.Sheets[sheetName] = newSheet;
        }

        // Write workbook to buffer
        const wbout = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        await driveObj.files.update({
          fileId,
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: wbout
          }
        });
        console.log('✅ Excel file synced to Google Drive (Add)');

        // Also update the second file if it exists
        const updateFileId = process.env.GOOGLE_DRIVE_FILE_update;
        if (updateFileId && updateFileId !== fileId) {
          try {
            await driveObj.files.update({
              fileId: updateFileId,
              media: {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                body: wbout
              }
            });
            console.log('✅ Update-Excel file synced to Google Drive (Add)');
          } catch (updateErr) {
            console.warn('⚠️ Failed to sync update-file:', updateErr.message);
          }
        }
      } catch (uploadErr) {
        console.warn('⚠️ Failed to sync Excel file to Google Drive (Add):', uploadErr.message);
      }
    }

    return true; // Return true because local update succeeded
  } catch (error) {
    console.error('❌ Critical error in addProductToExcel:', error.message);
    return false;
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
      try {
        await drive.files.update({
          fileId,
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: wbout
          }
        });
        console.log('✅ Excel file uploaded from output.json to Google Drive.');
      } catch (driveError) {
        console.warn('⚠️ Failed to update main Excel file on Google Drive:', driveError.message);
      }
      return true;
    }
  } catch (error) {
    console.warn('⚠️ Failed to upload Excel from local JSON to Google Drive:', error.message);
    return false;
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
    try {
      await drive.files.update({
        fileId,
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: wbout
        }
      });
      console.log('✅ Excel file updated from output.json on Google Drive.');
    } catch (driveError) {
      console.warn('⚠️ Failed to sync JSON to Google Drive:', driveError.message);
    }

    return true;
  } catch (error) {
    console.warn('⚠️ Failed to update Google Drive Excel from local JSON:', error.message);
    return false;
  }
}

// New function to remove product from Excel file and update output.json
async function removeProductFromExcel(barcode, fileId) {
  try {
    if (!fileId) {
      fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    }
    if (!fileId) {
      throw new Error('Missing required file ID for Excel update');
    }

    // Try to get data from Drive, fallback to local if needed
    let json;
    let workbook;
    let sheetName;
    let driveObj;

    try {
      const client = await auth.getClient();
      driveObj = google.drive({ version: 'v3', auth: client });

      const res = await driveObj.files.get({
        fileId,
        alt: 'media',
      }, { responseType: 'arraybuffer' });

      const buffer = Buffer.from(res.data);
      workbook = xlsx.read(buffer, { type: 'buffer' });
      sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      json = xlsx.utils.sheet_to_json(sheet);
    } catch (driveErr) {
      console.warn('⚠️ Could not download Excel from Drive for removal, falling back to local output_raw.json:', driveErr.message);
      try {
        const rawDataPath = path.join(__dirname, '..', 'output_raw.json');
        if (fs.existsSync(rawDataPath)) {
          json = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'));
        } else {
          json = [];
        }
      } catch (localErr) {
        console.error('❌ Failed to read local raw data fallback:', localErr.message);
        json = [];
      }
    }

    // Find and remove product by barcode
    const productIndex = json.findIndex(p => {
      if (!p.products_id) return false;
      const pId = String(p.products_id).trim();
      const bId = String(barcode).trim();
      return pId === bId || Number(pId) === Number(bId) || pId === String(Number(bId)) || String(Number(pId)) === bId;
    });

    if (productIndex !== -1) {
      json.splice(productIndex, 1);

      // Write raw data locally immediately
      const rawDataPath = path.join(__dirname, '..', 'output_raw.json');
      fs.writeFileSync(rawDataPath, JSON.stringify(json, null, 2));

      // Process and Update output.json locally immediately
      try {
        const PromotionDate = require('../models/PromotionDate.model');
        const promoDoc = await PromotionDate.findOne().sort({ createdAt: -1 }).exec();
        const pStart = promoDoc ? promoDoc.startDate : new Date();
        const pEnd = promoDoc ? promoDoc.endDate : new Date();
        await processAndSaveData(json, pStart, pEnd);
        console.log('✅ Local data (output.json) updated successfully after removal.');
      } catch (procErr) {
        console.warn('⚠️ Failed to process local data update after removal:', procErr.message);
      }

      // Attempt to upload back to Google Drive (even if drive download failed initially)
      if (driveObj) {
        try {
          const xlsx = require('xlsx');

          if (!workbook) {
            workbook = xlsx.utils.book_new();
            sheetName = 'Sheet1';
            const newSheet = xlsx.utils.json_to_sheet(json);
            xlsx.utils.book_append_sheet(workbook, newSheet, sheetName);
          } else {
            const newSheet = xlsx.utils.json_to_sheet(json);
            workbook.Sheets[sheetName] = newSheet;
          }
          const wbout = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

          await driveObj.files.update({
            fileId,
            media: {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              body: wbout
            }
          });
          console.log('✅ Excel file synced to Google Drive after removal');

          // Also update the second file if it exists
          const updateFileId = process.env.GOOGLE_DRIVE_FILE_update;
          if (updateFileId && updateFileId !== fileId) {
            try {
              await driveObj.files.update({
                fileId: updateFileId,
                media: {
                  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  body: wbout
                }
              });
              console.log('✅ Update-Excel file synced to Google Drive after removal');
            } catch (updateErr) {
              console.warn('⚠️ Failed to sync update-file after removal:', updateErr.message);
            }
          }
        } catch (uploadErr) {
          console.warn('⚠️ Failed to sync Excel file to Google Drive after removal:', uploadErr.message);
        }
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Critical error in removeProductFromExcel:', error.message);
    return false;
  }
}

module.exports = {
  downloadAndConvertExcel,
  categoryMap,
  reverseCategoryMap,
  categoryFieldsMap,
  addProductToExcel,
  removeProductFromExcel,
  uploadExcelFromJson,
  updateExcelFromJson,
  processAndSaveData
};
