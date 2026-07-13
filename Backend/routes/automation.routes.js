const express = require('express');
const router = express.Router();
const automationController = require('../controllers/automation.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware'); // Assuming these exist

// Admin facing routes (Dashboard)
// router.get('/dashboard', verifyToken, isAdmin, automationController.getDashboardData);
// router.patch('/settings', verifyToken, isAdmin, automationController.updateSettings);
// router.get('/logs', verifyToken, isAdmin, automationController.getLogs);

// Temporary routes without auth for initial testing with n8n (need to secure later)
router.get('/dashboard', automationController.getDashboardData);
router.patch('/settings', automationController.updateSettings);
router.get('/logs', automationController.getLogs);

// n8n bridge routes
// receive logging from n8n
router.post('/log', automationController.receiveLog);
// n8n fetches random product
router.get('/random-product', automationController.getRandomProduct);
// n8n fetches product by ID
// ملاحظة: تم حذف المسار المكرر '/product/:productId' لأنه كان بنفس شكل
// '/product/:id' فكان Express بيوجّه كل الطلبات لأول مسار مسجل (getProductById)
// وكانت getProduct (V4) ميتة تمامًا ومفيش أي طلب هيوصلها أبدًا.
router.get('/product/:id', automationController.getProductById);
// n8n fetches random product (new endpoint for V4)
router.get('/products/random', automationController.getRandomProduct);
// n8n fetches settings (new endpoint for V4)
router.get('/settings', automationController.getSettings);
// n8n checks daily count (new endpoint for V4)
router.get('/daily-count', automationController.getDailyCount);
// generate post image for social media
router.post('/generate-post-image', automationController.generatePostImage);
// product created webhook trigger
router.post('/product-created', automationController.productCreated);

// AI Sales Agent routes
router.post('/ai-analyze', automationController.aiAnalyzeIntent);
router.get('/recommend-books', automationController.recommendBooks);

// AI Content Generation routes
router.post('/ai/generate-content', automationController.aiGenerateContent);

// AI Orchestrator routes
router.post('/ai/execute', automationController.aiExecute);
router.get('/ai/metrics', automationController.getAIMetrics);
router.get('/ai/cost-report', automationController.getAICostReport);
router.get('/ai/performance-report', automationController.getAIPerformanceReport);
router.get('/ai/error-report', automationController.getAIErrorReport);
router.get('/ai/health', automationController.getAIHealth);

// Event Tracking routes
router.post('/track', automationController.trackEvent);
router.post('/aggregate', automationController.aggregateMetrics);
router.post('/trigger-promotion', automationController.triggerPromotion);

// Claude and n8n advanced integration
router.post('/claude/execute', automationController.executeClaudeCommand);
router.get('/n8n/stats', automationController.getN8nStats);
router.post('/deploy', automationController.deployToProduction);

// AI Sales Agent V3 - Comment handling
// GET: مطلوب من Meta نفسها للتحقق من الـ webhook وقت إعداده في Developer Portal
// (Meta بترسل hub.challenge وازاي المفروض نردّ عليه موضّح جوه verifyWebhook)
router.get('/comment-webhook', automationController.verifyWebhook);
router.post('/comment-webhook', automationController.commentWebhook);
router.post('/poll-facebook-comments', automationController.pollFacebookComments);
router.post('/poll-facebook-messages', automationController.pollFacebookMessages);
router.post('/generate-reply', automationController.generateReply);
router.post('/post-reply', automationController.postReply);
router.post('/log', automationController.log);

module.exports = router;