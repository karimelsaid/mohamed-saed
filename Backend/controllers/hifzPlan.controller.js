const User = require('../models/User.model');
const quranUtils = require('../utils/quranUtils');

const getTodayStr = () => quranUtils.getTodayEgyptStr();

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
    let retries = 3;
    while (retries > 0) {
        try {
            const { userLevel, dailyCapacity, memorizedContent, resetProgress } = req.body;
            const user = await User.findById(req.user._id);

            console.log(`[HifzPlan] saveSetup for user: ${user.email}, resetProgress: ${resetProgress}`);
            if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

            // --- 1. Smart Content Merge ---
            // Calculate this FIRST so we can use the valid content for gap detection if needed.
            const statsIsSetup = user.hifzPlan?.isSetupComplete;

            const finalMemorizedContent = (resetProgress) ? (memorizedContent || []) : (
                (() => {
                    const existing = user.hifzPlan?.memorizedContent || [];
                    const incoming = memorizedContent || [];

                    if (incoming.length === 0) return existing;

                    const mergedMap = new Map();
                    existing.forEach(v => mergedMap.set(v.verseKey, { ...v }));
                    incoming.forEach(v => {
                        const existingV = mergedMap.get(v.verseKey);
                        // Preserve existing timestamp if incoming doesn't have one
                        const lastReviewed = v.lastReviewed || (existingV ? existingV.lastReviewed : new Date());
                        mergedMap.set(v.verseKey, {
                            strength: 'medium',
                            reviewCount: 1,
                            ...existingV,
                            ...v,
                            lastReviewed
                        });
                    });

                    return Array.from(mergedMap.values());
                })()
            );

            // Accurate total verses count
            const totalVersesMemorized = finalMemorizedContent.length;

            // --- 2. Determine Start Position (Gap Detection) ---
            // We only need this if we are resetting OR if we don't have valid cursors.
            const memorizedKeys = new Set(finalMemorizedContent.map(v => v.verseKey));

            let startSurah = 1;
            let startVerse = 1;
            let foundGap = false;
            // Only search if we really need to (optimization)
            if (resetProgress || !user.hifzPlan?.cursors?.newMemorization) {
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
            }

            // --- 3. Manage Cursors ---
            let cursors = {
                newMemorization: { surah: startSurah, verse: startVerse },
                review: { surah: 1, page: 1 },
                recitation: { page: 1 }
            };

            // STRICT PRESERVATION vs RESET LOGIC
            if (user.hifzPlan && user.hifzPlan.cursors) {
                const oldCursors = user.hifzPlan.cursors;

                if (resetProgress) {
                    // RESET MODE: 
                    // 1. Maintain Hifz start position (from Gap Detection ideally, or manual)
                    if (!startSurah && oldCursors.newMemorization?.surah) {
                        cursors.newMemorization = { ...oldCursors.newMemorization };
                    }
                    // 2. FORCIBLY Reset Review and Recitation (already defaulted to 1 above)
                } else {
                    // UPDATE MODE: Intelligent Cursor Sync
                    // If memorized content exists, find the end of it and start there.
                    if (!memorizedContent && finalMemorizedContent && finalMemorizedContent.length > 0) {
                        try {
                            // Sort by Surah then Verse to find the absolute last point
                            const sorted = [...finalMemorizedContent].sort((a, b) => {
                                const [s1, v1] = a.verseKey.split(':').map(Number);
                                const [s2, v2] = b.verseKey.split(':').map(Number);
                                if (s1 !== s2) return s1 - s2;
                                return v1 - v2;
                            });

                            const lastVerseKey = sorted[sorted.length - 1].verseKey;
                            const [lastSurah, lastVerse] = lastVerseKey.split(':').map(Number);

                            // Determine next starting point
                            let nextSurah = lastSurah;
                            let nextVerse = lastVerse + 1;
                            const surahTotal = quranUtils.getSurahVerses(lastSurah) || 286;

                            if (nextVerse > surahTotal) {
                                nextSurah++;
                                nextVerse = 1;
                            }

                            if (nextSurah > 114) {
                                nextSurah = 114;
                                nextVerse = 6;
                            }

                            cursors.newMemorization = { surah: nextSurah, verse: nextVerse };

                        } catch (err) {
                            console.error('[HifzPlan] Error syncing cursor:', err);
                            if (oldCursors.newMemorization && oldCursors.newMemorization.surah) {
                                cursors.newMemorization = { ...oldCursors.newMemorization };
                            }
                        }
                    } else {
                        // Keep old cursors if provided or defaults
                        if (oldCursors.newMemorization) cursors.newMemorization = { ...oldCursors.newMemorization };
                        if (oldCursors.review) cursors.review = { ...oldCursors.review };
                        if (oldCursors.recitation) cursors.recitation = { ...oldCursors.recitation };
                    }
                }
            }

            // Verify cursor validity (fallback): If cursor points to a memorized verse, push it forward?
            // Skip for now to avoid "jumping" if the user wants to memorize it again.

            // --- 4. Construct Plan Object ---
            const newHifzPlan = {
                isSetupComplete: true,
                userLevel: userLevel || (user.hifzPlan ? user.hifzPlan.userLevel : 'beginner'),
                dailyCapacity: {
                    recitationType: dailyCapacity?.recitationType || user.hifzPlan?.dailyCapacity?.recitationType || 'page',
                    recitationAmount: dailyCapacity?.recitationAmount || user.hifzPlan?.dailyCapacity?.recitationAmount || 2,
                    newMemorization: dailyCapacity?.newMemorization || user.hifzPlan?.dailyCapacity?.newMemorization || 'verse',
                    memorizationAmount: dailyCapacity?.memorizationAmount || user.hifzPlan?.dailyCapacity?.memorizationAmount || 5, // Fix: Ensure strictly number? 
                    memorizationDays: dailyCapacity?.memorizationDays || user.hifzPlan?.dailyCapacity?.memorizationDays || 5,
                    reviewType: dailyCapacity?.reviewType || user.hifzPlan?.dailyCapacity?.reviewType || 'light',
                    reviewAmount: dailyCapacity?.reviewAmount || user.hifzPlan?.dailyCapacity?.reviewAmount || 1
                },
                memorizedContent: finalMemorizedContent,
                cursors: cursors,
                stats: {
                    totalVersesMemorized: totalVersesMemorized,
                    currentStreak: (user.hifzPlan && user.hifzPlan.stats) ? user.hifzPlan.stats.currentStreak : 0,
                    bestStreak: (user.hifzPlan && user.hifzPlan.stats) ? user.hifzPlan.stats.bestStreak : 0,
                    lastActiveDate: getTodayStr()
                }
            };

            // Ensure numbers for amounts
            newHifzPlan.dailyCapacity.memorizationAmount = Number(newHifzPlan.dailyCapacity.memorizationAmount) || 5;
            newHifzPlan.dailyCapacity.recitationAmount = Number(newHifzPlan.dailyCapacity.recitationAmount) || 2;
            newHifzPlan.dailyCapacity.reviewAmount = Number(newHifzPlan.dailyCapacity.reviewAmount) || 1;


            user.set('hifzPlan', newHifzPlan);

            // SYNC: Update mutabaa.plan
            if (!user.mutabaa) user.mutabaa = { plan: {}, dailyLog: [] };

            // If resetProgress is true, clear today's progress in mutabaa.dailyLog to start fresh
            // Label says "Reset Recitation and Review" -> Reset only those.
            if (resetProgress) {
                const today = getTodayStr();
                const logIdx = user.mutabaa.dailyLog.findIndex(l => l.date === today);
                if (logIdx !== -1) {
                    user.mutabaa.dailyLog[logIdx].tilawo = { status: 'pending', pagesCompleted: 0 };
                    // user.mutabaa.dailyLog[logIdx].hifz = ... preserved
                    user.mutabaa.dailyLog[logIdx].muraja = { status: 'pending', pagesCompleted: 0, versesCompleted: 0 };
                    user.mutabaa.dailyLog[logIdx].deepMuraja = { status: 'pending', pagesCompleted: 0 };
                    user.markModified('mutabaa.dailyLog');
                }

            }

            user.mutabaa.plan.hifzTarget = (newHifzPlan.dailyCapacity.newMemorization === 'verses') ? newHifzPlan.dailyCapacity.memorizationAmount : 1;
            user.mutabaa.plan.tilawoTarget = newHifzPlan.dailyCapacity.recitationAmount || 2;
            // FIX: murajaTarget (Consolidation) should be 1 if it exists, but deepMurajaTarget should follow the reviewAmount
            user.mutabaa.plan.murajaTarget = 1;
            user.mutabaa.plan.deepMurajaTarget = newHifzPlan.dailyCapacity.reviewAmount || 1;

            user.markModified('hifzPlan');
            user.markModified('mutabaa.plan');
            await user.save();

            res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح', plan: user.hifzPlan });
            return; // Success, exit loop

        } catch (err) {
            if (err.name === 'VersionError') {
                console.warn(`⚠️ [HifzPlan] VersionError in saveSetup. Retrying... (${retries})`);
                retries--;
                if (retries === 0) return res.status(409).json({ success: false, message: 'تضارب في البيانات، حاول مرة أخرى' });
                await new Promise(r => setTimeout(r, 100));
                continue;
            }
            console.error('[HifzPlan] saveSetup error:', err);
            return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        }
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

        // --- Stats & Timestamp Self-Healing ---
        const actualCount = (plan.memorizedContent || []).length;
        let needsSave = false;

        if (actualCount > 0 && (user.quranProgress?.versesMemorized === 0 || !user.quranProgress?.versesMemorized)) {
            // console.log(`[HifzPlan] SELF-HEALING: Recalculating stats for ${user.email}. Found ${actualCount} verses.`);
            if (!user.quranProgress) user.quranProgress = { totalPoints: 0, pagesRead: 0, versesMemorized: 0, pagesReviewed: 0, lastPage: 1, dailyStreak: 0 };
            user.quranProgress.versesMemorized = actualCount;
            // Only set points if they are completely missing
            if ((user.quranProgress.totalPoints || 0) === 0) {
                user.quranProgress.totalPoints = (actualCount * 5);
            }
            if (!plan.stats) plan.stats = { totalVersesMemorized: 0, currentStreak: 0 };
            plan.stats.totalVersesMemorized = actualCount;
            user.markModified('quranProgress');
            needsSave = true;
        }

        // --- Smart Point Correction ---
        // If points are disproportionately high compared to progress, reset to a sane estimate.
        // Formula: Verses*5 + PagesRead*10 + PagesReviewed*5 + some buffer
        const currentPoints = user.quranProgress?.totalPoints || 0;
        const progress = user.quranProgress || {};
        const estHifz = (progress.versesMemorized || 0) * 5;
        const estRead = (progress.pagesRead || 0) * 10;
        const estReview = (progress.pagesReviewed || 0) * 5;
        const saneMax = estHifz + estRead + estReview + 5000; // 5000 points buffer for streaks/bonuses

        if (currentPoints > saneMax && currentPoints > 20000) {
            // console.log(`[HifzPlan] POINT CORRECTION for ${user.email}: ${currentPoints} -> ${saneMax}`);
            if (user.quranProgress) {
                user.quranProgress.totalPoints = saneMax;
                user.markModified('quranProgress');
                needsSave = true;
            }
        }

        // Heal missing timestamps for legacy content to avoid errors, 
        // but set them to an OLD date so they don't push true recent wards out of the 7-ward window.
        let missingTimestamps = 0;
        const oldBaseDate = new Date("2020-01-01").getTime();
        (plan.memorizedContent || []).forEach((v, idx) => {
            if (!v.lastReviewed) {
                // Stagger by 1 hour to keep them as distinct 'historical' wards if ever needed
                v.lastReviewed = new Date(oldBaseDate + (idx * 3600 * 1000));
                missingTimestamps++;
            }
        });

        if (missingTimestamps > 0) {
            // console.log(`[HifzPlan] SELF-HEALING: Assigned legacy timestamps to ${missingTimestamps} verses for ${user.email}.`);
            user.markModified('hifzPlan');
            needsSave = true;
        }

        if (needsSave) await user.save();

        const cursors = plan.cursors || { newMemorization: { surah: 1, verse: 1 }, review: { surah: 1, page: 1 }, recitation: { page: 1 } };
        const todayLog = (user.mutabaa?.dailyLog || []).find(log => log.date === today);

        // 1️⃣ الحفظ الجديد (Aligned to Unit Boundaries)
        let hifzStartSurah = cursors.newMemorization.surah;
        let hifzStartVerse = cursors.newMemorization.verse;

        let amount = plan.dailyCapacity.newMemorization === 'verses' ? (plan.dailyCapacity.memorizationAmount || 5) : 1;
        let targetType = plan.dailyCapacity.newMemorization === 'verses' ? 'verses' : plan.dailyCapacity.newMemorization;
        let capTarget = null;

        if (plan.dailyCapacity.newMemorization === 'page' || plan.dailyCapacity.newMemorization === 'half_page') {
            if (plan.dailyCapacity.newMemorization === 'page') {
                const currentPage = quranUtils.getPageForVerse(hifzStartSurah, hifzStartVerse);
                capTarget = quranUtils.getLastVerseOfPage(currentPage);
                const start = quranUtils.getFirstVerseOfPage(currentPage);
                if (start) {
                    hifzStartSurah = start.surah;
                    hifzStartVerse = start.verse;
                }
            } else {
                capTarget = quranUtils.getHalfPageTarget(hifzStartSurah, hifzStartVerse);
                const start = quranUtils.getHalfPageStart(hifzStartSurah, hifzStartVerse);
                if (start) {
                    hifzStartSurah = start.surah;
                    hifzStartVerse = start.verse;
                }
            }

            if (capTarget) {
                amount = quranUtils.getVerseCountInRange(hifzStartSurah, hifzStartVerse, capTarget.surah, capTarget.verse);
            }
        }

        // Calculate end verse for display range
        let displayEndVerse = '';
        if (capTarget) {
            displayEndVerse = capTarget.verse;
        } else if (amount > 1) {
            // Logic to find end verse key if not explicit cap
            const rangeKeys = quranUtils.getVersesKeysInRange(hifzStartSurah, hifzStartVerse, amount);
            if (rangeKeys.length > 0) {
                const lastKey = rangeKeys[rangeKeys.length - 1];
                const [lS, lV] = lastKey.split(':').map(Number);
                if (lS === hifzStartSurah) {
                    displayEndVerse = lV;
                } else {
                    // If range crosses surah, maybe just show end verse? Or ignore complex label for now.
                    // User just wants "10 to 12".
                    displayEndVerse = lV;
                }
            }
        }

        const hifzLabel = (plan.dailyCapacity.newMemorization === 'page' ? 'حفظ صفحة كاملة: ' :
            (plan.dailyCapacity.newMemorization === 'half_page' ? 'حفظ نصف صفحة: ' : 'حفظ آيات: ')) +
            `${getSurahName(hifzStartSurah)} (${hifzStartVerse}${displayEndVerse ? ' إلى ' + displayEndVerse : ''})`;

        const hifzVersesKeys = quranUtils.getVersesKeysInRange(hifzStartSurah, hifzStartVerse, amount, capTarget);
        const memorizedKeys = new Set((plan.memorizedContent || []).map(v => v.verseKey));
        const amountDone = hifzVersesKeys.filter(k => memorizedKeys.has(k)).length;
        const hifzStatus = (amountDone >= amount && amount > 0) ? 'done' : 'pending';

        const newMemorization = {
            type: 'new_memorization',
            label: hifzLabel,
            target: targetType,
            unit: plan.dailyCapacity.newMemorization,
            surah: hifzStartSurah,
            verse: hifzStartVerse,
            amount: amount,
            verses: hifzVersesKeys,
            amountDone: amountDone,
            dailyAmountDone: todayLog?.hifz?.versesCompleted || 0,
            status: hifzStatus
        };

        // 2️⃣ التمكين (مراجعة آخر 7 أوراد/جلسات)
        const sortedMemorized = (plan.memorizedContent || [])
            .filter(v => v.lastReviewed)
            .sort((a, b) => new Date(b.lastReviewed) - new Date(a.lastReviewed));

        const wirds = [];
        if (sortedMemorized.length > 0) {
            let currentWird = [sortedMemorized[0]];
            for (let i = 1; i < sortedMemorized.length; i++) {
                const prevTime = new Date(sortedMemorized[i - 1].lastReviewed).getTime();
                const currTime = new Date(sortedMemorized[i].lastReviewed).getTime();

                // Group only if exactly the same timestamp (within a 5-second grace period)
                // This treats every distinct 'Save' action as a separate ward for consolidation.
                if (Math.abs(prevTime - currTime) <= 5 * 1000) {
                    currentWird.push(sortedMemorized[i]);
                } else {
                    wirds.push(currentWird);
                    currentWird = [sortedMemorized[i]];
                    if (wirds.length === 7) break;
                }
            }
            if (wirds.length < 7 && currentWird.length > 0) wirds.push(currentWird);
        }

        const recentContentRaw = [].concat(...wirds.slice(0, 7));
        let recentContent = recentContentRaw;

        // Ensure no gaps between consolidation and new hifz
        if (recentContentRaw.length > 0) {
            const sortedKeys = recentContentRaw.map(v => {
                const [s, a] = v.verseKey.split(':').map(Number);
                return { s, a };
            }).sort((a, b) => a.s !== b.s ? a.s - b.s : a.a - b.a);

            const firstV = sortedKeys[0];
            recentContent = plan.memorizedContent.filter(v => {
                const [s, a] = v.verseKey.split(':').map(Number);
                return (s > firstV.s || (s === firstV.s && a >= firstV.a));
            });
        }

        /*
        console.log(`[HifzPlan] Consolidation Audit for ${user.email}:`);
        console.log(`   - Total Verses with Timestamps: ${sortedMemorized.length}`);
        */
        /*
        console.log(`   - Detected Sessions (Wirds): ${wirds.length}`);
        wirds.forEach((w, idx) => {
            const startV = w[0].verseKey;
            const endV = w[w.length - 1].verseKey;
            const time = new Date(w[0].lastReviewed).toLocaleTimeString();
            console.log(`     #${idx + 1}: [${time}] Range: ${startV} to ${endV} (${w.length} verses)`);
        });
        */

        // Find Range for Label - Use ALL verses in the selected 7 wards
        let consolidationLabel = "تمكين الحفظ الجديد";
        let sortedKeys = [];
        if (recentContent.length > 0) {
            // Sort by Quran order (Surah index, Verse index) to find the absolute start and end
            sortedKeys = recentContent.map(v => {
                const [s, a] = v.verseKey.split(':').map(Number);
                return { s, a, key: v.verseKey };
            }).sort((a, b) => a.s !== b.s ? a.s - b.s : a.a - b.a);

            const startV = sortedKeys[0];
            const endV = sortedKeys[sortedKeys.length - 1];
            const wirdCountLabel = wirds.length > 0 ? ` (آخر ${wirds.length} أوراد)` : '';

            if (startV.s === endV.s) {
                consolidationLabel = `تمكين الحفظ الجديد${wirdCountLabel}: ${getSurahName(startV.s)} (${startV.a} إلى ${endV.a})`;
            } else {
                consolidationLabel = `تمكين الحفظ الجديد${wirdCountLabel}: ${getSurahName(startV.s)} (${startV.a}) إلى ${getSurahName(endV.s)} (${endV.a})`;
            }
        }

        const consolidationAmount = recentContent.length;
        const consolidationDone = todayLog?.muraja?.versesCompleted || 0;
        // Independent status based on actual verses done today
        const consolidationStatus = (consolidationAmount === 0 || consolidationDone >= consolidationAmount) ? 'done' : 'pending';

        // console.log(`[HifzPlan] Consolidation Task: amount=${consolidationAmount}, done=${consolidationDone}, status=${consolidationStatus}`);

        const consolidation = {
            type: 'consolidation',
            label: consolidationLabel,
            unit: 'verses',
            target: 'verses',
            amount: consolidationAmount,
            surah: sortedKeys.length > 0 ? sortedKeys[0].s : 0,
            verses: recentContent.map(v => v.verseKey),
            amountDone: consolidationDone,
            dailyAmountDone: todayLog?.muraja?.versesCompleted || 0,
            status: consolidationStatus
        };

        // 3️⃣ المراجعة البعيدة (Page/Juz based)
        const reviewStartPage = cursors.review.page;
        const reviewType = plan.dailyCapacity.reviewType || 'daily';
        const reviewAmount = plan.dailyCapacity.reviewAmount || 1;

        let reviewLabel = "";
        let revisionAmountDone = 0;
        const rawPagesDone = todayLog?.deepMuraja?.pagesCompleted || 0;

        if (reviewType === 'weekly') {
            const startJuz = quranUtils.getJuzForPage(reviewStartPage);
            if (reviewAmount === 1) {
                reviewLabel = `مراجعة الماضي: الجزء ${startJuz} كاملاً`;
            } else {
                reviewLabel = `مراجعة الماضي: من الجزء ${startJuz} إلى الجزء ${startJuz + reviewAmount - 1}`;
            }
            const totalPagesInJuz = quranUtils.getPagesCountInJuz(startJuz);
            revisionAmountDone = rawPagesDone / totalPagesInJuz;
        } else {
            reviewLabel = `مراجعة الماضي: ${quranUtils.getSurahAndJuzLabel(reviewStartPage)}`;
            if (reviewAmount > 1) {
                const endPage = (reviewStartPage + reviewAmount - 1) > 604 ? 604 : (reviewStartPage + reviewAmount - 1);
                reviewLabel = `مراجعة الماضي: ${quranUtils.getSurahAndJuzLabel(reviewStartPage)} إلى صفحة ${endPage}`;
            }
            revisionAmountDone = rawPagesDone;
        }

        const revision = {
            type: 'revision',
            label: reviewLabel,
            unit: reviewType === 'weekly' ? 'juz' : 'page',
            target: reviewType === 'weekly' ? 'juz' : 'page',
            amount: reviewAmount,
            startPage: reviewStartPage,
            amountDone: revisionAmountDone,
            dailyAmountDone: rawPagesDone,
            status: (todayLog?.deepMuraja?.status === 'done' && rawPagesDone < (reviewType === 'weekly' ? 1 : reviewAmount)) ? 'pending' : (todayLog?.deepMuraja?.status || 'pending')
        };

        // 4️⃣ ورد التلاوة
        const recitationStart = cursors.recitation.page;
        const recitationAmount = plan.dailyCapacity.recitationAmount || 2;
        let recitationAmountDone = todayLog?.tilawo?.pagesCompleted || 0;

        const recitation = {
            type: 'recitation',
            label: `تلاوة صفحة ${recitationStart} إلى ${recitationStart + recitationAmount - 1}`,
            amount: recitationAmount,
            unit: 'page',
            target: 'page',
            startPage: recitationStart,
            amountDone: recitationAmountDone,
            dailyAmountDone: todayLog?.tilawo?.pagesCompleted || 0,
            status: todayLog?.tilawo?.status || 'pending'
        };

        // Stats and Estimated Completion Date
        const totalVerses = 6236;
        const currentMemorized = user.quranProgress?.versesMemorized || plan.stats?.totalVersesMemorized || 0;
        const remaining = totalVerses - currentMemorized;
        const currentPercentage = ((currentMemorized / totalVerses) * 100).toFixed(1);

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

        // --- Precise Page Calculation ---
        let totalPagesFractional = 0;
        if (plan.memorizedContent && plan.memorizedContent.length > 0) {
            let traceCount = 0;
            // Group verses by page to minimize lookups if needed, or iterate directly
            plan.memorizedContent.forEach(v => {
                const [s, a] = v.verseKey.split(':').map(Number);
                const page = quranUtils.getPageForVerse(s, a);
                if (page) {
                    const versesOnPage = quranUtils.getVersesCountOnPage(page);
                    if (versesOnPage > 0) {
                        totalPagesFractional += (1 / versesOnPage);
                    }
                }
                traceCount++;
            });
        }
        const totalPagesMemorized = parseFloat(totalPagesFractional.toFixed(1));

        const stats = {
            totalVersesMemorized: currentMemorized,
            totalPagesMemorized: totalPagesMemorized, // Precise pages
            percentage: currentPercentage,
            remainingVerses: remaining,
            remainingPages: parseFloat((604 - totalPagesMemorized).toFixed(1)),
            completionDate: completionDate.toISOString().split('T')[0]
        };

        res.json({
            success: true,
            date: today,
            tasks: [newMemorization, consolidation, revision, recitation],
            streak: plan.stats?.currentStreak || 0,
            stats, // This already contains totalVersesMemorized and percentage
            quranProgress: user.quranProgress
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
