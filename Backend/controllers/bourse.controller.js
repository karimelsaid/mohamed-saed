const BourseOffer = require('../models/BourseOffer.model');
const SystemSettings = require('../models/SystemSettings');
const fs = require('fs');
const path = require('path');

// Shuffle array helper
function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// Utility to get Date String in Local Time
function getLocalDateString(date) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

exports.getCurrentOffer = async (req, res) => {
  try {
    const settings = await SystemSettings.getInstance();
    if (!settings.bourseConfig || !settings.bourseConfig.isActive) {
      return res.status(200).json({ active: false, message: 'Bourse is not active currently', freeGiftThreshold: settings.bourseConfig?.freeGiftThreshold || 1000 });
    }

    const now = new Date();
    const dateStr = getLocalDateString(now);
    
    console.log(`[Bourse] Checking for active offer. DateStr: ${dateStr}, Now (UTC): ${now.toISOString()}`);

    const activeOffer = await BourseOffer.findOne({
      date: dateStr,
      startTime: { $lte: now },
      endTime: { $gte: now }
    });

    if (activeOffer) {
      return res.status(200).json({ active: true, offer: activeOffer, freeGiftThreshold: settings.bourseConfig.freeGiftThreshold });
    }

    // Attempt to generate today's offers if they don't exist
    const offersCount = await BourseOffer.countDocuments({ date: dateStr });
    if (offersCount === 0) {
       await generateDailyBourseOffers(dateStr, settings.bourseConfig);
       // Check again
       const newOffer = await BourseOffer.findOne({
          date: dateStr,
          startTime: { $lte: now },
          endTime: { $gte: now }
       });
       if (newOffer) {
         return res.status(200).json({ active: true, offer: newOffer, freeGiftThreshold: settings.bourseConfig.freeGiftThreshold });
       }
    }
    
    res.status(200).json({ active: false, message: 'No active offer found at this time', freeGiftThreshold: settings.bourseConfig.freeGiftThreshold });
  } catch(error) {
    console.error('Error fetching current bourse offer:', error);
    res.status(500).json({ active: false, message: 'Error fetching current bourse offer', error: error.message });
  }
};

exports.generateDailyBourseOffers = generateDailyBourseOffers;

async function generateDailyBourseOffers(dateStr, config) {
  let productsData;
  try {
    productsData = fs.readFileSync(path.join(__dirname, '..', 'output.json'), 'utf-8');
  } catch (err) {
    console.error('Could not read output.json for bourse generation');
    return;
  }
  let allBooks = JSON.parse(productsData);
  
  if (config.allowedCategories && config.allowedCategories.length > 0) {
    allBooks = allBooks.filter(b => config.allowedCategories.includes(b.product_category));
  }

  // Filter merchant products based on config
  if (!config.includeMerchantProducts) {
    const internalIds = ['kenouz', 'admin', 'admin__karim_mohamed__', '69d11b07df78621a8d7b1559'];
    allBooks = allBooks.filter(b => {
      let isAdmin = false;
      if (b.merchantId) {
        const mId = (typeof b.merchantId === 'object' ? (b.merchantId._id || b.merchantId.id || '') : b.merchantId).toString().toLowerCase();
        const role = (typeof b.merchantId === 'object' ? (b.merchantId.role || '') : '').toLowerCase();
        const username = (typeof b.merchantId === 'object' ? (b.merchantId.username || '') : '').toLowerCase();
        
        if (role === 'admin' || username === 'admin' || internalIds.includes(mId)) {
          isAdmin = true;
        }
      }

      // 2. Check the image path (most reliable discriminator in this system)
      // Admin paths start with /uploads/books/admin_
      // Merchant paths start with /uploads/books/merchant_
      const imgPath = (b.image_path || '').toLowerCase();
      const isMerchantPath = imgPath.includes('/merchant_');
      const isAdminPath = imgPath.includes('/admin_');

      // If we found an admin indicator, it's NOT a merchant product
      if (isAdmin || isAdminPath) return true;
      
      // If we found a merchant indicator, it IS a merchant product (filter out)
      if (isMerchantPath || b.merchantId) return false;

      // Default to true for legacy/internal products
      return true;
    });
  }

  // Filter only books that have a valid price and available quantity
  allBooks = allBooks.filter(b => (parseFloat(b.product_price) || parseFloat(b.price)) > 0 && parseInt(b.product_quantity || 0) > 0);

  if (allBooks.length === 0) {
    console.warn('No books available to generate bourse offers');
    return;
  }

  const netProfit = config.netProfitMargin || 10;
  const booksPerSlot = config.booksPerSlot || 8;

  const offersToCreate = [];
  
  const [year, month, day] = dateStr.split('-');
  
  for (let i = 0; i < 32; i++) {
    const startMinutes = i * 45;
    const endMinutes = startMinutes + 44;
    
    // Create dates in local time to avoid UTC shift
    const startTime = new Date(year, month - 1, day, 0, startMinutes, 0);
    const endTime = new Date(year, month - 1, day, 0, endMinutes, 59);

    const shuffled = shuffle([...allBooks]);
    const selectedBooks = shuffled.slice(0, Math.min(booksPerSlot, shuffled.length));

    const slotBooks = selectedBooks.map(book => {
      const originalPrice = parseFloat(book.product_price || book.price || 0);
      let cost = parseFloat(book.price_cost || 0);
      
      // APPLY FALLBACK: If cost is missing, assume 70% of original price
      if (cost === 0) {
        cost = originalPrice * 0.7;
      }
      
      let parsedBoursePrice = cost > 0 ? cost + netProfit : originalPrice * 0.8;
      
      if (parsedBoursePrice >= originalPrice) {
         parsedBoursePrice = originalPrice - 1; // At least 1 EGP discount
      }
      
      return {
        bookId: book.products_id,
        bookName: book.product_name,
        originalPrice: originalPrice,
        boursePrice: Math.ceil(parsedBoursePrice),
        quantityAvailable: Math.max(1, parseInt(book.product_quantity || 1)),
        quantitySold: 0
      };
    });

    offersToCreate.push({
      date: dateStr,
      slotIndex: i,
      startTime,
      endTime,
      books: slotBooks,
      status: 'scheduled'
    });
  }

  await BourseOffer.insertMany(offersToCreate);
  console.log(`Successfully generated 32 Bourse Offers for ${dateStr}`);
}

exports.getBourseSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.getInstance();
    res.status(200).json(settings.bourseConfig || {});
  } catch (error) {
    res.status(500).json({ message: 'Error getting bourse settings', error: error.message });
  }
};

exports.updateBourseSettings = async (req, res) => {
  try {
    const { isActive, netProfitMargin, freeGiftThreshold, allowedCategories, booksPerSlot, includeMerchantProducts } = req.body;
    const settings = await SystemSettings.getInstance();
    
    if (!settings.bourseConfig) {
      settings.bourseConfig = {};
    }
    
    // Check if configuration that affects results has changed
    const needsRegeneration = (
      (allowedCategories !== undefined && JSON.stringify(allowedCategories) !== JSON.stringify(settings.bourseConfig.allowedCategories)) ||
      (includeMerchantProducts !== undefined && includeMerchantProducts !== settings.bourseConfig.includeMerchantProducts) ||
      (booksPerSlot !== undefined && booksPerSlot !== settings.bourseConfig.booksPerSlot) ||
      (netProfitMargin !== undefined && netProfitMargin !== settings.bourseConfig.netProfitMargin)
    );

    if (isActive !== undefined) settings.bourseConfig.isActive = isActive;
    if (netProfitMargin !== undefined) settings.bourseConfig.netProfitMargin = netProfitMargin;
    if (freeGiftThreshold !== undefined) settings.bourseConfig.freeGiftThreshold = freeGiftThreshold;
    if (allowedCategories !== undefined) settings.bourseConfig.allowedCategories = allowedCategories;
    if (booksPerSlot !== undefined) settings.bourseConfig.booksPerSlot = booksPerSlot;
    if (includeMerchantProducts !== undefined) settings.bourseConfig.includeMerchantProducts = includeMerchantProducts;

    await settings.save();

    // If configuration changed, delete today's future offers to force regeneration
    if (needsRegeneration) {
      const now = new Date();
      const dateStr = getLocalDateString(now);
      // Delete current and future offers for today
      // This will force re-generation on next getCurrentOffer hit
      await BourseOffer.deleteMany({
        date: dateStr,
        endTime: { $gte: now } 
      });
      console.log(`[Bourse] Bourse settings updated. Cleared today's future offers for regeneration.`);
    }

    res.status(200).json({ message: 'Bourse settings updated successfully', config: settings.bourseConfig });
  } catch (error) {
    res.status(500).json({ message: 'Error updating bourse settings', error: error.message });
  }
};

exports.getTodayOffersAdmin = async (req, res) => {
  try {
    const now = new Date();
    const dateStr = getLocalDateString(now);
    
    const offers = await BourseOffer.find({ date: dateStr }).sort({ slotIndex: 1 });
    res.status(200).json(offers);
  } catch(error) {
    res.status(500).json({ message: 'Error fetching today offers', error: error.message });
  }
};
