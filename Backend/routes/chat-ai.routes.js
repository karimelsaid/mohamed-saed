// routes/chat-ai.routes.js
const express = require('express');
const router = express.Router();
const chatAiController = require('../controllers/chat-ai.controller');

// مسار لإرسال رسالة إلى خدمة الذكاء الاصطناعي
router.post('/send-message', chatAiController.sendMessage);

// مسار للحصول على النماذج المتاحة (اختياري)
router.get('/models', chatAiController.getAvailableModels);

// مسار للحصول على محادثة بواسطة ID
router.get('/conversation/:conversationId', chatAiController.getConversation);

module.exports = router;
