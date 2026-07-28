const express = require('express');
const router = express.Router();
const publisherController = require('../controllers/publisher.controller');

// Public route to get publisher logo (no authentication required)
router.get('/logo/:publisherName', publisherController.getPublisherLogo);

module.exports = router;
