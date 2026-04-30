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
    members: any[];
    currentMembers?: number;
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

    createHalaqa(data: { name: string; description?: string; maxMembers?: number; leaderId: string; gender?: string }): Observable<any> {
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

    getMessages(halaqaId: string, limit: number = 50, pinned: boolean = false, before?: string): Observable<any> {
        let url = `${this.apiUrl}/${halaqaId}/messages?limit=${limit}&pinned=${pinned}`;
        if (before) url += `&before=${before}`;
        return this.http.get(url);
    }

    sendMessage(halaqaId: string, userId: string, content: string, type: string = 'text', replyTo?: string, mentions?: string[], fileMetadata?: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/${halaqaId}/messages`, {
            userId, content, type, replyTo, mentions, fileMetadata
        });
    }

    searchMessages(halaqaId: string, query: string, offset: number = 0, limit: number = 20): Observable<any> {
        return this.http.get(`${this.apiUrl}/${halaqaId}/search?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`);
    }

    togglePinMessage(messageId: string, userId: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/messages/${messageId}/pin`, { userId });
    }

    uploadVoiceMessage(audioBlob: Blob, userId: string): Observable<any> {
        let extension = 'webm';
        const type = audioBlob.type.toLowerCase();
        if (type.includes('mp4') || type.includes('m4a')) extension = 'm4a';
        else if (type.includes('ogg')) extension = 'ogg';
        else if (type.includes('aac')) extension = 'aac';
        else if (type.includes('wav')) extension = 'wav';

        const formData = new FormData();
        formData.append('audio', audioBlob, `voice-message.${extension}`);
        formData.append('userId', userId);
        return this.http.post(`${this.apiUrl}/upload-voice`, formData);
    }

    deleteHalaqa(id: string, userId: string): Observable<any> {
        return this.http.request('delete', `${this.apiUrl}/${id}`, { body: { userId } });
    }

    uploadFile(file: File, userId: string): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', userId);
        return this.http.post(`${this.apiUrl}/upload-file`, formData);
    }

    rateMember(data: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/rate`, data);
    }

    getOrCreateDM(userId: string, otherUserId: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/get-or-create-dm`, { userId, otherUserId });
    }

    getHalaqaStats(halaqaId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/${halaqaId}/stats`);
    }

    getHalaqaMedia(halaqaId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/${halaqaId}/media`);
    }
}
