const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth.middleware');
const quranProgressController = require('../controllers/quran-progress.controller');

console.log('AuthenticateToken type:', typeof authenticateToken);
// جميع الطلبات تتطلب تسجيل الدخول
if (typeof authenticateToken !== 'function') {
    throw new Error('AuthenticateToken is not a function');
}
router.use(authenticateToken);

// الحصول على تقدم المستخدم
router.get('/progress', quranProgressController.getProgress);

// إضافة نقاط
router.post('/add-points', quranProgressController.addPoints);

// تحديث الالتزام اليومي
router.post('/update-streak', quranProgressController.updateStreak);

// تحديث آخر صفحة
router.post('/last-page', quranProgressController.updateLastPage);

// إضافة/إزالة bookmark
router.post('/bookmark', quranProgressController.toggleBookmark);

module.exports = router;
