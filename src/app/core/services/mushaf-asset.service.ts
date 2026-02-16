import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, from, firstValueFrom } from 'rxjs';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class MushafAssetService {
    private progressSubject = new BehaviorSubject<number>(0);
    public progress$ = this.progressSubject.asObservable();

    private loadingSubject = new BehaviorSubject<boolean>(false);
    public loading$ = this.loadingSubject.asObservable();

    private messageSubject = new BehaviorSubject<string>('');
    public message$ = this.messageSubject.asObservable();

    private errorSubject = new BehaviorSubject<string | null>(null);
    public error$ = this.errorSubject.asObservable();

    private totalFiles = 604 + 1 + 3 + 30; // 604 pages + Basmalah + 3 JSONs + 30 juz chunks
    private completedFiles = 0;

    constructor(private http: HttpClient) { }

    /**
     * Checks if the Mushaf assets are already downloaded on the device.
     * On Web, it always returns true (as we load from CDN/Server directly).
     */
    async checkForAssets(): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) {
            return true;
        }

        try {
            // Check for a marker file first
            await Filesystem.stat({
                path: 'mushaf_assets/completed.marker',
                directory: Directory.Data
            });

            // Verify essential files exist to prevent false positives from corrupt downloads
            await Filesystem.stat({
                path: 'mushaf_assets/data/mushaf.json',
                directory: Directory.Data
            });
            await Filesystem.stat({
                path: 'mushaf_assets/fonts/QCF_BSML.woff2',
                directory: Directory.Data
            });

            return true;
        } catch (e) {
            // If any check fails, consider assets missing/corrupt
            try {
                // Try to clean up the marker if it exists but other files are missing
                await Filesystem.deleteFile({
                    path: 'mushaf_assets/completed.marker',
                    directory: Directory.Data
                });
            } catch (cleanupErr) {
                // Ignore cleanup error
            }
            return false;
        }
    }

    async ensureAssets(): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;

        const hasAssets = await this.checkForAssets();
        if (hasAssets) return;

        // Start download and wait for it
        return this.downloadAssets();
    }

    /**
     * Starts the download process for all necessary assets.
     */
    async downloadAssets(): Promise<void> {
        if (this.loadingSubject.value) {
            // If already loading, wait for it to finish
            return new Promise((resolve) => {
                const sub = this.loadingSubject.subscribe(isLoading => {
                    if (!isLoading) {
                        sub.unsubscribe();
                        resolve();
                    }
                });
            });
        }

        this.loadingSubject.next(true);
        this.progressSubject.next(0);
        this.completedFiles = 0;
        this.errorSubject.next(null); // Clear previous errors
        this.messageSubject.next('بدء تحميل المصحف الشريف...');

        try {
            // Create directories first
            await this.ensureDirectory('mushaf_assets');
            await this.ensureDirectory('mushaf_assets/fonts');
            await this.ensureDirectory('mushaf_assets/data/mushaf_chunks');

            // 1. Download Data Files
            this.messageSubject.next('تحميل بيانات المصحف...');
            await this.downloadFile('data/mushaf.json', 'mushaf_assets/data/mushaf.json');
            await this.downloadFile('data/mushaf-metadata.json', 'mushaf_assets/data/mushaf-metadata.json');

            // 1a. Optional: Search Data (Don't let failures here stop the whole app)
            try {
                await this.downloadFile('data/quran-search.json', 'mushaf_assets/data/quran-search.json');
            } catch (searchErr) {
                console.warn('Search database not available on server, app will use online search fallback.', searchErr);
                // Increment completed files anyway to keep progress bar moving if it was counted
                this.completedFiles++;
            }

            // 1b. Download Juz Chunks
            for (let i = 1; i <= 30; i++) {
                await this.downloadFile(`data/mushaf_chunks/juz_${i}.json`, `mushaf_assets/data/mushaf_chunks/juz_${i}.json`);
            }

            // 2. Download Basmalah Font
            this.messageSubject.next('تحميل ملفات الخطوط...');
            await this.downloadFile('fonts/QCF_BSML.woff2', 'mushaf_assets/fonts/QCF_BSML.woff2');

            // 3. Download Page Fonts (1 to 604)
            const batchSize = 10;
            for (let i = 1; i <= 604; i += batchSize) {
                const promises = [];
                for (let j = 0; j < batchSize && (i + j) <= 604; j++) {
                    const pageNum = i + j;
                    const fontName = `QCF_P${pageNum.toString().padStart(3, '0')}.woff2`;
                    promises.push(this.downloadFile(`fonts/${fontName}`, `mushaf_assets/fonts/${fontName}`));
                }
                await Promise.all(promises);
            }

            // Write marker file
            await Filesystem.writeFile({
                path: 'mushaf_assets/completed.marker',
                data: 'completed',
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });

            this.messageSubject.next('تم التحميل بنجاح');
            this.progressSubject.next(100);
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error('Asset download failed:', error);
            const errMsg = 'حدث خطأ أثناء التحميل. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.';
            this.messageSubject.next(errMsg);
            this.errorSubject.next(errMsg);
            throw error;
        } finally {
            this.loadingSubject.next(false);
        }
    }

    private async ensureDirectory(path: string): Promise<void> {
        try {
            // Check if directory already exists to prevent plugin errors in logs
            const check = await Filesystem.stat({
                path,
                directory: Directory.Data
            }).catch(() => null);

            if (!check) {
                await Filesystem.mkdir({
                    path,
                    directory: Directory.Data,
                    recursive: true
                });
            }
        } catch (e) {
            // Ignore if exists or other minor error
        }
    }

    private async downloadFile(remotePath: string, localPath: string): Promise<void> {
        const url = `${environment.mushafBaseUrl}/${remotePath}`;

        try {
            const response = await Filesystem.downloadFile({
                url: url,
                path: localPath,
                directory: Directory.Data,
            });

            this.completedFiles++;
            const percent = Math.round((this.completedFiles / this.totalFiles) * 100);
            this.progressSubject.next(percent);
        } catch (err) {
            console.error(`Failed to download ${url}`, err);
            throw err;
        }
    }

    /**
     * Returns the local URI for a font file.
     */
    async getFontUri(fontName: string): Promise<string> {
        if (!Capacitor.isNativePlatform()) {
            return `${environment.mushafBaseUrl}/fonts/${fontName}.woff2`;
        }

        const path = `mushaf_assets/fonts/${fontName}.woff2`;
        try {
            // VERIFY if file actually exists before giving back the URI
            // getUri alone does NOT check existence
            await Filesystem.stat({
                path,
                directory: Directory.Data
            });

            const uriResult = await Filesystem.getUri({
                path,
                directory: Directory.Data
            });
            return Capacitor.convertFileSrc(uriResult.uri);
        } catch (e) {
            // Fallback to remote if missing or check failed
            console.warn(`[MushafAsset] Font ${fontName} not found locally, using remote fallback.`);
            return `${environment.mushafBaseUrl}/fonts/${fontName}.woff2`;
        }
    }

    /**
     * Loads JSON data from local filesystem on Native or Backend on Web.
     */
    async getJsonData<T>(path: string): Promise<T> {
        const url = `${environment.mushafBaseUrl}/${path}`;
        const cacheKey = `mushaf_cache_${path}`;
        console.log(`[MushafAsset] Fetching JSON: ${path} (Native: ${Capacitor.isNativePlatform()})`);

        if (!Capacitor.isNativePlatform()) {
            try {
                const data = await firstValueFrom(this.http.get<T>(url));
                // Cache it for offline use on Web
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(data));
                } catch (e) {
                    console.warn('[MushafAsset] LocalStorage quota exceeded, skipping cache.');
                }
                return data;
            } catch (err) {
                console.warn(`[MushafAsset] Web fetch failed for ${path}, trying localStorage cache.`);
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
                throw err;
            }
        }

        try {
            const result = await Filesystem.readFile({
                path: `mushaf_assets/${path}`,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            const data = JSON.parse(result.data as string);
            // Also update localStorage cache for consistency
            try {
                localStorage.setItem(cacheKey, JSON.stringify(data));
            } catch (e) {
                console.warn('[MushafAsset] LocalStorage quota exceeded (Native file read), skipping cache update.');
            }
            console.log(`[MushafAsset] Loaded ${path} from local persistent storage.`);
            return data;
        } catch (e) {
            // Check cache FIRST before attempting any network requests if file is missing from filesystem
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                console.log(`[MushafAsset] File ${path} missing from Storage, returning cached version.`);
                return JSON.parse(cached);
            }

            console.warn(`[MushafAsset] File ${path} not in persistent storage or cache, trying bundle.`);
            try {
                // Try to load from bundled assets (served by Capacitor local server)
                const data = await firstValueFrom(this.http.get<T>(path));
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(data));
                } catch (e) {
                    console.warn('[MushafAsset] LocalStorage quota exceeded (Bundle read), skipping cache update.');
                }
                return data;
            } catch (bundleErr) {
                // Only attempt remote if NOT on Android or if explicitly needed
                // For this user's offline-first request, we should be very careful
                console.warn(`[MushafAsset] File ${path} not in bundle, attempting remote as last resort.`);
                try {
                    const data = await firstValueFrom(this.http.get<T>(url));
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify(data));
                    } catch (e) {
                        console.warn('[MushafAsset] LocalStorage quota exceeded (Remote fetch), skipping cache update.');
                    }
                    return data;
                } catch (remoteErr) {
                    console.error(`[MushafAsset] Total failure to load ${path}:`, remoteErr);
                    throw remoteErr;
                }
            }
        }
    }

    getSurahVerses(surahId: number): number {
        const surahVerses: { [key: number]: number } = {
            1: 7, 2: 286, 3: 200, 4: 176, 5: 120, 6: 165, 7: 206, 8: 75, 9: 129, 10: 109,
            11: 123, 12: 111, 13: 43, 14: 52, 15: 99, 16: 128, 17: 111, 18: 110, 19: 98, 20: 135,
            21: 112, 22: 78, 23: 118, 24: 64, 25: 77, 26: 227, 27: 93, 28: 88, 29: 69, 30: 60,
            31: 34, 32: 30, 33: 73, 34: 54, 35: 45, 36: 83, 37: 182, 38: 88, 39: 75, 40: 85,
            41: 54, 42: 53, 43: 89, 44: 59, 45: 37, 46: 35, 47: 38, 48: 29, 49: 18, 50: 45,
            51: 60, 52: 49, 53: 62, 54: 55, 55: 78, 56: 96, 57: 29, 58: 22, 59: 24, 60: 13,
            61: 14, 62: 11, 63: 11, 64: 18, 65: 12, 66: 12, 67: 30, 68: 52, 69: 52, 70: 44,
            71: 28, 72: 28, 73: 20, 74: 56, 75: 40, 76: 31, 77: 50, 78: 40, 79: 46, 80: 42,
            81: 29, 82: 19, 83: 36, 84: 25, 85: 22, 86: 17, 87: 19, 88: 26, 89: 30, 90: 20,
            91: 15, 92: 21, 93: 11, 94: 8, 95: 8, 96: 19, 97: 5, 98: 8, 99: 8, 100: 11,
            101: 11, 102: 8, 103: 3, 104: 9, 105: 5, 106: 4, 107: 7, 108: 3, 109: 6, 110: 3,
            111: 5, 112: 4, 113: 5, 114: 6
        };
        return surahVerses[surahId] || 0;
    }
}
