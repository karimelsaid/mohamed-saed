import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserLibraryEntry, AccessCheckResponse } from '../models/ebook.model';

import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class UserLibraryService {
    private apiUrl = `${environment.apiBaseUrl}/user-library`;

    constructor(private http: HttpClient) { }

    // Get user's library
    getUserLibrary(): Observable<{ success: boolean; count: number; data: UserLibraryEntry[] }> {
        return this.http.get<{ success: boolean; count: number; data: UserLibraryEntry[] }>(this.apiUrl);
    }

    // Add ebook to library (purchase)
    addToLibrary(ebookId: string, acquiredVia: string = 'purchase', pricePaid?: number): Observable<{ success: boolean; message: string; data: UserLibraryEntry }> {
        return this.http.post<{ success: boolean; message: string; data: UserLibraryEntry }>(`${this.apiUrl}/add`, {
            ebookId,
            acquiredVia,
            pricePaid
        });
    }

    // Check if user has access to ebook
    checkAccess(ebookId: string): Observable<AccessCheckResponse> {
        return this.http.get<AccessCheckResponse>(`${this.apiUrl}/check-access/${ebookId}`);
    }

    // Check public access for preview (no login required)
    checkPublicAccess(ebookId: string): Observable<AccessCheckResponse> {
        return this.http.get<AccessCheckResponse>(`${this.apiUrl}/public-check-access/${ebookId}`);
    }

    // Remove from library
    removeFromLibrary(ebookId: string): Observable<{ success: boolean; message: string }> {
        return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/${ebookId}`);
    }

    // Request a new book
    requestBook(userId: string, bookName: string, authorName?: string): Observable<any> {
        return this.http.post(`${environment.apiBaseUrl}/users/request-book`, {
            userId,
            bookName,
            authorName
        });
    }
}
