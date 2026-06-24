const AutomationSetting = require('../models/AutomationSetting.model');
const AutomationLog = require('../models/AutomationLog.model');
const automationService = require('../services/automation.service');
const Product = require('../models/Product.model');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

/**
 * Get the current automation dashboard stats and settings
 */
exports.getDashboardData = async (req, res) => {
    try {
        const settings = await AutomationSetting.getInstance();
        const stats = await automationService.getStats(30);
        
        const recentLogs = await AutomationLog.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('metadata.productId', 'product_name products_id product_image');

        res.json({
            success: true,
            settings,
            stats,
            recentLogs
        });
    } catch (error) {
        console.error('Error in getDashboardData:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Update automation settings
 */
exports.updateSettings = async (req, res) => {
    try {
        const updates = req.body;
        const settings = await AutomationSetting.findOneAndUpdate({}, updates, { new: true, upsert: true });
        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error in updateSettings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get paginated logs for the log viewer
 */
exports.getLogs = async (req, res) => {
    try {
        const { page = 1, limit = 20, type, status } = req.query;
        const query = {};
        if (type) query.type = type;
        if (status) query.status = status;

        const logs = await AutomationLog.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('metadata.productId', 'product_name products_id');

        const total = await AutomationLog.countDocuments(query);

        res.json({
            success: true,
            logs,
            total,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error in getLogs:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * n8n Webhook receiver to log success/failure of external actions
 */
exports.receiveLog = async (req, res) => {
    try {
        const { type, platform, status, title, details, error, metadata } = req.body;
        
        const log = await AutomationLog.create({
            type,
            platform,
            status,
            title,
            details,
            error,
            metadata
        });

        res.json({ success: true, logId: log._id });
    } catch (err) {
        console.error('Error receiving log from n8n:', err);
        res.status(500).json({ success: false });
    }
};

/**
 * Endpoint for n8n to fetch a random product for posting
 */
exports.getRandomProduct = async (req, res) => {
    try {
        // Find a random approved product
        // We can use $sample in aggregation
        const products = await Product.aggregate([
            { $match: { status: 'approved' } },
            { $sample: { size: 1 } }
        ]);

        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'No products found' });
        }

        const product = products[0];
        
        // Prepare the payload as expected by n8n
        res.json({
            success: true,
            product: {
                id: product._id,
                barcode: product.products_id,
                name: product.product_name,
                description: product.product_description,
                price: product.product_price,
                image: product.image_path || product.product_image,
                category: product.product_category,
                link: `https://knoozbook.com/product/${product.products_id}`
            }
        });
    } catch (error) {
        console.error('Error in getRandomProduct:', error);
        res.status(500).json({ success: false });
    }
};

/**
 * Execute a command using Claude Code CLI
 */
exports.executeClaudeCommand = async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ success: false, message: 'Prompt is required' });
        }

        const result = await automationService.runClaudeAgent(prompt);
        res.json(result);
    } catch (error) {
        console.error('Error in executeClaudeCommand:', error);
        res.status(500).json({ success: false, message: 'Server error during Claude execution' });
    }
};

/**
 * Get stats from n8n API
 */
exports.getN8nStats = async (req, res) => {
    try {
        const stats = await automationService.fetchN8nStats();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error in getN8nStats:', error);
        res.status(500).json({ success: false, message: 'Server error fetching n8n stats' });
    }
};

/**
 * Trigger deployment to production
 */
exports.deployToProduction = async (req, res) => {
    try {
        const result = await automationService.deployToProduction();
        res.json(result);
    } catch (error) {
        console.error('Error in deployToProduction:', error);
        res.status(500).json({ success: false, message: 'Server error during deployment' });
    }
};

/**
 * AI Intent Analysis - Analyze user message intent
 */
exports.aiAnalyzeIntent = async (req, res) => {
    try {
        const { message, platform, userId } = req.body;
        
        if (!message) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }

        // Simple intent classification (can be enhanced with AI)
        const intents = {
            'purchase': ['شراء', 'اشتري', 'سعر', 'كم', 'طلب', 'احتاج', 'عايز', 'ابي'],
            'inquiry': ['استفسار', 'سؤال', 'عن', 'معلومات', 'تفاصيل'],
            'complaint': ['شكوى', 'مشكلة', 'سيء', 'تأخير'],
            'general': ['مرحبا', 'السلام', 'هاي', 'هلا']
        };

        let detectedIntent = 'general';
        for (const [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(keyword => message.includes(keyword))) {
                detectedIntent = intent;
                break;
            }
        }

        // Extract category from message if possible
        const categories = ['روايات', 'تطوير ذات', 'أعمال', 'تربية', 'دين', 'تاريخ', 'علوم'];
        const detectedCategory = categories.find(cat => message.includes(cat)) || 'general';

        res.json({
            success: true,
            intent: detectedIntent,
            category: detectedCategory,
            confidence: 0.85,
            message: message
        });
    } catch (error) {
        console.error('Error in aiAnalyzeIntent:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Recommend Books based on category
 */
exports.recommendBooks = async (req, res) => {
    try {
        const { category, limit = 3 } = req.query;
        
       const query = { status: 'approved' };
        if (category && category !== 'general') {
            query.product_category = { $regex: category, $options: 'i' };
        }

        const products = await Product.find(query)
            .sort({ views: -1 })
            .limit(parseInt(limit))
            .select('product_name product_description product_price product_image products_id');

        const recommendations = products.map(p => ({
            id: p._id,
            name: p.product_name,
            description: p.product_description.substring(0, 200),
            price: p.product_price,
            image: p.image_path || p.product_image,
            link: `https://knoozbook.com/book/${p.products_id}`
        }));

        res.json({
            success: true,
            recommendations,
            count: recommendations.length
        });
    } catch (error) {
        console.error('Error in recommendBooks:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Track Event for Analytics
 */
exports.trackEvent = async (req, res) => {
    try {
        const { eventType, productId, userId, sessionId, metadata } = req.body;
        
        // Create event log
        const log = await AutomationLog.create({
            type: eventType,
            platform: metadata?.platform || 'website',
            status: 'success',
            title: `${eventType} - ${productId}`,
            details: metadata,
            metadata: { productId, userId, sessionId }
        });

        // Update product views if impression
        if (eventType === 'impression' && productId) {
            await Product.findByIdAndUpdate(productId, {
                $inc: { views: 1 }
            });
        }

        res.json({ success: true, logId: log._id });
    } catch (error) {
        console.error('Error in trackEvent:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Aggregate Analytics Metrics
 */
exports.aggregateMetrics = async (req, res) => {
    try {
        const { timeRange = '24h' } = req.body;
        
        const timeAgo = new Date();
        if (timeRange === '24h') timeAgo.setHours(timeAgo.getHours() - 24);
        else if (timeRange === '7d') timeAgo.setDate(timeAgo.getDate() - 7);
        else if (timeRange === '30d') timeAgo.setDate(timeAgo.getDate() - 30);

        const metrics = await AutomationLog.aggregate([
            { $match: { createdAt: { $gte: timeAgo } } },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            }
        ]);

        const result = {
            impressions: metrics.find(m => m._id === 'impression')?.count || 0,
            clicks: metrics.find(m => m._id === 'click')?.count || 0,
            comments: metrics.find(m => m._id === 'comment')?.count || 0,
            purchases: metrics.find(m => m._id === 'purchase')?.count || 0,
            engagementRate: 0
        };

        if (result.impressions > 0) {
            result.engagementRate = ((result.clicks + result.comments) / result.impressions * 100).toFixed(2);
        }

        res.json({ success: true, metrics: result });
    } catch (error) {
        console.error('Error in aggregateMetrics:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Trigger Auto Promotion for high-engagement products
 */
exports.triggerPromotion = async (req, res) => {
    try {
        const { productId, reason, metrics } = req.body;
        
        const settings = await AutomationSetting.getInstance();
        if (!settings.autoPostEnabled || !settings.n8nWebhookUrls.autoPost) {
            return res.json({ success: false, message: 'Auto-post is disabled' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const payload = {
            action: 'auto_promotion',
            reason,
            products_id: product.products_id,
            name: product.product_name,
            category: product.product_category,
            price: product.product_price,
            image: product.image_path || product.product_image,
            description: product.product_description,
            link: `https://knoozbook.com/book/${product.products_id}`,
            metrics
        };

        await axios.post(settings.n8nWebhookUrls.autoPost, payload);

        await AutomationLog.create({
            type: 'post',
            platform: 'facebook',
            status: 'success',
            title: `Auto Promotion: ${product.product_name}`,
            details: { reason, metrics },
            metadata: { productId }
        });

        res.json({ success: true, message: 'Promotion triggered' });
    } catch (error) {
        console.error('Error in triggerPromotion:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
