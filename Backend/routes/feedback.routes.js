const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');
const verifyToken = require('../middleware/auth.middleware');
const authenticateAdmin = require('../middleware/admin.auth');

// Public or User feedback submission
// verifyToken is optional here if we want guests to submit feedback
router.post('/submit', (req, res, next) => {
    // Check if token exists, if so authenticate, else proceed as guest
    if (req.headers.authorization) {
        return verifyToken(req, res, next);
    }
    next();
}, feedbackController.submitFeedback);

// Admin only routes
router.get('/all', authenticateAdmin, feedbackController.getAllFeedback);

module.exports = router;
