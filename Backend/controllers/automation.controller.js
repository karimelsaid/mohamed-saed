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
        // Use $sample with a larger size to ensure randomness, then pick one
        const products = await Product.aggregate([
            { $match: { status: 'approved' } },
            { $sample: { size: 10 } } // Get 10 random products first
        ]);

        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'No products found' });
        }

        // Pick one randomly from the 10 to ensure better randomness
        const randomIndex = Math.floor(Math.random() * Math.min(products.length, 10));
        const product = products[randomIndex];

        console.log(`[getRandomProduct] Selected product: ${product.product_name} (${product.products_id}) from merchant: ${product.merchant || 'unknown'}`);

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
                merchant: product.merchant || 'unknown',
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
        
        // Try to find by MongoDB ObjectId first, then by products_id
        let product;
        try {
            product = await Product.findById(id);
        } catch (e) {
            // If invalid ObjectId, search by products_id
            product = await Product.findOne({ products_id: id });
        }
        
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
                author: product.author,
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
 * Get stats from n8n API and analytics from MongoDB
 */
exports.getN8nStats = async (req, res) => {
    try {
        const n8nStats = await automationService.fetchN8nStats();
        const analyticsStats = await automationService.getAnalyticsStats();

        // Merge both stats
        const combinedStats = {
            ...n8nStats,
            ...analyticsStats
        };

        res.json({ success: true, stats: combinedStats });
    } catch (error) {
        console.error('[getN8nStats] Error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching n8n stats' });
    }
};

/**
 * GET /comment-webhook — Meta webhook verification handshake.
 * لازم يكون موجود قبل ما تقدر تفعّل الـ webhook من Meta Developer Portal،
 * غير كده Meta هترفض تسجيل الـ webhook من الأساس.
 * لازم تحط VERIFY_TOKEN في .env وتحط نفس القيمة في خانة "Verify Token" بالـ Portal.
 */
exports.verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
        console.log('[verifyWebhook] Webhook verified successfully');
        return res.status(200).send(challenge);
    }

    console.warn('[verifyWebhook] Verification failed - token mismatch');
    return res.sendStatus(403);
};

/**
 * Generic log endpoint for n8n workflows
 */
exports.log = async (req, res) => {
    try {
        const { type, platform, status, message, metadata, error } = req.body;

        const logData = {
            type: type || 'general',
            platform,
            status: status || 'info',
            message,
            metadata: metadata || {}
        };

        if (error) {
            logData.error = error;
        }

        const log = new AutomationLog(logData);
        await log.save();

        console.log('[log] Entry saved:', { type, platform, status });
        res.json({ success: true });
    } catch (error) {
        console.error('Error in log:', error);
        res.status(500).json({ success: false, message: 'Server error logging' });
    }
};

/**
 * Comment webhook for receiving Facebook/Instagram comments directly from Meta
 */
exports.commentWebhook = async (req, res) => {
    try {
        const body = req.body;
        
        // Meta sends: { object: 'page', entry: [{ id, changes: [{ field, value }] }] }
        if (!body.entry || !body.entry[0] || !body.entry[0].changes) {
            console.log('[commentWebhook] Invalid Meta payload structure');
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        const platform = body.object === 'instagram' ? 'instagram' : 'facebook';
        const entry = body.entry[0];
        const changes = entry.changes;

        // Process each change
        for (const change of changes) {
            if (change.field !== 'feed' && change.field !== 'comments') {
                continue;
            }

            const value = change.value || {};
            if (value.verb && value.verb !== 'add') {
                continue; // Only handle new comments
            }

            const comment = value.message || value.text || '';
            const commentId = value.comment_id || value.id;
            const postId = value.post_id || entry.id;
            const fromId = value.from?.id || value.from?.username;
            const userName = value.from?.name || value.from?.username;

            if (!comment || !commentId) {
                continue;
            }

            // Skip comments from our own page
            const facebookPageId = process.env.FACEBOOK_PAGE_ID;
            if (facebookPageId && String(fromId) === String(facebookPageId)) {
                console.log('[commentWebhook] Ignoring comment from our own page');
                continue;
            }

            // Check for duplicates
            const existing = await AutomationLog.findOne({
                type: 'comment',
                'metadata.commentId': commentId
            });
            if (existing) {
                console.log('[commentWebhook] Duplicate comment, skipping:', commentId);
                continue;
            }

            console.log('[commentWebhook] Processing comment:', { platform, comment, commentId, postId, fromId, userName });

            // Log the comment
            const log = new AutomationLog({
                type: 'comment',
                platform,
                status: 'pending',
                message: comment,
                metadata: {
                    postId,
                    commentId,
                    userId: fromId,
                    userName
                }
            });
            await log.save();

            // Generate AI reply
            try {
                const GroqProvider = require('../ai/providers/groq.provider');
                const AIConfig = require('../ai/config/ai.config');
                const groqConfig = AIConfig.getProviderConfig('groq');
                const groqProvider = new GroqProvider(groqConfig);
                
                const prompt = `
أنت مساعد مبيعات ودود لمكتبة "كنوز بوك" (متجر كتب وروايات عربي، الموقع knoozbook.com).
تعليق العميل: "${comment}"
المنصة: ${platform}

اكتب ردًا موجزًا ومهذبًا باللغة العربية فقط (بدون أي كلمات إنجليزية إلا اسم الموقع knoozbook.com إذا لزم).
لو السؤال عن السعر أو التوفر وجّه العميل بأدب لرسالتنا الخاصة أو لموقعنا للاطلاع على التفاصيل.
لا تتجاوز 3 جمل قصيرة.
`;

                const result = await groqProvider.generateText({
                    messages: [
                        { role: 'system', content: 'أنت مساعد مبيعات ودود لمكتبة "كنوز بوك" (متجر كتب وروايات عربي، الموقع knoozbook.com).' },
                        { role: 'user', content: prompt }
                    ],
                    model: groqConfig.defaultModel,
                    temperature: 0.7,
                    maxTokens: 200
                });
                
                const replyText = (result.text || result.response || result.output || 'شكراً لتواصلك معنا! سنساعدك بأسرع وقت.').trim();
                console.log('[commentWebhook] AI reply:', replyText);

                // Post reply to Facebook/Instagram
                const pageToken = process.env.FACEBOOK_PAGE_TOKEN;
                if (!pageToken) {
                    console.error('[commentWebhook] Facebook credentials missing');
                    continue;
                }

                let url;
                if (platform === 'facebook') {
                    url = `https://graph.facebook.com/v18.0/${commentId}/comments`;
                } else if (platform === 'instagram') {
                    url = `https://graph.facebook.com/v18.0/${commentId}/replies`;
                } else {
                    continue;
                }

                const response = await axios.post(url, {
                    message: replyText,
                    access_token: pageToken
                });

                console.log('[commentWebhook] Reply posted successfully:', response.data.id);

                // Log the reply
                await AutomationLog.create({
                    type: 'comment_reply',
                    platform,
                    status: 'success',
                    message: replyText,
                    metadata: {
                        commentId,
                        postId,
                        replyId: response.data.id
                    }
                });
            } catch (error) {
                console.error('[commentWebhook] Error processing comment:', error.message);
                await AutomationLog.create({
                    type: 'comment_reply',
                    platform,
                    status: 'failed',
                    message: comment,
                    error: error.message,
                    metadata: {
                        commentId,
                        postId
                    }
                });
            }
        }

        // Respond immediately to Meta
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error in commentWebhook:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Poll Facebook comments using Graph API (alternative to webhook)
 */
exports.pollFacebookComments = async (req, res) => {
    try {
        const pageId = process.env.FACEBOOK_PAGE_ID;
        const pageToken = process.env.FACEBOOK_PAGE_TOKEN;

        if (!pageId || !pageToken) {
            console.error('[pollFacebookComments] Facebook credentials missing');
            return res.json({ success: false, message: 'Facebook credentials missing' });
        }

        console.log('[pollFacebookComments] Starting poll for page:', pageId);

        // Get recent posts
        const postsResponse = await axios.get(
            `https://graph.facebook.com/v18.0/${pageId}/posts`,
            {
                params: {
                    fields: 'id,message,created_time',
                    limit: 10,
                    access_token: pageToken
                }
            }
        );

        const posts = postsResponse.data.data;
        console.log('[pollFacebookComments] Found', posts.length, 'posts');

        for (const post of posts) {
            const postId = post.id;
            
            // Get comments for this post
            try {
                const commentsResponse = await axios.get(
                    `https://graph.facebook.com/v18.0/${postId}/comments`,
                    {
                        params: {
                            fields: 'id,message,created_time,from',
                            limit: 10,
                            access_token: pageToken
                        }
                    }
                );

                const comments = commentsResponse.data.data;
                console.log('[pollFacebookComments] Post', postId, 'has', comments.length, 'comments');

                for (const comment of comments) {
                    const commentId = comment.id;
                    const commentText = comment.message;
                    const fromId = comment.from.id;
                    const userName = comment.from.name;

                    // Skip comments from our own page
                    if (String(fromId) === String(pageId)) {
                        continue;
                    }

                    // Check for duplicates
                    const existing = await AutomationLog.findOne({
                        type: 'comment',
                        'metadata.commentId': commentId
                    });
                    if (existing) {
                        continue;
                    }

                    console.log('[pollFacebookComments] Processing new comment:', { commentId, commentText, fromId, userName });

                    // Log the comment
                    const log = new AutomationLog({
                        type: 'comment',
                        platform: 'facebook',
                        status: 'pending',
                        message: commentText,
                        metadata: {
                            postId,
                            commentId,
                            userId: fromId,
                            userName
                        }
                    });
                    await log.save();

                    // Generate AI reply
                    try {
                        const GroqProvider = require('../ai/providers/groq.provider');
                        const AIConfig = require('../ai/config/ai.config');
                        const groqConfig = AIConfig.getProviderConfig('groq');
                        const groqProvider = new GroqProvider(groqConfig);
                        
                        const prompt = `
أنت مساعد مبيعات ودود لمكتبة "كنوز بوك" (متجر كتب وروايات عربي، الموقع knoozbook.com).
تعليق العميل: "${commentText}"
المنصة: facebook

اكتب ردًا موجزًا ومهذبًا باللغة العربية فقط (بدون أي كلمات إنجليزية إلا اسم الموقع knoozbook.com إذا لزم).
لو السؤال عن السعر أو التوفر وجّه العميل بأدب لرسالتنا الخاصة أو لموقعنا للاطلاع على التفاصيل.
لا تتجاوز 3 جمل قصيرة.
`;

                        const result = await groqProvider.generateText({
                            messages: [
                                { role: 'system', content: 'أنت مساعد مبيعات ودود لمكتبة "كنوز بوك" (متجر كتب وروايات عربي، الموقع knoozbook.com).' },
                                { role: 'user', content: prompt }
                            ],
                            model: groqConfig.defaultModel,
                            temperature: 0.7,
                            maxTokens: 200
                        });
                        
                        const replyText = (result.text || result.response || result.output || 'شكراً لتواصلك معنا! سنساعدك بأسرع وقت.').trim();
                        console.log('[pollFacebookComments] AI reply:', replyText);

                        // Post reply to Facebook
                        const response = await axios.post(
                            `https://graph.facebook.com/v18.0/${commentId}/comments`,
                            {
                                message: replyText,
                                access_token: pageToken
                            }
                        );

                        console.log('[pollFacebookComments] Reply posted successfully:', response.data.id);

                        // Log the reply
                        await AutomationLog.create({
                            type: 'comment_reply',
                            platform: 'facebook',
                            status: 'success',
                            message: replyText,
                            metadata: {
                                commentId,
                                postId,
                                replyId: response.data.id
                            }
                        });
                    } catch (error) {
                        console.error('[pollFacebookComments] Error processing comment:', error.message);
                        await AutomationLog.create({
                            type: 'comment_reply',
                            platform: 'facebook',
                            status: 'failed',
                            message: commentText,
                            error: error.message,
                            metadata: {
                                commentId,
                                postId
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('[pollFacebookComments] Error fetching comments for post', postId, ':', error.message);
            }
        }

        res.json({ success: true, message: 'Poll completed' });
    } catch (error) {
        console.error('Error in pollFacebookComments:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Poll Facebook Messages (Messenger) using Graph API
 */
exports.pollFacebookMessages = async (req, res) => {
    try {
        const pageId = process.env.FACEBOOK_PAGE_ID;
        const pageToken = process.env.FACEBOOK_PAGE_TOKEN;

        if (!pageId || !pageToken) {
            console.error('[pollFacebookMessages] Facebook credentials missing');
            return res.json({ success: false, message: 'Facebook credentials missing' });
        }

        console.log('[pollFacebookMessages] Starting poll for page:', pageId);

        // Get recent conversations
        const conversationsResponse = await axios.get(
            `https://graph.facebook.com/v18.0/${pageId}/conversations`,
            {
                params: {
                    fields: 'id,participants,updated_time',
                    limit: 10,
                    access_token: pageToken
                }
            }
        );

        const conversations = conversationsResponse.data.data;
        console.log('[pollFacebookMessages] Found', conversations.length, 'conversations');

        for (const conversation of conversations) {
            const conversationId = conversation.id;
            
            // Get messages for this conversation
            try {
                const messagesResponse = await axios.get(
                    `https://graph.facebook.com/v18.0/${conversationId}/messages`,
                    {
                        params: {
                            fields: 'id,message,created_time,from,to',
                            limit: 10,
                            access_token: pageToken
                        }
                    }
                );

                const messages = messagesResponse.data.data;
                console.log('[pollFacebookMessages] Conversation', conversationId, 'has', messages.length, 'messages');

                for (const message of messages) {
                    const messageId = message.id;
                    const messageText = message.message;
                    const fromId = message.from.id;
                    const fromName = message.from.name;
                    const toId = message.to.id;

                    // Skip messages from our own page
                    if (String(fromId) === String(pageId)) {
                        continue;
                    }

                    // Check for duplicates
                    const existing = await AutomationLog.findOne({
                        type: 'message',
                        'metadata.messageId': messageId
                    });
                    if (existing) {
                        continue;
                    }

                    console.log('[pollFacebookMessages] Processing new message:', { messageId, messageText, fromId, fromName });

                    // Log the message
                    const log = new AutomationLog({
                        type: 'message',
                        platform: 'facebook',
                        status: 'pending',
                        message: messageText,
                        metadata: {
                            conversationId,
                            messageId,
                            userId: fromId,
                            userName: fromName
                        }
                    });
                    await log.save();

                    // Generate AI reply
                    try {
                        const GroqProvider = require('../ai/providers/groq.provider');
                        const AIConfig = require('../ai/config/ai.config');
                        const groqConfig = AIConfig.getProviderConfig('groq');
                        const groqProvider = new GroqProvider(groqConfig);
                        
                        const prompt = `
أنت مساعد مبيعات ودود لمكتبة "كنوز بوك" (متجر كتب وروايات عربي، الموقع knoozbook.com).
رسالة العميل: "${messageText}"
المنصة: facebook messenger

اكتب ردًا موجزًا ومهذبًا باللغة العربية فقط (بدون أي كلمات إنجليزية إلا اسم الموقع knoozbook.com إذا لزم).
لو السؤال عن السعر أو التوفر وجّه العميل بأدب لموقعنا للاطلاع على التفاصيل.
لا تتجاوز 3 جمل قصيرة.
`;

                        const result = await groqProvider.generateText({
                            messages: [
                                { role: 'system', content: 'أنت مساعد مبيعات ودود لمكتبة "كنوز بوك" (متجر كتب وروايات عربي، الموقع knoozbook.com).' },
                                { role: 'user', content: prompt }
                            ],
                            model: groqConfig.defaultModel,
                            temperature: 0.7,
                            maxTokens: 200
                        });
                        
                        const replyText = (result.text || result.response || result.output || 'شكراً لتواصلك معنا! سنساعدك بأسرع وقت.').trim();
                        console.log('[pollFacebookMessages] AI reply:', replyText);

                        // Send reply via Facebook Messenger API
                        const response = await axios.post(
                            `https://graph.facebook.com/v18.0/${pageId}/messages`,
                            {
                                recipient: { id: fromId },
                                message: { text: replyText },
                                access_token: pageToken
                            }
                        );

                        console.log('[pollFacebookMessages] Reply sent successfully:', response.data.message_id);

                        // Log the reply
                        await AutomationLog.create({
                            type: 'message_reply',
                            platform: 'facebook',
                            status: 'success',
                            message: replyText,
                            metadata: {
                                conversationId,
                                messageId,
                                replyId: response.data.message_id
                            }
                        });
                    } catch (error) {
                        console.error('[pollFacebookMessages] Error processing message:', error.message);
                        await AutomationLog.create({
                            type: 'message_reply',
                            platform: 'facebook',
                            status: 'failed',
                            message: messageText,
                            error: error.message,
                            metadata: {
                                conversationId,
                                messageId
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('[pollFacebookMessages] Error fetching messages for conversation', conversationId, ':', error.message);
            }
        }

        res.json({ success: true, message: 'Poll completed' });
    } catch (error) {
        console.error('Error in pollFacebookMessages:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Generate AI reply for a comment
 */
exports.generateReply = async (req, res) => {
    try {
        const { comment, platform, productId } = req.body;

        if (!comment) {
            return res.status(400).json({ success: false, message: 'comment is required' });
        }

        console.log('[generateReply] Generating reply for:', { comment, platform, productId });

        // نجيب بيانات المنتج الحقيقية من قاعدة البيانات (لو معروف) بدل ما نسيب
        // الـ AI "يخمن" السعر أو التوفر، ده كان بيسبب معلومات غلط في الردود.
        let productContext = 'لم يتم تحديد كتاب معين في هذا التعليق.';
        let product = null;
        if (productId) {
            product = await Product.findOne({ products_id: productId })
                .select('product_name product_description product_price status');
        }
        if (product) {
            productContext = `
اسم الكتاب: ${product.product_name}
السعر: ${product.product_price} جنيه
الحالة: ${product.status === 'approved' ? 'متوفر' : 'غير متوفر حاليًا'}
وصف مختصر: ${(product.product_description || '').substring(0, 200)}
رابط الشراء: https://knoozbook.com/book/${productId}
`;
        }

        const prompt = `
أنت مساعد مبيعات ودود لمكتبة "كنوز بوك" (متجر كتب وروايات عربي، الموقع knoozbook.com).
تعليق العميل: "${comment}"
المنصة: ${platform}

بيانات الكتاب (استخدمها إن وجدت ولا تخترق أي أرقام أو معلومات غير موجودة هنا):
${productContext}

اكتب ردًا موجزًا ومهذبًا باللغة العربية فقط (بدون أي كلمات إنجليزية إلا اسم الموقع knoozbook.com إذا لزم).
لو السؤال عن السعر أو التوفر واستخدم البيانات أعلاه، ولو الكتاب غير معروف وجّه العميل بأدب لرسالتنا الخاصة أو لموقعنا للاطلاع على التفاصيل.
لا تتجاوز 3 جمل قصيرة.
`;

        // Use Groq provider directly for simple text generation
        const GroqProvider = require('../ai/providers/groq.provider');
        const AIConfig = require('../ai/config/ai.config');
        const groqConfig = AIConfig.getProviderConfig('groq');
        const groqProvider = new GroqProvider(groqConfig);
        
        const result = await groqProvider.generateText({
            messages: [
                { role: 'system', content: 'أنت مساعد مبيعات ودود لمكتبة "كنوز بوك" (متجر كتب وروايات عربي، الموقع knoozbook.com).' },
                { role: 'user', content: prompt }
            ],
            model: groqConfig.defaultModel,
            temperature: 0.7,
            maxTokens: 200
        });
        
        let replyText = (result.text || result.response || result.output || 'شكراً لتواصلك معنا! سنساعدك بأسرع وقت.').trim();

        console.log('[generateReply] AI response:', replyText);

        res.json({
            success: true,
            reply: replyText
        });
    } catch (error) {
        console.error('Error in generateReply:', error);
        res.status(500).json({ success: false, message: 'Server error generating reply' });
    }
};

/**
 * Post reply to Facebook/Instagram
 */
exports.postReply = async (req, res) => {
    try {
        const { platform, commentId, reply, postId, facebookPageToken } = req.body;

        if (!commentId || !reply) {
            return res.status(400).json({ success: false, message: 'commentId and reply are required' });
        }

        console.log('[postReply] Posting reply:', { platform, commentId, reply, postId });

        // Use token from request (from n8n) or fallback to env
        const pageToken = facebookPageToken || process.env.FACEBOOK_PAGE_TOKEN;

        if (!pageToken) {
            return res.status(500).json({ success: false, message: 'Facebook credentials missing' });
        }

        let url;
        const data = {
            message: reply,
            access_token: pageToken
        };

        if (platform === 'facebook') {
            // الرد على تعليق فيسبوك: بننشئ تعليق فرعي تحت نفس التعليق
            url = `https://graph.facebook.com/v18.0/${commentId}/comments`;
        } else if (platform === 'instagram') {
            // ملحوظة مهمة: إنستجرام له endpoint مختلف تمامًا عن فيسبوك للرد على
            // تعليق (Graph API الخاص بالتعليقات على انستجرام بيستخدم /replies
            // مش /comments). استخدام مسار فيسبوك هنا كان هيفشل دايمًا مع انستجرام.
            url = `https://graph.facebook.com/v18.0/${commentId}/replies`;
        } else {
            return res.status(400).json({ success: false, message: 'Invalid platform' });
        }

        const response = await axios.post(url, data);

        console.log('[postReply] Response:', response.data);

        // Log the reply
        const log = new AutomationLog({
            type: 'comment_reply',
            platform,
            status: 'success',
            message: reply,
            metadata: {
                commentId,
                postId,
                replyId: response.data.id
            }
        });

        await log.save();

        res.json({
            success: true,
            replyId: response.data.id
        });
    } catch (error) {
        const apiError = error.response?.data?.error?.message || error.message;
        console.error('Error in postReply:', apiError);

        // نسجل الفشل كمان عشان يبان في لوحة الأتمتة إن الرد فشل ومحدش يفتكر
        // إن كل حاجة شغالة تمام
        try {
            await AutomationLog.create({
                type: 'comment_reply',
                platform: req.body.platform,
                status: 'failed',
                message: req.body.reply,
                error: apiError,
                metadata: {
                    commentId: req.body.commentId,
                    postId: req.body.postId
                }
            });
        } catch (logErr) {
            console.error('Error logging failed reply:', logErr.message);
        }

        res.status(500).json({ success: false, message: 'Server error posting reply', error: apiError });
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