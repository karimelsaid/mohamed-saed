import { Injectable } from '@angular/core';
import { Observable, Subject, of, map, tap } from 'rxjs';
import { HifzPlanService } from './hifz-plan.service';

export interface MutabaaPlan {
    tilawoTarget: number;
    hifzTarget: number;
    murajaTarget: number;
    deepMurajaTarget: number;
}



export interface TaskStatus {
    status: 'pending' | 'done' | 'postponed';
    pagesCompleted?: number;
    versesCompleted?: number;
}

export interface DailyLog {
    date: string;
    tilawo: TaskStatus;
    hifz: TaskStatus;
    muraja: TaskStatus;
    deepMuraja: TaskStatus;
    rabt: TaskStatus;
    completedAt?: Date;
}

export interface MutabaaResponse {
    success: boolean;
    plan: MutabaaPlan;
    todayLog: DailyLog;
    quranProgress?: any;
}

@Injectable({
    providedIn: 'root'
})
export class MutabaaService {
    private readonly STORAGE_KEY = 'guest_mutabaa_data';
    private taskUpdatedSource = new Subject<void>();
    taskUpdated$ = this.taskUpdatedSource.asObservable();

    constructor() { }

    notifyTaskUpdated() {
        this.taskUpdatedSource.next();
    }

    getMutabaaData(): Observable<MutabaaResponse> {
        const localData = localStorage.getItem(this.STORAGE_KEY);
        if (localData) {
            return of(JSON.parse(localData));
        }
        // Return default empty plan if no local data
        const defaultResponse: MutabaaResponse = {
            success: true,
            plan: { tilawoTarget: 1, hifzTarget: 1, murajaTarget: 1, deepMurajaTarget: 1 },
            todayLog: {
                date: new Date().toISOString().split('T')[0],
                tilawo: { status: 'pending' },
                hifz: { status: 'pending' },
                muraja: { status: 'pending' },
                deepMuraja: { status: 'pending' },
                rabt: { status: 'pending' }
            }
        };
        return of(defaultResponse);
    }

    updatePlanSettings(settings: Partial<MutabaaPlan>): Observable<any> {
        return this.getMutabaaData().pipe(
            tap(data => {
                data.plan = { ...data.plan, ...settings };
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            })
        );
    }

    updateTaskStatus(taskType: 'tilawo' | 'hifz' | 'muraja' | 'deepMuraja' | 'new_memorization' | 'rabt', status: 'done' | 'postponed' | 'pending', amountDone?: number, unit?: string, currentPosition?: any, verses?: string[]): Observable<any> {
        return this.getMutabaaData().pipe(
            tap(data => {
                const previousLog = (data.todayLog as any)[taskType];
                const isHifzUnit = (taskType === 'hifz' || taskType === 'new_memorization' || taskType === 'rabt');
                const previousAmountDone = isHifzUnit ? (previousLog?.versesCompleted || 0) : (previousLog?.pagesCompleted || previousLog?.amountDone || 0);
                const previousStatus = previousLog?.status;
                let finalStatus = status;
                if ((taskType === 'hifz' || taskType === 'new_memorization') && status === 'done') {
                    const rabt = (data.todayLog as any).rabt;
                    const hifzPlanStr = localStorage.getItem('guest_hifz_plan');
                    const hifzPlan = hifzPlanStr ? JSON.parse(hifzPlanStr) : null;
                    const unlinkedCount = hifzPlan?.stats?.unlinkedWardsCount || 0;

                    // STRICT LOCK: Only block IF 7 wards have been saved AND Rabt is not done.
                    if (rabt && rabt.status !== 'done' && unlinkedCount >= 7) {
                        console.warn('⛔ [Mutabaa] Hifz blocked: 7-ward limit reached. Al-Rabt (Linking) is required first.');
                        finalStatus = 'pending';
                    }
                }

                const isHifz = taskType === 'hifz' || taskType === 'new_memorization' || taskType === 'rabt';
                (data.todayLog as any)[taskType] = {
                    status: finalStatus,
                    pagesCompleted: isHifz ? 0 : amountDone,
                    versesCompleted: isHifz ? amountDone : 0
                };

                // Moved save call to the end of the method to ensure all modifications (including Al-Rabt reset) are captured.

                // NEW: Unified HifzPlan processing for Hifz, New Memorization, and Rabt
                const hifzPlanStr = localStorage.getItem('guest_hifz_plan');
                if (hifzPlanStr && (taskType === 'hifz' || taskType === 'new_memorization' || taskType === 'rabt')) {
                    const hifzPlan = JSON.parse(hifzPlanStr);
                    let planNeedsSave = false;

                    if (taskType === 'hifz' || taskType === 'new_memorization') {
                        // 1. Persist Verses to memorizedContent & Today's active ward
                        if (verses && verses.length > 0) {
                            if (!hifzPlan.memorizedContent) hifzPlan.memorizedContent = [];
                            if (!hifzPlan.wardHistory) hifzPlan.wardHistory = [];

                            // Store in Today's Log for current session persistence
                            (data.todayLog as any)[taskType].verses = verses;

                            const existingKeys = new Set(hifzPlan.memorizedContent.map((m: any) => m.verseKey));
                            const newEntries = verses
                                .filter(vKey => !existingKeys.has(vKey))
                                .map(vKey => ({
                                    verseKey: vKey,
                                    strength: 'strong',
                                    lastReviewed: new Date()
                                }));

                            if (newEntries.length > 0) {
                                hifzPlan.memorizedContent.push(...newEntries);
                            }

                            // 1b. Record as an atomic "Ward" in history ONLY when completely DONE
                            if (status === 'done') {
                                hifzPlan.wardHistory = hifzPlan.wardHistory || [];
                                const lastWard = hifzPlan.wardHistory[hifzPlan.wardHistory.length - 1];

                                // Check if this content is genuinely new compared to the last atomic ward
                                const isNewContent = !lastWard || verses.some(v => !lastWard.includes(v)) || lastWard.length !== verses.length;

                                if (isNewContent) {
                                    hifzPlan.wardHistory.push(verses);
                                    if (hifzPlan.wardHistory.length > 50) hifzPlan.wardHistory.shift();
                                    console.log(`📦 [Mutabaa] Committed NEW Ward to history (Total: ${hifzPlan.wardHistory.length})`);

                                    if (data.todayLog) {
                                        data.todayLog.rabt = { status: 'pending', versesCompleted: 0 };
                                        console.log('🔄 [Mutabaa] Auto-reset Al-Rabt status for the new Hifz ward.');
                                    }

                                    hifzPlan.stats.unlinkedWardsCount = (hifzPlan.stats.unlinkedWardsCount || 0) + 1;
                                    console.log(`📊 [Mutabaa] Unlinked Wards: ${hifzPlan.stats.unlinkedWardsCount}/7`);
                                }
                            }
                        }
                        planNeedsSave = true;
                    }

                    // Rabt completion resets the counter
                    if (taskType === 'rabt' && finalStatus === 'done') {
                        hifzPlan.stats.unlinkedWardsCount = 0;
                        console.log('✅ [Mutabaa] Al-Rabt completed. Resetting 7-ward counter.');
                        planNeedsSave = true;
                    }

                    if (planNeedsSave) {
                        // 2. Re-calculate Stats systematically
                        hifzPlan.stats.totalVersesMemorized = hifzPlan.memorizedContent?.length || 0;
                        hifzPlan.stats.remainingVerses = Math.max(0, 6236 - hifzPlan.stats.totalVersesMemorized);
                        hifzPlan.stats.percentage = Math.round((hifzPlan.stats.totalVersesMemorized / 6236) * 100);

                        if (status === 'done' && previousStatus !== 'done') {
                            hifzPlan.stats.lastActiveDate = new Date().toISOString();
                        }

                        // 3. Update Current Position for Hifz based on progress (with wrap-around)
                        if ((taskType === 'hifz' || taskType === 'new_memorization') && currentPosition?.verseKey) {
                            const parts = currentPosition.verseKey.split(':');
                            const lastSurah = parseInt(parts[0]);
                            const lastVerse = parseInt(parts[1]);

                            // Build set of all memorized verse keys
                            const memorizedKeys = new Set<string>(
                                (hifzPlan.memorizedContent || []).map((m: any) => m.verseKey)
                            );

                            // Find the next unmemorized verse with wrap-around
                            const nextPosition = HifzPlanService.getNextUnmemorizedVerse(
                                lastSurah,
                                lastVerse,
                                memorizedKeys
                            );

                            if (nextPosition) {
                                hifzPlan.currentPosition = nextPosition;
                                console.log(`📍 [Mutabaa] Advanced Hifz position to ${nextPosition.surah}:${nextPosition.verse} (wrap-around enabled)`);
                            } else {
                                // All Quran memorized! Do NOT reset to 1:1. 
                                // Keep at current position or a terminal position.
                                console.log('🎉 [Mutabaa] All Quran verses are memorized! No movement needed.');
                            }
                        }

                        localStorage.setItem('guest_hifz_plan', JSON.stringify(hifzPlan));
                    }
                }

                // Final save for mutabaa data (todayLog)
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));

                // If tilawo (recitation) is done, update the lastReadPage to advance the start position for next time
                if (taskType === 'tilawo') {
                    const hifzPlanStr = localStorage.getItem('guest_hifz_plan');
                    if (hifzPlanStr) {
                        const hifzPlan = JSON.parse(hifzPlanStr);
                        const currentPage = currentPosition?.page || 0;

                        if (currentPage > 0) {
                            // Baseline: If we actually moved forward, update the lastReadPage
                            if (currentPage > (hifzPlan.stats.lastReadPage || 0)) {
                                hifzPlan.stats.lastReadPage = currentPage;
                                localStorage.setItem('guest_hifz_plan', JSON.stringify(hifzPlan));
                            }
                        } else if (amountDone !== undefined) {
                            const delta = amountDone - previousAmountDone;
                            if (delta > 0) {
                                let nextPos = (hifzPlan.stats.lastReadPage || 0) + delta;
                                if (nextPos > 604) nextPos = (nextPos % 604) || 604;
                                hifzPlan.stats.lastReadPage = nextPos;
                                localStorage.setItem('guest_hifz_plan', JSON.stringify(hifzPlan));
                            }
                        }
                    }
                }

                // If deepMuraja (past revision) is progressed, update its cursor too
                if (taskType === 'deepMuraja') {
                    const hifzPlanStr = localStorage.getItem('guest_hifz_plan');
                    if (hifzPlanStr) {
                        const hifzPlan = JSON.parse(hifzPlanStr);
                        const currentPage = currentPosition?.page || 0;

                        if (currentPage > 0) {
                            if (currentPage > (hifzPlan.stats.lastDeepRevisionPage || 0)) {
                                hifzPlan.stats.lastDeepRevisionPage = currentPage;
                                localStorage.setItem('guest_hifz_plan', JSON.stringify(hifzPlan));
                            }
                        } else if (amountDone !== undefined) {
                            const delta = amountDone - previousAmountDone;
                            if (delta > 0) {
                                let nextPos = (hifzPlan.stats.lastDeepRevisionPage || 0) + delta;
                                if (nextPos > 604) nextPos = (nextPos % 604) || 604;
                                hifzPlan.stats.lastDeepRevisionPage = nextPos;
                                localStorage.setItem('guest_hifz_plan', JSON.stringify(hifzPlan));
                            }
                        }
                    }
                }

                this.notifyTaskUpdated();
            }),
            map(() => ({ success: true }))
        );
    }

    resetTodayLog(): void {
        const dataStr = localStorage.getItem(this.STORAGE_KEY);
        if (dataStr) {
            const data = JSON.parse(dataStr);
            // Reset today's log to pending clean states
            data.todayLog = {
                date: new Date().toISOString().split('T')[0],
                tilawo: { status: 'pending', pagesCompleted: 0 },
                hifz: { status: 'pending', versesCompleted: 0 },
                muraja: { status: 'pending', versesCompleted: 0 },
                deepMuraja: { status: 'pending', pagesCompleted: 0 },
                rabt: { status: 'pending', versesCompleted: 0 }
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        }
        this.notifyTaskUpdated();
    }

    resetCursors(): void {
        // Cursors are stored in the Hifz Plan stats
        const hifzPlanStr = localStorage.getItem('guest_hifz_plan');
        if (hifzPlanStr) {
            const hifzPlan = JSON.parse(hifzPlanStr);
            hifzPlan.stats.lastReadPage = 0;
            hifzPlan.stats.lastDeepRevisionPage = 0;
            hifzPlan.stats.unlinkedWardsCount = 0;
            localStorage.setItem('guest_hifz_plan', JSON.stringify(hifzPlan));
        }
        this.notifyTaskUpdated();
    }
}

