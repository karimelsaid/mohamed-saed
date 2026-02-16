import { Injectable } from '@angular/core';
import { Bookmark } from '../models/bookmark.model';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class BookmarkService {
    private readonly STORAGE_KEY = 'kenouz_bookmarks';
    private bookmarksSubject = new BehaviorSubject<Bookmark[]>(this.loadFromStorage());
    public bookmarks$ = this.bookmarksSubject.asObservable();

    constructor() { }

    private loadFromStorage(): Bookmark[] {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    private saveToStorage(bookmarks: Bookmark[]): void {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(bookmarks));
        this.bookmarksSubject.next(bookmarks);
    }

    getBookmarks(): Bookmark[] {
        return this.bookmarksSubject.getValue();
    }

    addBookmark(bookmark: Bookmark): void {
        const current = this.getBookmarks();
        const updated = [bookmark, ...current];
        this.saveToStorage(updated);
    }

    deleteBookmark(id: string): void {
        const current = this.getBookmarks();
        const updated = current.filter(b => b.id !== id);
        this.saveToStorage(updated);
    }

    isPageBookmarked(pageNumber: number): boolean {
        return this.getBookmarks().some(b => b.pageNumber === pageNumber);
    }

    getBookmarkForPage(pageNumber: number): Bookmark | undefined {
        return this.getBookmarks().find(b => b.pageNumber === pageNumber);
    }
}
