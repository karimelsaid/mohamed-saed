const express = require('express');
const router = express.Router();
const halaqaController = require('../controllers/halaqa.controller');

// إنشاء حلقة جديدة
router.post('/create', halaqaController.createHalaqa);

// جلب الحلقات المتاحة
router.get('/available', halaqaController.getAvailableHalaqas);

// الانضمام لحلقة
router.post('/join', halaqaController.joinHalaqa);

module.exports = router;
