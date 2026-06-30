const AutomationSetting = require('../models/AutomationSetting.model');
const AutomationLog = require('../models/AutomationLog.model');
const automationService = require('../services/automation.service');
const Product = require('../models/Product.model');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const logger = require('../services/logger.service');

/**
 * Get the current automation dashboard stats and settings
 */
exports.getDashboardData = async (req, res) => {
    try {
        const settings = await AutomationSetting.getInstance();

        const recentLogs = await AutomationLog.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('metadata.productId', 'product_name products_id product_image');

        res.json({
            success: true,
            settings,
            stats: [], // Stats will be loaded from n8n API
            recentLogs
        });
    } catch (error) {
        console.error('Error in getDashboardData:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get automation settings (for n8n workflows)
 */
exports.getSettings = async (req, res) => {
    try {
        const settings = await AutomationSetting.getInstance();
        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error in getSettings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Update automation settings
 */
exports.updateSettings = async (req, res) => {
    try {
        const updates = req.body;

        // Auto-calculate schedule based on dailyLimit for socialPosts
        if (updates.socialPosts && updates.socialPosts.dailyLimit) {
            const dailyLimit = updates.socialPosts.dailyLimit;
            const startHour = 8; // 8:00 AM
            const endHour = 21; // 9:00 PM

            if (dailyLimit > 0) {
                const totalHours = endHour - startHour + 1;
                const interval = Math.floor(totalHours / dailyLimit);
                const schedule = [];

                for (let i = 0; i < dailyLimit; i++) {
                    const hour = startHour + (i * interval);
                    if (hour <= endHour) {
                        schedule.push(`${hour.toString().padStart(2, '0')}:00`);
                    }
                }

                updates.socialPosts.schedule = schedule;
            }
        }

        // Auto-calculate schedule based on dailyLimit for whatsappStatus
        if (updates.whatsappStatus && updates.whatsappStatus.dailyLimit) {
            const dailyLimit = updates.whatsappStatus.dailyLimit;
            const startHour = 8; // 8:00 AM
            const endHour = 20; // 8:00 PM

            if (dailyLimit > 0) {
                const totalHours = endHour - startHour + 1;
                const interval = Math.floor(totalHours / dailyLimit);
                const schedule = [];

                for (let i = 0; i < dailyLimit; i++) {
                    const hour = startHour + (i * interval);
                    if (hour <= endHour) {
                        schedule.push(`${hour.toString().padStart(2, '0')}:00`);
                    }
                }

                updates.whatsappStatus.schedule = schedule;
            }
        }

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
                image: product.image_path || product.product_image || (product.images && product.images[0]) || '',
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
 * Endpoint for n8n to fetch product by ID
 */
exports.getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const product = await Product.findById(id);
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        res.json({
            success: true,
            product: {
                id: product._id,
                barcode: product.products_id,
                name: product.product_name,
                description: product.product_description,
                price: product.product_price,
                image: product.image_path || product.product_image || (product.images && product.images[0]) || '',
                category: product.product_category,
                link: `https://knoozbook.com/product/${product.products_id}`
            }
        });
    } catch (error) {
        console.error('Error in getProductById:', error);
        res.status(500).json({ success: false });
    }
};

/**
 * Product Created Webhook Trigger
 * Called by Backend when a new product is created
 */
exports.productCreated = async (req, res) => {
    try {
        const { productId, event } = req.body;
        
        if (!productId) {
            return res.status(400).json({ success: false, message: 'productId is required' });
        }
        
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        // Trigger n8n workflow
        const settings = await AutomationSetting.getInstance();
        if (settings.n8nWebhookUrls?.autoPost) {
            const payload = {
                productId: product._id,
                event: event || 'created',
                product: {
                    id: product._id,
                    barcode: product.products_id,
                    name: product.product_name,
                    description: product.product_description,
                    price: product.product_price,
                    image: product.image_path || product.product_image || (product.images && product.images[0]) || '',
                    category: product.product_category,
                    link: `https://knoozbook.com/product/${product.products_id}`
                }
            };
            
            await axios.post(settings.n8nWebhookUrls.autoPost, payload);
        }
        
        res.json({ success: true, message: 'Product created event triggered' });
    } catch (error) {
        console.error('Error in productCreated:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * AI Content Generation
 * Generates complete social media content using OpenAI
 * Returns structured JSON with caption, hashtags, CTA, best time, etc.
 */
exports.aiGenerateContent = async (req, res) => {
    try {
        const { product, platform } = req.body;
        
        if (!product) {
            return res.status(400).json({ success: false, message: 'Product data is required' });
        }

        const settings = await AutomationSetting.getInstance();
        const openaiApiKey = process.env.OPENAI_API_KEY || settings.openaiApiKey;
        
        if (!openaiApiKey) {
            return res.status(500).json({ success: false, message: 'OpenAI API key not configured' });
        }

        // Determine tone based on category
        const categoryTones = {
            'روايات': 'emotional',
            'تطوير ذات': 'motivational',
            'أعمال': 'professional',
            'تربية': 'warm',
            'دين': 'respectful',
            'تاريخ': 'informative',
            'علوم': 'educational'
        };
        
        const tone = categoryTones[product.category] || 'friendly';

        const prompt = `أنت مدير التسويق الرسمي لموقع كنوز للكتب (KnoozBook). مهمتك إنشاء محتوى تسويقي احترافي للكتب.

معلومات الكتاب:
- الاسم: ${product.name}
- الوصف: ${product.description}
- السعر: ${product.price} ج.م
- الفئة: ${product.category}
- نبرة المحتوى: ${tone}

القواعد الصارمة:
1. اكتب كأنك موظف تسويق في KnoozBook، لا مثل ChatGPT
2. استخدم شخصية ثابتة للبراند: ودودة، محترفة، محفزة
3. لا تستخدم Emoji بكثرة (حد أقصى 2-3)
4. لا تكرر نفس أسلوب الكتابة في كل منشور
5. لا تذكر معلومات غير موجودة في الكتاب
6. لو الكتاب رواية، لا تحرق الأحداث
7. الـ caption يجب أن يكون أقل من 150 كلمة
8. أضف CTA واضح ومحفز
9. اكتب باللهجة المصرية البسيطة والودودة

ارجع JSON صالح فقط بهذا التنسيق:
{
  "caption": "النص الكامل للمنشور",
  "hashtags": ["هاشتاج1", "هاشتاج2", "هاشتاج3", "هاشتاج4", "هاشتاج5"],
  "cta": "دعوة للعمل المختصرة",
  "tone": "${tone}",
  "bestPlatform": ["facebook", "instagram"],
  "bestTime": "20:00",
  "targetAudience": "18-30",
  "imageStyle": "minimal"
}`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'أنت مساعد تسويق محترف لموقع كنوز للكتب. اكتب محتوى احترافي ومحفز للشراء.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.8,
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const content = JSON.parse(response.data.choices[0].message.content);
        
        res.json({
            success: true,
            content
        });
    } catch (error) {
        console.error('Error in aiGenerateContent:', error);
        res.status(500).json({ success: false, message: 'Server error generating AI content' });
    }
};

/**
 * AI Orchestrator - Execute AI Task
 * Central endpoint for all AI operations
 */
exports.aiExecute = async (req, res) => {
    try {
        const aiOrchestrator = require('../ai/services/ai-orchestrator.service');
        const aiLogger = require('../ai/services/ai-logger.service');
        
        const { task, data, options } = req.body;
        
        if (!task) {
            return res.status(400).json({ success: false, message: 'Task is required' });
        }

        // Flatten product data to top level for prompt template variables
        // e.g. { product: { name, price } } -> { name, price, ... }
        let flatData = { ...data };
        if (data?.product) {
            const categoryTones = {
                'روايات': 'emotional', 'تطوير ذات': 'motivational',
                'أعمال': 'professional', 'تربية': 'warm',
                'دين': 'respectful', 'تاريخ': 'informative', 'علوم': 'educational'
            };
            flatData = {
                ...data.product,
                tone: data.product.tone || categoryTones[data.product.category] || 'friendly',
                platform: data.platform || 'facebook',
                ...data
            };
        }

        // Execute task with flattened data
        const result = await aiOrchestrator.executeWithFallback(task, flatData, options);
        
        // Log execution
        await aiLogger.logExecution(result, {
            userId: req.user?.id,
            sessionId: req.sessionID,
            requestId: req.id
        });
        
        res.json(result);
    } catch (error) {
        console.error('Error in aiExecute:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error executing AI task',
            error: error.message 
        });
    }
};

/**
 * Get AI Metrics
 * Returns current AI metrics
 */
exports.getAIMetrics = async (req, res) => {
    try {
        const aiLogger = require('../ai/services/ai-logger.service');
        const metrics = aiLogger.getMetrics();
        
        res.json({
            success: true,
            metrics
        });
    } catch (error) {
        console.error('Error in getAIMetrics:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get AI Cost Report
 * Returns cost report for specified time period
 */
exports.getAICostReport = async (req, res) => {
    try {
        const aiLogger = require('../ai/services/ai-logger.service');
        const hours = parseInt(req.query.hours) || 24;
        const report = await aiLogger.getCostReport(hours);
        
        res.json({
            success: true,
            report
        });
    } catch (error) {
        console.error('Error in getAICostReport:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get AI Performance Report
 * Returns performance report for specified time period
 */
exports.getAIPerformanceReport = async (req, res) => {
    try {
        const aiLogger = require('../ai/services/ai-logger.service');
        const hours = parseInt(req.query.hours) || 24;
        const report = await aiLogger.getAIPerformanceReport(hours);
        
        res.json({
            success: true,
            report
        });
    } catch (error) {
        console.error('Error in getAIPerformanceReport:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get AI Error Report
 * Returns error report for specified time period
 */
exports.getAIErrorReport = async (req, res) => {
    try {
        const aiLogger = require('../ai/services/ai-logger.service');
        const hours = parseInt(req.query.hours) || 24;
        const report = await aiLogger.getErrorReport(hours);
        
        res.json({
            success: true,
            report
        });
    } catch (error) {
        console.error('Error in getAIErrorReport:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get AI Health
 * Returns health status of all AI providers
 */
exports.getAIHealth = async (req, res) => {
    try {
        const aiOrchestrator = require('../ai/services/ai-orchestrator.service');
        const healthMonitor = require('../ai/services/health-monitor.service');
        
        // Force refresh health check for all providers
        const healthResults = await healthMonitor.forceRefresh();
        const healthStats = healthMonitor.getHealthStats();
        
        // Build health object for UI (provider name -> boolean)
        const health = {};
        for (const [name] of aiOrchestrator.providers) {
            health[name] = healthMonitor.isProviderHealthy(name);
        }
        
        res.json({
            success: true,
            health,
            stats: healthStats
        });
    } catch (error) {
        console.error('Error in getAIHealth:', error);
        res.status(500).json({ success: false, message: 'Server error' });
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
            image: p.image_path || p.product_image || (p.images && p.images[0]) || '',
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
 * Get product by ID (for n8n workflows)
 */
exports.getProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const product = await Product.findOne({ products_id: productId });
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.json({
            success: true,
            product: {
                id: product.products_id,
                name: product.product_name,
                description: product.product_description || '',
                price: product.product_price,
                category: product.product_category || 'general',
                image: product.image_path || product.product_image || (product.images && product.images[0]) || '',
                link: `https://knoozbook.com/book/${product.products_id}`
            }
        });
    } catch (error) {
        console.error('Error in getProduct:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get daily post count (for n8n workflows to check limits)
 */
exports.getDailyCount = async (req, res) => {
    try {
        const { type } = req.query; // 'social-posts', 'whatsapp-broadcast', or 'whatsapp-status' (legacy)
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Map type to database log type
        let logType = 'post';
        if (type === 'whatsapp-broadcast' || type === 'whatsapp-status') {
            logType = 'whatsapp_broadcast';
        }
        
        const count = await AutomationLog.countDocuments({
            type: logType,
            status: 'success',
            createdAt: { $gte: today, $lt: tomorrow }
        });

        res.json({ success: true, count, date: today });
    } catch (error) {
        console.error('Error in getDailyCount:', error);
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
            image: product.image_path || product.product_image || (product.images && product.images[0]) || '',
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

/**
 * Generate Social Media Post Image
 * Creates a professional 1080x1080 image for book promotion
 */
exports.generatePostImage = async (req, res) => {
    try {
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, message: 'productId is required' });
        }

        // Fetch product
        const product = await Product.findOne({ products_id: productId });

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Construct full image URL
        let imageUrl;
        if (product.image_path && product.image_path.startsWith('http')) {
            imageUrl = product.image_path;
        } else if (product.image_path && product.image_path.startsWith('/uploads')) {
            imageUrl = `https://knoozbook.com${product.image_path}`;
        } else if (product.product_image && product.product_image.startsWith('http')) {
            imageUrl = product.product_image;
        } else if (product.product_image && product.product_image.startsWith('/uploads')) {
            imageUrl = `https://knoozbook.com${product.product_image}`;
        } else if (product.images && product.images.length > 0 && product.images[0].startsWith('http')) {
            imageUrl = product.images[0];
        } else if (product.images && product.images.length > 0 && product.images[0].startsWith('/uploads')) {
            imageUrl = `https://knoozbook.com${product.images[0]}`;
        } else {
            return res.status(400).json({ success: false, message: 'No valid image found' });
        }

        const sharp = require('sharp');
        const { Vibrant } = require('node-vibrant/node');

        // Fetch cover image
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const coverBuffer = Buffer.from(imageResponse.data);

        console.log('Image buffer size:', coverBuffer.length);
        console.log('Image URL:', imageUrl);

        // Convert to PNG if needed (also normalizes any format so sharp/Vibrant handle it well)
        let processedBuffer = coverBuffer;
        try {
            const metadata = await sharp(coverBuffer).metadata();
            console.log('Image format:', metadata.format);
            if (metadata.format === 'webp') {
                console.log('Converting webp to PNG...');
                processedBuffer = await sharp(coverBuffer).png().toBuffer();
            }
        } catch (error) {
            console.error('Sharp metadata error:', error.message);
            try {
                processedBuffer = await sharp(coverBuffer).png().toBuffer();
            } catch (convertError) {
                console.error('Sharp conversion error:', convertError.message);
                return res.status(400).json({ success: false, message: 'Invalid image format', error: convertError.message });
            }
        }

        // Get dominant color from the (now-normalized) cover buffer.
        // Using the buffer directly (instead of re-fetching the remote URL)
        // means Vibrant works for every format, including webp.
        let dominantColor = '#4A90E2';
        try {
            const vibrant = await Vibrant.from(processedBuffer).getPalette();
            dominantColor = vibrant.Vibrant?.hex || vibrant.Muted?.hex || '#4A90E2';
        } catch (error) {
            console.error('Vibrant error:', error.message);
            dominantColor = '#4A90E2';
        }
        console.log('Dominant color:', dominantColor);

        // Create output directory if not exists
        const outputDir = path.join(__dirname, '../uploads/generated');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Clean up generated images older than 24h so the server doesn't fill up
        // with one-time-use social media post images.
        try {
            const ONE_DAY_MS = 24 * 60 * 60 * 1000;
            const now = Date.now();
            const files = fs.readdirSync(outputDir);
            for (const file of files) {
                const filePath = path.join(outputDir, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > ONE_DAY_MS) {
                    fs.unlinkSync(filePath);
                    console.log('Cleaned up old generated image:', file);
                }
            }
        } catch (cleanupError) {
            console.error('Cleanup error (non-fatal):', cleanupError.message);
        }

        // Generate filename
        const filename = `post-${productId}-${Date.now()}.jpg`;
        const outputPath = path.join(outputDir, filename);

        const CANVAS_SIZE = 1080;

        // Resize cover to fit nicely in the center, keep real dimensions for shadow sizing.
        // Bounding box is 70% of the canvas (756px) so the cover takes up ~70% of the final image.
        console.log('Resizing cover...');
        const resizedCoverResult = await sharp(processedBuffer)
            .resize(756, 756, { fit: 'inside', withoutEnlargement: false })
            .png()
            .toBuffer({ resolveWithObject: true });
        const resizedCover = resizedCoverResult.data;
        const coverW = resizedCoverResult.info.width;
        const coverH = resizedCoverResult.info.height;
        console.log('Resized cover dimensions:', coverW, 'x', coverH);

        // Real drop shadow: a blurred, offset, semi-transparent rounded rectangle
        // sized to match the cover, rendered via SVG + Gaussian blur filter.
        const shadowPadding = 40;
        const shadowSvg = `
            <svg width="${coverW + shadowPadding * 2}" height="${coverH + shadowPadding * 2}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="18" />
                    </filter>
                </defs>
                <rect x="${shadowPadding}" y="${shadowPadding + 16}" width="${coverW}" height="${coverH}" rx="6"
                      fill="black" fill-opacity="0.45" filter="url(#blur)" />
            </svg>
        `;
        const shadowBuffer = await sharp(Buffer.from(shadowSvg)).png().toBuffer();

        // Bottom overlay: fade strip + phone number (bottom right) + website (bottom left)
        // + "اطلب الان" pill button (bottom center)
        const textSvg = `
            <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="black" stop-opacity="0" />
                        <stop offset="100%" stop-color="black" stop-opacity="0.55" />
                    </linearGradient>
                </defs>
                <rect x="0" y="${CANVAS_SIZE - 170}" width="${CANVAS_SIZE}" height="170" fill="url(#fade)" />

                <text x="${CANVAS_SIZE - 40}" y="${CANVAS_SIZE - 55}"
                      font-family="Noto Sans Arabic, Arial, sans-serif" font-size="34" font-weight="bold"
                      fill="white" text-anchor="end" direction="ltr">01094612729</text>

                <text x="40" y="${CANVAS_SIZE - 55}"
                      font-family="Noto Sans Arabic, Arial, sans-serif" font-size="30"
                      fill="white" text-anchor="start" direction="ltr">knoozbook.com</text>

                <rect x="${CANVAS_SIZE / 2 - 100}" y="${CANVAS_SIZE - 95}" width="200" height="56" rx="28"
                      fill="white" />
                <text x="${CANVAS_SIZE / 2}" y="${CANVAS_SIZE - 57}"
                      font-family="Noto Sans Arabic, Arial, sans-serif" font-size="28" font-weight="bold"
                      fill="${dominantColor}" text-anchor="middle">اطلب الآن</text>
            </svg>
        `;
        const textBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer();

        // Compose everything directly onto the colored canvas and save in one
        // pipeline (avoids re-reading intermediate raw buffers with sharp,
        // which fails because raw .toBuffer() output has no format metadata).
        console.log('Creating canvas with color:', dominantColor, 'and compositing...');
        await sharp({
            create: {
                width: CANVAS_SIZE,
                height: CANVAS_SIZE,
                channels: 3,
                background: dominantColor
            }
        })
            .composite([
                { input: shadowBuffer, gravity: 'center' },
                { input: resizedCover, gravity: 'center' },
                { input: textBuffer, left: 0, top: 0 }
            ])
            .jpeg({ quality: 90 })
            .toFile(outputPath);
        console.log('Image saved successfully');

        imageUrl = `https://knoozbook.com/uploads/generated/${filename}`;

        res.json({
            success: true,
            imageUrl
        });
    } catch (error) {
        console.error('Error in generatePostImage:', error);
        res.status(500).json({ success: false, message: 'Error generating post image', error: error.message });
    }
};