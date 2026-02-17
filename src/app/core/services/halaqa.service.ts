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

    getAvailableHalaqas(gender: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/available?gender=${gender}`);
    }

    joinHalaqa(userId: string, inviteCode: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/join`, { userId, inviteCode });
    }
}
