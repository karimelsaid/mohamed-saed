const Product = require('../models/Product.model');
const User = require('../models/User.model');
const mongoose = require('mongoose');

/**
 * Tracks a view for a product
 */
exports.trackProductView = async (req, res) => {
    try {
        const { productId } = req.params;
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        let product;
        if (mongoose.Types.ObjectId.isValid(productId)) {
            product = await Product.findById(productId);
        }
        
        // If not found by _id, try finding by products_id (numeric string)
        if (!product) {
            product = await Product.findOne({ products_id: productId });
        }

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Increment total views
        product.views = (product.views || 0) + 1;

        // Update daily history
        const historyIndex = product.viewHistory.findIndex(h => h.date === today);
        if (historyIndex > -1) {
            product.viewHistory[historyIndex].count += 1;
        } else {
            product.viewHistory.push({ date: today, count: 1 });
        }

        // Limit history to last 30 days to save space
        if (product.viewHistory.length > 30) {
            product.viewHistory.shift();
        }

        await product.save({ validateBeforeSave: false });
        res.json({ success: true, views: product.views });
    } catch (error) {
        console.error('Error tracking product view:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Tracks a visit to a merchant's store
 */
exports.trackStoreVisit = async (req, res) => {
    try {
        const { merchantId } = req.params;
        const today = new Date().toISOString().split('T')[0];

        // Only track visits for registered merchants with valid ObjectIds
        if (!mongoose.Types.ObjectId.isValid(merchantId)) {
            return res.json({ success: true, message: 'Skipped tracking for virtual merchant' });
        }

        const merchant = await User.findById(merchantId);
        if (!merchant || merchant.role !== 'merchant') {
            return res.status(404).json({ success: false, message: 'Merchant not found' });
        }

        // Increment total store views
        merchant.storeViews = (merchant.storeViews || 0) + 1;

        // Update daily history
        const historyIndex = merchant.storeViewHistory.findIndex(h => h.date === today);
        if (historyIndex > -1) {
            merchant.storeViewHistory[historyIndex].count += 1;
        } else {
            merchant.storeViewHistory.push({ date: today, count: 1 });
        }

        // Limit history to last 30 days
        if (merchant.storeViewHistory.length > 30) {
            merchant.storeViewHistory.shift();
        }

        await merchant.save({ validateBeforeSave: false });
        res.json({ success: true, storeViews: merchant.storeViews });
    } catch (error) {
        console.error('Error tracking store visit:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Aggregates analytics for a merchant
 */
exports.getMerchantAnalytics = async (req, res) => {
    try {
        const merchantId = req.merchant._id;
        
        // 1. Get Merchant Info (Store Views)
        const merchant = await User.findById(merchantId).select('storeViews storeViewHistory merchantName');
        
        // 2. Get All Merchant Products sorted by views
        const products = await Product.find({ merchantId })
            .select('product_name views viewHistory product_category product_image products_id')
            .sort({ views: -1 });

        // 3. Calculate Category Performance
        const categoryStats = {};
        products.forEach(p => {
            const cat = p.product_category || 'Other';
            if (!categoryStats[cat]) {
                categoryStats[cat] = { views: 0, productCount: 0 };
            }
            categoryStats[cat].views += p.views || 0;
            categoryStats[cat].productCount += 1;
        });

        // 4. Summarize total product views
        const totalProductViews = products.reduce((sum, p) => sum + (p.views || 0), 0);

        // 5. Build combined daily trend (Sum of all products + store visits)
        // For simplicity, we'll return them separately and let frontend handle it
        
        res.json({
            success: true,
            analytics: {
                storeViews: merchant.storeViews || 0,
                storeViewHistory: merchant.storeViewHistory || [],
                totalProductViews,
                topProducts: products.slice(0, 10), // Top 10 products
                categoryPerformance: Object.entries(categoryStats).map(([name, stats]) => ({
                    name,
                    views: stats.views,
                    count: stats.productCount
                })),
                recentProductViewsTrend: products.reduce((acc, p) => {
                    p.viewHistory.forEach(h => {
                        const existing = acc.find(item => item.date === h.date);
                        if (existing) {
                            existing.count += h.count;
                        } else {
                            acc.push({ date: h.date, count: h.count });
                        }
                    });
                    return acc;
                }, []).sort((a, b) => a.date.localeCompare(b.date))
            }
        });
    } catch (error) {
        console.error('Error fetching merchant analytics:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Tracks a search query
 */
exports.trackSearchTerm = async (req, res) => {
    try {
        const { term } = req.body;
        if (!term || typeof term !== 'string' || term.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid search term' });
        }

        const cleanTerm = term.trim().toLowerCase();
        const SearchQuery = require('../models/SearchQuery.model');

        // Upsert the search term
        await SearchQuery.findOneAndUpdate(
            { term: cleanTerm },
            { 
                $inc: { count: 1 },
                $set: { lastSearchedAt: new Date() }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error tracking search term:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
