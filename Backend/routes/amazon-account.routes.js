const express = require('express');
const router = express.Router();
const amazonAccountController = require('../controllers/amazon-account.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

// Routes for Amazon accounts management
router.get('/', authMiddleware, amazonAccountController.listAccounts);
router.post('/', authMiddleware, amazonAccountController.createAccount);
router.put('/:id', authMiddleware, amazonAccountController.updateAccount);
router.post('/:id/activate', authMiddleware, amazonAccountController.toggleActiveAccount);
router.post('/:id/test', authMiddleware, amazonAccountController.testAccountConnection);
router.delete('/:id', authMiddleware, amazonAccountController.deleteAccount);

module.exports = router;
