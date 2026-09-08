const ReadingChallenge = require('../models/ReadingChallenge.model');
const Ebook = require('../models/Ebook.model');
const User = require('../models/User.model');
const SystemSettings = require('../models/SystemSettings');

// Create a new challenge
exports.createChallenge = async (req, res) => {
    try {
        const hostId = req.user._id;
        const { bookId, bookTitle, bookCover, title, description, isPublic, maxParticipants, targetValue, endDate } = req.body;

        const challenge = new ReadingChallenge({
            bookId,
            bookTitle,
            bookCover,
            hostId,
            title,
            description,
            isPublic,
            maxParticipants,
            targetValue,
            endDate,
            participants: [{
                userId: hostId,
                progressPercent: 0
            }]
        });

        await challenge.save();

        res.status(201).json({
            success: true,
            message: 'تم إنشاء التحدي بنجاح',
            data: challenge
        });
    } catch (error) {
        console.error('Error creating challenge:', error);
        res.status(500).json({ success: false, message: 'خطأ في إنشاء التحدي', error: error.message });
    }
};

// Join a challenge via ID or Invite Code
exports.joinChallenge = async (req, res) => {
    try {
        const userId = req.user._id;
        const { inviteCode, challengeId } = req.body;

        let challenge;
        if (inviteCode) {
            challenge = await ReadingChallenge.findOne({ inviteCode });
        } else if (challengeId) {
            challenge = await ReadingChallenge.findById(challengeId);
        }

        if (!challenge) {
            return res.status(404).json({ success: false, message: 'التحدي غير موجود' });
        }

        if (challenge.status !== 'active') {
            return res.status(400).json({ success: false, message: 'هذا التحدي لم يعد نشطاً' });
        }

        // Check if already joined
        const alreadyJoined = challenge.participants.some(p => p.userId.toString() === userId.toString());
        if (alreadyJoined) {
            return res.status(400).json({ success: false, message: 'أنت مشارك بالفعل في هذا التحدي' });
        }

        // Check max participants
        if (challenge.participants.length >= challenge.maxParticipants) {
            return res.status(400).json({ success: false, message: 'اكتمل العدد الأقصى للمشاركين' });
        }

        challenge.participants.push({
            userId,
            progressPercent: 0
        });

        await challenge.save();

        res.json({ success: true, message: 'تم الانضمام للتحدي بنجاح', data: challenge });
    } catch (error) {
        console.error('Error joining challenge:', error);
        res.status(500).json({ success: false, message: 'خطأ في الانضمام للتحدي', error: error.message });
    }
};

// Get public challenges for a specific book
exports.getPublicChallenges = async (req, res) => {
    try {
        const { bookId } = req.params;
        const challenges = await ReadingChallenge.find({
            bookId,
            isPublic: true,
            status: 'active',
            endDate: { $gt: new Date() }
        }).populate('hostId', 'username profilePicture')
          .populate('participants.userId', 'username profilePicture');

        res.json({ success: true, data: challenges });
    } catch (error) {
        console.error('Error fetching public challenges:', error);
        res.status(500).json({ success: false, message: 'خطأ في جلب التحديات', error: error.message });
    }
};

// Get all active public challenges across all books
exports.getAllPublicChallenges = async (req, res) => {
    try {
        const challenges = await ReadingChallenge.find({
            isPublic: true,
            status: 'active',
            endDate: { $gt: new Date() }
        }).populate('hostId', 'username profilePicture')
          .populate('participants.userId', 'username profilePicture')
          .sort({ createdAt: -1 })
          .limit(20); // Limit to latest 20 for performance

        // In a real app we'd need to populate book details from the external library or a local cache
        // but since bookId is a string, we return it as is. The frontend will have to fetch book details
        // if it needs the cover, or we could just use the book cover if we had saved it.
        // Wait, did we save book details in the challenge? We only saved bookId.

        res.json({ success: true, data: challenges });
    } catch (error) {
        console.error('Error fetching all public challenges:', error);
        res.status(500).json({ success: false, message: 'خطأ في جلب التحديات', error: error.message });
    }
};

// Get user's active challenges
exports.getMyChallenges = async (req, res) => {
    try {
        const userId = req.user._id;
        const challenges = await ReadingChallenge.find({
            'participants.userId': userId
        }).populate('hostId', 'username profilePicture')
          .populate('participants.userId', 'username profilePicture')
          .sort({ createdAt: -1 });

        res.json({ success: true, data: challenges });
    } catch (error) {
        console.error('Error fetching user challenges:', error);
        res.status(500).json({ success: false, message: 'خطأ في جلب التحديات', error: error.message });
    }
};

// Get user's active challenges for a specific book (used by epub reader)
exports.getMyChallengesForBook = async (req, res) => {
    try {
        const userId = req.user._id;
        const { bookId } = req.params;
        const challenges = await ReadingChallenge.find({
            bookId,
            'participants.userId': userId,
            status: 'active'
        }).populate('hostId', 'username profilePicture')
          .populate('participants.userId', 'username profilePicture')
          .sort({ createdAt: -1 });

        res.json({ success: true, data: challenges });
    } catch (error) {
        console.error('Error fetching challenges for book:', error);
        res.status(500).json({ success: false, message: 'خطأ في جلب التحديات', error: error.message });
    }
};

// Update progress (can be called from epub-reader or reading-progress)
exports.updateProgress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { challengeId, progressPercent } = req.body;

        const challenge = await ReadingChallenge.findById(challengeId);
        if (!challenge) {
            return res.status(404).json({ success: false, message: 'التحدي غير موجود' });
        }

        const updated = await challenge.updateParticipantProgress(userId, progressPercent);
        if (updated) {
            // Check for rewards if completed
            const participant = challenge.participants.find(p => p.userId.toString() === userId.toString());
            if (participant && participant.completedAt && !participant.pointsAwarded) {
                // Award points
                const settings = await SystemSettings.getInstance();
                const baseReward = 100; // base reward for completion
                let rankBonus = 0;
                
                if (participant.rank === 0) rankBonus = 100; // 1st place
                else if (participant.rank === 1) rankBonus = 50; // 2nd place
                else if (participant.rank === 2) rankBonus = 25; // 3rd place
                
                const totalPoints = baseReward + rankBonus;
                
                // Add points to user (using User model method if exists, or just direct update)
                await User.findByIdAndUpdate(userId, { $inc: { walletBalance: totalPoints } });
                participant.pointsAwarded = true;
            }
            await challenge.save();
        }

        res.json({ success: true, data: challenge });
    } catch (error) {
        console.error('Error updating challenge progress:', error);
        res.status(500).json({ success: false, message: 'خطأ في تحديث التقدم', error: error.message });
    }
};
// Leave challenge
exports.leaveChallenge = async (req, res) => {
    try {
        const userId = req.user._id;
        const challengeId = req.params.id;

        const challenge = await ReadingChallenge.findById(challengeId);
        if (!challenge) {
            return res.status(404).json({ success: false, message: 'التحدي غير موجود' });
        }

        // If the user is the host, they cannot leave, they must delete/end the challenge
        if (challenge.hostId.toString() === userId.toString()) {
            return res.status(400).json({ success: false, message: 'لا يمكن لمنشئ التحدي المغادرة. يجب عليك إنهاء التحدي بأكمله.' });
        }

        // Remove the user from participants
        const participantIndex = challenge.participants.findIndex(p => p.userId.toString() === userId.toString());
        if (participantIndex === -1) {
            return res.status(400).json({ success: false, message: 'أنت غير منضم لهذا التحدي' });
        }

        challenge.participants.splice(participantIndex, 1);
        await challenge.save();

        res.json({ success: true, message: 'تم مغادرة التحدي بنجاح' });
    } catch (error) {
        console.error('Error leaving challenge:', error);
        res.status(500).json({ success: false, message: 'خطأ أثناء مغادرة التحدي' });
    }
};

// Delete/End challenge
exports.deleteChallenge = async (req, res) => {
    try {
        const userId = req.user._id;
        const challengeId = req.params.id;

        const challenge = await ReadingChallenge.findById(challengeId);
        if (!challenge) {
            return res.status(404).json({ success: false, message: 'التحدي غير موجود' });
        }

        // Only host can delete
        if (challenge.hostId.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'فقط منشئ التحدي يمكنه إنهاؤه' });
        }

        await ReadingChallenge.findByIdAndDelete(challengeId);

        res.json({ success: true, message: 'تم إنهاء التحدي وحذفه بنجاح' });
    } catch (error) {
        console.error('Error deleting challenge:', error);
        res.status(500).json({ success: false, message: 'خطأ أثناء إنهاء التحدي' });
    }
};
