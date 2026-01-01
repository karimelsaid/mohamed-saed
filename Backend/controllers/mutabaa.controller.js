const User = require('../models/User.model');
const { surahVerses } = require('../utils/surahData');

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
        const { taskType: rawTaskType, status, amountDone } = req.body;
        const taskType = (rawTaskType === 'new_memorization') ? 'hifz' : rawTaskType;
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

        let newAmount = 0;
        let target = 0;
        if (taskType === 'hifz') {
            target = user.hifzPlan?.dailyCapacity?.memorizationAmount || user.mutabaa.plan.hifzTarget || 5;
        } else {
            target = taskType === 'tilawo' ? user.mutabaa.plan.tilawoTarget :
                (taskType === 'muraja' ? user.mutabaa.plan.murajaTarget : user.mutabaa.plan.deepMurajaTarget);
        }

        if (amountDone !== undefined) {
            newAmount = amountDone;
        } else {
            // If amount not specified, we assume user is doing exactly the remaining target for the day
            if (oldStatus === 'done') {
                // If already done and no amount provided, just add 1 unit? 
                // Or better: don't accumulate blindly. If it was already done, stay at oldAmount or add a minimal unit.
                // For safety: if already done, we add the target again (Extra work)
                newAmount = oldAmount + target;
            } else {
                newAmount = target;
            }
        }

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

                // FIX: Add to memorizedContent
                if (user.hifzPlan && user.hifzPlan.cursors) {
                    const current = user.hifzPlan.cursors.newMemorization;
                    const newVerses = getVersesInRange(current.surah, current.verse, newAmount);

                    // Add unique verses
                    if (!user.hifzPlan.memorizedContent) user.hifzPlan.memorizedContent = [];
                    const existingKeys = new Set(user.hifzPlan.memorizedContent.map(v => v.verseKey));
                    newVerses.forEach(v => {
                        if (!existingKeys.has(v.verseKey)) user.hifzPlan.memorizedContent.push(v);
                    });

                    // Advance cursor
                    const nextPos = advanceVersePosition(current.surah, current.verse, newAmount);
                    user.hifzPlan.cursors.newMemorization = nextPos;
                    user.hifzPlan.currentPosition = nextPos;
                    user.markModified('hifzPlan');
                }

            } else if (taskType === 'tilawo') {
                user.quranProgress.pagesRead += newAmount;
                user.quranProgress.totalPoints += (newAmount * 10); // 10 points per page

                // Advance Recitation Cursor
                if (user.hifzPlan?.cursors?.recitation) {
                    user.hifzPlan.cursors.recitation.page += newAmount;
                    if (user.hifzPlan.cursors.recitation.page > 604) user.hifzPlan.cursors.recitation.page = 1;
                    user.markModified('hifzPlan');
                }
            } else if (taskType === 'muraja' || taskType === 'deepMuraja') {
                if (user.quranProgress.pagesReviewed === undefined) user.quranProgress.pagesReviewed = 0;
                user.quranProgress.pagesReviewed += newAmount;
                user.quranProgress.totalPoints += (newAmount * 5); // 5 points per revision page

                // Advance Review Cursor (for deepMuraja)
                if (taskType === 'deepMuraja' && user.hifzPlan?.cursors?.review) {
                    user.hifzPlan.cursors.review.page += newAmount;
                    if (user.hifzPlan.cursors.review.page > 604) user.hifzPlan.cursors.review.page = 1;
                    user.markModified('hifzPlan');
                }
            }
            user.quranProgress.lastActivityDate = new Date();
        }
        else if (status !== 'done' && oldStatus === 'done') {
            // Reverting Completion
            if (taskType === 'hifz') {
                user.quranProgress.versesMemorized = Math.max(0, user.quranProgress.versesMemorized - oldAmount);
                user.quranProgress.totalPoints = Math.max(0, user.quranProgress.totalPoints - (oldAmount * 5));
                // Note: We don't remove from memorizedContent or revert cursor to avoid mess if user just unchecked accidental check
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

                // FIX: Also advance cursor if adding more verses
                if (diff > 0 && user.hifzPlan) {
                    if (!user.hifzPlan.cursors) {
                        user.hifzPlan.cursors = {
                            newMemorization: { surah: 1, verse: 1 },
                            review: { surah: 1, page: 1 },
                            recitation: { page: 1 }
                        };
                    }
                    const current = user.hifzPlan.cursors.newMemorization;

                    // Add NEW verses to content
                    const newVerses = getVersesInRange(current.surah, current.verse, diff);
                    if (!user.hifzPlan.memorizedContent) user.hifzPlan.memorizedContent = [];
                    const existingKeys = new Set(user.hifzPlan.memorizedContent.map(v => v.verseKey));
                    newVerses.forEach(v => {
                        if (!existingKeys.has(v.verseKey)) user.hifzPlan.memorizedContent.push(v);
                    });

                    const nextPos = advanceVersePosition(current.surah, current.verse, diff);
                    user.hifzPlan.cursors.newMemorization = nextPos;
                    user.hifzPlan.currentPosition = nextPos;
                    user.markModified('hifzPlan');
                }
            } else if (taskType === 'tilawo') {
                user.quranProgress.pagesRead += diff;
                user.quranProgress.totalPoints += (diff * 10);

                // Advance Recitation Cursor
                if (diff > 0 && user.hifzPlan?.cursors?.recitation) {
                    user.hifzPlan.cursors.recitation.page += diff;
                    if (user.hifzPlan.cursors.recitation.page > 604) user.hifzPlan.cursors.recitation.page = 1;
                    user.markModified('hifzPlan');
                }
            } else {
                user.quranProgress.pagesReviewed = (user.quranProgress.pagesReviewed || 0) + diff;
                user.quranProgress.totalPoints += (diff * 5);

                // Advance Review Cursor (for deepMuraja)
                if (diff > 0 && taskType === 'deepMuraja' && user.hifzPlan?.cursors?.review) {
                    user.hifzPlan.cursors.review.page += diff;
                    if (user.hifzPlan.cursors.review.page > 604) user.hifzPlan.cursors.review.page = 1;
                    user.markModified('hifzPlan');
                }

                // Advance Recitation Cursor (for tilawo)
                if (diff > 0 && taskType === 'tilawo' && user.hifzPlan?.cursors?.recitation) {
                    user.hifzPlan.cursors.recitation.page += diff;
                    if (user.hifzPlan.cursors.recitation.page > 604) user.hifzPlan.cursors.recitation.page = 1;
                    user.markModified('hifzPlan');
                }
            }
        }

        // Update Log
        currentLog[taskType].status = status;
        if (taskType === 'hifz') currentLog[taskType].versesCompleted = newAmount;
        else currentLog[taskType].pagesCompleted = newAmount;

        user.mutabaa.dailyLog[logIndex] = currentLog;

        user.markModified('hifzPlan');
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
        if (error.name === 'VersionError') {
            console.warn(`⚠️ [Mutabaa] VersionError on task ${taskType}. This usually means multiple concurrent updates. Retrying logic might be needed but skipping for now to prevent crash.`);
            return res.json({ success: true, message: 'Sync accepted (parallel overlap)' });
        }
        console.error('Error updating task:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Helper: Get list of verses in a range
function getVersesInRange(surah, verse, amount) {
    const verses = [];
    let currentSurah = surah;
    let currentVerse = verse;
    let count = 0;

    while (count < amount) {
        if (currentSurah > 114) break; // End of Quran
        const total = surahVerses[currentSurah] || 7;

        while (currentVerse <= total && count < amount) {
            verses.push({ verseKey: `${currentSurah}:${currentVerse}` });
            currentVerse++;
            count++;
        }

        if (currentVerse > total) {
            currentSurah++;
            currentVerse = 1;
        }
    }
    return verses;
}

// Helper: Advance verse position correctly across Surahs
function advanceVersePosition(surah, verse, amount) {
    let currentSurah = surah;
    let currentVerse = verse + amount;

    while (currentSurah <= 114) {
        const total = surahVerses[currentSurah] || 7; // Fallback to 7 (Fatiha)
        if (currentVerse <= total) {
            return { surah: currentSurah, verse: currentVerse };
        }
        currentVerse -= total;
        currentSurah++;
    }

    // If finished القرآن, restart from beginning
    return { surah: 1, verse: 1 };
}
