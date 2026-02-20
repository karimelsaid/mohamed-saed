const PromotionTheme = require('../models/PromotionTheme.model');
const PromoPackage = require('../models/PromoPackage.model');
const Coupon = require('../models/Coupon.model');
const Product = require('../models/Product.model');
const User = require('../models/User.model');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Helper to calculate cost with fallback
const getEffectiveCost = (product) => {
    if (product.price_cost && product.price_cost > 0) {
        return product.price_cost;
    }
    // Fallback: 60% of selling price
    return product.product_price * 0.6;
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

        const products = await Product.find({ _id: { $in: productIds } });

        let totalCost = 0;
        let totalSellingPrice = 0;

        products.forEach(p => {
            totalCost += getEffectiveCost(p);
            totalSellingPrice += p.product_price;
        });

        // Rule: FinalPrice >= 2 * TotalCost (50% net profit)
        const minPriceFor50PercentProfit = totalCost * 2;

        // Calculate best possible discount
        let bestDiscountedPrice = totalSellingPrice;
        let discountAmount = 0;

        if (totalSellingPrice > minPriceFor50PercentProfit) {
            discountAmount = totalSellingPrice - minPriceFor50PercentProfit;
            bestDiscountedPrice = minPriceFor50PercentProfit;
        }

        res.status(200).json({
            originalPrice: totalSellingPrice,
            discountedPrice: bestDiscountedPrice,
            savings: discountAmount,
            profitMargin: ((bestDiscountedPrice - totalCost) / bestDiscountedPrice) * 100
        });

    } catch (error) {
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
        const packages = await PromoPackage.find().sort({ createdAt: -1 });
        res.status(200).json(packages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching packages', error: error.message });
    }
};

exports.createPackage = async (req, res) => {
    try {
        const { name, products, fixedPrice, promoPrice, description } = req.body;
        // Cast string IDs to ObjectIds safely
        const productIds = (products || []).map(id => {
            try { return new mongoose.Types.ObjectId(id); } catch (e) { return null; }
        }).filter(Boolean);

        const newPackage = new PromoPackage({
            name,
            description: description || '',
            products: productIds,
            promoPrice: promoPrice || fixedPrice || 0,
            totalOriginalPrice: fixedPrice || promoPrice || 0,
            minPrice: req.body.minPrice,
            maxPrice: req.body.maxPrice,
            isActive: true
        });
        await newPackage.save();
        res.status(201).json({ message: 'Package created successfully', package: newPackage });
    } catch (error) {
        console.log('[createPackage] req.body:', JSON.stringify(req.body, null, 2));
        console.error('[createPackage] ERROR:', error);
        res.status(500).json({ message: 'Error creating package', error: error.message, details: error.errors });
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
