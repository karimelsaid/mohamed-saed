const User = require('../models/User.model');
const { surahVerses } = require('../utils/surahData');
const quranUtils = require('../utils/quranUtils');

// Helper to get local date in Egypt (UTC+2) using unified logic
const getTodayStr = () => quranUtils.getTodayEgyptStr();

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
// تحديث حالة مهمة (إنجاز أو تأجيل)
exports.updateTaskStatus = async (req, res) => {
    let retries = 3;
    while (retries > 0) {
        try {
            const { taskType: rawTaskType, status, amountDone } = req.body;
            // console.log(`[Mutabaa] updateTaskStatus request: type=${rawTaskType}, status=${status}, amount=${amountDone}`);

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

            // --- Consolidation Guard ---
            // If taskType is hifz and they are trying to mark it as 'done', 
            // check if they have pending consolidation (muraja).
            if (taskType === 'hifz' && status === 'done') {
                // Determine if consolidation is truly required:
                // 1. Must have memorized before.
                // 2. Must have "historical" context (verses with timestamps) to review.
                const timestampedVerses = (user.hifzPlan?.memorizedContent || []).filter(v => v.lastReviewed).length;

                const murajaLog = currentLog['muraja'];
                const isMurajaDone = murajaLog && murajaLog.status === 'done';

                if (timestampedVerses > 0 && !isMurajaDone) {
                    // console.log(`[Mutabaa] Guard: Blocking Hifz for ${user.email} - Consolidation pending.`);
                    return res.status(400).json({
                        success: false,
                        message: 'يجب إتمام "تمكين الحفظ الجديد" أولاً قبل تسجيل ورد الأمس كحفظ ثابت.'
                    });
                }
            }

            // Ensure task type object exists in log
            if (!currentLog[taskType]) {
                currentLog[taskType] = {
                    status: 'pending',
                    pagesCompleted: 0,
                    versesCompleted: 0
                };
            }

            const oldStatus = currentLog[taskType].status;
            let oldAmount = (taskType === 'hifz' ? currentLog[taskType].versesCompleted : currentLog[taskType].pagesCompleted) || 0;

            let newAmount = 0;
            let target = 0;
            if (taskType === 'hifz') {
                target = user.hifzPlan?.dailyCapacity?.memorizationAmount || user.mutabaa.plan.hifzTarget || 5;
            } else {
                target = taskType === 'tilawo' ? user.mutabaa.plan.tilawoTarget :
                    (taskType === 'muraja' ? user.mutabaa.plan.murajaTarget : user.mutabaa.plan.deepMurajaTarget);
            }

            let amountDoneFromReq = req.body.amountDone;
            if (amountDoneFromReq !== undefined) {
                newAmount = Number(amountDoneFromReq);
            } else {
                // If amount not specified, we assume user is doing exactly the remaining target for the day
                if (oldStatus === 'done') {
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

            // Handle Progression (newAmount > oldAmount)
            let effectiveDiff = newAmount - oldAmount;
            const existingKeys = new Set((user.hifzPlan?.memorizedContent || []).map(v => v.verseKey));

            // --- Atomic DB Update Strategy ---
            const isVerseTask = (taskType === 'hifz') || (taskType === 'muraja' && req.body.unit === 'verses');
            const field = isVerseTask ? 'versesCompleted' : 'pagesCompleted';

            // HEAL: If status is 'done' for hifz, ensure newAmount is at least target
            if (taskType === 'hifz' && status === 'done' && newAmount < target) {
                // console.log(`[Mutabaa] Auto-healing hifz amount to target: ${target}`);
                newAmount = target;
            }

            const updateOps = {
                $set: {
                    'quranProgress.lastActivityDate': new Date(),
                    [`mutabaa.dailyLog.${logIndex}.${taskType}.status`]: status,
                    [`mutabaa.dailyLog.${logIndex}.${taskType}.${field}`]: newAmount
                },
                $inc: {}
            };

            if (effectiveDiff > 0) {
                if (taskType === 'tilawo') {
                    updateOps.$inc['quranProgress.pagesRead'] = effectiveDiff;
                    updateOps.$inc['quranProgress.totalPoints'] = effectiveDiff * 10;
                } else if (taskType === 'muraja' || taskType === 'deepMuraja') {
                    if (!isVerseTask) {
                        updateOps.$inc['quranProgress.pagesReviewed'] = effectiveDiff;
                        updateOps.$inc['quranProgress.totalPoints'] = effectiveDiff * 5;
                    } else {
                        // For verse-based consolidation, reward 1 point per verse to avoid massive inflation
                        updateOps.$inc['quranProgress.totalPoints'] = effectiveDiff * 1;
                    }
                }
            } else if (effectiveDiff < 0) {
                const reduction = Math.abs(effectiveDiff);
                if (taskType === 'hifz') {
                    updateOps.$inc['quranProgress.versesMemorized'] = -reduction;
                    updateOps.$inc['quranProgress.totalPoints'] = -(reduction * 5);
                } else if (taskType === 'tilawo') {
                    updateOps.$inc['quranProgress.pagesRead'] = -reduction;
                    updateOps.$inc['quranProgress.totalPoints'] = -(reduction * 10);
                } else if (taskType === 'muraja' || taskType === 'deepMuraja') {
                    updateOps.$inc['quranProgress.pagesReviewed'] = -reduction;
                    updateOps.$inc['quranProgress.totalPoints'] = -(reduction * 5);
                }
            }

            if (taskType === 'hifz') {
                const current = user.hifzPlan?.cursors?.newMemorization || { surah: 1, verse: 1 };
                const hifzUnit = user.hifzPlan?.dailyCapacity?.newMemorization || 'verse';
                let capTarget = null;
                if (hifzUnit === 'page') {
                    capTarget = quranUtils.getLastVerseOfPage(quranUtils.getPageForVerse(current.surah, current.verse));
                } else if (hifzUnit === 'half_page') {
                    capTarget = quranUtils.getHalfPageTarget(current.surah, current.verse);
                }

                if (effectiveDiff > 0 || status === 'done') {
                    // Logic: Advance from the last unmemorized verse or unit start
                    let s = current.surah, v = current.verse;
                    let skipCount = 0;
                    while (skipCount < 100 && existingKeys.has(`${s}:${v}`)) {
                        skipCount++;
                        const total = surahVerses[s] || 286;
                        v++; if (v > total) { s++; v = 1; }
                        if (s > 114) break;
                    }

                    const basePos = { surah: s, verse: v };
                    let nextPos = advanceVersePosition(basePos.surah, basePos.verse, Math.max(effectiveDiff, 0), null);

                    // SNAP TO FINISH: If the task is marked 'done', force cursor to jump past capTarget
                    if (status === 'done' && capTarget) {
                        nextPos = advanceVersePosition(capTarget.surah, capTarget.verse, 1, null);
                        // console.log(`[Mutabaa] Hifz SNAP: Status=done. Snapping cursor to ${nextPos.surah}:${nextPos.verse}`);
                    }

                    // console.log(`[Mutabaa] Hifz Sync: Cur=${current.surah}:${current.verse}, Skip=${skipCount}, Diff=${effectiveDiff} -> NextPos=${nextPos.surah}:${nextPos.verse}`);

                    updateOps.$set['hifzPlan.cursors.newMemorization'] = nextPos;
                    updateOps.$set['hifzPlan.currentPosition'] = nextPos;

                    // Sync ONLY the verses actually memorized in this specific action
                    // Avoid using capTarget for timestamping as it merges future/past verses into one Ward.
                    const actualSyncAmount = quranUtils.getVerseCountInRange(basePos.surah, basePos.verse, nextPos.surah, nextPos.verse);
                    const actualSyncKeys = quranUtils.getVersesKeysInRange(basePos.surah, basePos.verse, actualSyncAmount, nextPos);

                    const now = new Date();
                    const trulyNewKeys = actualSyncKeys.filter(k => !existingKeys.has(k));

                    // Add new verses
                    if (trulyNewKeys.length > 0) {
                        const newEntries = trulyNewKeys.map(k => ({
                            verseKey: k,
                            strength: 'medium',
                            lastReviewed: now,
                            reviewCount: 1
                        }));
                        user.hifzPlan.memorizedContent.push(...newEntries);
                        updateOps.$inc['quranProgress.versesMemorized'] = trulyNewKeys.length;
                        updateOps.$inc['hifzPlan.stats.totalVersesMemorized'] = trulyNewKeys.length;
                        updateOps.$inc['quranProgress.totalPoints'] = trulyNewKeys.length * 5;
                    }

                    // Update timestamp ONLY for the verses in THIS save action
                    const syncSet = new Set(actualSyncKeys);
                    user.hifzPlan.memorizedContent.forEach(v => {
                        if (syncSet.has(v.verseKey)) {
                            v.lastReviewed = now;
                        }
                    });

                    updateOps.$set['hifzPlan.memorizedContent'] = user.hifzPlan.memorizedContent;
                    user.markModified('hifzPlan.memorizedContent');
                } else if (effectiveDiff === 0 && newAmount > 0) {
                    // console.log(`[Mutabaa] Hifz Check: Diff=0 but newAmount > 0. Cursor at ${current.surah}:${current.verse}`);
                    if (!existingKeys.has(`${current.surah}:${current.verse}`)) {
                        // console.log(`[Mutabaa] Hifz RECOVERY: Stuck cursor detected! Forcing sync of ${newAmount} verses.`);
                        const newVersesInRange = quranUtils.getVersesKeysInRange(current.surah, current.verse, newAmount, capTarget);
                        if (newVersesInRange.length > 0) {
                            const nextPos = advanceVersePosition(current.surah, current.verse, newVersesInRange.length, capTarget);
                            updateOps.$set['hifzPlan.cursors.newMemorization'] = nextPos;
                            updateOps.$set['hifzPlan.currentPosition'] = nextPos;
                            // Add verses if they are missing
                            const now = new Date();
                            const trulyNewKeys = newVersesInRange.filter(k => !existingKeys.has(k));

                            if (trulyNewKeys.length > 0) {
                                const newEntries = trulyNewKeys.map(k => ({
                                    verseKey: k,
                                    strength: 'medium',
                                    lastReviewed: now,
                                    reviewCount: 1
                                }));
                                user.hifzPlan.memorizedContent.push(...newEntries);
                                updateOps.$inc['quranProgress.versesMemorized'] = trulyNewKeys.length;
                                updateOps.$inc['hifzPlan.stats.totalVersesMemorized'] = trulyNewKeys.length;
                                updateOps.$inc['quranProgress.totalPoints'] = trulyNewKeys.length * 5;
                            }

                            // Update timestamp for EVERYTHING in the sync range
                            const syncSet = new Set(newVersesInRange);
                            user.hifzPlan.memorizedContent.forEach(v => {
                                if (syncSet.has(v.verseKey)) {
                                    v.lastReviewed = now;
                                }
                            });

                            updateOps.$set['hifzPlan.memorizedContent'] = user.hifzPlan.memorizedContent;
                            user.markModified('hifzPlan.memorizedContent');
                        }
                    } else {
                        // Cursor is fine, but maybe we can skip already memorized ones if they exist?
                        let skipCount = 0;
                        let s = current.surah, v = current.verse;
                        while (skipCount < 100 && existingKeys.has(`${s}:${v}`)) {
                            skipCount++;
                            const total = surahVerses[s] || 7;
                            v++; if (v > total) { s++; v = 1; }
                            if (s > 114) break;
                        }
                        if (skipCount > 0) {
                            const nextPos = advanceVersePosition(current.surah, current.verse, skipCount, null);
                            updateOps.$set['hifzPlan.cursors.newMemorization'] = nextPos;
                            updateOps.$set['hifzPlan.currentPosition'] = nextPos;
                            console.log(`[Mutabaa] Hifz Recovery: Skipping ${skipCount} already-memorized verses. New Cursor -> ${nextPos.surah}:${nextPos.verse}`);
                        }
                    }
                }
            } else if (taskType === 'tilawo' && effectiveDiff > 0) {
                const unit = req.body.unit || 'page';
                let jumpAmount = effectiveDiff;
                if (unit === 'juz') jumpAmount = effectiveDiff * 20;
                else if (unit === 'hizb') jumpAmount = effectiveDiff * 10;
                else if (unit === 'half_hizb') jumpAmount = effectiveDiff * 5;
                else if (unit === 'rub_hizb') jumpAmount = effectiveDiff * 2.5;

                // Ensure hifzPlan and cursors structure exists completely
                if (!user.hifzPlan) user.hifzPlan = {};
                if (!user.hifzPlan.cursors) user.hifzPlan.cursors = { recitation: { page: 1 }, review: { page: 1, surah: 1 }, newMemorization: { surah: 1, verse: 1 } };
                if (!user.hifzPlan.cursors.recitation) user.hifzPlan.cursors.recitation = { page: 1 };

                // Get current page safely
                let currentPage = user.hifzPlan.cursors.recitation.page || 1;
                let nextPage = currentPage + jumpAmount;
                if (nextPage > 604) nextPage = 1;

                // Explicitly set the cursor in updateOps
                updateOps.$set['hifzPlan.cursors.recitation.page'] = nextPage;

                // Also BACKFILL the cursors object if it was missing to ensure future updates work
                if (!user.hifzPlan.cursors.review) updateOps.$set['hifzPlan.cursors.review'] = { page: 1, surah: 1 };
                if (!user.hifzPlan.cursors.newMemorization) updateOps.$set['hifzPlan.cursors.newMemorization'] = { surah: 1, verse: 1 };
            } else if (taskType === 'deepMuraja' && effectiveDiff > 0) {
                const unit = req.body.unit || 'page';
                let jumpAmount = effectiveDiff;
                if (unit === 'juz') jumpAmount = effectiveDiff * 20;
                else if (unit === 'hizb') jumpAmount = effectiveDiff * 10;
                else if (unit === 'half_hizb') jumpAmount = effectiveDiff * 5;
                else if (unit === 'rub_hizb') jumpAmount = effectiveDiff * 2.5;

                // Ensure cursors object exists
                if (!user.hifzPlan) user.hifzPlan = {};
                if (!user.hifzPlan.cursors) user.hifzPlan.cursors = {};
                if (!user.hifzPlan.cursors.review) user.hifzPlan.cursors.review = { page: 1, surah: 1 };

                if (user.hifzPlan.cursors.review) {
                    let nextPage = (user.hifzPlan.cursors.review.page || 1) + jumpAmount;
                    if (nextPage > 604) nextPage = 1;
                    updateOps.$set['hifzPlan.cursors.review.page'] = nextPage;
                }
            }

            if (taskType === 'hifz' && status === 'done') {
                // console.log(`[Mutabaa] Hifz Complete: Resetting muraja status for ${user.email}`);
                updateOps.$set[`mutabaa.dailyLog.${logIndex}.muraja.status`] = 'pending';
                // DO NOT reset versesCompleted to 0, so that point calculation only rewards NEW verses in the window.
            }

            if (Object.keys(updateOps.$inc).length === 0) delete updateOps.$inc;
            updateOps.$inc = updateOps.$inc || {};
            updateOps.$inc.__v = 1; // Atomic version increment

            // console.log(`[Mutabaa] ATOMIC_UPDATE for ${user.email}: Type=${taskType}, Status=${status}, Amount=${newAmount}`);

            const updatedUser = await User.findOneAndUpdate(
                { _id: user._id, __v: user.__v }, // Version check for race conditions
                updateOps,
                { new: true }
            );

            if (!updatedUser) {
                const conflictUser = await User.findById(user._id);
                // console.warn(`⚠️ [Mutabaa] Race Condition Detected for ${user.email}. DB_Version=${conflictUser?.__v}, Read_Version=${user.__v}. Retrying...`);
                throw { name: 'VersionError' };
            }

            const finalLog = updatedUser.mutabaa.dailyLog[logIndex];
            // console.log(`📈 [Mutabaa] POST-SAVE: Type=${taskType}, Status=${finalLog[taskType].status}, Cursor=${updatedUser.hifzPlan?.cursors?.newMemorization?.surah}:${updatedUser.hifzPlan?.cursors?.newMemorization?.verse}, MemTotal=${updatedUser.hifzPlan?.memorizedContent?.length}`);

            return res.json({
                success: true,
                todayLog: finalLog,
                quranProgress: updatedUser.quranProgress
            });

        } catch (error) {
            if (error.name === 'VersionError') {
                // console.warn(`⚠️ [Mutabaa] VersionError on task ${req.body?.taskType}. Retrying... (${retries} retries left)`);
                retries--;
                if (retries === 0) {
                    return res.status(409).json({ success: false, message: 'Concurrency conflict, please retry' });
                }
                // Small delay before retry
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
            console.error('Error updating task:', error);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    }
};

// Helper: Get list of verses in a range
function getVersesInRange(surah, verse, amount, capTarget = null) {
    const keys = quranUtils.getVersesKeysInRange(surah, verse, amount, capTarget);
    return keys.map(k => ({ verseKey: k }));
}

// Helper: Advance verse position correctly across Surahs
function advanceVersePosition(surah, verse, amount, capTarget = null) {
    let currentSurah = surah;
    let currentVerse = verse + amount;

    let targetPos = null;
    while (currentSurah <= 114) {
        const total = surahVerses[currentSurah] || 7;
        if (currentVerse <= total) {
            targetPos = { surah: currentSurah, verse: currentVerse };
            break;
        }
        currentVerse -= total;
        currentSurah++;
    }

    if (!targetPos) targetPos = { surah: 1, verse: 1 };

    // Apply cap if provided
    if (capTarget) {
        if (targetPos.surah > capTarget.surah || (targetPos.surah === capTarget.surah && targetPos.verse > capTarget.verse)) {
            // Jump to the verse IMMEDIATELY after the cap
            let nextSurah = capTarget.surah;
            let nextVerse = capTarget.verse + 1;
            const total = surahVerses[nextSurah] || 7;

            if (nextVerse > total) {
                nextSurah++;
                nextVerse = 1;
            }

            // Cap at end of Quran
            if (nextSurah > 114) return { surah: 114, verse: 6 };

            return { surah: nextSurah, verse: nextVerse };
        }
    }

    return targetPos;
}
