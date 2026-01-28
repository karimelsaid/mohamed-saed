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
                lastReadPage: shouldReset ? 0 : (existingPlan?.stats?.lastReadPage || 0),
                lastDeepRevisionPage: shouldReset ? 0 : (existingPlan?.stats?.lastDeepRevisionPage || 0)
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
        const mutabaaDataStr = localStorage.getItem('guest_mutabaa_data');
        let todayLog: any = null;
        if (mutabaaDataStr) {
            todayLog = JSON.parse(mutabaaDataStr).todayLog;
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

        let nextStart = lastRead + 1;
        if (nextStart > 604) nextStart = (nextStart % 604) || 1;

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
                label: `ورد التلاوة: ${recitationAmount} ${this.getUnitLabel(recitationUnit)} (البداية من ص ${nextStart})`,
                status: todayLog?.tilawo?.status || 'pending',
                amount: recitationAmount,
                unit: recitationUnit,
                amountDone: pagesDoneToday,
                page: nextStart,
                startPage: nextStart
            });
        }

        // Check if today is a day for Hifz (ensure number comparison)
        const hifzDays = (plan.dailyCapacity.hifzDays ?? [0, 1, 2, 3, 4, 5, 6]).map(Number);
        if (hifzDays.includes(arabicDayIndex)) {
            tasks.push({
                type: 'new_memorization',
                label: `حفظ جديد: ${hifzDisplayAmount} ${this.getUnitLabel(plan.dailyCapacity.newMemorization)}`,
                status: todayLog?.hifz?.status || 'pending',
                amount: hifzDisplayAmount,
                unit: plan.dailyCapacity.newMemorization,
                amountDone: todayLog?.hifz?.versesCompleted || 0,
                surah: plan.currentPosition.surah,
                verse: plan.currentPosition.verse,
                position: plan.currentPosition
            });
        }

        const memoUnit = plan.dailyCapacity.newMemorization || 'page';
        const memoAmount = plan.dailyCapacity.memorizationAmount || 1;
        const historyCount = plan.memorizedContent?.length || 0;

        const wardHistory = plan.wardHistory || [];
        const totalMemorized = plan.memorizedContent?.length || 0;

        // "Al-Rabt" (Linking) activates if we have at least 5 prior wards in history,
        // OR if the user has substantial memorized content (e.g. > 50 verses) even with empty history.
        // This ensures experienced users jumping in get Rabt immediately.
        // Additionally, Rabt only shows on the same days as Hifz (new memorization)
        const isRabtActive = (wardHistory.length >= 5 || totalMemorized >= 50) && hifzDays.includes(arabicDayIndex);

        // "Al-Rabt" (Linking) only activates if we have at least 6 prior wards to link with today's (total 7).
        if (isRabtActive) {
            // 1. Calculate the ideal review size (today + 6 past)
            const wardSizeEstimate = (memoUnit === 'verses' || memoUnit === 'verse') ? memoAmount : (memoUnit === 'half_page' ? 8 : 15) * memoAmount;

            // 2. Extract real history (Target = 7 wards total: Today + 6 past)
            const isTodayHifzDone = todayLog?.hifz?.status === 'done';
            const windowSize = isTodayHifzDone ? 7 : 6;
            let historyVerses = wardHistory.slice(-windowSize).flat();

            // SMART BOOTSTRAP: If explicit history is empty but we have memorized content, 
            // synthesize the link verses from the last memorized parts.
            if (historyVerses.length === 0 && totalMemorized > 0) {
                // We take roughly 7 "ward-sized" chunks.
                // Estimating chunk size from today's target or default 15 verses.
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

            tasks.push({
                type: 'consolidation' as any,
                label: `الربط: السبع أوراد الأخيرة (${rabtTotalVerses} آية في ${windowSize + (isTodayHifzDone ? 0 : 1)} أوراد)`,
                status: todayLog?.rabt?.status || 'pending',
                amount: rabtTotalVerses,
                unit: 'verses',
                amountDone: todayLog?.rabt?.versesCompleted || 0,
                isRabt: true,
                lookBackUnits: windowSize,
                wardCount: windowSize + (isTodayHifzDone ? 0 : 1),
                surah: rabtSurah || plan.currentPosition.surah,
                verse: rabtVerse || plan.currentPosition.verse,
                verses: historyVerses,
                includeCurrentWard: !isTodayHifzDone
            } as any);
        }

        // --- Revision Task (Muraaja) ---
        // Only show if today is a day for Muraja AND there is history (ensure number comparison)
        const murajaDays = (plan.dailyCapacity.murajaDays ?? [0, 1, 2, 3, 4, 5, 6]).map(Number);
        if (historyCount > 0 && murajaDays.includes(arabicDayIndex)) {
            const lastDeep = plan.stats.lastDeepRevisionPage || 0;
            const reviewAmount = plan.dailyCapacity.reviewAmount || 1;
            let nextDeepStart = lastDeep + 1; // Advance to next page 
            if (nextDeepStart > 604) nextDeepStart = 1;

            const revisionLabel = isRabtActive ? 'مراجعة الماضي البعيد' : 'مراجعة الماضي';

            tasks.push({
                type: 'revision' as any,
                label: `${revisionLabel}: ${reviewAmount} صفحة (البداية ص ${nextDeepStart})`,
                status: todayLog?.deepMuraja?.status || 'pending',
                amount: reviewAmount,
                unit: 'page',
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
}

