import { Injectable } from '@angular/core';
import { EbookService } from './ebook.service';
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

    constructor(private ebookService: EbookService) {
        this.initDB();
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
        const storedKey = localStorage.getItem('app_kek');
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
            localStorage.setItem('app_kek', JSON.stringify(exportedKey));
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
                // We use streamEbook from the existing service, but we handle the retry logic there
                return this.ebookService.streamEbook(ebookId).pipe( // Default to authenticated stream
                    catchError(err => {
                        // Fallback to public stream if 401/403 (same logic as before)
                        if (err.status === 401 || err.status === 403) {
                            return this.ebookService.streamPublicEbook(ebookId);
                        }
                        return throwError(() => err);
                    }),
                    switchMap(blob => from(blob.arrayBuffer())),
                    switchMap(buffer => from(this.saveToCache(ebookId, buffer))),
                    map(buffer => new Blob([buffer], { type: 'application/epub+zip' }))
                );
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

    private async saveToCache(ebookId: string, data: ArrayBuffer): Promise<ArrayBuffer> {
        try {
            const { buffer: encrypted, iv } = await this.encryptData(data);
            const db = await this.getDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const record = {
                    data: encrypted,
                    iv: iv,
                    timestamp: Date.now()
                };

                const request = store.put(record, ebookId);
                request.onsuccess = () => resolve(data); // Return original data to user immediately
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.warn('Failed to cache book', e);
            return data; // Return data anyway so user can read currently
        }
    }
}
