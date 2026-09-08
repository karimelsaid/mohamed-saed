const express = require('express');
const router = express.Router();
const readingChallengeController = require('../controllers/reading-challenge.controller');

// Middleware
const verifyToken = require('../middleware/auth.middleware');

// Create a challenge
router.post('/', verifyToken, readingChallengeController.createChallenge);

// Join a challenge
router.post('/join', verifyToken, readingChallengeController.joinChallenge);

// Get my active challenges
router.get('/my-challenges', verifyToken, readingChallengeController.getMyChallenges);

// Get public challenges for a specific book
router.get('/public/:bookId', readingChallengeController.getPublicChallenges);

// Get all public challenges across all books
router.get('/public-all', readingChallengeController.getAllPublicChallenges);

// Get my challenges for a specific book (epub reader)
router.get('/my-book/:bookId', verifyToken, readingChallengeController.getMyChallengesForBook);

// Update progress (called continuously while reading)
router.post('/progress', verifyToken, readingChallengeController.updateProgress);

// Leave challenge
router.post('/leave/:id', verifyToken, readingChallengeController.leaveChallenge);

// Delete/End challenge
router.delete('/:id', verifyToken, readingChallengeController.deleteChallenge);

module.exports = router;
