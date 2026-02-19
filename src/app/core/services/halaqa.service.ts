import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Halaqa {
    _id: string;
    name: string;
    description?: string;
    gender: 'male' | 'female';
    leader: any;
    members: string[];
    maxMembers: number;
    inviteCode?: string;
    active: boolean;
    createdAt: Date;
}

@Injectable({
    providedIn: 'root'
})
export class HalaqaService {
    private apiUrl = `${environment.apiBaseUrl}/halaqa`;

    constructor(private http: HttpClient) { }

    createHalaqa(data: { name: string; description?: string; maxMembers?: number; leaderId: string }): Observable<any> {
        return this.http.post(`${this.apiUrl}/create`, data);
    }

    getAvailableHalaqas(gender: string, userId?: string, search?: string, page: number = 1, limit: number = 10): Observable<any> {
        let url = `${this.apiUrl}/available?gender=${gender}&page=${page}&limit=${limit}`;
        if (userId) url += `&userId=${userId}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        return this.http.get(url);
    }

    getMyHalaqas(userId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/my/${userId}`);
    }

    joinHalaqa(userId: string, inviteCode: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/join`, { userId, inviteCode });
    }

    // --- Phase 2 Methods ---

    getHalaqaDetails(id: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/${id}`);
    }

    getMessages(halaqaId: string, limit: number = 50): Observable<any> {
        return this.http.get(`${this.apiUrl}/${halaqaId}/messages?limit=${limit}`);
    }

    sendMessage(halaqaId: string, userId: string, content: string, type: string = 'text'): Observable<any> {
        return this.http.post(`${this.apiUrl}/${halaqaId}/messages`, { userId, content, type });
    }

    uploadVoiceMessage(audioBlob: Blob, userId: string): Observable<any> {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice-message.webm');
        formData.append('userId', userId);
        return this.http.post(`${this.apiUrl}/upload-voice`, formData);
    }

    deleteHalaqa(id: string, userId: string): Observable<any> {
        return this.http.request('delete', `${this.apiUrl}/${id}`, { body: { userId } });
    }

    rateMember(data: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/rate`, data);
    }
}
