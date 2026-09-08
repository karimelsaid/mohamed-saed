import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ReadingChallenge {
    _id: string;
    bookId: any;
    hostId: any;
    title: string;
    description: string;
    isPublic: boolean;
    maxParticipants: number;
    targetType: string;
    targetValue: number;
    startDate: string;
    endDate: string;
    status: string;
    participants: any[];
    inviteCode: string;
}

@Injectable({
    providedIn: 'root'
})
export class ReadingChallengeService {
    private apiUrl = `${environment.apiBaseUrl}/reading-challenges`;

    constructor(private http: HttpClient) { }

    createChallenge(data: any): Observable<any> {
        return this.http.post(`${this.apiUrl}`, data);
    }

    joinChallenge(data: { inviteCode?: string, challengeId?: string }): Observable<any> {
        return this.http.post(`${this.apiUrl}/join`, data);
    }

    getMyChallenges(): Observable<any> {
        return this.http.get(`${this.apiUrl}/my-challenges`);
    }

    getPublicChallenges(bookId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/public/${bookId}`);
    }

    getAllPublicChallenges(): Observable<any> {
        return this.http.get(`${this.apiUrl}/public-all`);
    }

    updateProgress(challengeId: string, progressPercent: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/progress`, { challengeId, progressPercent });
    }

    leaveChallenge(challengeId: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/leave/${challengeId}`, {});
    }

    deleteChallenge(challengeId: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${challengeId}`);
    }

    getMyChallengesForBook(bookId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/my-book/${bookId}`);
    }
}
