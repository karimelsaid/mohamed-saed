import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DailyCapacity {
    recitationType: 'page' | 'half_hizb' | 'hizb' | 'juz';
    recitationAmount: number;
    newMemorization: 'verse' | 'half_page' | 'page' | 'verses';
    memorizationAmount?: number;
    memorizationDays: number;
    reviewType: 'light' | 'weekly' | 'rescue';
    reviewAmount?: number;
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
    currentPosition: { surah: number; verse: number };
    stats: {
        totalVersesMemorized: number;
        currentStreak: number;
        bestStreak: number;
        lastActiveDate: string;
    };
    reminders?: {
        recitation: { enabled: boolean; time: string };
        memorization: { enabled: boolean; time: string };
        revision: { enabled: boolean; time: string };
    };
}

export interface DailyTask {
    type: 'new_memorization' | 'consolidation' | 'recitation';
    label: string;
    status: 'pending' | 'done' | 'postponed';
    target?: string;
    position?: { surah: number; verse: number };
    verses?: string[];
    amount?: number;
    unit?: string;
}

@Injectable({
    providedIn: 'root'
})
export class HifzPlanService {
    private apiUrl = `${environment.apiBaseUrl}/hifz-plan`;

    constructor(private http: HttpClient) { }

    /**
     * الحصول على حالة الخطة
     */
    getPlan(): Observable<{ success: boolean; isSetupComplete: boolean; plan: HifzPlan }> {
        return this.http.get<{ success: boolean; isSetupComplete: boolean; plan: HifzPlan }>(this.apiUrl);
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
    }): Observable<{ success: boolean; message: string; plan: HifzPlan }> {
        return this.http.post<{ success: boolean; message: string; plan: HifzPlan }>(`${this.apiUrl}/setup`, data);
    }

    /**
     * الحصول على مهام اليوم
     */
    getDailyTasks(): Observable<{ success: boolean; date: string; tasks: DailyTask[]; streak: number; stats?: any; needsSetup?: boolean }> {
        return this.http.get<{ success: boolean; date: string; tasks: DailyTask[]; streak: number; stats?: any; needsSetup?: boolean }>(`${this.apiUrl}/daily-tasks`);
    }

    /**
     * تحديث حالة ذاكرة آية
     */
    updateVerseStrength(verseKey: string, wasCorrect?: boolean, strength?: string): Observable<{ success: boolean }> {
        return this.http.post<{ success: boolean }>(`${this.apiUrl}/verse-strength`, { verseKey, wasCorrect, strength });
    }

    /**
     * تقليل الحمل اليومي
     */
    reduceLoad(taskType: string): Observable<{ success: boolean; message: string; plan: HifzPlan }> {
        return this.http.post<{ success: boolean; message: string; plan: HifzPlan }>(`${this.apiUrl}/reduce-load`, { taskType });
    }

    /**
     * حفظ إعدادات التنبيهات
     */
    saveReminders(reminders: any): Observable<{ success: boolean; message: string; reminders: any }> {
        return this.http.post<{ success: boolean; message: string; reminders: any }>(`${this.apiUrl}/reminders`, { reminders });
    }
}
