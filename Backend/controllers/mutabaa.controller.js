const User = require('../models/User.model');

// Helper to get local date in Egypt (UTC+2)
const getTodayStr = () => {
    // Offset for Egypt: UTC+2. If it's DST, it might be UTC+3 but standard is +2.
    // For a more robust way without extra libs:
    return new Date(new Date().getTime() + (2 * 60 * 60 * 1000)).toISOString().split('T')[0];
};

// Helper to ensure mutabaa object exists
const ensureMutabaa = (user) => {
    if (!user.mutabaa) {
        user.mutabaa = {
            plan: {
                tilawoTarget: 2,
                hifzTarget: 0,
                murajaTarget: 0,
                deepMurajaTarget: 0
            },
            dailyLog: []
        };
    }
    if (!user.mutabaa.plan) {
        user.mutabaa.plan = {
            tilawoTarget: 2,
            hifzTarget: 0,
            murajaTarget: 0,
            deepMurajaTarget: 0
        };
    }
    if (!user.mutabaa.dailyLog) {
        user.mutabaa.dailyLog = [];
    }
};

// الحصول على خطة المتابعة وحالة اليوم
exports.getMutabaaData = async (req, res) => {
    try {
        // req.user is already the user document thanks to auth middleware
        // But we refresh it to be safe or just use it. 
        // Using findById with req.user._id to be standard.
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        ensureMutabaa(user);

        // التأكد من وجود سجل لليوم
        const today = getTodayStr();
        let todayLog = user.mutabaa.dailyLog.find(log => log.date === today);

        if (!todayLog) {
            // إنشاء سجل جديد لليوم إذا لم يوجد
            todayLog = {
                date: today,
                tilawo: { status: 'pending', pagesCompleted: 0 },
                hifz: { status: 'pending', versesCompleted: 0 },
                muraja: { status: 'pending', pagesCompleted: 0 },
                deepMuraja: { status: 'pending', pagesCompleted: 0 }
            };
            user.mutabaa.dailyLog.push(todayLog);

            // تنظيف السجلات القديمة (اختياري: الاحتفاظ بآخر 30 يوم فقط لتقليل الحجم)
            if (user.mutabaa.dailyLog.length > 60) {
                user.mutabaa.dailyLog.shift();
            }

            await user.save();
        }

        res.json({
            success: true,
            plan: user.mutabaa.plan,
            todayLog: todayLog,
            quranProgress: user.quranProgress // Added for global progress display
        });
    } catch (error) {
        console.error('Error fetching mutabaa data:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// تحديث إعدادات الخطة
exports.updatePlanSettings = async (req, res) => {
    try {
        const { tilawoTarget, hifzTarget, murajaTarget, deepMurajaTarget } = req.body;

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        ensureMutabaa(user);

        if (tilawoTarget !== undefined) user.mutabaa.plan.tilawoTarget = tilawoTarget;
        if (hifzTarget !== undefined) user.mutabaa.plan.hifzTarget = hifzTarget;
        if (murajaTarget !== undefined) user.mutabaa.plan.murajaTarget = murajaTarget;
        if (deepMurajaTarget !== undefined) user.mutabaa.plan.deepMurajaTarget = deepMurajaTarget;

        // Reset today's status if target is increased beyond current completion
        const today = getTodayStr();
        let todayLog = user.mutabaa.dailyLog.find(log => log.date === today);
        if (todayLog) {
            if (hifzTarget !== undefined && hifzTarget > (todayLog.hifz?.versesCompleted || 0)) todayLog.hifz.status = 'pending';
            if (tilawoTarget !== undefined && tilawoTarget > (todayLog.tilawo?.pagesCompleted || 0)) todayLog.tilawo.status = 'pending';
            if (murajaTarget !== undefined && murajaTarget > (todayLog.muraja?.pagesCompleted || 0)) todayLog.muraja.status = 'pending';
            if (deepMurajaTarget !== undefined && deepMurajaTarget > (todayLog.deepMuraja?.pagesCompleted || 0)) todayLog.deepMuraja.status = 'pending';
            user.markModified('mutabaa.dailyLog');
        }

        await user.save();

        res.json({
            success: true,
            message: 'Updated plan settings',
            plan: user.mutabaa.plan,
            todayLog: todayLog,
            quranProgress: user.quranProgress
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// تحديث حالة مهمة (إنجاز أو تأجيل)
exports.updateTaskStatus = async (req, res) => {
    try {
        const { taskType, status, amountDone } = req.body;
        // taskType: 'tilawo' | 'hifz' | 'muraja' | 'deepMuraja'
        // status: 'done' | 'postponed' | 'pending'

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        ensureMutabaa(user);

        const today = getTodayStr();
        let logIndex = user.mutabaa.dailyLog.findIndex(log => log.date === today);

        if (logIndex === -1) {
            user.mutabaa.dailyLog.push({ date: today });
            logIndex = user.mutabaa.dailyLog.length - 1;
        }

        const currentLog = user.mutabaa.dailyLog[logIndex];

        // Ensure task type object exists in log
        if (!currentLog[taskType]) {
            currentLog[taskType] = {
                status: 'pending',
                [taskType === 'hifz' ? 'versesCompleted' : 'pagesCompleted']: 0
            };
        }

        const oldStatus = currentLog[taskType].status;
        const oldAmount = (taskType === 'hifz' ? currentLog[taskType].versesCompleted : currentLog[taskType].pagesCompleted) || 0;
        const newAmount = amountDone !== undefined ? amountDone : (taskType === 'hifz' ? user.mutabaa.plan.hifzTarget : (taskType === 'tilawo' ? user.mutabaa.plan.tilawoTarget : (taskType === 'muraja' ? user.mutabaa.plan.murajaTarget : user.mutabaa.plan.deepMurajaTarget)));

        // --- Global Progress Sync ---
        if (!user.quranProgress) {
            user.quranProgress = { totalPoints: 0, pagesRead: 0, versesMemorized: 0, pagesReviewed: 0, lastPage: 1, dailyStreak: 0 };
        }
        if (user.quranProgress.pagesReviewed === undefined) user.quranProgress.pagesReviewed = 0;
        if (user.quranProgress.totalPoints === undefined) user.quranProgress.totalPoints = 0;
        if (user.quranProgress.versesMemorized === undefined) user.quranProgress.versesMemorized = 0;
        if (user.quranProgress.pagesRead === undefined) user.quranProgress.pagesRead = 0;

        // Handle Status Transition
        if (status === 'done' && oldStatus !== 'done') {
            // New Completion
            if (taskType === 'hifz') {
                user.quranProgress.versesMemorized += newAmount;
                user.quranProgress.totalPoints += (newAmount * 5); // 5 points per verse
            } else if (taskType === 'tilawo') {
                user.quranProgress.pagesRead += newAmount;
                user.quranProgress.totalPoints += (newAmount * 10); // 10 points per page
            } else if (taskType === 'muraja' || taskType === 'deepMuraja') {
                if (user.quranProgress.pagesReviewed === undefined) user.quranProgress.pagesReviewed = 0;
                user.quranProgress.pagesReviewed += newAmount;
                user.quranProgress.totalPoints += (newAmount * 5); // 5 points per revision page
            }
            user.quranProgress.lastActivityDate = new Date();
        }
        else if (status !== 'done' && oldStatus === 'done') {
            // Reverting Completion
            if (taskType === 'hifz') {
                user.quranProgress.versesMemorized = Math.max(0, user.quranProgress.versesMemorized - oldAmount);
                user.quranProgress.totalPoints = Math.max(0, user.quranProgress.totalPoints - (oldAmount * 5));
            } else if (taskType === 'tilawo') {
                user.quranProgress.pagesRead = Math.max(0, user.quranProgress.pagesRead - oldAmount);
                user.quranProgress.totalPoints = Math.max(0, user.quranProgress.totalPoints - (oldAmount * 10));
            } else if (taskType === 'muraja' || taskType === 'deepMuraja') {
                user.quranProgress.pagesReviewed = Math.max(0, (user.quranProgress.pagesReviewed || 0) - oldAmount);
                user.quranProgress.totalPoints = Math.max(0, user.quranProgress.totalPoints - (oldAmount * 5));
            }
        }
        else if (status === 'done' && oldStatus === 'done' && newAmount !== oldAmount) {
            // Updating amount while still done
            const diff = newAmount - oldAmount;
            if (taskType === 'hifz') {
                user.quranProgress.versesMemorized += diff;
                user.quranProgress.totalPoints += (diff * 5);
            } else if (taskType === 'tilawo') {
                user.quranProgress.pagesRead += diff;
                user.quranProgress.totalPoints += (diff * 10);
            } else {
                user.quranProgress.pagesReviewed = (user.quranProgress.pagesReviewed || 0) + diff;
                user.quranProgress.totalPoints += (diff * 5);
            }
        }

        // Update Log
        currentLog[taskType].status = status;
        if (taskType === 'hifz') currentLog[taskType].versesCompleted = newAmount;
        else currentLog[taskType].pagesCompleted = newAmount;

        user.mutabaa.dailyLog[logIndex] = currentLog;

        // Mark as modified if it's a nested array update
        user.markModified('mutabaa.dailyLog');
        user.markModified('quranProgress');

        console.log(`📈 [Mutabaa] Task ${taskType} updated to ${status}. New Amount: ${newAmount}. Total Points: ${user.quranProgress.totalPoints}`);

        await user.save();

        res.json({
            success: true,
            todayLog: currentLog,
            quranProgress: user.quranProgress // Return updated progress
        });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
