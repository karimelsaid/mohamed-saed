const gamificationService = require('../services/gamification.service');
const Challenge = require('../models/Challenge.model');
const UserChallenge = require('../models/UserChallenge.model');
const UserAchievement = require('../models/UserAchievement.model');
const Achievement = require('../models/Achievement.model');
const User = require('../models/User.model');

// Sync Reading Progress (XP, Streak)
exports.syncProgress = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id; // Assuming Auth middleware
        const { minutesRead, pagesRead, ebookId } = req.body;

        const result = await gamificationService.processReadingSession(userId, {
            minutesRead,
            pagesRead,
            ebookId
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Gamification Sync Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get User Gamification Profile
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const profile = await gamificationService.getUserProfile(userId);
        res.json({ success: true, data: profile });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get Available Challenges
exports.getChallenges = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;

        // distinct challenges user has joined
        const myChallenges = await UserChallenge.find({ userId });
        const myChallengeIds = myChallenges.map(uc => uc.challengeId.toString());

        // All active global challenges
        const allChallenges = await Challenge.find({ isActive: true });

        // Merge logic
        const responseData = allChallenges.map(challenge => {
            const userState = myChallenges.find(uc => uc.challengeId.toString() === challenge._id.toString());
            return {
                ...challenge.toObject(),
                joined: !!userState,
                progress: userState ? userState.progress : 0,
                status: userState ? userState.status : 'available',
                userChallengeId: userState ? userState._id : null
            };
        });

        res.json({ success: true, data: responseData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Join Challenge
exports.joinChallenge = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { challengeId } = req.body;

        const exists = await UserChallenge.findOne({ userId, challengeId });
        if (exists) return res.status(400).json({ success: false, message: 'Already joined' });

        const newEntry = new UserChallenge({ userId, challengeId });
        await newEntry.save();

        res.json({ success: true, message: 'Joined successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Claim Reward
exports.claimReward = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { userChallengeId } = req.body;

        const uc = await UserChallenge.findOne({ _id: userChallengeId, userId });
        if (!uc) return res.status(404).json({ success: false, message: 'Challenge record not found' });

        if (uc.status !== 'completed') return res.status(400).json({ success: false, message: 'Challenge not completed yet' });
        if (uc.rewardsClaimed) return res.status(400).json({ success: false, message: 'Reward already claimed' });

        const challenge = await Challenge.findById(uc.challengeId);

        // Give Reward (XP)
        const user = await User.findById(userId);
        user.gamification.xp += challenge.xpReward;

        // Check Level Up again (Simple reuse for now, ideally service function)
        // ... omitted strictly for brevity, ideally call service

        uc.rewardsClaimed = true;
        await uc.save();
        await user.save();

        res.json({ success: true, xpAdded: challenge.xpReward });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get Leaderboard
exports.getLeaderboard = async (req, res) => {
    try {
        const list = await gamificationService.getGlobalLeaderboard();
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Convert Coins to Balance
exports.convertCoins = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { coins } = req.body;

        if (!coins || coins <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const result = await gamificationService.exchangeCoins(userId, coins);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
