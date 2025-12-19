import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GamificationProfile {
    xp: number;
    level: number;
    currentStreak: number;
    longestStreak: number;
    coins: number;
    nextLevelXP: number;
    username: string;
    referralCode?: string;
    referralBalance?: number;
    profileImage?: string;
    lastStreakUpdate?: Date;
}

export interface Challenge {
    _id: string;
    title: string;
    description: string;
    type: string;
    targetValue: number;
    xpReward: number;
    joined: boolean;
    progress: number;
    status: string; // 'available', 'active', 'completed'
    userChallengeId?: string;
    badgeIcon?: string;
    rewardsClaimed?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class GamificationService {
    private apiUrl = `${environment.apiBaseUrl}/gamification`;

    constructor(private http: HttpClient) { }

    getProfile(): Observable<{ success: boolean, data: GamificationProfile }> {
        return this.http.get<{ success: boolean, data: GamificationProfile }>(
            `${this.apiUrl}/status`
        );
    }

    getChallenges(): Observable<{ success: boolean, data: Challenge[] }> {
        return this.http.get<{ success: boolean, data: Challenge[] }>(`${this.apiUrl}/challenges`);
    }

    joinChallenge(challengeId: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/challenges/join`, { challengeId });
    }

    claimReward(userChallengeId: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/challenges/claim`, { userChallengeId });
    }

    getLeaderboard(): Observable<{ success: boolean, data: any[] }> {
        return this.http.get<{ success: boolean, data: any[] }>(`${this.apiUrl}/leaderboard`);
    }

    syncProgress(sessionData: { minutesRead: number, pagesRead: number, ebookId: string }): Observable<any> {
        return this.http.post(`${this.apiUrl}/progress/sync`, sessionData);
    }

    convertCoins(coins: number): Observable<{ success: boolean, data: { newCoinBalance: number, newWalletBalance: number, exchangedAmount: number } }> {
        return this.http.post<{ success: boolean, data: any }>(`${this.apiUrl}/coins/convert`, { coins });
    }
}
