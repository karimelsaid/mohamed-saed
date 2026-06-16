import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MutabaaService } from './mutabaa.service';

export interface DailyCapacity {
    recitationType: 'page' | 'half_hizb' | 'hizb' | 'juz';
    recitationAmount: number;
    newMemorization: 'verse' | 'half_page' | 'page' | 'verses';
    memorizationAmount?: number;
    memorizationDays: number;
    reviewType: 'light' | 'weekly' | 'rescue';
    reviewAmount?: number;
    // Weekday selection (0=Sat, 6=Fri)
    tilawaDays?: number[];
    hifzDays?: number[];
    murajaDays?: number[];
    rabtDays?: number[];
}

export interface MemorizedVerse {
    verseKey: string;
    strength: 'strong' | 'medium' | 'weak' | 'rescue';
    lastReviewed?: Date;
    nextReview?: Date;
    reviewCount?: number;
}

export interface HifzPlan {
    isSetupComplete: boolean;
    userLevel: 'beginner' | 'intermediate' | 'advanced';
    dailyCapacity: DailyCapacity;
    memorizedContent: MemorizedVerse[];
    wardHistory?: string[][];
    currentPosition: { surah: number; verse: number };
    stats: {
        totalVersesMemorized: number;
        percentage: number;
        currentStreak: number;
        bestStreak: number;
        lastActiveDate: string;
        lastReadPage?: number;
        lastDeepRevisionPage?: number;
        remainingVerses?: number;
        completionDate?: string;
        unlinkedWardsCount?: number;
    };
    reminders?: {
        recitation: { enabled: boolean; time: string };
        memorization: { enabled: boolean; time: string };
        revision: { enabled: boolean; time: string };
        kahfFriday?: { enabled: boolean; time: string };
        bedtimeMulkSajda?: { enabled: boolean; time: string };
    };
}

export interface DailyTask {
    type: 'new_memorization' | 'consolidation' | 'recitation' | 'revision';
    label: string;
    status: 'pending' | 'done' | 'postponed';
    target?: string;
    position?: { surah: number; verse: number };
    surah?: number;
    verse?: number;
    verses?: string[];
    amount?: number;
    amountDone?: number;
    unit?: string;
    resolvedPage?: number;
    resolvedVerseKey?: string;
    startPage?: number;
    page?: number;
}

@Injectable({
    providedIn: 'root'
})
export class HifzPlanService {
    private readonly STORAGE_KEY = 'guest_hifz_plan';

    constructor(private mutabaaService: MutabaaService) { }

    /**
     * الحصول على حالة الخطة
     */
    getPlan(): Observable<{ success: boolean; isSetupComplete: boolean; plan: HifzPlan }> {
        const localPlan = localStorage.getItem(this.STORAGE_KEY);
        if (localPlan) {
            const plan = JSON.parse(localPlan);
            return of({ success: true, isSetupComplete: plan.isSetupComplete, plan });
        }
        return of({ success: true, isSetupComplete: false, plan: this.getDefaultPlan() });
    }

    private getDefaultPlan(): HifzPlan {
        return {
            isSetupComplete: false,
            userLevel: 'beginner',
            dailyCapacity: {
                recitationType: 'page',
                recitationAmount: 1,
                newMemorization: 'verse',
                memorizationDays: 5,
                reviewType: 'light'
            },
            memorizedContent: [],
            wardHistory: [],
            currentPosition: { surah: 1, verse: 1 },
            stats: {
                totalVersesMemorized: 0,
                percentage: 0,
                currentStreak: 0,
                bestStreak: 0,
                lastActiveDate: new Date().toISOString(),
                lastReadPage: 0,
                lastDeepRevisionPage: 0,
                unlinkedWardsCount: 0
            }
        };
    }

    /**
     * حفظ إعدادات المعالج
     */
    saveSetup(data: {
        userLevel: string;
        dailyCapacity: DailyCapacity;
        memorizedContent?: MemorizedVerse[];
        totalVersesMemorized?: number;
        resetProgress?: boolean;
        currentPosition?: { surah: number; verse: number };
        customLastReadPage?: number;
        customLastDeepRevisionPage?: number;
    }): Observable<{ success: boolean; message: string; plan: HifzPlan }> {
        const existingPlanStr = localStorage.getItem(this.STORAGE_KEY);
        const existingPlan: HifzPlan | null = existingPlanStr ? JSON.parse(existingPlanStr) : null;

        // Determine if we should preserve or reset history
        const shouldReset = !!data.resetProgress;

        const stats = (shouldReset) ? this.getDefaultPlan().stats : {
            ...this.getDefaultPlan().stats,
            ...(existingPlan?.stats || {}),
        };

        const memorizedContent = (data.memorizedContent !== undefined) ? data.memorizedContent :
            (shouldReset ? [] : (existingPlan?.memorizedContent || []));

        const wardHistory = shouldReset ? [] : (existingPlan?.wardHistory || []);

        const plan: HifzPlan = {
            ...this.getDefaultPlan(),
            ...data,
            isSetupComplete: true,
            userLevel: data.userLevel as any,
            memorizedContent, // Use the resolved content
            wardHistory,
            currentPosition: data.currentPosition || (shouldReset ? { surah: 1, verse: 1 } : (existingPlan?.currentPosition || { surah: 1, verse: 1 })),
            stats: {
                ...stats,
                totalVersesMemorized: data.totalVersesMemorized !== undefined ? data.totalVersesMemorized : (memorizedContent.length || 0),
                remainingVerses: 6236 - (data.totalVersesMemorized !== undefined ? data.totalVersesMemorized : (memorizedContent.length || 0)),
                percentage: Math.round(((data.totalVersesMemorized !== undefined ? data.totalVersesMemorized : (memorizedContent.length || 0)) / 6236) * 100),
                lastActiveDate: new Date().toISOString(),
                lastReadPage: data.customLastReadPage !== undefined ? data.customLastReadPage : (shouldReset ? 0 : (existingPlan?.stats?.lastReadPage || 0)),
                lastDeepRevisionPage: data.customLastDeepRevisionPage !== undefined ? data.customLastDeepRevisionPage : (shouldReset ? 0 : (existingPlan?.stats?.lastDeepRevisionPage || 0)),
                completionDate: this.calculateCompletionDate(data.dailyCapacity, 6236 - (data.totalVersesMemorized !== undefined ? data.totalVersesMemorized : (memorizedContent.length || 0)))
            }
        } as any;

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(plan));

        // RESET: Always clear today's progress log when the plan is modified/reset
        // to prevent stale task statuses (like Al-Rabt) from appearing prematurely.
        this.mutabaaService.resetTodayLog();
        if (shouldReset) {
            this.mutabaaService.resetCursors();
        }

        return of({ success: true, message: 'تم حفظ الإعدادات محلياً', plan });
    }

    /**
     * الحصول على مهام اليوم
     */
    getDailyTasks(): Observable<{ success: boolean; date: string; tasks: DailyTask[]; streak: number; stats?: any; needsSetup?: boolean }> {
        const localPlanStr = localStorage.getItem(this.STORAGE_KEY);
        if (!localPlanStr) {
            return of({ success: true, date: new Date().toISOString(), tasks: [], streak: 0, needsSetup: true });
        }
        const localPlan: HifzPlan = JSON.parse(localPlanStr);
        return of({
            success: true,
            date: new Date().toISOString(),
            tasks: this.generateGuestTasks(localPlan),
            streak: localPlan.stats.currentStreak,
            stats: localPlan.stats
        });
    }

    private generateGuestTasks(plan: HifzPlan): DailyTask[] {
        const mutabaaData = this.mutabaaService.checkAndResetTodayLog();
        let todayLog: any = null;
        if (mutabaaData) {
            todayLog = mutabaaData.todayLog;
        }

        // Get today's weekday index (0=Sat, 6=Fri based on Arabic week)
        const jsDay = new Date().getDay(); // JS: 0=Sun, 6=Sat
        const todayIndex = jsDay === 0 ? 1 : jsDay === 6 ? 0 : jsDay + 1; // Convert to Arabic week
        // Correction: Arabic week: Sat=0, Sun=1, Mon=2, ...Fri=6
        // JS: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
        // Map: Sat(JS6)->0, Sun(JS0)->1, Mon(JS1)->2, ..., Fri(JS5)->6
        const arabicDayIndex = jsDay === 6 ? 0 : jsDay + 1;

        const recitationAmount = plan.dailyCapacity.recitationAmount;
        const recitationUnit = plan.dailyCapacity.recitationType;
        const lastRead = plan.stats.lastReadPage || 0;
        const pagesDoneToday = todayLog?.tilawo?.pagesCompleted || 0;
        const tilawaStatus = todayLog?.tilawo?.status || 'pending';

        const nextStart = ((lastRead + 1 - 1) % 604) + 1;
        const currentPage = todayLog?.tilawo?.page || 0;
        const inProgressPage = pagesDoneToday > 0 ? (((currentPage > 0 ? currentPage : nextStart + pagesDoneToday - 1) % 604) + 1) : nextStart;
        const displayStart = (tilawaStatus === 'done') ? nextStart : inProgressPage;

        const hifzDisplayAmount = (plan.dailyCapacity.newMemorization === 'verse' ? 1 : (plan.dailyCapacity.memorizationAmount || 1));

        const tasks: DailyTask[] = [];

        // Debug: Log weekday filtering
        console.log(`[HifzPlan] Today's JS day: ${jsDay}, Arabic day index: ${arabicDayIndex}`);
        console.log(`[HifzPlan] Tilawa days from plan:`, plan.dailyCapacity.tilawaDays);
        console.log(`[HifzPlan] Hifz days from plan:`, plan.dailyCapacity.hifzDays);

        // Check if today is a day for Tilawa (ensure number comparison)
        const tilawaDays = (plan.dailyCapacity.tilawaDays ?? [0, 1, 2, 3, 4, 5, 6]).map(Number);
        if (tilawaDays.includes(arabicDayIndex)) {
            tasks.push({
                type: 'recitation',
                label: `ورد التلاوة: ${recitationAmount} ${this.getUnitLabel(recitationUnit)} (البداية من ص ${displayStart})`,
                status: todayLog?.tilawo?.status || 'pending',
                amount: recitationAmount,
                unit: recitationUnit,
                amountDone: pagesDoneToday,
                page: displayStart,
                startPage: displayStart
            });
        }

        // Check if today is a day for Hifz (ensure number comparison)
        const hifzDays = (plan.dailyCapacity.hifzDays ?? [0, 1, 2, 3, 4, 5, 6]).map(Number);
        const totalMemorized = plan.memorizedContent?.length || 0;
        const isQuranComplete = totalMemorized >= 6236;

        if (hifzDays.includes(arabicDayIndex)) {
            tasks.push({
                type: 'new_memorization',
                label: isQuranComplete ? 'تهانينا! تم ختم حفظ القرآن الكريم' : `حفظ جديد: ${hifzDisplayAmount} ${this.getUnitLabel(plan.dailyCapacity.newMemorization)}`,
                status: todayLog?.hifz?.status || 'pending',
                amount: hifzDisplayAmount,
                unit: plan.dailyCapacity.newMemorization,
                amountDone: todayLog?.hifz?.versesCompleted || 0,
                surah: isQuranComplete ? undefined : plan.currentPosition.surah,
                verse: isQuranComplete ? undefined : plan.currentPosition.verse,
                position: isQuranComplete ? undefined : plan.currentPosition
            });
        }

        const memoUnit = plan.dailyCapacity.newMemorization || 'page';
        const memoAmount = plan.dailyCapacity.memorizationAmount || 1;
        const historyCount = plan.memorizedContent?.length || 0;

        const wardHistory = plan.wardHistory || [];
        // Removed duplicate totalMemorized declaration

        // "Al-Rabt" (Linking) always appears on Hifz days to show progress,
        // but remains LOCKED until 7 new wards are accumulated.
        const showRabtCard = hifzDays.includes(arabicDayIndex);

        if (showRabtCard) {
            const unlinkedCount = plan.stats.unlinkedWardsCount || 0;
            const targetCount = 7;
            const isLocked = unlinkedCount < targetCount;

            // 1. Calculate the ideal review size (today + 6 past)
            const wardSizeEstimate = (memoUnit === 'verses' || memoUnit === 'verse') ? memoAmount : (memoUnit === 'half_page' ? 8 : 15) * memoAmount;

            // 2. Extract real history (Target = 7 wards total: Today + 6 past)
            const isTodayHifzDone = todayLog?.hifz?.status === 'done';

            // RABT LOGIC FIX: Strict 7-Wird limits
            // If Hifz is done today, we include today's wird, so look back 6 more (Total 7)
            // If Hifz NOT done, we look back 6 (Total 6 prior), plus today's slot implicitly pending? 
            // Actually, the windowSize calc below (7 or 6) effectively manages the *scope*.
            const windowSize = isTodayHifzDone ? 7 : 6;
            let historyVerses = wardHistory.slice(-windowSize).flat();

            // SMART BOOTSTRAP: If explicit history is empty but we have memorized content, 
            // synthesize the link verses from the last memorized parts.
            if (historyVerses.length === 0 && totalMemorized > 0) {
                // We take roughly 7 "ward-sized" chunks.
                const chunkSize = (memoUnit === 'page' ? 15 : (memoUnit === 'half_page' ? 8 : memoAmount)) || 15;
                const lookbackCount = isTodayHifzDone ? 7 : 6;
                const vKeys = plan.memorizedContent.slice(-chunkSize * lookbackCount).map(m => m.verseKey);
                historyVerses = vKeys;
                console.log(`🚀 [HifzPlan] Bootstrapped Rabt history with ${historyVerses.length} verses from memorized content.`);
            }

            const rabtTotalVerses = historyVerses.length + (isTodayHifzDone ? 0 : wardSizeEstimate);

            const firstVerseKey = historyVerses.length > 0 ? historyVerses[0] : null;
            let rabtSurah = 0;
            let rabtVerse = 0;
            if (firstVerseKey) {
                const parts = firstVerseKey.split(':');
                rabtSurah = parseInt(parts[0]);
                rabtVerse = parseInt(parts[1]);
            }

            // CHECK DONE STATUS
            const isRabtDone = todayLog?.rabt?.status === 'done';

            // STRICT CAP: If done, force amountDone to equal amount to prevent "Sabiq"
            // This ensures the card "closes" (visual completion) without implied extra credit.
            const effectiveAmountDone = isRabtDone ? rabtTotalVerses : (todayLog?.rabt?.versesCompleted || 0);

            tasks.push({
                type: 'consolidation' as any,
                label: `الربط: السبع أوراد الأخيرة (${rabtTotalVerses} آية في ${windowSize + (isTodayHifzDone ? 0 : 1)} أوراد)`,
                status: todayLog?.rabt?.status || 'pending',
                amount: rabtTotalVerses,
                unit: 'verses',
                amountDone: effectiveAmountDone,
                isRabt: true,
                lookBackUnits: windowSize,
                wardCount: windowSize + (isTodayHifzDone ? 0 : 1),
                surah: rabtSurah || plan.currentPosition.surah,
                verse: rabtVerse || plan.currentPosition.verse,
                verses: historyVerses,
                includeCurrentWard: !isTodayHifzDone,
                disableSabiq: true, // Custom hint for future UI updates if needed
                isLocked: isLocked, // HTML will use this to show overlay
                currentCount: unlinkedCount,
                targetCount: targetCount
            } as any);
        }

        // --- Revision Task (Muraaja) ---
        // Only show if today is a day for Muraja AND there is history (ensure number comparison)
        const murajaDays = (plan.dailyCapacity.murajaDays ?? [0, 1, 2, 3, 4, 5, 6]).map(Number);
        if (historyCount > 0 && murajaDays.includes(arabicDayIndex)) {
            const lastDeep = plan.stats.lastDeepRevisionPage || 0;
            const reviewAmount = plan.dailyCapacity.reviewAmount || 1;
            const reviewUnit = plan.dailyCapacity.reviewType === 'light' ? 'page' : 'juz';

            let nextDeepStart = lastDeep + 1; // Advance to next page as fallback
            if (nextDeepStart > 604) nextDeepStart = 1;

            const revisionLabel = showRabtCard ? 'مراجعة الماضي البعيد' : 'مراجعة الماضي';

            tasks.push({
                type: 'revision' as any,
                label: `${revisionLabel}: ${reviewAmount} ${this.getUnitLabel(reviewUnit)} (البداية ص ${nextDeepStart})`,
                status: todayLog?.deepMuraja?.status || 'pending',
                amount: reviewAmount,
                unit: reviewUnit,
                amountDone: todayLog?.deepMuraja?.pagesCompleted || todayLog?.deepMuraja?.amountDone || 0,
                page: nextDeepStart,
                startPage: nextDeepStart
            } as any);
        }

        return tasks;
    }

    private getUnitLabel(unit: string): string {
        switch (unit) {
            case 'page': return 'صفحة';
            case 'verse': return 'آية';
            case 'verses': return 'آيات';
            case 'half_page': return 'نصف صفحة';
            case 'juz': return 'جزء';
            case 'hizb': return 'حزب';
            case 'half_hizb': return 'نصف حزب';
            default: return unit;
        }
    }


    /**
     * تحديث حالة ذاكرة آية
     */
    updateVerseStrength(verseKey: string, wasCorrect?: boolean, strength?: string): Observable<{ success: boolean }> {
        const localPlanStr = localStorage.getItem(this.STORAGE_KEY);
        if (localPlanStr) {
            const plan: HifzPlan = JSON.parse(localPlanStr);
            const idx = plan.memorizedContent.findIndex(v => v.verseKey === verseKey);
            if (idx > -1) {
                if (strength) plan.memorizedContent[idx].strength = strength as any;
                plan.memorizedContent[idx].lastReviewed = new Date();
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(plan));
            }
        }
        return of({ success: true });
    }

    /**
     * تقليل الحمل اليومي
     */
    reduceLoad(taskType: string): Observable<{ success: boolean; message: string; plan: HifzPlan }> {
        const localPlanStr = localStorage.getItem(this.STORAGE_KEY);
        if (localPlanStr) {
            const plan: HifzPlan = JSON.parse(localPlanStr);
            if (taskType === 'recitation' && plan.dailyCapacity.recitationAmount > 1) {
                plan.dailyCapacity.recitationAmount--;
            } else if (taskType === 'memorization' && plan.dailyCapacity.memorizationAmount && plan.dailyCapacity.memorizationAmount > 1) {
                plan.dailyCapacity.memorizationAmount--;
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(plan));
            return of({ success: true, message: 'تم تقليل الحمل بنجاح', plan });
        }
        return of({ success: false, message: 'لا توجد خطة نشطة', plan: this.getDefaultPlan() });
    }

    /**
     * حفظ إعدادات التنبيهات
     */
    saveReminders(reminders: any): Observable<{ success: boolean; message: string; reminders: any }> {
        const localPlanStr = localStorage.getItem(this.STORAGE_KEY);
        if (localPlanStr) {
            const plan = JSON.parse(localPlanStr);
            plan.reminders = reminders;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(plan));
        }
        return of({ success: true, message: 'تم حفظ التنبيهات محلياً', reminders });
    }

    private calculateCompletionDate(capacity: DailyCapacity, remainingVerses: number): string | null {
        if (remainingVerses <= 0) return new Date().toISOString();

        const unit = capacity.newMemorization;
        const amount = capacity.memorizationAmount || 1;
        let daysPerWeek = 5;
        if (capacity.hifzDays && Array.isArray(capacity.hifzDays)) {
            daysPerWeek = capacity.hifzDays.length;
        } else if (typeof capacity.memorizationDays === 'number') {
            daysPerWeek = capacity.memorizationDays;
        }

        if (daysPerWeek === 0) return ''; // No active days

        // Estimate daily verses
        let dailyVerses = 0;
        if (unit === 'verse' || unit === 'verses') {
            dailyVerses = amount;
        } else if (unit === 'half_page') {
            dailyVerses = amount * 8; // Avg verses per half page
        } else if (unit === 'page') {
            dailyVerses = amount * 15; // Avg verses per page
        } else {
            dailyVerses = amount * 15; // Default fallback
        }

        if (dailyVerses <= 0) return '';

        const weeklyVerses = dailyVerses * daysPerWeek;
        const weeksNeeded = remainingVerses / weeklyVerses;
        const daysNeeded = weeksNeeded * 7;

        if (remainingVerses <= 0) return null;

        const completionDate = new Date();
        completionDate.setDate(completionDate.getDate() + Math.ceil(daysNeeded));

        return completionDate.toISOString();
    }

    /**
     * تسجيل النشاط اليومي (لزيادة العداد بمجرد الدخول)
     */
    recordDailyActivity(): Observable<{ success: boolean; streak: number; increased: boolean }> {
        const localPlanStr = localStorage.getItem(this.STORAGE_KEY);
        if (!localPlanStr) return of({ success: false, streak: 0, increased: false });

        const plan: HifzPlan = JSON.parse(localPlanStr);
        const today = new Date().toISOString().split('T')[0];
        const lastActive = plan.stats.lastActiveDate ? plan.stats.lastActiveDate.split('T')[0] : '';

        let increased = false;

        // If last active was BEFORE today (i.e. yesterday or earlier), we update streak
        if (lastActive !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (lastActive === yesterdayStr) {
                // Consecutive day
                plan.stats.currentStreak = (plan.stats.currentStreak || 0) + 1;
                increased = true;
            } else {
                // Streak broken or first day
                plan.stats.currentStreak = 1;
                increased = true; // Still considered an increase/activation
            }

            if (plan.stats.currentStreak > (plan.stats.bestStreak || 0)) {
                plan.stats.bestStreak = plan.stats.currentStreak;
            }

            plan.stats.lastActiveDate = new Date().toISOString();
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(plan));
        }

        return of({ success: true, streak: plan.stats.currentStreak, increased });
    }

    /**
     * Static verse counts for all 114 surahs of the Quran
     */
    private static readonly SURAH_VERSE_COUNTS: number[] = [
        7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
        111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73,
        54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60,
        49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
        44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19,
        26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3,
        6, 3, 5, 4, 5, 6
    ];

    /**
     * البحث عن أول آية غير محفوظة مع دعم الالتفاف (Wrap-Around)
     * @param currentSurah - رقم السورة الحالية (1-114)
     * @param currentVerse - رقم الآية الحالية
     * @param memorizedKeys - مجموعة مفاتيح الآيات المحفوظة (Set)
     * @returns الموضع الجديد {surah, verse} أو null إذا كل القرآن محفوظ
     */
    static getNextUnmemorizedVerse(
        currentSurah: number,
        currentVerse: number,
        memorizedKeys: Set<string>
    ): { surah: number; verse: number } | null {
        const totalSurahs = 114;

        // البحث من الموضع الحالي + 1 حتى نهاية القرآن، ثم من البداية
        let searchVerse = currentVerse + 1;
        let searchSurah = currentSurah;

        // التحقق من تجاوز عدد آيات السورة الحالية
        if (searchVerse > HifzPlanService.SURAH_VERSE_COUNTS[searchSurah - 1]) {
            searchSurah++;
            searchVerse = 1;
        }

        // البحث في المصحف كله (دورة كاملة)
        for (let loopCount = 0; loopCount < totalSurahs + 1; loopCount++) {
            // الالتفاف بعد سورة 114
            if (searchSurah > totalSurahs) {
                searchSurah = 1;
                searchVerse = 1;
            }

            const surahVerseCount = HifzPlanService.SURAH_VERSE_COUNTS[searchSurah - 1];

            // البحث في آيات السورة الحالية
            for (let v = searchVerse; v <= surahVerseCount; v++) {
                const verseKey = `${searchSurah}:${v}`;
                if (!memorizedKeys.has(verseKey)) {
                    console.log(`🔍 [HifzPlan] Next unmemorized verse found: ${verseKey}`);
                    return { surah: searchSurah, verse: v };
                }
            }

            // الانتقال للسورة التالية
            searchSurah++;
            searchVerse = 1;

            // التحقق من العودة للموضع الأصلي (دورة كاملة بدون نتيجة)
            if (searchSurah === currentSurah) {
                // بحث أخير في السورة الأصلية من بدايتها حتى الآية الأصلية
                for (let v = 1; v <= currentVerse; v++) {
                    const verseKey = `${searchSurah}:${v}`;
                    if (!memorizedKeys.has(verseKey)) {
                        console.log(`🔍 [HifzPlan] Next unmemorized verse found (wrapped): ${verseKey}`);
                        return { surah: searchSurah, verse: v };
                    }
                }
                break;
            }
        }

        // كل القرآن محفوظ!
        console.log('🎉 [HifzPlan] All Quran verses are memorized!');
        return null;
    }
}

