const Product = require('../models/Product.model');
const User = require('../models/User.model');
const SearchQuery = require('../models/SearchQuery.model');
const AnalyticsEvent = require('../models/AnalyticsEvent.model');
const mongoose = require('mongoose');
const axios = require('axios');

// n8n webhook URL for event tracking
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.knoozbook.com/webhook/track-event';

/**
 * Tracks any event (impression, click, comment, purchase, other)
 */
exports.trackEvent = async (req, res) => {
    console.log('[Analytics] trackEvent called');
    console.log('[Analytics] Request body:', JSON.stringify(req.body));
    
    try {
        const { eventType, productId, userId, sessionId, metadata, products, orderId } = req.body;

        if (!eventType) {
            return res.status(400).json({ success: false, message: 'eventType is required' });
        }

        // Save event to MongoDB AnalyticsEvent collection
        await AnalyticsEvent.create({
            eventType,
            productId: productId || null,
            userId: userId || 'anonymous',
            sessionId,
            orderId: orderId || null,
            products: products || [],
            metadata: metadata || {},
            createdAt: new Date()
        });

        // Forward event to n8n webhook (fire and forget)
        // n8n webhook automatically wraps the payload in "body", so send directly
        const n8nPayload = req.body;
        console.log('[Analytics] Forwarding event to n8n:', N8N_WEBHOOK_URL);
        console.log('[Analytics] Payload:', JSON.stringify(n8nPayload, null, 2));
        
        // Send to n8n asynchronously
        axios.post(N8N_WEBHOOK_URL, n8nPayload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 5000
        }).then(response => {
            console.log('[Analytics] Successfully forwarded to n8n:', response.status);
        }).catch(err => {
            console.error('[Analytics] Error forwarding event to n8n:', err.message);
            if (err.response) {
                console.error('[Analytics] n8n response status:', err.response.status);
                console.error('[Analytics] n8n response data:', err.response.data);
            }
        });

        // For events that don't require productId (e.g., search, purchase_batch)
        if (!productId) {
            // Handle search events - store search term in database
            if (eventType === 'search' && metadata && metadata.searchTerm) {
                const searchTerm = metadata.searchTerm.trim().toLowerCase();
                if (searchTerm) {
                    await SearchQuery.findOneAndUpdate(
                        { term: searchTerm },
                        {
                            $inc: { count: 1 },
                            $set: { lastSearchedAt: new Date() }
                        },
                        { upsert: true, new: true }
                    );
                    console.log(`[Analytics] Search term tracked: "${searchTerm}"`);
                    return res.json({
                        success: true,
                        message: 'Search term tracked',
                        eventType,
                        searchTerm
                    });
                }
            }
            // Log the event without product tracking
            console.log(`[Analytics] Event tracked without productId: ${eventType}`, { userId, sessionId, metadata });
            return res.json({
                success: true,
                message: 'Event tracked (no productId)',
                eventType
            });
        }

        const today = new Date().toISOString().split('T')[0];

        let product;
        if (mongoose.Types.ObjectId.isValid(productId)) {
            product = await Product.findById(productId);
        }
        if (!product) {
            product = await Product.findOne({ products_id: productId });
        }

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const fieldMap = {
            impression: 'impressions',
            click: 'clicks',
            comment: 'comments',
            purchase: 'purchases',
        };

        const field = fieldMap[eventType] || 'otherEvents';
        product[field] = (product[field] || 0) + 1;

        if (['impression', 'click', 'view'].includes(eventType)) {
            product.views = (product.views || 0) + 1;

            const historyIndex = product.viewHistory.findIndex(h => h.date === today);
            if (historyIndex > -1) {
                product.viewHistory[historyIndex].count += 1;
            } else {
                product.viewHistory.push({ date: today, count: 1 });
            }
            if (product.viewHistory.length > 30) {
                product.viewHistory.shift();
            }
        }

        await product.save({ validateBeforeSave: false });

        res.json({
            success: true,
            message: 'Event tracked',
            eventType,
            productId
        });
    } catch (error) {
        console.error('Error tracking event:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Tracks a view for a product
 */
exports.trackProductView = async (req, res) => {
    console.log('[Analytics] trackProductView called for productId:', req.params.productId);
    
    try {
        const { productId } = req.params;
        const today = new Date().toISOString().split('T')[0];

        let product;
        if (mongoose.Types.ObjectId.isValid(productId)) {
            product = await Product.findById(productId);
        }
        
        if (!product) {
            product = await Product.findOne({ products_id: productId });
        }

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        product.views = (product.views || 0) + 1;

        const historyIndex = product.viewHistory.findIndex(h => h.date === today);
        if (historyIndex > -1) {
            product.viewHistory[historyIndex].count += 1;
        } else {
            product.viewHistory.push({ date: today, count: 1 });
        }

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

        if (!mongoose.Types.ObjectId.isValid(merchantId)) {
            return res.json({ success: true, message: 'Skipped tracking for virtual merchant' });
        }

        const merchant = await User.findById(merchantId);
        if (!merchant || merchant.role !== 'merchant') {
            return res.status(404).json({ success: false, message: 'Merchant not found' });
        }

        merchant.storeViews = (merchant.storeViews || 0) + 1;

        const historyIndex = merchant.storeViewHistory.findIndex(h => h.date === today);
        if (historyIndex > -1) {
            merchant.storeViewHistory[historyIndex].count += 1;
        } else {
            merchant.storeViewHistory.push({ date: today, count: 1 });
        }

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
        
        const merchant = await User.findById(merchantId).select('storeViews storeViewHistory merchantName');
        
        const products = await Product.find({ merchantId })
            .select('product_name views viewHistory product_category product_image products_id')
            .sort({ views: -1 });

        const categoryStats = {};
        products.forEach(p => {
            const cat = p.product_category || 'Other';
            if (!categoryStats[cat]) {
                categoryStats[cat] = { views: 0, productCount: 0 };
            }
            categoryStats[cat].views += p.views || 0;
            categoryStats[cat].productCount += 1;
        });

        const totalProductViews = products.reduce((sum, p) => sum + (p.views || 0), 0);

        res.json({
            success: true,
            analytics: {
                storeViews: merchant.storeViews || 0,
                storeViewHistory: merchant.storeViewHistory || [],
                totalProductViews,
                topProducts: products.slice(0, 10),
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