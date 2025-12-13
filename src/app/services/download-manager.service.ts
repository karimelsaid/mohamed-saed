import { environment } from '../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject } from 'rxjs';

export interface DownloadProgress {
    state: 'PENDING' | 'DOWNLOADING' | 'EXTRACTING' | 'DONE' | 'ERROR';
    progress: number;
    fileName?: string;
    error?: string;
}

export interface DownloadedBook {
    id: string;
    title: string;
    author?: string;
    category?: string;
    downloadDate: number;
    contentLength: number;
}

interface ExtractResponse {
    success: boolean;
    bookId: string;
    content: string;
    length: number;
    error?: string;
    toc?: any[];
    idMap?: { [key: string]: number };
}

@Injectable({
    providedIn: 'root'
})
export class DownloadManagerService {
    private dbName = 'KenouzLibraryDB';
    private storeName = 'books';
    private metaStoreName = 'booksMeta';
    private dbPromise: Promise<IDBDatabase>;

    // Encryption Props
    private encryptionKey: CryptoKey | null = null;
    private readonly IV_LENGTH = 12;

    // Observable for downloaded book IDs
    private downloadedBookIdsSubject = new BehaviorSubject<Set<string>>(new Set());
    public downloadedBookIds$ = this.downloadedBookIdsSubject.asObservable();

    constructor(private http: HttpClient) {
        this.dbPromise = this.initDB();
        this.loadDownloadedBookIds();
    }

    // --- IndexedDB Initialization ---
    private initDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2); // Version 2 for new meta store
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.metaStoreName)) {
                    db.createObjectStore(this.metaStoreName, { keyPath: 'id' });
                }
            };
        });
    }

    // --- Load Downloaded Book IDs ---
    private async loadDownloadedBookIds() {
        const books = await this.getAllDownloadedBooks();
        const ids = new Set(books.map(b => b.id));
        this.downloadedBookIdsSubject.next(ids);
    }

    // --- Encryption Helpers ---
    private async getEncryptionKey(): Promise<CryptoKey> {
        if (this.encryptionKey) return this.encryptionKey;

        const storedKey = localStorage.getItem('app_lib_kek');
        if (storedKey) {
            this.encryptionKey = await window.crypto.subtle.importKey(
                'jwk',
                JSON.parse(storedKey),
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        } else {
            this.encryptionKey = await window.crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
            const exportedKey = await window.crypto.subtle.exportKey('jwk', this.encryptionKey);
            localStorage.setItem('app_lib_kek', JSON.stringify(exportedKey));
        }

        return this.encryptionKey!;
    }

    private async encryptData(data: string): Promise<{ buffer: ArrayBuffer, iv: Uint8Array }> {
        const key = await this.getEncryptionKey();
        const iv = window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(data);

        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as any },
            key,
            encodedData
        );
        return { buffer: encrypted, iv: iv };
    }

    private async decryptData(encryptedData: ArrayBuffer, iv: Uint8Array): Promise<string> {
        const key = await this.getEncryptionKey();
        const decrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as any },
            key,
            encryptedData
        );
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    // --- Main Workflow: Check Cache OR Call Backend API ---
    downloadAndProcessBook(bookId: string, url: string, metadata?: { title: string, author?: string, category?: string }): Observable<DownloadProgress> {
        const progressSubject = new Subject<DownloadProgress>();

        // Check if already cached
        this.getBookContent(bookId).then(content => {
            if (content) {
                console.log('Book already cached, skipping download');
                progressSubject.next({ state: 'DONE', progress: 100 });
                progressSubject.complete();
                return;
            }
            // Not cached - call backend to extract
            this.extractViaBackend(bookId, url, metadata, progressSubject);
        });

        return progressSubject.asObservable();
    }

    private extractViaBackend(bookId: string, url: string, metadata: { title: string, author?: string, category?: string } | undefined, subject: Subject<DownloadProgress>) {
        subject.next({ state: 'DOWNLOADING', progress: 0 });

        // Call backend API that does all the heavy lifting
        const apiUrl = `${environment.apiBaseUrl}/extract-book?bookId=${encodeURIComponent(bookId)}&url=${encodeURIComponent(url)}`;

        // Simulate some progress while waiting
        subject.next({ state: 'DOWNLOADING', progress: 30 });

        this.http.get<ExtractResponse>(apiUrl).subscribe({
            next: async (response) => {
                if (response.success && response.content) {
                    subject.next({ state: 'EXTRACTING', progress: 70 });

                    try {
                        // Encrypt and save to IndexedDB
                        await this.saveToDB(bookId, response.content, response.toc, response.idMap);

                        // Save metadata
                        if (metadata) {
                            await this.saveMetadata({
                                id: bookId,
                                title: metadata.title,
                                author: metadata.author,
                                category: metadata.category,
                                downloadDate: Date.now(),
                                contentLength: response.length
                            });
                        }

                        // Update downloaded IDs
                        const currentIds = this.downloadedBookIdsSubject.getValue();
                        currentIds.add(bookId);
                        this.downloadedBookIdsSubject.next(new Set(currentIds));

                        subject.next({ state: 'DONE', progress: 100 });
                        subject.complete();
                    } catch (e: any) {
                        subject.next({ state: 'ERROR', progress: 0, error: 'Save Failed: ' + e.message });
                        subject.error(e);
                    }
                } else {
                    subject.next({ state: 'ERROR', progress: 0, error: response.error || 'Unknown error' });
                    subject.error(new Error(response.error || 'Extraction failed'));
                }
            },
            error: (err) => {
                console.error('Backend Extract Error:', err);
                subject.next({ state: 'ERROR', progress: 0, error: 'Backend Error: ' + (err.message || 'Network error') });
                subject.error(err);
            }
        });
    }

    // --- Metadata Operations ---
    private async saveMetadata(meta: DownloadedBook) {
        const db = await this.dbPromise;
        return new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(this.metaStoreName, 'readwrite');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.put(meta);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getAllDownloadedBooks(): Promise<DownloadedBook[]> {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.metaStoreName, 'readonly');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // --- Delete Book ---
    async deleteBook(id: string): Promise<void> {
        const db = await this.dbPromise;

        // Delete content
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        // Delete metadata
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(this.metaStoreName, 'readwrite');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        // Update downloaded IDs
        const currentIds = this.downloadedBookIdsSubject.getValue();
        currentIds.delete(id);
        this.downloadedBookIdsSubject.next(new Set(currentIds));
    }

    // --- IndexedDB Operations with Encryption ---
    private async saveToDB(id: string, content: string, toc?: any[], idMap?: { [key: string]: number }) {
        const db = await this.dbPromise;
        const { buffer: encrypted, iv } = await this.encryptData(content);

        return new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put({
                id,
                content: encrypted,
                iv: iv,
                toc: toc || [],
                idMap: idMap || {},
                timestamp: Date.now()
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getBookIdMap(id: string): Promise<{ [key: string]: number }> {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            request.onsuccess = () => {
                const record = request.result;
                resolve(record ? (record.idMap || {}) : {});
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getBookTOC(id: string): Promise<any[]> {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            request.onsuccess = () => {
                const record = request.result;
                resolve(record ? (record.toc || []) : []);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getBookContent(id: string): Promise<string | null> {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            request.onsuccess = async () => {
                const record = request.result;
                if (record && record.content && record.iv) {
                    try {
                        const text = await this.decryptData(record.content, record.iv);
                        resolve(text);
                    } catch (e: any) {
                        console.error('Decryption failed', e);
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async isBookAvailable(id: string): Promise<boolean> {
        const db = await this.dbPromise;
        return new Promise((resolve) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const req = store.count(id);
            req.onsuccess = () => resolve(req.result > 0);
            req.onerror = () => resolve(false);
        });
    }
}
