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
    private booksInMemory: ExternalBook[] | null = null;

    constructor(private http: HttpClient) { }

    getAllBooks(): Observable<ExternalBook[]> {
        if (this.booksInMemory) {
            return of(this.booksInMemory);
        }

        return new Observable<ExternalBook[]>(observer => {
            let localLoaded = false;

            const loadFromCache = async () => {
                try {
                    if (typeof window !== 'undefined' && 'caches' in window) {
                        const cache = await caches.open('kenouz-external-library-cache');
                        const cachedResponse = await cache.match(this.jsonUrl);
                        if (cachedResponse) {
                            const data = await cachedResponse.json();
                            const books = this.processJson(data);
                            if (books.length > 0) {
                                this.booksInMemory = books;
                                observer.next(books);
                                localLoaded = true;
                                console.log('📚 Loaded 4970 books from native Cache Storage');
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to read external books from Cache Storage', e);
                }
            };

            const fetchFromNetwork = () => {
                this.http.get<any>(this.jsonUrl).subscribe({
                    next: (data: any) => {
                        const books = this.processJson(data);
                        this.booksInMemory = books;
                        observer.next(books);
                        
                        // Cache it for next time
                        if (typeof window !== 'undefined' && 'caches' in window) {
                            caches.open('kenouz-external-library-cache').then(cache => {
                                cache.put(this.jsonUrl, new Response(JSON.stringify(data)));
                            }).catch(err => console.warn('Failed to cache external books', err));
                        }
                        
                        observer.complete();
                    },
                    error: (err: any) => {
                        console.error('Failed to fetch external books from network', err);
                        if (!localLoaded) {
                            observer.next([]);
                        }
                        observer.complete();
                    }
                });
            };

            // Execute SWR
            loadFromCache().then(() => {
                if (typeof navigator !== 'undefined' && navigator.onLine) {
                    fetchFromNetwork();
                } else {
                    if (!localLoaded) observer.next([]);
                    observer.complete();
                }
            });
        });
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
