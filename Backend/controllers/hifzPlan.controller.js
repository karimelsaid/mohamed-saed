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
const { surahVerses } = require('../utils/surahData');

/**
 * حفظ إعدادات المعالج (Setup Wizard)
 */
exports.saveSetup = async (req, res) => {
    try {
        const { userLevel, dailyCapacity, memorizedContent } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        // Calculate accurate total verses from backend data
        let totalVersesMemorized = 0;
        console.log('[HifzPlan] saveSetup received body:', {
            level: userLevel,
            capacity: dailyCapacity,
            contentLength: memorizedContent?.length
        });

        if (memorizedContent && Array.isArray(memorizedContent)) {
            memorizedContent.forEach(item => {
                if (item.verseKey) {
                    const surahId = parseInt(item.verseKey.split(':')[0]);
                    const count = surahVerses[surahId] || 0;
                    totalVersesMemorized += count;
                    console.log(`[HifzPlan] + Surah ${surahId}: ${count} verses. Total: ${totalVersesMemorized}`);
                    // Log a sample
                    if (surahId === 1 || surahId === 2) {
                        console.log(`[HifzPlan] Surah ${surahId} verses: ${count}`);
                    }
                }
            });
        }
        console.log('[HifzPlan] Calculated Total Verses:', totalVersesMemorized);

        // Calculate start position for New Memorization (Smart Gap Detection)
        const memorizedSurahIds = new Set();
        (memorizedContent || []).forEach(v => {
            const surahId = parseInt(v.verseKey.split(':')[0]);
            memorizedSurahIds.add(surahId);
        });

        let startSurah = 1;
        for (let i = 1; i <= 114; i++) {
            if (!memorizedSurahIds.has(i)) {
                startSurah = i;
                break;
            }
        }

        user.hifzPlan = {
            isSetupComplete: true,
            userLevel: userLevel || 'beginner',
            dailyCapacity: {
                recitationType: dailyCapacity?.recitationType || 'page',
                recitationAmount: dailyCapacity?.recitationAmount || 2,
                newMemorization: dailyCapacity?.newMemorization || 'verse',
                memorizationDays: dailyCapacity?.memorizationDays || 5,
                reviewType: dailyCapacity?.reviewType || 'light',
                reviewAmount: dailyCapacity?.reviewAmount || 1
            },
            memorizedContent: memorizedContent || [],
            cursors: {
                newMemorization: { surah: startSurah, verse: 1 },
                review: { surah: 1, page: 1 },
                recitation: { page: 1 }
            },
            // Deprecated but kept for compatibility
            currentPosition: { surah: startSurah, verse: 1 },
            stats: {
                totalVersesMemorized: totalVersesMemorized, // Backend calculation
                currentStreak: 0,
                bestStreak: 0,
                lastActiveDate: getTodayStr()
            }
        };

        user.markModified('hifzPlan');
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

        // 1️⃣ الحفظ الجديد
        // Use cursor to determine next task
        // Logic: Simple increment for now, assuming next verse is valid
        const nextSurah = cursors.newMemorization.surah;
        const nextVerse = cursors.newMemorization.verse;

        const newMemorization = {
            type: 'new_memorization',
            label: `سورة ${nextSurah} - آية ${nextVerse}`,
            target: plan.dailyCapacity.newMemorization,
            start: { surah: nextSurah, verse: nextVerse },
            amount: 1, // Determines how many verses/pages (placeholder logic)
            status: 'pending'
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

        const consolidation = {
            type: 'consolidation',
            label: 'التمكين',
            verses: recentContent.map(v => v.verseKey),
            status: 'pending'
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
            startPage: reviewStartPage, // To be used by frontend
            status: 'pending'
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
            status: 'pending'
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
        console.error('[HifzPlan] generateDailyTasks error:', err);
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
    } catch (err) {
        console.error('[HifzPlan] reduceLoad error:', err);
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
};
