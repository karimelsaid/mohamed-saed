import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { EbookService } from './ebook.service';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { Observable, from, throwError, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class OfflineEbookService {
    private dbName = 'KenouzEbookCache';
    private storeName = 'ebooks';
    private dbVersion = 1;

    // Key for encryption/decryption (Generated simply for this device instance)
    // In a real high-security production app, this might be derived from user credentials or server-sent
    // For this requirement (prevent casual file access), a device-local key is sufficient.
    private encryptionKey: CryptoKey | null = null;
    private readonly IV_LENGTH = 12; // AES-GCM standard

    constructor(
        private ebookService: EbookService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        if (isPlatformBrowser(this.platformId)) {
            this.initDB();
        }
    }

    private async initDB() {
        return new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName); // Key is ebookId (string)
                }
            };
        });
    }

    private async getDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    // --- Encryption/Decryption Helpers ---
    private async getEncryptionKey(): Promise<CryptoKey> {
        if (this.encryptionKey) return this.encryptionKey;

        // Use a fixed salt/seed for the device so we can regenerate the same key locally
        // If we were using user-passwords, we'd derive from that. 
        // Here we use a persistent generated key stored in IndexedDB as a separate config
        // OR simper: Generate one and store it.
        // For simplicity & performance in this context: We'll generate a key and store it in a separate store if needed,
        // but caching the Jwk or Raw key in a specific key-store is best practice.
        // Let's use a simpler approach: Derive from a hardcoded app secret + device-specific logic if possible, 
        // OR just generate and store in a separate config Store.

        // For now: Generate a key and store it in localStorage (as JWK) to persist across sessions
        const storedKey = isPlatformBrowser(this.platformId) ? localStorage.getItem('app_kek') : null;
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
                true, // extractable to save
                ['encrypt', 'decrypt']
            );
            const exportedKey = await window.crypto.subtle.exportKey('jwk', this.encryptionKey);
            if (isPlatformBrowser(this.platformId)) {
                localStorage.setItem('app_kek', JSON.stringify(exportedKey));
            }
        }

        return this.encryptionKey!;
    }

    private async encryptData(data: ArrayBuffer): Promise<{ buffer: ArrayBuffer, iv: Uint8Array }> {
        const key = await this.getEncryptionKey();
        const iv = window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as any },
            key,
            data
        );
        return { buffer: encrypted, iv: iv };
    }

    private async decryptData(encryptedData: ArrayBuffer, iv: Uint8Array): Promise<ArrayBuffer> {
        const key = await this.getEncryptionKey();
        return await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as any },
            key,
            encryptedData
        );
    }

    // --- Public API ---

    // Check if book exists in cache
    public async isBookCached(ebookId: string): Promise<boolean> {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count(ebookId);
            request.onsuccess = () => resolve(request.result > 0);
            request.onerror = () => resolve(false);
        });
    }

    // Save metadata for a book (called when reading successfully)
    public async saveMetadata(ebookId: string, metadata: any): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const getReq = store.get(ebookId);
            getReq.onsuccess = () => {
                const record = getReq.result;
                if (record) {
                    record.metadata = metadata;
                    store.put(record, ebookId);
                }
                resolve();
            };
            getReq.onerror = () => resolve(); // Ignore errors
        });
    }

    // Get metadata for a specific book
    public async getMetadata(ebookId: string): Promise<any | null> {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(ebookId);
            request.onsuccess = () => {
                const record = request.result;
                resolve(record ? record.metadata : null);
            };
            request.onerror = () => resolve(null);
        });
    }

    // Get all cached books with their metadata
    public async getCachedBooks(): Promise<any[]> {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const books: any[] = [];

            // Use cursor to get both key (ebookId) and value
            const cursorRequest = store.openCursor();
            cursorRequest.onsuccess = (event: any) => {
                const cursor = event.target.result;
                if (cursor) {
                    const record = cursor.value;
                    if (record.metadata) {
                        // Include the ebookId (cursor.key) in the returned object
                        books.push({
                            ...record.metadata,
                            _id: cursor.key, // Add the ID
                            id: cursor.key,  // Also as 'id' for compatibility
                            ebookId: cursor.key
                        });
                    }
                    cursor.continue();
                } else {
                    // No more records
                    resolve(books);
                }
            };
            cursorRequest.onerror = () => resolve([]);
        });
    }

    // Main method: Get from cache OR fetch from network
    public getOrFetchBook(ebookId: string): Observable<Blob> {
        // 1. Try Cache First
        return from(this.getFromCache(ebookId)).pipe(
            switchMap(cachedData => {
                if (cachedData) {
                    console.log('Book loaded from secure cache');
                    return of(new Blob([cachedData], { type: 'application/epub+zip' }));
                }

                // 2. Not in Cache: Check Network
                if (!navigator.onLine) {
                    return throwError(() => new Error('NO_INTERNET'));
                }

                // 3. Online: Fetch, Encrypt, Store
                // Usage of STREAM EBOOK (Full) primarily, falling back to public if needed.
                // This allows us to download the FULL book locally.
                // The Reader Component will restrict view to first 20 pages if user has no access.
                return this.ebookService.streamEbook(ebookId).pipe(
                    // Process the blob we got
                    switchMap(blob => from(blob.arrayBuffer())),
                    switchMap(buffer => from(this.saveToCache(ebookId, buffer))),
                    map(buffer => new Blob([buffer], { type: 'application/epub+zip' }))
                );
            })
        );
    }


    // Download with progress tracking
    public downloadBookWithProgress(ebookId: string, metadata: any = null): Observable<{ state: 'PENDING' | 'DOWNLOADING' | 'ENCRYPTING' | 'DONE' | 'ERROR', progress: number }> {
        // 1. Check cache first
        return from(this.getFromCache(ebookId)).pipe(
            switchMap(cachedData => {
                if (cachedData) {
                    // Repair: If we have data but maybe missing metadata (old download), save it now
                    if (metadata) {
                        this.saveMetadata(ebookId, metadata);
                    }
                    return of({ state: 'DONE' as const, progress: 100 });
                }

                if (!navigator.onLine) {
                    return throwError(() => new Error('NO_INTERNET'));
                }

                return new Observable<{ state: 'PENDING' | 'DOWNLOADING' | 'ENCRYPTING' | 'DONE' | 'ERROR', progress: number }>(observer => {
                    observer.next({ state: 'PENDING', progress: 0 });

                    this.ebookService.streamEbookWithProgress(ebookId).subscribe({
                        next: (event: HttpEvent<Blob>) => {
                            if (event.type === HttpEventType.DownloadProgress) {
                                const percentDone = Math.round(100 * event.loaded / (event.total || 1));
                                observer.next({ state: 'DOWNLOADING', progress: percentDone });
                            } else if (event.type === HttpEventType.Response) {
                                observer.next({ state: 'ENCRYPTING', progress: 99 });
                                const blob = event.body;
                                if (blob) {
                                    blob.arrayBuffer().then(buffer => {
                                        this.saveToCache(ebookId, buffer, metadata).then(() => {
                                            observer.next({ state: 'DONE', progress: 100 });
                                            observer.complete();
                                        });
                                    });
                                }
                            }
                        },
                        error: (err) => {
                            observer.next({ state: 'ERROR', progress: 0 });
                            observer.error(err);
                        }
                    });
                });
            })
        );
    }

    // --- Internal Storage Logic ---
    private async getFromCache(ebookId: string): Promise<ArrayBuffer | null> {
        try {
            const db = await this.getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(ebookId);

                request.onsuccess = async () => {
                    const record = request.result;
                    if (record) {
                        try {
                            const decrypted = await this.decryptData(record.data, record.iv);
                            resolve(decrypted);
                        } catch (e) {
                            console.error('Decryption failed', e);
                            // Verification failed (tampered data?) -> Treat as miss
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.warn('Error reading from cache', e);
            return null; // Fail safe
        }
    }

    private async saveToCache(ebookId: string, data: ArrayBuffer, metadata: any = null): Promise<ArrayBuffer> {
        try {
            const { buffer: encrypted, iv } = await this.encryptData(data);
            const db = await this.getDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);

                // If metadata is not provided, try to preserve existing metadata if updating?
                // For now, assume new download provides metadata.
                const record: any = {
                    data: encrypted,
                    iv: iv,
                    timestamp: Date.now()
                };

                if (metadata) {
                    record.metadata = metadata;
                }

                const request = store.put(record, ebookId);
                request.onsuccess = () => resolve(data); // Return original data to user immediately
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.warn('Failed to cache book', e);
            return data; // Return data anyway so user can read currently
        }
    }


    // Delete a book from cache
    public async deleteBook(ebookId: string): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(ebookId);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }

    // --- Local Favorites (LocalStorage) ---

    private readonly FAVORITES_KEY = 'local_favorites';

    getLocalFavorites(): string[] {
        const stored = isPlatformBrowser(this.platformId) ? localStorage.getItem(this.FAVORITES_KEY) : null;
        return stored ? JSON.parse(stored) : [];
    }

    isLocalFavorite(ebookId: string): boolean {
        const favorites = this.getLocalFavorites();
        return favorites.includes(ebookId);
    }

    addLocalFavorite(ebookId: string): void {
        const favorites = this.getLocalFavorites();
        if (!favorites.includes(ebookId)) {
            favorites.push(ebookId);
            if (isPlatformBrowser(this.platformId)) {
                localStorage.setItem(this.FAVORITES_KEY, JSON.stringify(favorites));
            }
        }
    }

    removeLocalFavorite(ebookId: string): void {
        let favorites = this.getLocalFavorites();
        favorites = favorites.filter(id => id !== ebookId);
        if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem(this.FAVORITES_KEY, JSON.stringify(favorites));
        }
    }
}
