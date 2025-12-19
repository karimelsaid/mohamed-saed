const express = require('express');
const router = express.Router();
const gamificationController = require('../controllers/gamification.controller');

const verifyToken = require('../middleware/auth.middleware');

router.post('/progress/sync', verifyToken, gamificationController.syncProgress);
router.get('/status', verifyToken, gamificationController.getProfile);
router.get('/challenges', verifyToken, gamificationController.getChallenges);
router.post('/challenges/join', verifyToken, gamificationController.joinChallenge);
router.post('/challenges/claim', verifyToken, gamificationController.claimReward);
router.get('/leaderboard', gamificationController.getLeaderboard);

router.post('/coins/convert', verifyToken, gamificationController.convertCoins);

module.exports = router;
