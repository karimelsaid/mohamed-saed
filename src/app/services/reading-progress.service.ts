import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { finalize } from 'rxjs';
import { ReadingProgress, Bookmark, Highlight, ReaderSettings } from '../models/ebook.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class ReadingProgressService {
    private apiUrl = `${environment.apiBaseUrl}/reading-progress`;

    private currentProgressSubject = new BehaviorSubject<ReadingProgress | null>(null);
    public currentProgress$ = this.currentProgressSubject.asObservable();

    private savingIds = new Set<string>();

    constructor(private http: HttpClient) { }

    // Get reading progress for an ebook
    getProgress(ebookId: string): Observable<{ success: boolean; data: ReadingProgress }> {
        return this.http.get<{ success: boolean; data: ReadingProgress }>(`${this.apiUrl}/${ebookId}`).pipe(
            tap(response => {
                if (response.success) {
                    this.currentProgressSubject.next(response.data);
                }
            })
        );
    }

    // Update reading progress
    updateProgress(ebookId: string, data: {
        currentCfi?: string;
        currentPage?: number;
        totalPages?: number;
        progressPercent?: number;
        readingTimeMinutes?: number;
    }): Observable<{ success: boolean; message: string; data: ReadingProgress }> {
        if (this.savingIds.has(ebookId)) {
            // Return an empty observable or mock response to satisfy the subscriber
            return new Observable(obs => obs.complete());
        }

        this.savingIds.add(ebookId);
        return this.http.put<{ success: boolean; message: string; data: ReadingProgress }>(`${this.apiUrl}/${ebookId}`, data).pipe(
            tap(response => {
                if (response.success) {
                    this.currentProgressSubject.next(response.data);
                }
            }),
            finalize(() => {
                this.savingIds.delete(ebookId);
            })
        );
    }

    // Update reader settings
    updateSettings(ebookId: string, settings: Partial<ReaderSettings>): Observable<{ success: boolean; message: string; data: ReadingProgress }> {
        return this.http.put<{ success: boolean; message: string; data: ReadingProgress }>(`${this.apiUrl}/${ebookId}/settings`, settings);
    }

    // Add bookmark
    addBookmark(ebookId: string, cfi: string, label: string): Observable<{ success: boolean; message: string; data: ReadingProgress }> {
        return this.http.post<{ success: boolean; message: string; data: ReadingProgress }>(`${this.apiUrl}/${ebookId}/bookmarks`, {
            cfi,
            label
        }).pipe(
            tap(response => {
                if (response.success) {
                    this.currentProgressSubject.next(response.data);
                }
            })
        );
    }

    // Remove bookmark
    removeBookmark(ebookId: string, bookmarkId: string): Observable<{ success: boolean; message: string; data: ReadingProgress }> {
        return this.http.delete<{ success: boolean; message: string; data: ReadingProgress }>(`${this.apiUrl}/${ebookId}/bookmarks/${bookmarkId}`).pipe(
            tap(response => {
                if (response.success) {
                    this.currentProgressSubject.next(response.data);
                }
            })
        );
    }

    // Get all bookmarks
    getBookmarks(ebookId: string): Observable<{ success: boolean; data: Bookmark[] }> {
        return this.http.get<{ success: boolean; data: Bookmark[] }>(`${this.apiUrl}/${ebookId}/bookmarks`);
    }

    // Add highlight
    addHighlight(ebookId: string, cfi: string, text: string, color: string, note?: string, cfiRange?: string): Observable<{ success: boolean; message: string; data: ReadingProgress }> {
        return this.http.post<{ success: boolean; message: string; data: ReadingProgress }>(`${this.apiUrl}/${ebookId}/highlights`, {
            cfi,
            text,
            color,
            note,
            cfiRange
        }).pipe(
            tap(response => {
                if (response.success) {
                    this.currentProgressSubject.next(response.data);
                }
            })
        );
    }

    // Remove highlight
    removeHighlight(ebookId: string, highlightId: string): Observable<{ success: boolean; message: string; data: ReadingProgress }> {
        return this.http.delete<{ success: boolean; message: string; data: ReadingProgress }>(`${this.apiUrl}/${ebookId}/highlights/${highlightId}`).pipe(
            tap(response => {
                if (response.success) {
                    this.currentProgressSubject.next(response.data);
                }
            })
        );
    }

    // Get all highlights
    getHighlights(ebookId: string): Observable<{ success: boolean; data: Highlight[] }> {
        return this.http.get<{ success: boolean; data: Highlight[] }>(`${this.apiUrl}/${ebookId}/highlights`);
    }

    // Get current progress from cache
    getCurrentProgress(): ReadingProgress | null {
        return this.currentProgressSubject.value;
    }

    // Clear current progress
    clearCurrentProgress(): void {
        this.currentProgressSubject.next(null);
    }
}
