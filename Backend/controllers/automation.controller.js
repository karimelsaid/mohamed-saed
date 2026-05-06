const AutomationSetting = require('../models/AutomationSetting.model');
const AutomationLog = require('../models/AutomationLog.model');
const automationService = require('../services/automation.service');
const Product = require('../models/Product.model');
const path = require('path');
const fs = require('fs');

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
