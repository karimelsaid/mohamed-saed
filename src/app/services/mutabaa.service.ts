import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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
    completedAt?: Date;
}

export interface MutabaaResponse {
    success: boolean;
    plan: MutabaaPlan;
    todayLog: DailyLog;
    quranProgress?: any; // Using any to avoid importing full User model, or define a subset interface
}

@Injectable({
    providedIn: 'root'
})
export class MutabaaService {
    private apiUrl = `${environment.apiBaseUrl}/mutabaa`;

    constructor(private http: HttpClient) { }

    getMutabaaData(): Observable<MutabaaResponse> {
        return this.http.get<MutabaaResponse>(this.apiUrl);
    }

    updatePlanSettings(settings: Partial<MutabaaPlan>): Observable<any> {
        return this.http.put(`${this.apiUrl}/settings`, settings);
    }

    updateTaskStatus(taskType: 'tilawo' | 'hifz' | 'muraja' | 'deepMuraja', status: 'done' | 'postponed' | 'pending', amountDone?: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/task`, { taskType, status, amountDone });
    }
}
