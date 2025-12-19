const User = require('../models/User.model');
const DailyLog = require('../models/DailyLog.model');
const Challenge = require('../models/Challenge.model');
const UserChallenge = require('../models/UserChallenge.model');
const Achievement = require('../models/Achievement.model');
const UserAchievement = require('../models/UserAchievement.model');

const SystemSettings = require('../models/SystemSettings');

// Constants (Defaults if DB fails, but we try to use DB)
const XP_PER_PAGE = 2;
const MAX_XP_PER_DAY = 500;
const STREAK_MIN_MINUTES = 0.1;

exports.processReadingSession = async (userId, sessionData) => {
    const { minutesRead, pagesRead, ebookId } = sessionData;
    if (!userId) throw new Error('User ID is required');

    const today = new Date().toISOString().split('T')[0];

    const settings = await SystemSettings.getInstance();
    const readingPoints = settings.gamification.readingPointsPerMinute || 1;

    // 1. Log Daily Activity
    let dailyLog = await DailyLog.findOne({ userId, date: today });
    if (!dailyLog) {
        dailyLog = new DailyLog({ userId, date: today });
    }

    const currentDailyXP = (dailyLog.minutesRead * readingPoints) + (dailyLog.pagesRead * XP_PER_PAGE);

    dailyLog.minutesRead += (minutesRead || 0);
    dailyLog.pagesRead += (pagesRead || 0);
    await dailyLog.save();

    // 2. Calculate XP
    let xpEarned = Math.ceil(((minutesRead || 0) * readingPoints) + ((pagesRead || 0) * XP_PER_PAGE));

    // Apply Daily Cap
    const newDailyXP = (dailyLog.minutesRead * readingPoints) + (dailyLog.pagesRead * XP_PER_PAGE);
    // If we were below cap
    if (currentDailyXP < MAX_XP_PER_DAY) {
        if (newDailyXP > MAX_XP_PER_DAY) {
            // Cap the earnings to reach exactly MAX
            xpEarned = MAX_XP_PER_DAY - currentDailyXP;
        }
        // If still below cap, xpEarned remains as is
    } else {
        xpEarned = 0; // Already capped
    }

    // 3. Update User (XP, Level, Streak)
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Initialize gamification object if missing (backward compatibility)
    if (!user.gamification) {
        user.gamification = {
            xp: 0,
            level: 1,
            currentStreak: 0,
            longestStreak: 0,
            coins: 0
        };
    }

    user.gamification.xp += xpEarned;

    // Level Check
    // Level Check
    let levelUp = false;
    // Use loop to handle multiple level jumps (e.g. if user earned massive XP or manual DB edit)
    while (true) {
        const currentLevel = user.gamification.level;
        const requiredXP = 100 * Math.pow(currentLevel, 1.5);

        if (user.gamification.xp >= requiredXP) {
            user.gamification.level += 1;
            levelUp = true;
            user.gamification.coins += 10 * user.gamification.level;
            // Note: In a real game, you might want to cap levels or coins, but strictly following formula here.
        } else {
            break;
        }
    }

    // Streak Check
    let streakUpdated = false;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Get last update date string in UTC
    const lastUpdateDate = user.gamification.lastStreakUpdate ? new Date(user.gamification.lastStreakUpdate) : null;
    const lastUpdateStr = lastUpdateDate ? lastUpdateDate.toISOString().split('T')[0] : null;

    // Check if we already updated streak today (UTC)
    const isSameDay = lastUpdateStr === todayStr;

    if (!isSameDay) {
        // Check if user has read enough TODAY (UTC) to count as a streak day
        if (dailyLog.minutesRead >= STREAK_MIN_MINUTES) {

            // Calculate yesterday in UTC
            const yesterday = new Date(now);
            yesterday.setUTCDate(yesterday.getUTCDate() - 1); // Use UTC Date manipulation
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            // Check if the PREVIOUS update was Yesterday (UTC)
            // Or if previous streak was 0 (new streak start)
            const isYesterday = lastUpdateStr === yesterdayStr;

            if (isYesterday || user.gamification.currentStreak === 0) {
                if (isYesterday) {
                    user.gamification.currentStreak += 1;
                } else {
                    user.gamification.currentStreak = 1;
                }

                // --- CHECK STREAK BONUSES ---
                const currentStreak = user.gamification.currentStreak;
                const bonus7 = settings.gamification.streakBonus7Days || 100;
                const bonus30 = settings.gamification.streakBonus30Days || 500;

                if (currentStreak % 30 === 0) {
                    user.gamification.coins += bonus30;
                    // Add notification
                    user.notifications.push({
                        message: `🔥 أسطورة! حافظت على الحماس لمدة 30 يوم متواصلة! حصلت على ${bonus30} نقطة إضافية!`,
                        type: 'system',
                        read: false,
                        createdAt: new Date()
                    });
                } else if (currentStreak % 7 === 0) {
                    user.gamification.coins += bonus7;
                    user.notifications.push({
                        message: `🔥 رائع! 7 أيام متواصلة! حصلت على ${bonus7} نقطة إضافية!`,
                        type: 'system',
                        read: false,
                        createdAt: new Date()
                    });
                }
                // -----------------------------

            } else {
                // Streak broken, start new
                user.gamification.currentStreak = 1;
            }

            if (user.gamification.currentStreak > user.gamification.longestStreak) {
                user.gamification.longestStreak = user.gamification.currentStreak;
            }

            user.gamification.lastStreakUpdate = now;
            streakUpdated = true;
        }
    }

    await user.save();

    // 4. Update Challenges
    await this.updateChallenges(userId, {
        minutesRead,
        pagesRead,
        streak: user.gamification.currentStreak
    });

    return {
        xpEarned,
        levelUp,
        newLevel: user.gamification.level,
        streakUpdated,
        currentStreak: user.gamification.currentStreak,
        dailyProgress: {
            minutes: dailyLog.minutesRead,
            target: STREAK_MIN_MINUTES,
            captured: dailyLog.minutesRead >= STREAK_MIN_MINUTES
        }
    };
};

exports.updateChallenges = async (userId, activity) => {
    const userChallenges = await UserChallenge.find({ userId, status: 'active' });

    for (const uc of userChallenges) {
        const challenge = await Challenge.findById(uc.challengeId);
        if (!challenge || !challenge.isActive) continue;

        const now = new Date();
        if (challenge.endDate && now > challenge.endDate) continue;

        let progressInc = 0;
        let newProgress = uc.progress;

        if (challenge.type === 'reading_time') {
            newProgress += (activity.minutesRead || 0);
        } else if (challenge.type === 'streak_length') {
            if (activity.streak) {
                newProgress = activity.streak; // Absolute value for streak
            }
        }
        // books_read would be handled separately on book completion event

        if (newProgress !== uc.progress) {
            uc.progress = newProgress;
            if (uc.progress >= challenge.targetValue) {
                uc.status = 'completed';
                uc.completedAt = new Date();
            }
            await uc.save();
        }
    }
};

exports.getUserProfile = async (userId) => {
    // Trigger Daily Active Reward Check
    // We call this here so active users don't need to re-login to get rewards
    try {
        await exports.processLogin(userId);
    } catch (err) {
        console.error('Error awarding daily login points:', err);
    }

    const user = await User.findById(userId).select('gamification username email referralCode referralBalance profileImage');
    if (!user) throw new Error('User not found');

    if (!user.gamification) {
        user.gamification = {
            xp: 0,
            level: 1,
            currentStreak: 0,
            longestStreak: 0,
            lastStreakUpdate: null,
            coins: 0
        };
        // Optionally save ensuring it persists, or just return default structure
        // await user.save(); // Better to save it so next time it's there
    }

    if (!user.gamification.level) user.gamification.level = 1; // Double check


    // Ensure Referral Code Exists
    if (!user.referralCode) {
        // Simple generation: first 4 chars of username + random number
        const cleanName = user.username.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
        const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
        user.referralCode = (cleanName || 'KENOUZ') + uniqueSuffix;
        await user.save();
    }

    // Calculate progress to next level
    const currentLevel = user.gamification.level;
    const nextLevelXP = 100 * Math.pow(currentLevel + 1, 1.5);

    // Get Referral Stats
    // Assuming we might store referral count in the future, or just count existing referrals
    // user.referralCount is not in model explicitly, but we can return it if added
    // For now we use the `gamification.coins` as key stat

    return {
        ...user.gamification,
        username: user.username,
        referralCode: user.referralCode,
        referralBalance: user.referralBalance || 0,
        nextLevelXP: Math.ceil(nextLevelXP),
        profileImage: user.profileImage // Fixed: Return the profile image
    };
};

exports.getGlobalLeaderboard = async () => {
    return User.find({}, 'username gamification.xp gamification.level logo profileImage')
        .sort({ 'gamification.xp': -1 })
        .limit(20);
};

exports.processReferral = async (referrerId, newUserId) => {
    const settings = await SystemSettings.getInstance();
    const REFERRER_REWARD = settings.gamification.referralPoints || 50; // Get from DB
    const REFEREE_REWARD = settings.gamification.referralPoints || 50;  // Giving same reward to both for now or split if needed

    // Award Referrer
    const referrer = await User.findById(referrerId);
    if (referrer) {
        if (!referrer.gamification) referrer.gamification = { coins: 0, xp: 0, level: 1 };
        referrer.gamification.coins = (referrer.gamification.coins || 0) + REFERRER_REWARD;

        // Add notification
        referrer.notifications.push({
            message: `🎉 تهانينا! لقد ربحت ${REFERRER_REWARD} عملة لدعوة صديق جديد!`,
            type: 'system',
            read: false,
            createdAt: new Date()
        });

        await referrer.save();
    }

    // Award Referee (New User)
    const newUser = await User.findById(newUserId);
    if (newUser) {
        if (!newUser.gamification) newUser.gamification = { coins: 0, xp: 0, level: 1 };
        newUser.gamification.coins = (newUser.gamification.coins || 0) + REFEREE_REWARD;

        // Add notification
        newUser.notifications.push({
            message: `🎁 هدية ترحيبية! لقد حصلت على ${REFEREE_REWARD} عملة لاستخدام كود الدعوة!`,
            type: 'system',
            read: false,
            createdAt: new Date()
        });

        await newUser.save();
    }
};

exports.exchangeCoins = async (userId, coinsToExchange) => {
    const settings = await SystemSettings.getInstance();
    const EXCHANGE_RATE = settings.economy.coinExchangeRate || 50; // Get from DB
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    if (!user.gamification || (user.gamification.coins || 0) < coinsToExchange) {
        throw new Error('رصيد العملات غير كافي');
    }

    const cashValue = Math.floor(coinsToExchange / EXCHANGE_RATE);
    if (cashValue < 1) {
        throw new Error(`يجب استبدال ${EXCHANGE_RATE} عملة على الأقل للحصول على 1 جنيه`);
    }

    // Deduct coins
    const exactCoinsToDeduct = cashValue * EXCHANGE_RATE;
    user.gamification.coins -= exactCoinsToDeduct;

    // Add to wallet
    user.referralBalance = (user.referralBalance || 0) + cashValue;

    // Add notification
    user.notifications.push({
        message: `💱 تم تحويل ${exactCoinsToDeduct} عملة إلى ${cashValue} جنيه في محفظتك.`,
        type: 'system',
        read: false,
        createdAt: new Date()
    });

    await user.save();

    return {
        success: true,
        newCoinBalance: user.gamification.coins,
        newWalletBalance: user.referralBalance,
        exchangedAmount: cashValue,
        coinsDeducted: exactCoinsToDeduct
    };
};

exports.processLogin = async (userId) => {
    // Atomic update to prevent race conditions (double rewards on parallel requests)
    const settings = await SystemSettings.getInstance();
    const loginPoints = settings.gamification.loginPoints || 10;

    const now = new Date();
    // Use ISO String date part for stable day comparison "YYYY-MM-DD"
    const todayString = now.toISOString().split('T')[0];

    // Atomic Check & Update: Only update if lastRewardDateString is NOT today
    // This strictly prevents race conditions between parallel requests (e.g. Google Sign In + Auto Login)
    const user = await User.findOneAndUpdate(
        {
            _id: userId,
            $or: [
                { 'gamification.lastRewardDateString': { $ne: todayString } },
                { 'gamification.lastRewardDateString': { $exists: false } }
            ]
        },
        {
            $inc: { 'gamification.coins': loginPoints },
            $set: {
                'gamification.lastLoginRewardDate': now,
                'gamification.lastRewardDateString': todayString
            },
            $push: {
                notifications: {
                    message: `🔓 تسجيل دخول يومي! حصلت على ${loginPoints} عملة!`,
                    type: 'system',
                    read: false,
                    createdAt: now
                }
            },
            $setOnInsert: { 'gamification.xp': 0, 'gamification.level': 1 }
        },
        { new: true }
    );

    if (user) {
        // Reward was awarded
        return { awarded: true, points: loginPoints };
    }

    return { awarded: false };
};
