const express = require('express');
const router = express.Router();
const mutabaaController = require('../controllers/mutabaa.controller');
const authenticateToken = require('../middleware/auth.middleware');

// Debug Route
router.get('/ping', (req, res) => {
    console.log('🏓 Ping hit!');
    res.json({ message: 'pong' });
});

// جميع الروابط تتطلب تسجيل الدخول
router.use(authenticateToken);

router.get('/', mutabaaController.getMutabaaData);
router.put('/settings', mutabaaController.updatePlanSettings);
router.post('/task', mutabaaController.updateTaskStatus);

module.exports = router;
