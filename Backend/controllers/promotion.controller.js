const PromotionTheme = require('../models/PromotionTheme.model');
const PromoPackage = require('../models/PromoPackage.model');
const Coupon = require('../models/Coupon.model');
const Product = require('../models/Product.model');
const User = require('../models/User.model');
const SystemSettings = require('../models/SystemSettings');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Hero Upload Config
const heroStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const heroDir = path.join(__dirname, '..', 'uploads', 'hero');
        if (!fs.existsSync(heroDir)) {
            fs.mkdirSync(heroDir, { recursive: true });
        }
        cb(null, heroDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.png';
        cb(null, `hero-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
    }
});

const uploadHero = multer({
    storage: heroStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for high-res hero images
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed!'), false);
        }
    }
});

exports.uploadHeroImage = (req, res) => {
    uploadHero.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, message: `Multer error: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ success: false, message: `Upload error: ${err.message}` });
        }

        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No image uploaded' });
            }
            const publicUrl = `/uploads/hero/${req.file.filename}`;
            res.status(200).json({ success: true, imageUrl: publicUrl });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Upload failed', error: error.message });
        }
    });
};

const getEffectiveCost = (product, excelMatch = null) => {
    const docCost = excelMatch ? parseFloat(excelMatch.price_cost) : 0;
    if (docCost && docCost > 0) return docCost;

    if (product.price_cost && product.price_cost > 0) {
        return product.price_cost;
    }
    const livePrice = excelMatch ? (parseFloat(excelMatch.price) || parseFloat(excelMatch.product_price) || 0) : (product.product_price || 0);
    // Fallback: 70% of selling price as cost to insure a reasonable profit calculation
    return livePrice * 0.7;
};

exports.getActivePromotion = async (req, res) => {
    try {
        const activeTheme = await PromotionTheme.findOne({ isActive: true });
        if (!activeTheme) {
            return res.status(200).json({ message: 'No active promotion', theme: null });
        }
        res.status(200).json({ theme: activeTheme });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching active promotion', error: error.message });
    }
};

exports.getHeroConfig = async (req, res) => {
    try {
        const settings = await SystemSettings.getInstance();
        res.status(200).json(settings.heroConfig || { mode: 'slider' });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching hero config', error: error.message });
    }
};

exports.getHeroBooks = async (req, res) => {
    try {
        // 1. Fetch from output.json (Excel)
        let excelProducts = [];
        const filePath = path.join(__dirname, '..', 'output.json');
        if (fs.existsSync(filePath)) {
            try {
                excelProducts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) {
                console.error('Error parsing output.json in getHeroBooks:', e);
            }
        }

        // 2. Fetch from MongoDB Product collection
        const dbProducts = await Product.find({ 
            status: 'approved',
            $or: [
                { product_image: { $exists: true, $ne: '' } },
                { image_path: { $exists: true, $ne: '' } }
            ]
        }).lean();

        // 3. Load merchant role and names
        const merchants = await User.find({ role: { $in: ['merchant', 'admin'] } })
            .select('_id name merchantName logo role')
            .lean();
            
        const merchantMap = new Map();
        merchants.forEach(m => merchantMap.set(m._id.toString(), {
            name: (m.merchantName || m.name || 'كنوز'),
            logo: m.logo,
            role: m.role
        }));

        // 4. Merge and Unify
        const uniqueItems = new Map();
        
        const getMatchKey = (item) => {
            if (!item) return null;
            if (item.products_id && /^\d+$/.test(item.products_id.toString())) return item.products_id.toString();
            if (item.product_image && /^\d+$/.test(item.product_image.toString())) return item.product_image.toString();
            return item.products_id || (item._id ? item._id.toString() : null);
        };

        excelProducts.forEach(item => {
            const matchKey = getMatchKey(item);
            if (matchKey && (item.product_image || item.image_path)) {
                uniqueItems.set(matchKey, {
                    ...item,
                    isDbProduct: false
                });
            }
        });

        dbProducts.forEach(product => {
            const matchKey = getMatchKey(product);
            const excelMatch = uniqueItems.get(matchKey);

            let finalPid = product._id.toString();
            if (excelMatch && excelMatch.products_id) finalPid = excelMatch.products_id.toString();

            const mergedProduct = {
                ...(excelMatch || {}),
                ...product,
                products_id: finalPid,
                _id: product._id.toString(),
                isDbProduct: true
            };

            const itemKey = matchKey || finalPid;
            uniqueItems.set(itemKey, mergedProduct);
        });

        let allProducts = Array.from(uniqueItems.values());

        // 5. Enrich merchant fields
        allProducts.forEach(book => {
            if (!book.merchantId && !book.isDbProduct) book.merchantId = '69d11b07df78621a8d7b1559';

            if (merchantMap && book.merchantId) {
                const mInfo = merchantMap.get(book.merchantId.toString());
                if (mInfo) {
                    book.merchantName = mInfo.name;
                    book.merchantLogo = mInfo.logo || book.merchantLogo;
                    book.merchantRole = mInfo.role;
                }
            }
            if (!book.merchantName) book.merchantName = 'كنوز';
            book.products_id = book.products_id || book.product_image || book._id;
        });

        // 6. Ensure they have a valid image
        allProducts = allProducts.filter(p => p.product_image || p.image_path);

        // 7. Shuffle and pick 32 random items
        const shuffled = allProducts.sort(() => 0.5 - Math.random());
        const sampledProducts = shuffled.slice(0, 32);

        // 8. Map to frontend fields
        const products = sampledProducts.map(p => ({
            _id: p._id ? p._id.toString() : p.products_id,
            product_name: p.product_name || p.bookName,
            product_image: p.product_image,
            image_path: p.image_path,
            product_price: p.product_price,
            barcode: p.barcode || p.products_id,
            author: p.author || '',
            products_id: p.products_id,
            merchantId: p.merchantId,
            merchantName: p.merchantRole === 'admin' ? null : p.merchantName,
            merchantRole: p.merchantRole || 'admin'
        }));

        res.status(200).json({ success: true, products });
    } catch (error) {
        console.error('Error in getHeroBooks:', error);
        res.status(500).json({ success: false, message: 'Error fetching hero books', error: error.message });
    }
};

exports.spinLuckyWheel = async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const activeTheme = await PromotionTheme.findOne({ isActive: true, 'luckyWheel.isEnabled': true });
        if (!activeTheme) return res.status(400).json({ message: 'Lucky wheel is not active' });

        // Check spin limit
        const now = new Date();
        const todayStr = now.toDateString();
        const spinLimit = activeTheme.luckyWheel.spinLimitPerUser || 1;

        let dailyCount = user.gamification?.dailySpinCount || 0;
        const lastSpin = user.gamification?.lastWheelSpin ? new Date(user.gamification.lastWheelSpin) : null;

        if (lastSpin && lastSpin.toDateString() === todayStr) {
            if (dailyCount >= spinLimit) {
                return res.status(400).json({
                    message: `لقد استنفدت محاولاتك لليوم (${spinLimit}). عد غداً!`
                });
            }
        } else {
            // New day, reset count
            dailyCount = 0;
        }

        const prizes = activeTheme.luckyWheel.prizes;
        if (!prizes || prizes.length === 0) return res.status(400).json({ message: 'No prizes configured' });

        // Total probability sum
        const sumOfProbabilities = prizes.reduce((sum, p) => sum + (p.probability || 0), 0);

        let selectedPrize;
        let randomValue;
        let totalWeight;

        if (sumOfProbabilities === 0) {
            // If all probabilities are 0, treat them as equal weights (each has 1 weight)
            totalWeight = prizes.length;
            randomValue = Math.random() * totalWeight;
            const selectedIndex = Math.floor(randomValue);
            selectedPrize = prizes[selectedIndex];

            console.log(`[LuckyWheel] ALL PROBS ZERO. TotalWeight: ${totalWeight}, RandomIndex: ${selectedIndex}, Prize: ${selectedPrize.label}`);
        } else {
            // Normal weighted selection
            totalWeight = sumOfProbabilities;
            randomValue = Math.random() * totalWeight;

            let cumulativeProbability = 0;
            selectedPrize = prizes[prizes.length - 1]; // Default to last if something goes wrong

            for (let i = 0; i < prizes.length; i++) {
                cumulativeProbability += (prizes[i].probability || 0);
                if (randomValue < cumulativeProbability) {
                    selectedPrize = prizes[i];
                    console.log(`[LuckyWheel] Weighted Selection. RandomValue: ${randomValue.toFixed(4)}, TotalWeight: ${totalWeight.toFixed(4)}, SelectedIndex: ${i}, Prize: ${selectedPrize.label}`);
                    break;
                }
            }
        }

        // Build a plain object explicitly to ensure all fields are captured correctly
        const prizeResult = {
            label: selectedPrize.label,
            type: selectedPrize.type,
            value: selectedPrize.value,
            icon: selectedPrize.icon,
            quantity: selectedPrize.quantity || 1,
            wonBooks: []
        };

        // Assign prize
        if (prizeResult.type === 'coupon') {
            const coupon = await Coupon.findOne({ code: prizeResult.value });
            if (coupon) {
                user.earnedCoupons.push({
                    couponId: coupon._id,
                    code: coupon.code,
                    earnedAt: now
                });
            }
        } else if (prizeResult.type === 'points') {
            const points = parseInt(prizeResult.value) || 0;
            user.quranProgress.totalPoints += points;
            // Also increment coins as they are often used interchangeably in the UI
            user.gamification.coins = (user.gamification.coins || 0) + points;
        } else if (prizeResult.type === 'book') {
            const winQuantity = Math.max(1, prizeResult.quantity || 1);
            let pool = [];

            if (typeof prizeResult.value === 'string') {
                pool = prizeResult.value.split(',').map(id => id.trim()).filter(id => id);
            } else if (Array.isArray(prizeResult.value)) {
                pool = prizeResult.value;
            }

            console.log(`[LuckyWheel] Book Prize. Pool: ${pool.length}, Quantity: ${winQuantity}`);

            // Shuffle and pick N
            const shuffled = pool.sort(() => 0.5 - Math.random());
            const selectedIds = shuffled.slice(0, winQuantity);

            console.log(`[LuckyWheel] Selected Book IDs: ${selectedIds.join(', ')}`);

            for (const bId of selectedIds) {
                let book = null;

                // 1. Try Find by MongoDB _id (if valid)
                if (mongoose.Types.ObjectId.isValid(bId)) {
                    book = await Product.findById(bId).populate('merchantId', 'username');
                }

                // 2. Try Find by product_image field (which often holds the numeric ID)
                if (!book) {
                    book = await Product.findOne({ product_image: String(bId) }).populate('merchantId', 'username');
                }

                if (book) {
                    console.log(`[LuckyWheel] Found book in Mongo: ${book.product_name}`);
                    user.prizes.push({ type: 'book', value: bId, receivedAt: now });
                    prizeResult.wonBooks.push({
                        name: book.product_name,
                        image: book.product_image,
                        price: book.product_price,
                        merchant: book.merchantId?.username || 'Kenouz',
                        id: book._id
                    });
                } else {
                    // 3. Fallback to Excel Data (output.json)
                    try {
                        const outputJsonPath = path.join(__dirname, '..', 'output.json');
                        if (fs.existsSync(outputJsonPath)) {
                            const outputData = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
                            const excelBook = outputData.find(b => String(b.products_id) === String(bId));

                            if (excelBook) {
                                console.log(`[LuckyWheel] Found book in Excel: ${excelBook.product_name}`);
                                user.prizes.push({ type: 'book', value: bId, receivedAt: now });

                                // Normalize image path (Excel path starts with /uploads/ which frontend prepends too)
                                let imgPath = excelBook.image_path || excelBook.product_image;
                                if (imgPath && imgPath.startsWith('/uploads/')) {
                                    imgPath = imgPath.replace('/uploads/', '');
                                } else if (imgPath && imgPath.startsWith('uploads/')) {
                                    imgPath = imgPath.replace('uploads/', '');
                                }

                                prizeResult.wonBooks.push({
                                    name: excelBook.product_name,
                                    image: imgPath,
                                    price: excelBook.product_price,
                                    merchant: 'Kenouz',
                                    id: String(bId)
                                });
                            } else {
                                console.warn(`[LuckyWheel] Book ID ${bId} not found in Excel fallback`);
                            }
                        }
                    } catch (fsError) {
                        console.error('[LuckyWheel] Excel Fallback Error:', fsError);
                    }
                }
            }
        }

        console.log(`[LuckyWheel] Final WonBooks Count: ${prizeResult.wonBooks.length}`);

        user.gamification.lastWheelSpin = now;
        user.gamification.dailySpinCount = (dailyCount || 0) + 1;
        await user.save();

        const responsePayload = {
            message: 'Spin successful',
            prize: {
                label: prizeResult.label,
                type: prizeResult.type,
                value: prizeResult.type === 'book' ? prizeResult.wonBooks.map(b => b.id).join(',') : prizeResult.value,
                icon: prizeResult.icon,
                books: prizeResult.wonBooks
            }
        };

        console.log('[LuckyWheel] Sending Response:', JSON.stringify(responsePayload.prize));
        res.status(200).json(responsePayload);
    } catch (error) {
        console.error('[LuckyWheel] Spin Error:', error);
        res.status(500).json({ message: 'Error spinning wheel', error: error.message });
    }
};

exports.getDynamicOffer = async (req, res) => {
    try {
        const { productIds } = req.body;
        if (!productIds || !Array.isArray(productIds)) {
            return res.status(400).json({ message: 'Invalid product selection' });
        }

        const settings = await SystemSettings.getInstance();
        const targetMargin = settings.economy?.dynamicOfferProfitMargin || 50;

        // Count occurrences of each ID (could be ObjectIds or Barcodes)
        const idCounts = {};
        productIds.forEach(id => {
            idCounts[id] = (idCounts[id] || 0) + 1;
        });

        const outputDataPath = path.join(__dirname, '..', 'output.json');
        let outputData = [];
        try {
            if (fs.existsSync(outputDataPath)) {
                outputData = JSON.parse(fs.readFileSync(outputDataPath, 'utf8'));
            }
        } catch (err) {
            console.error('[DynamicOffer] Error reading output.json:', err);
        }
        const adminMerchant = await User.findOne({ role: 'admin' });

        const products = [];
        const uniqueRequestedIds = Object.keys(idCounts);

        for (const id of uniqueRequestedIds) {
            let productDoc = null;

            // 1. Try by ObjectId
            if (mongoose.Types.ObjectId.isValid(id)) {
                productDoc = await Product.findById(id).populate('merchantId');
            }

            // 2. Try by Barcode/Image (if not found or if id was not a valid ObjectId)
            if (!productDoc) {
                const barcodeStr = String(id).trim();
                productDoc = await Product.findOne({
                    $or: [
                        { product_image: barcodeStr },
                        { product_image: barcodeStr + '.webp' },
                        { product_image: barcodeStr + '.jpg' }
                    ]
                }).populate('merchantId');

                // 3. Sync on demand from Excel if still not found
                if (!productDoc) {
                    const excelProduct = outputData.find(p => String(p.products_id) === barcodeStr);
                    if (excelProduct && adminMerchant) {
                        try {
                            productDoc = await Product.findOneAndUpdate(
                                { product_image: barcodeStr },
                                {
                                    $setOnInsert: {
                                        product_name: excelProduct.product_name || excelProduct.bookName,
                                        product_quantity: parseInt(excelProduct.product_quantity) || 50,
                                        product_category: excelProduct.product_category || 'General',
                                        product_description: excelProduct.product_description || 'Auto-synced for Dynamic Offer',
                                        product_price: parseFloat(excelProduct.product_price) || 0,
                                        price_cost: parseFloat(excelProduct.price_cost) || 0,
                                        status: 'approved',
                                        merchantId: adminMerchant._id,
                                        productType: 'physical'
                                    }
                                },
                                { upsert: true, new: true }
                            );
                            console.log(`[DynamicOffer] Synced/found product ${barcodeStr} in MongoDB`);
                        } catch (syncError) {
                            console.error(`[DynamicOffer] Failed to sync ${barcodeStr}:`, syncError.message);
                        }
                    }
                }
            }

            if (productDoc) {
                // Ensure we store the ID used in the request to map back to idCounts
                productDoc._originalRequestedId = id;
                products.push(productDoc);
            }
        }

        if (products.length === 0 && productIds.length > 0) {
            return res.status(404).json({ message: 'No valid products found for offer calculation' });
        }

        let totalCost = 0;
        let totalSellingPrice = 0;

        products.forEach(p => {
            const count = idCounts[p._originalRequestedId] || idCounts[p._id.toString()] || 0;
            const excelMatch = outputData.find(e => String(e.products_id) === String(p.products_id) || String(e.products_id) === String(p.product_image));
            
            const livePrice = excelMatch ? (parseFloat(excelMatch.price) || parseFloat(excelMatch.product_price) || 0) : (p.product_price || 0);
            
            const costPerUnit = getEffectiveCost(p, excelMatch);
            totalCost += (costPerUnit * count);
            totalSellingPrice += (livePrice * count);
        });

        // Rule: FinalPrice should yield targetMargin
        const marginDecimal = targetMargin / 100;
        let minPriceForTargetProfit = totalCost / (1 - marginDecimal);

        // Ensure we always GIVE a discount for a bundle (at least 10% or enough to be attractive)
        const minBundleDiscountPercent = 0.10;
        const maxPriceWithMinDiscount = totalSellingPrice * (1 - minBundleDiscountPercent);

        // We use the lower of (target profit price) or (10% discount price), 
        // BUT we must not go below cost + small margin
        const absoluteFloorPrice = totalCost * 1.10;

        let bestDiscountedPrice = Math.min(minPriceForTargetProfit, maxPriceWithMinDiscount);

        if (bestDiscountedPrice < absoluteFloorPrice) {
            bestDiscountedPrice = absoluteFloorPrice;
        }

        if (bestDiscountedPrice > totalSellingPrice * 0.95) {
            bestDiscountedPrice = totalSellingPrice * 0.95; // Always give at least 5%
        }

        const discountAmount = totalSellingPrice - bestDiscountedPrice;

        const responseData = {
            originalPrice: totalSellingPrice,
            discountedPrice: Math.floor(bestDiscountedPrice),
            savings: Math.floor(discountAmount),
            profitMargin: bestDiscountedPrice > 0 ? ((bestDiscountedPrice - totalCost) / bestDiscountedPrice) * 100 : 0
        };

        console.log('[DynamicOffer] Calculated:', responseData);
        res.status(200).json(responseData);

    } catch (error) {
        console.error('[DynamicOffer] Critical Error:', error);
        res.status(500).json({ message: 'Error calculating dynamic offer', error: error.message });
    }
};

exports.createCoupon = async (req, res) => {
    try {
        const couponData = req.body;

        // Calculate expiryDate if duration is provided
        if (couponData.durationValue && couponData.durationUnit) {
            const now = new Date();
            if (couponData.durationUnit === 'hours') {
                now.setHours(now.getHours() + couponData.durationValue);
            } else if (couponData.durationUnit === 'days') {
                now.setDate(now.getDate() + couponData.durationValue);
            }
            couponData.expiryDate = now;
        }

        const newCoupon = new Coupon(couponData);
        await newCoupon.save();
        res.status(201).json({ message: 'Coupon created successfully', coupon: newCoupon });
    } catch (error) {
        res.status(500).json({ message: 'Error creating coupon', error: error.message });
    }
};

exports.updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const couponData = req.body;

        // Recalculate expiryDate if duration is updated
        if (couponData.durationValue && couponData.durationUnit) {
            const now = new Date();
            if (couponData.durationUnit === 'hours') {
                now.setHours(now.getHours() + couponData.durationValue);
            } else if (couponData.durationUnit === 'days') {
                now.setDate(now.getDate() + couponData.durationValue);
            }
            couponData.expiryDate = now;
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(id, couponData, { new: true });
        if (!updatedCoupon) return res.status(404).json({ message: 'Coupon not found' });

        res.status(200).json({ message: 'Coupon updated successfully', coupon: updatedCoupon });
    } catch (error) {
        res.status(500).json({ message: 'Error updating coupon', error: error.message });
    }
};

exports.validateCoupon = async (req, res) => {
    try {
        let { code, userId, orderAmount } = req.body;
        if (!code) return res.status(400).json({ message: 'رمز الخصم مطلوب' });

        // Normalize code: trim and uppercase
        const normalizedCode = code.trim().toUpperCase();

        const coupon = await Coupon.findOne({ code: normalizedCode, isActive: true });

        if (!coupon) {
            console.log(`[Coupon] Invalid code: ${normalizedCode}`);
            return res.status(404).json({ message: 'رمز الخصم غير صالح' });
        }

        if (coupon.expiryDate && new Date() > coupon.expiryDate) {
            return res.status(400).json({ message: 'انتهت صلاحية هذا الكود' });
        }

        if (coupon.uses >= coupon.maxUses) {
            return res.status(400).json({ message: 'تم استهلاك جميع محاولات هذا الكود' });
        }

        // Only check minOrderAmount if orderAmount > 0 (i.e. we are at checkout phase)
        // If orderAmount is 0, we are just "activating" it for display in search results
        if (orderAmount > 0 && orderAmount < coupon.minOrderAmount) {
            return res.status(400).json({ message: `الحد الأدنى لاستخدام هذا الكود هو ${coupon.minOrderAmount}` });
        }

        if (userId) {
            const userUsage = coupon.usedBy.find(u => u.userId && u.userId.toString() === userId.toString());
            if (userUsage && userUsage.count >= (coupon.maxUsers || 1)) {
                return res.status(400).json({ message: 'لقد استنفدت عدد مرات استخدامك لهذا الكود' });
            }
        }

        res.status(200).json({
            message: 'Coupon is valid',
            code: coupon.code,
            discountType: coupon.discountType,
            value: coupon.value,
            maxDiscountAmount: coupon.maxDiscountAmount,
            minPrice: coupon.minPrice,
            maxPrice: coupon.maxPrice,
            maxProducts: coupon.maxProducts,
            maxQtyPerProduct: coupon.maxQtyPerProduct
        });

    } catch (error) {
        res.status(500).json({ message: 'Error validating coupon', error: error.message });
    }
};

exports.getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.status(200).json(coupons);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching coupons', error: error.message });
    }
};

exports.deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        await Coupon.findByIdAndDelete(id);
        res.status(200).json({ message: 'Coupon deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting coupon', error: error.message });
    }
};

exports.getAllThemes = async (req, res) => {
    try {
        const themes = await PromotionTheme.find();
        res.status(200).json(themes);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching themes', error: error.message });
    }
};

exports.createTheme = async (req, res) => {
    try {
        const { name, themeConfig, luckyWheel } = req.body;
        // Auto-generate slug — use timestamp fallback for non-latin names (e.g. Arabic)
        const baseSlug = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const slug = baseSlug || `theme-${Date.now()}`;
        const newTheme = new PromotionTheme({
            name,
            slug,
            themeConfig,
            luckyWheel,
            isActive: false
        });
        await newTheme.save();
        res.status(201).json({ message: 'Theme created successfully', theme: newTheme });
    } catch (error) {
        res.status(500).json({ message: 'Error creating theme', error: error.message });
    }
};

exports.updateTheme = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedTheme = await PromotionTheme.findByIdAndUpdate(id, req.body, { new: true });
        if (!updatedTheme) return res.status(404).json({ message: 'Theme not found' });
        res.status(200).json({ message: 'Theme updated successfully', theme: updatedTheme });
    } catch (error) {
        res.status(500).json({ message: 'Error updating theme', error: error.message });
    }
};

exports.toggleTheme = async (req, res) => {
    try {
        const { id } = req.params;
        const themeToToggle = await PromotionTheme.findById(id);

        if (!themeToToggle) return res.status(404).json({ message: 'Theme not found' });

        if (!themeToToggle.isActive) {
            // Deactivate all others first if we are activating this one
            await PromotionTheme.updateMany({}, { isActive: false });
        }

        themeToToggle.isActive = !themeToToggle.isActive;
        await themeToToggle.save();

        res.status(200).json({
            message: `Theme ${themeToToggle.isActive ? 'activated' : 'deactivated'} successfully`,
            theme: themeToToggle
        });
    } catch (error) {
        res.status(500).json({ message: 'Error toggling theme', error: error.message });
    }
};

// --- Package Management ---

exports.getAllPackages = async (req, res) => {
    try {
        const packages = await PromoPackage.find()
            .populate({
                path: 'products',
                populate: { path: 'merchantId' }
            })
            .sort({ createdAt: -1 });
        res.status(200).json(packages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching packages', error: error.message });
    }
};

exports.createPackage = async (req, res) => {
    console.log('[PROMO_DEBUG_v2] Entering createPackage');
    try {
        const { name, products, fixedPrice, promoPrice, description } = req.body;

        const resolvedProductIds = [];
        let outputData = [];
        try {
            const outputPath = path.join(__dirname, '..', 'output.json');
            if (fs.existsSync(outputPath)) {
                outputData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
            }
        } catch (e) {
            console.error('[createPackage] Error reading output.json:', e.message);
        }

        // Find a fallback ADMIN merchant for synced products
        const adminMerchant = await User.findOne({ role: 'admin' });

        for (const id of (products || [])) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                resolvedProductIds.push(new mongoose.Types.ObjectId(id));
            } else {
                const barcodeStr = String(id).trim();

                // 1. Try to find in MongoDB
                let productDoc = await Product.findOne({
                    $or: [
                        { product_image: barcodeStr },
                        { product_image: barcodeStr + '.webp' },
                        { product_image: barcodeStr + '.jpg' },
                        { product_image: { $regex: new RegExp(`(^|[\\/\\-_])${barcodeStr}(\\.|_|\\-|$)`, 'i') } }
                    ]
                });

                if (productDoc) {
                    resolvedProductIds.push(productDoc._id);
                    continue;
                }

                // 2. Not in MongoDB? Find-or-create from output.json (Sync on demand)
                const excelProduct = outputData.find(p => String(p.products_id) === barcodeStr);
                if (excelProduct && adminMerchant) {
                    try {
                        productDoc = await Product.findOneAndUpdate(
                            { product_image: barcodeStr },
                            {
                                $setOnInsert: {
                                    product_name: excelProduct.product_name || excelProduct.bookName,
                                    product_quantity: parseInt(excelProduct.product_quantity) || 50,
                                    product_category: excelProduct.product_category || 'General',
                                    product_description: excelProduct.product_description || 'Auto-synced from Excel',
                                    product_price: parseFloat(excelProduct.product_price) || 0,
                                    price_cost: parseFloat(excelProduct.price_cost) || 0,
                                    status: 'approved',
                                    merchantId: adminMerchant._id,
                                    productType: 'physical'
                                }
                            },
                            { upsert: true, new: true }
                        );

                        console.log(`[createPackage] Synced/found product ${barcodeStr} in MongoDB: ${productDoc._id}`);
                        resolvedProductIds.push(productDoc._id);
                    } catch (syncError) {
                        console.error(`[createPackage] Failed to sync product ${barcodeStr}:`, syncError.message);
                    }
                }
            }
        }

        const newPackage = new PromoPackage({
            name,
            description: description || '',
            products: resolvedProductIds,
            promoPrice: promoPrice || fixedPrice || 0,
            totalOriginalPrice: req.body.totalOriginalPrice || fixedPrice || promoPrice || 0,
            minPrice: req.body.minPrice,
            maxPrice: req.body.maxPrice,
            isActive: true
        });
        await newPackage.save();
        res.status(201).json({ message: 'Package created successfully', package: newPackage });
    } catch (error) {
        console.error('[createPackage] ERROR:', error);
        res.status(500).json({ message: 'Error creating package', error: error.message });
    }
};

exports.deletePackage = async (req, res) => {
    try {
        const { id } = req.params;
        await PromoPackage.findByIdAndDelete(id);
        res.status(200).json({ message: 'Package deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting package', error: error.message });
    }
};

// --- Wheel Config (stored inside active theme) ---
exports.getWheelConfig = async (req, res) => {
    try {
        const theme = await PromotionTheme.findOne({ isActive: true });
        if (!theme) return res.status(404).json({ message: 'No active theme found' });
        res.status(200).json(theme.luckyWheel);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching wheel config', error: error.message });
    }
};

exports.updateWheelConfig = async (req, res) => {
    try {
        const { themeId, luckyWheel } = req.body;
        const theme = themeId
            ? await PromotionTheme.findByIdAndUpdate(themeId, { luckyWheel }, { new: true })
            : await PromotionTheme.findOneAndUpdate({ isActive: true }, { luckyWheel }, { new: true });
        if (!theme) return res.status(404).json({ message: 'Theme not found' });
        res.status(200).json({ message: 'Wheel config updated', luckyWheel: theme.luckyWheel });
    } catch (error) {
        res.status(500).json({ message: 'Error updating wheel config', error: error.message });
    }
};

const HeroSlide = require('../models/HeroSlide.model');

exports.getHeroSlides = async (req, res) => {
    try {
        const slides = await HeroSlide.find().sort({ order: 1 });
        res.status(200).json({ success: true, slides });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching hero slides', error: error.message });
    }
};

exports.createHeroSlide = async (req, res) => {
    try {
        const slideData = req.body;
        // In a real scenario, this would handle file uploads via multer.
        // For now, we assume paths are provided or handled by a separate upload middleware.
        const newSlide = new HeroSlide(slideData);
        await newSlide.save();
        res.status(201).json({ success: true, message: 'Hero slide created', slide: newSlide });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating hero slide', error: error.message });
    }
};

exports.deleteHeroSlide = async (req, res) => {
    try {
        const { id } = req.params;
        const slide = await HeroSlide.findById(id);
        if (!slide) return res.status(404).json({ success: false, message: 'Slide not found' });

        // Delete physical files if they exist in uploads
        const deleteFile = (filePath) => {
            if (!filePath) return;

            // Generate absolute path to the file
            // filePath is typically '/uploads/hero/...'
            const cleanPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
            const fullPath = path.resolve(__dirname, '..', cleanPath);

            if (fs.existsSync(fullPath)) {
                try {
                    fs.unlinkSync(fullPath);
                } catch (err) {
                    console.error(`❌ [DeleteHero] Error unlinking ${fullPath}:`, err.message);
                }
            }
        };

        deleteFile(slide.desktopPath);
        deleteFile(slide.mobilePath);

        await HeroSlide.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: 'Hero slide and files deleted permanently' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting hero slide', error: error.message });
    }
};
