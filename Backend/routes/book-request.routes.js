const express = require('express');
const router = express.Router();
const bookRequestController = require('../controllers/book-request.controller');

/**
 * Book Request Routes
 * مسارات طلبات إضافة الكتب المطلوبة
 */

// إنشاء طلب كتاب جديد (متاح للجميع)
router.post('/', bookRequestController.createBookRequest);

// مسارات الأدمن (تحتاج مصادقة)
router.get('/admin/statistics', bookRequestController.getStatistics);
router.get('/admin', bookRequestController.getAllBookRequests);
router.put('/admin/:id/status', bookRequestController.updateRequestStatus);
router.delete('/admin/:id', bookRequestController.deleteRequest);

module.exports = router;
