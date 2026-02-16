import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';

export interface ExternalBook {
    id: string; // generated from index or bokname
    title: string;
    author: string;
    category: string;
    mainCategory: string;
    downloadUrl: string; // rar link
    publisher?: string;
    partsCount?: string | number;
    source: 'external';
}

@Injectable({
    providedIn: 'root'
})
export class ExternalLibraryService {
    private jsonUrl = 'json/bok.json'; // Assumed to be served from public/json/bok.json
    private booksCache$: Observable<ExternalBook[]> | null = null;

    constructor(private http: HttpClient) { }

    getAllBooks(): Observable<ExternalBook[]> {
        if (!this.booksCache$) {
            this.booksCache$ = this.http.get<any>(this.jsonUrl).pipe(
                map(data => this.processJson(data)),
                shareReplay(1),
                catchError(err => {
                    console.error('Failed to load external books', err);
                    return of([]);
                })
            );
        }
        return this.booksCache$;
    }

    private processJson(data: any): ExternalBook[] {
        // The JSON seems to be an object with one key "المكتبة الشاملة2=4970 كتاب epub" 
        // holding the array, OR it might be just the array depending on how it's exactly structured at root.
        // Based on the file view: 
        // { "المكتبة الشاملة2=4970 كتاب epub": [ ... ] }

        const rootKey = Object.keys(data)[0];
        const rawList = data[rootKey] || [];

        if (!Array.isArray(rawList)) return [];

        return rawList.map((item: any, index: number) => ({
            id: `ext_${index}`,
            title: item['bokname'] || 'بدون عنوان',
            author: item['المؤلف'] || 'مجهول',
            category: item['القسم الجديد'] || item['القسم الرئيسي'] || 'عام',
            mainCategory: item['القسم الرئيسي'] || '',
            downloadUrl: item['downloadRarbok'],
            publisher: item['الناشر'],
            partsCount: item['عدد الأجزاء'],
            source: 'external'
        }));
    }

    getUniqueCategories(books: ExternalBook[]): string[] {
        return Array.from(new Set(books.map(b => b.category))).sort();
    }

    getBookById(id: string): Observable<ExternalBook | undefined> {
        return this.getAllBooks().pipe(
            map(books => books.find(b => b.id === id))
        );
    }
}
