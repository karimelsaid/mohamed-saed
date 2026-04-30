const express = require('express');
const router = express.Router();
const halaqaController = require('../controllers/halaqa.controller');

// إنشاء حلقة جديدة
router.post('/create', halaqaController.createHalaqa);

// جلب الحلقات المتاحة
router.get('/available', halaqaController.getAvailableHalaqas);

// الانضمام لحلقة
router.post('/join', halaqaController.joinHalaqa);

// حلقات المستخدم
router.get('/my/:userId', halaqaController.getMyHalaqas);

// --- Phase 2 Routes ---

// تفاصيل الحلقة
router.get('/:id', halaqaController.getHalaqaDetails);

// رسائل المحادثة
router.get('/:id/messages', halaqaController.getMessages);
router.get('/:id/search', halaqaController.searchMessages);
router.get('/:id/stats', halaqaController.getHalaqaStats);
router.get('/:id/media', halaqaController.getHalaqaMedia);
router.post('/:id/messages', halaqaController.sendMessage);
router.post('/messages/:messageId/pin', halaqaController.togglePinMessage);

// حذف الحلقة
router.delete('/:id', halaqaController.deleteHalaqa);

// تقييم الأعضاء
router.post('/rate', halaqaController.rateMember);

// رفع رسالة صوتية
router.post('/upload-voice', halaqaController.uploadVoiceMessage);
router.post('/upload-file', halaqaController.uploadFile);

// الدردشة الخاصة
router.post('/get-or-create-dm', halaqaController.getOrCreateDM);

module.exports = router;
