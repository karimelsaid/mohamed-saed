import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
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
    walletBalance: number;
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

    // إعدادات الاقتصاد (لتحويل النقاط)
    private economySubject = new BehaviorSubject<any>(null);
    public economy$ = this.economySubject.asObservable();

    // النقاط المقابلة لكل نشاط (للعرض فقط)
    public readonly POINTS = {
        MINUTE_READING: 1,           // نقطة واحدة لكل دقيقة قراءة
        VERSE_MEMORIZED: 5,          // 5 نقاط لكل آية يتم حفظها لأول مرة
        PAGE_COMPLETE: 10,           // 10 نقاط عند إتمام قراءة صفحة كاملة
        HIZB_COMPLETE: 50,           // 50 نقطة عند إتمام حزب كامل
        JUZ_COMPLETE: 100,           // 100 نقطة عند إتمام جزء كامل
        DAILY_STREAK: 20,            // 20 نقطة إضافية للالتزام اليومي (التتابع)
        KHATMA_COMPLETE: 1000,       // 1000 نقطة مكافأة عند ختم القرآن كاملاً
        REVISION_PAGE_COMPLETE: 5,   // 5 نقاط لكل صفحة مراجعة (أقل من الحفظ الجديد)
        REVISION_VERSE_COMPLETE: 2   // نقطتان لكل آية يتم مراجعتها وتثبيتها
    };

    constructor(private http: HttpClient) { }

    // جلب تقدم المستخدم
    getProgress(): Observable<{ success: boolean; progress: QuranProgress; economy: any }> {
        return this.http.get<{ success: boolean; progress: QuranProgress; economy: any }>(`${this.apiUrl}/progress`).pipe(
            tap(response => {
                if (response.success) {
                    this.progressSubject.next(response.progress);
                    if (response.economy) {
                        this.economySubject.next(response.economy);
                    }
                }
            }),
            catchError(err => {
                return throwError(err);
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
                    } else {
                        this.getProgress().subscribe();
                    }
                }
            }),
            catchError(err => {
                return throwError(err);
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
                error: err => { }
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

    // تحويل النقاط إلى جنيهات
    convertPoints(points: number): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/convert-points`, { points }).pipe(
            tap(response => {
                if (response.success) {
                    const current = this.progressSubject.value;
                    if (current) {
                        this.progressSubject.next({
                            ...current,
                            totalPoints: response.newTotalPoints,
                            walletBalance: response.newBalance
                        });
                    }
                }
            })
        );
    }

    // طلب سحب الرصيد
    requestPayout(): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/request-payout`, {}).pipe(
            tap(response => {
                if (response.success) {
                    const current = this.progressSubject.value;
                    if (current) {
                        this.progressSubject.next({
                            ...current,
                            walletBalance: 0
                        });
                    }
                }
            })
        );
    }

    // إنشاء تبرع
    createDonation(amount: number, message: string = ''): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/create-donation`, { amount, message }).pipe(
            tap(response => {
                if (response.success) {
                    const current = this.progressSubject.value;
                    if (current) {
                        this.progressSubject.next({
                            ...current,
                            walletBalance: response.newBalance
                        });
                    }
                }
            })
        );
    }

    // جلب إحصائيات التبرعات الإجمالية
    getDonationStats(): Observable<any> {
        return this.http.get<any>(`${environment.apiBaseUrl}/admin/donation-stats`);
    }
}
