const express = require('express');
const router = express.Router();
const hifzPlanController = require('../controllers/hifzPlan.controller');
const authenticateToken = require('../middleware/auth.middleware');

// جميع المسارات تتطلب مصادقة
router.use(authenticateToken);

// الحصول على حالة الخطة
router.get('/', hifzPlanController.getHifzPlan);

// حفظ إعدادات المعالج
router.post('/setup', hifzPlanController.saveSetup);

// توليد مهام اليوم
router.get('/daily-tasks', hifzPlanController.generateDailyTasks);

// تحديث حالة ذاكرة آية
router.post('/verse-strength', hifzPlanController.updateVerseStrength);

// تقليل الحمل اليومي
router.post('/reduce-load', hifzPlanController.reduceLoad);

module.exports = router;
