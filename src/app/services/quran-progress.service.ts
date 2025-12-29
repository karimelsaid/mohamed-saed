import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface QuranProgress {
    totalPoints: number;
    dailyStreak: number;
    longestStreak: number;
    pagesRead: number;
    pagesReviewed?: number; // Added for revision tracking
    versesMemorized: number;
    totalMinutesReading: number;
    khatmatCount: number;
    lastActivityDate: Date | null;
    lastPage: number;
    bookmarks: number[];
}

export interface PointsResponse {
    success: boolean;
    pointsAdded: number;
    totalPoints: number;
    message: string;
}

// أنواع الأنشطة
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
    private apiUrl = `${environment.apiBaseUrl}/quran-progress`;

    // حالة التقدم المحلية
    private progressSubject = new BehaviorSubject<QuranProgress | null>(null);
    public progress$ = this.progressSubject.asObservable();

    // النقاط المقابلة لكل نشاط (للعرض فقط)
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

    constructor(private http: HttpClient) { }

    // جلب تقدم المستخدم
    getProgress(): Observable<{ success: boolean; progress: QuranProgress }> {
        return this.http.get<{ success: boolean; progress: QuranProgress }>(`${this.apiUrl}/progress`).pipe(
            tap(response => {
                if (response.success) {
                    this.progressSubject.next(response.progress);
                }
            })
        );
    }

    // إضافة نقاط
    addPoints(activity: ActivityType, count: number = 1): Observable<PointsResponse> {
        return this.http.post<PointsResponse>(`${this.apiUrl}/add-points`, { activity, count }).pipe(
            tap(response => {
                if (response.success) {
                    const current = this.progressSubject.value;
                    if (current) {
                        this.progressSubject.next({
                            ...current,
                            totalPoints: response.totalPoints
                        });
                    }
                }
            })
        );
    }

    // تحديث الالتزام اليومي
    updateStreak(): Observable<{ success: boolean; streak: number; pointsAdded: number }> {
        return this.http.post<{ success: boolean; streak: number; pointsAdded: number }>(
            `${this.apiUrl}/update-streak`, {}
        ).pipe(
            tap(response => {
                if (response.success) {
                    const current = this.progressSubject.value;
                    if (current) {
                        this.progressSubject.next({
                            ...current,
                            dailyStreak: response.streak,
                            totalPoints: current.totalPoints + response.pointsAdded
                        });
                    }
                }
            })
        );
    }

    // تحديث آخر صفحة
    updateLastPage(pageNumber: number): Observable<{ success: boolean; lastPage: number }> {
        return this.http.post<{ success: boolean; lastPage: number }>(
            `${this.apiUrl}/last-page`, { pageNumber }
        ).pipe(
            tap(response => {
                if (response.success) {
                    const current = this.progressSubject.value;
                    if (current) {
                        this.progressSubject.next({
                            ...current,
                            lastPage: pageNumber
                        });
                    }
                }
            })
        );
    }

    // إضافة/إزالة bookmark
    toggleBookmark(pageNumber: number): Observable<{ success: boolean; action: string; pageNumber: number }> {
        return this.http.post<{ success: boolean; action: string; pageNumber: number }>(
            `${this.apiUrl}/bookmark`, { pageNumber }
        ).pipe(
            tap(response => {
                if (response.success) {
                    const current = this.progressSubject.value;
                    if (current) {
                        const bookmarks = [...current.bookmarks];
                        if (response.action === 'added') {
                            bookmarks.push(pageNumber);
                        } else {
                            const index = bookmarks.indexOf(pageNumber);
                            if (index > -1) bookmarks.splice(index, 1);
                        }
                        this.progressSubject.next({
                            ...current,
                            bookmarks
                        });
                    }
                }
            })
        );
    }

    // التحقق من تسجيل الدخول قبل إضافة النقاط
    addPointsIfLoggedIn(activity: ActivityType, count: number = 1): void {
        const user = localStorage.getItem('user');
        if (user) {
            this.addPoints(activity, count).subscribe({
                error: err => console.error('Failed to add points:', err)
            });
        }
    }

    // الحصول على التقدم الحالي (synchronous)
    getCurrentProgress(): QuranProgress | null {
        return this.progressSubject.value;
    }

    // تحديث الحالة المحلية من مصدر خارجي (مثل جدول المتابعة)
    setLocalProgress(progress: QuranProgress): void {
        if (progress) {
            this.progressSubject.next(progress);
        }
    }
}
