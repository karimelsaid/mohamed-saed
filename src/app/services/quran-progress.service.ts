import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface QuranProgress {
    totalPoints: number;
    dailyStreak: number;
    longestStreak: number;
    pagesRead: number;
    pagesReviewed?: number;
    versesMemorized: number;
    totalMinutesReading: number;
    khatmatCount: number;
    lastActivityDate: Date | null;
    lastPage: number;
    lastReadPage: number;
    bookmarks: number[];
    walletBalance: number;
}

export interface PointsResponse {
    success: boolean;
    pointsAdded: number;
    totalPoints: number;
    message: string;
}

export type ActivityType =
    | 'MINUTE_READING'
    | 'VERSE_MEMORIZED'
    | 'PAGE_COMPLETE'
    | 'HIZB_COMPLETE'
    | 'JUZ_COMPLETE'
    | 'DAILY_STREAK'
    | 'KHATMA_COMPLETE'
    | 'REVISION_PAGE_COMPLETE'
    | 'REVISION_VERSE_COMPLETE';

@Injectable({
    providedIn: 'root'
})
export class QuranProgressService {
    private readonly STORAGE_KEY = 'guest_quran_progress';

    // حالة التقدم المحلية
    private progressSubject = new BehaviorSubject<QuranProgress | null>(null);
    public progress$ = this.progressSubject.asObservable();

    // إعدادات الاقتصاد (Disabled)
    private economySubject = new BehaviorSubject<any>({ quranPointsPerEGP: 500 });
    public economy$ = this.economySubject.asObservable();

    public readonly POINTS = {
        MINUTE_READING: 1,
        VERSE_MEMORIZED: 5,
        PAGE_COMPLETE: 10,
        HIZB_COMPLETE: 50,
        JUZ_COMPLETE: 100,
        DAILY_STREAK: 20,
        KHATMA_COMPLETE: 1000,
        REVISION_PAGE_COMPLETE: 5,
        REVISION_VERSE_COMPLETE: 2
    };

    constructor() {
        this.loadLocalProgress();
    }

    private loadLocalProgress(): void {
        const guestProgress = localStorage.getItem(this.STORAGE_KEY);
        if (guestProgress) {
            try {
                this.progressSubject.next(JSON.parse(guestProgress));
            } catch (e) {
                console.error('Error parsing local progress', e);
                this.progressSubject.next(this.getDefaultProgress());
            }
        } else {
            this.progressSubject.next(this.getDefaultProgress());
        }
    }

    private saveLocalProgress(progress: QuranProgress): void {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(progress));
        this.progressSubject.next(progress);
    }

    // جلب تقدم المستخدم
    getProgress(): Observable<{ success: boolean; progress: QuranProgress; economy: any }> {
        const current = this.progressSubject.value || this.getDefaultProgress();
        return of({
            success: true,
            progress: current,
            economy: this.economySubject.value
        }).pipe(
            tap(res => {
                this.progressSubject.next(res.progress);
            })
        );
    }

    private getDefaultProgress(): QuranProgress {
        return {
            totalPoints: 0,
            dailyStreak: 0,
            longestStreak: 0,
            pagesRead: 0,
            versesMemorized: 0,
            totalMinutesReading: 0,
            khatmatCount: 0,
            lastActivityDate: null,
            lastPage: 1,
            lastReadPage: 1,
            bookmarks: [],
            walletBalance: 0
        };
    }

    // إضافة نقاط
    addPoints(activity: ActivityType, count: number = 1): Observable<PointsResponse> {
        const current = this.progressSubject.value || this.getDefaultProgress();
        const updated = {
            ...current,
            pagesRead: activity === 'PAGE_COMPLETE' ? current.pagesRead + count : current.pagesRead,
            versesMemorized: activity === 'VERSE_MEMORIZED' ? current.versesMemorized + count : current.versesMemorized,
            pagesReviewed: activity === 'REVISION_PAGE_COMPLETE' ? (current.pagesReviewed || 0) + count : current.pagesReviewed,
        };
        this.saveLocalProgress(updated);
        return of({
            success: true,
            pointsAdded: 0,
            totalPoints: 0,
            message: 'تم تحديث الإحصائيات محلياً'
        });
    }

    // تحديث الالتزام اليومي
    updateStreak(): Observable<{ success: boolean; streak: number; pointsAdded: number }> {
        const current = this.progressSubject.value || this.getDefaultProgress();
        const updated = {
            ...current,
            dailyStreak: current.dailyStreak + 1,
            totalPoints: current.totalPoints + this.POINTS.DAILY_STREAK
        };
        this.saveLocalProgress(updated);
        return of({ success: true, streak: updated.dailyStreak, pointsAdded: this.POINTS.DAILY_STREAK });
    }

    // تحديث آخر صفحة
    updateLastPage(pageNumber: number): Observable<{ success: boolean; lastPage: number }> {
        const current = this.progressSubject.value || this.getDefaultProgress();
        const updated = { ...current, lastPage: pageNumber };
        this.saveLocalProgress(updated);
        localStorage.setItem('lastMushafPage', pageNumber.toString());
        return of({ success: true, lastPage: pageNumber });
    }

    // إضافة/إزالة bookmark
    toggleBookmark(pageNumber: number): Observable<{ success: boolean; action: string; pageNumber: number }> {
        const current = this.progressSubject.value || this.getDefaultProgress();
        const bookmarks = [...current.bookmarks];
        const index = bookmarks.indexOf(pageNumber);
        let action = '';
        if (index > -1) {
            bookmarks.splice(index, 1);
            action = 'removed';
        } else {
            bookmarks.push(pageNumber);
            action = 'added';
        }
        const updated = { ...current, bookmarks };
        this.saveLocalProgress(updated);
        return of({ success: true, action, pageNumber });
    }

    // التحقق قبل إضافة النقاط
    addPointsIfLoggedIn(activity: ActivityType, count: number = 1): void {
        this.addPoints(activity, count).subscribe();
    }

    // الحصول على التقدم الحالي (synchronous)
    getCurrentProgress(): QuranProgress | null {
        return this.progressSubject.value;
    }

    // تحديث الحالة المحلية من مصدر خارجي
    setLocalProgress(progress: QuranProgress): void {
        if (progress) {
            this.saveLocalProgress(progress);
        }
    }
}

