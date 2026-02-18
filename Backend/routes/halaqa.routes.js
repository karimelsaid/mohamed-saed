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
router.post('/:id/messages', halaqaController.sendMessage);

// حذف الحلقة
router.delete('/:id', halaqaController.deleteHalaqa);

// تقييم الأعضاء
router.post('/rate', halaqaController.rateMember);

module.exports = router;
