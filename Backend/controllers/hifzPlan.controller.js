const User = require('../models/User.model');

// دالة مساعدة للحصول على تاريخ اليوم (توقيت مصر)
const getTodayStr = () => {
    const now = new Date();
    const egyptOffset = 2 * 60; // UTC+2
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const egyptTime = new Date(utc + (egyptOffset * 60000));
    return egyptTime.toISOString().split('T')[0];
};

/**
 * الحصول على حالة خطة الحفظ
 */
exports.getHifzPlan = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        res.json({
            success: true,
            isSetupComplete: user.hifzPlan?.isSetupComplete || false,
            plan: user.hifzPlan || {}
        });
    } catch (err) {
        console.error('[HifzPlan] getHifzPlan error:', err);
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
};

/**
 * حفظ إعدادات المعالج (Setup Wizard)
 */
const { surahVerses, surahNames } = require('../utils/surahData');

/**
 * دالة مساعدة للحصول على اسم السورة
 */
const getSurahName = (id) => {
    return surahNames[id - 1] || `سورة ${id}`;
};

/**
 * حفظ إعدادات المعالج (Setup Wizard)
 */
exports.saveSetup = async (req, res) => {
    try {
        const { userLevel, dailyCapacity, memorizedContent, resetProgress } = req.body;
        const user = await User.findById(req.user._id);

        console.log(`[HifzPlan] saveSetup for user: ${user.email}, resetProgress: ${resetProgress}`);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        // Accurate total verses count from individual verse keys
        const totalVersesMemorized = (memorizedContent && Array.isArray(memorizedContent)) ? memorizedContent.length : 0;

        // Smart start position (first GAP Detection at Verse Level)
        const memorizedKeys = new Set((memorizedContent || []).map(v => v.verseKey));

        let startSurah = 1;
        let startVerse = 1;
        let foundGap = false;

        for (let s = 1; s <= 114; s++) {
            const versesInSurah = surahVerses[s] || 0;
            for (let v = 1; v <= versesInSurah; v++) {
                if (!memorizedKeys.has(`${s}:${v}`)) {
                    startSurah = s;
                    startVerse = v;
                    foundGap = true;
                    break;
                }
            }
            if (foundGap) break;
        }

        // Initialize cursors
        let cursors = {
            newMemorization: { surah: startSurah, verse: startVerse },
            review: { surah: 1, page: 1 },
            recitation: { page: 1 }
        };

        // Preservation logic
        if (user.hifzPlan && user.hifzPlan.cursors) {
            const oldCursors = user.hifzPlan.cursors;

            // Only preserve newMemorization if it's still at or ahead of the first gap
            // But if it's pointing to something already memorized, reset.
            if (oldCursors.newMemorization && oldCursors.newMemorization.surah === startSurah && oldCursors.newMemorization.verse >= startVerse) {
                cursors.newMemorization = oldCursors.newMemorization;
            } else {
                cursors.newMemorization = { surah: startSurah, verse: startVerse };
            }

            // Preservation for Review/Recitation
            // RESET them if the user explicitly cleared everything (new plan) OR if resetProgress flag is true
            if (totalVersesMemorized > 0 && !resetProgress) {
                if (oldCursors.review && oldCursors.review.page !== undefined) cursors.review = oldCursors.review;
                if (oldCursors.recitation && oldCursors.recitation.page !== undefined) cursors.recitation = oldCursors.recitation;
            }
        }

        // Plain object for Mongoose
        const newHifzPlan = {
            isSetupComplete: true,
            userLevel: userLevel || (user.hifzPlan ? user.hifzPlan.userLevel : 'beginner'),
            dailyCapacity: {
                recitationType: dailyCapacity?.recitationType || 'page',
                recitationAmount: dailyCapacity?.recitationAmount || 2,
                newMemorization: dailyCapacity?.newMemorization || 'verse',
                memorizationAmount: dailyCapacity?.memorizationAmount || 5,
                memorizationDays: dailyCapacity?.memorizationDays || 5,
                reviewType: dailyCapacity?.reviewType || 'light',
                reviewAmount: dailyCapacity?.reviewAmount || 1
            },
            memorizedContent: memorizedContent || [],
            cursors: {
                newMemorization: {
                    surah: cursors.newMemorization?.surah || 1,
                    verse: cursors.newMemorization?.verse || 1
                },
                review: {
                    surah: cursors.review?.surah || 1,
                    page: cursors.review?.page || 1
                },
                recitation: {
                    page: cursors.recitation?.page || 1
                }
            },
            stats: {
                totalVersesMemorized: totalVersesMemorized,
                currentStreak: (user.hifzPlan && user.hifzPlan.stats) ? user.hifzPlan.stats.currentStreak : 0,
                bestStreak: (user.hifzPlan && user.hifzPlan.stats) ? user.hifzPlan.stats.bestStreak : 0,
                lastActiveDate: getTodayStr()
            }
        };

        user.set('hifzPlan', newHifzPlan);

        // SYNC: Update mutabaa.plan
        if (!user.mutabaa) user.mutabaa = { plan: {}, dailyLog: [] };

        // If resetProgress is true, clear today's progress in mutabaa.dailyLog to start fresh
        if (resetProgress) {
            const today = getTodayStr();
            const logIdx = user.mutabaa.dailyLog.findIndex(l => l.date === today);
            if (logIdx !== -1) {
                user.mutabaa.dailyLog[logIdx].tilawo = { status: 'pending', pagesCompleted: 0 };
                user.mutabaa.dailyLog[logIdx].hifz = { status: 'pending', versesCompleted: 0 };
                user.mutabaa.dailyLog[logIdx].muraja = { status: 'pending', pagesCompleted: 0 };
                user.mutabaa.dailyLog[logIdx].deepMuraja = { status: 'pending', pagesCompleted: 0 };
                user.markModified('mutabaa.dailyLog');
            }
        }

        user.mutabaa.plan.hifzTarget = (newHifzPlan.dailyCapacity.newMemorization === 'verses') ? newHifzPlan.dailyCapacity.memorizationAmount : 1;
        user.mutabaa.plan.tilawoTarget = newHifzPlan.dailyCapacity.recitationAmount || 2;
        user.mutabaa.plan.murajaTarget = 1;
        user.mutabaa.plan.deepMurajaTarget = newHifzPlan.dailyCapacity.reviewAmount || 1;

        user.markModified('hifzPlan');
        user.markModified('mutabaa.plan');
        await user.save();

        res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح', plan: user.hifzPlan });
    } catch (err) {
        console.error('[HifzPlan] saveSetup error:', err);
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
};

/**
 * توليد مهام اليوم بناءً على الخطة
 */
exports.generateDailyTasks = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        if (!user.hifzPlan?.isSetupComplete) {
            return res.json({ success: false, needsSetup: true, message: 'يرجى إكمال الإعداد أولاً' });
        }

        const plan = user.hifzPlan;
        const today = getTodayStr();

        const cursors = plan.cursors || { newMemorization: { surah: 1, verse: 1 }, review: { surah: 1, page: 1 }, recitation: { page: 1 } };

        const todayLog = (user.mutabaa?.dailyLog || []).find(log => log.date === today);

        // 1️⃣ الحفظ الجديد
        const nextSurah = cursors.newMemorization.surah;
        const nextVerse = cursors.newMemorization.verse;

        const amount = plan.dailyCapacity.newMemorization === 'verses' ? (plan.dailyCapacity.memorizationAmount || 5) : 1;
        let label = `${getSurahName(nextSurah)} - آية ${nextVerse}`;

        if (plan.dailyCapacity.newMemorization === 'verses' && amount > 1) {
            label = `${getSurahName(nextSurah)} - من آية ${nextVerse} إلى ${nextVerse + amount - 1}`;
        } else if (plan.dailyCapacity.newMemorization === 'page') {
            label = `حفظ صفحة كاملة (بداية من ${getSurahName(nextSurah)} آية ${nextVerse})`;
        } else if (plan.dailyCapacity.newMemorization === 'half_page') {
            label = `حفظ نصف صفحة (بداية من ${getSurahName(nextSurah)} آية ${nextVerse})`;
        }

        const newMemorization = {
            type: 'new_memorization',
            label: label,
            target: plan.dailyCapacity.newMemorization === 'verses' ? 'verses' : plan.dailyCapacity.newMemorization,
            surah: nextSurah,
            verse: nextVerse,
            amount: amount,
            amountDone: todayLog?.hifz?.versesCompleted || 0,
            status: (todayLog?.hifz?.status === 'done' && (todayLog?.hifz?.versesCompleted || 0) < amount) ? 'pending' : (todayLog?.hifz?.status || 'pending')
        };

        // 2️⃣ التمكين (مراجعة آخر 14 يوم)
        const recentContent = (plan.memorizedContent || [])
            .filter(v => {
                if (!v.lastReviewed) return false;
                const daysSince = Math.floor((Date.now() - new Date(v.lastReviewed)) / (1000 * 60 * 60 * 24));
                return daysSince <= 14;
            })
            // Sort by most recent
            .sort((a, b) => new Date(b.lastReviewed) - new Date(a.lastReviewed))
            .slice(0, 10);

        const consolidationSurahs = [...new Set(recentContent.map(v => parseInt(v.verseKey.split(':')[0])))];
        const consolidationLabel = consolidationSurahs.length > 0
            ? `تمكين الحفظ الجديد (${consolidationSurahs.map(id => getSurahName(id)).join('، ')})`
            : 'تمكين الحفظ الجديد';

        const consolidation = {
            type: 'consolidation',
            label: consolidationLabel,
            verses: recentContent.map(v => v.verseKey),
            amountDone: todayLog?.muraja?.pagesCompleted || 0, // Using muraja field as placeholder
            status: todayLog?.muraja?.status || 'pending'
        };

        // 3️⃣ المراجعة البعيدة (الماضي)
        // Use review cursor
        const reviewStartPage = cursors.review.page;
        const reviewAmount = plan.dailyCapacity.reviewAmount || 1;
        const isJuz = plan.dailyCapacity.reviewType === 'weekly';

        // logic: if juz, we display Juz number. If page, we display Page range.
        const reviewLabel = isJuz
            ? `الجزء ${Math.ceil(reviewStartPage / 20)}` // Rough estimation or use proper cursor logic for Juz
            : `صفحة ${reviewStartPage} إلى ${reviewStartPage + reviewAmount - 1}`;

        const revision = {
            type: 'revision',
            label: reviewLabel,
            amount: reviewAmount,
            unit: plan.dailyCapacity.reviewType === 'weekly' ? 'juz' : 'page',
            startPage: reviewStartPage,
            amountDone: todayLog?.deepMuraja?.pagesCompleted || 0,
            status: (todayLog?.deepMuraja?.status === 'done' && (todayLog?.deepMuraja?.pagesCompleted || 0) < reviewAmount) ? 'pending' : (todayLog?.deepMuraja?.status || 'pending')
        };

        // 4️⃣ ورد التلاوة
        // Use recitation cursor
        const recitationStart = cursors.recitation.page;
        const recitationAmount = plan.dailyCapacity.recitationAmount || 2;

        const recitation = {
            type: 'recitation',
            label: `صفحة ${recitationStart} إلى ${recitationStart + recitationAmount - 1}`,
            amount: recitationAmount,
            unit: plan.dailyCapacity.recitationType,
            startPage: recitationStart,
            amountDone: todayLog?.tilawo?.pagesCompleted || 0,
            status: (todayLog?.tilawo?.status === 'done' && (todayLog?.tilawo?.pagesCompleted || 0) < recitationAmount) ? 'pending' : (todayLog?.tilawo?.status || 'pending')
        };

        // Calculate Estimated Completion Date
        const totalVerses = 6236;
        const currentMemorized = plan.stats?.totalVersesMemorized || 0;

        const remaining = totalVerses - currentMemorized;

        let dailyRate = 1; // verses per day (default)
        const cap = plan.dailyCapacity.newMemorization;
        const daysPerWeek = plan.dailyCapacity.memorizationDays || 5;

        // Estimate rate
        if (cap === 'verse') dailyRate = 1;
        else if (cap === 'verses') dailyRate = plan.dailyCapacity.memorizationAmount || 5;
        else if (cap === 'half_page') dailyRate = 7; // Approx
        else if (cap === 'page') dailyRate = 15; // Approx

        // Effective rate considering days off
        const effectiveDailyRate = (dailyRate * daysPerWeek) / 7;

        const daysNeeded = remaining > 0 ? Math.ceil(remaining / effectiveDailyRate) : 0;
        const completionDate = new Date();
        completionDate.setDate(completionDate.getDate() + daysNeeded);

        res.json({
            success: true,
            date: today,
            tasks: [newMemorization, consolidation, revision, recitation],
            streak: plan.stats?.currentStreak || 0,
            stats: {
                totalVersesMemorized: currentMemorized,
                percentage: ((currentMemorized / totalVerses) * 100).toFixed(1),
                completionDate: completionDate.toISOString().split('T')[0],
                remainingVerses: remaining
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
};

/**
 * تحديث حالة الذاكرة لآية
 */
exports.updateVerseStrength = async (req, res) => {
    try {
        const { verseKey, strength, wasCorrect } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        if (!user.hifzPlan) user.hifzPlan = { memorizedContent: [] };
        if (!user.hifzPlan.memorizedContent) user.hifzPlan.memorizedContent = [];

        const existing = user.hifzPlan.memorizedContent.find(v => v.verseKey === verseKey);

        if (existing) {
            // تحديث الحالة بناءً على الأداء
            if (wasCorrect !== undefined) {
                if (wasCorrect) {
                    // ترقية: weak -> medium -> strong
                    if (existing.strength === 'rescue') existing.strength = 'weak';
                    else if (existing.strength === 'weak') existing.strength = 'medium';
                    else if (existing.strength === 'medium') existing.strength = 'strong';
                } else {
                    // خفض: strong -> medium -> weak -> rescue
                    if (existing.strength === 'strong') existing.strength = 'medium';
                    else if (existing.strength === 'medium') existing.strength = 'weak';
                    else existing.strength = 'rescue';
                }
            } else if (strength) {
                existing.strength = strength;
            }
            existing.lastReviewed = new Date();
            existing.reviewCount = (existing.reviewCount || 0) + 1;
        } else {
            // إضافة آية جديدة
            user.hifzPlan.memorizedContent.push({
                verseKey,
                strength: strength || 'medium',
                lastReviewed: new Date(),
                reviewCount: 1
            });
        }

        user.markModified('hifzPlan');
        await user.save();

        res.json({ success: true, message: 'تم تحديث حالة الآية' });
    } catch (err) {
        console.error('[HifzPlan] updateVerseStrength error:', err);
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
};

/**
 * تقليل الحمل اليومي
 */
exports.reduceLoad = async (req, res) => {
    try {
        const { taskType } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        if (!user.hifzPlan?.dailyCapacity) {
            return res.status(400).json({ success: false, message: 'لا توجد خطة محددة' });
        }

        // تقليل الحمل بنسبة 25%
        if (taskType === 'new_memorization') {
            // لا يمكن تقليل أقل من آية
        } else if (taskType === 'recitation') {
            const current = user.hifzPlan.dailyCapacity.recitationAmount;
            user.hifzPlan.dailyCapacity.recitationAmount = Math.max(1, Math.floor(current * 0.75));
        }

        user.markModified('hifzPlan');
        await user.save();

        res.json({ success: true, message: 'تم تقليل الحمل ❤️', plan: user.hifzPlan });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
};

/**
 * حفظ إعدادات التنبيهات المخصصة
 */
exports.saveReminders = async (req, res) => {
    try {
        const { reminders } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        if (!user.hifzPlan) user.hifzPlan = {};

        user.hifzPlan.reminders = {
            recitation: {
                enabled: reminders?.recitation?.enabled ?? false,
                time: reminders?.recitation?.time || '08:00'
            },
            memorization: {
                enabled: reminders?.memorization?.enabled ?? false,
                time: reminders?.memorization?.time || '09:00'
            },
            revision: {
                enabled: reminders?.revision?.enabled ?? false,
                time: reminders?.revision?.time || '10:00'
            }
        };

        user.markModified('hifzPlan');
        await user.save();

        res.json({ success: true, message: 'تم حفظ إعدادات التنبيهات بنجاح', reminders: user.hifzPlan.reminders });
    } catch (err) {
        console.error('[HifzPlan] saveReminders error:', err);
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
};
