import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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

    private isInitialSetupSubject = new BehaviorSubject<boolean>(false);
    public isInitialSetup$ = this.isInitialSetupSubject.asObservable();

    private totalFiles = 638; // default: 604 pages + Basmalah + 3 JSONs + 30 juz chunks
    private completedFiles = 0;
    private readonly MAX_RETRIES = 4;
    private readonly RETRY_DELAY_MS = 1500;

    // ZIP-based image download config (for warsh / tajweed)
    private readonly PAGES_PER_ZIP = 20;
    private readonly TOTAL_PAGES = 604;

    public localBaseUri: string = '';

    constructor(
        private http: HttpClient,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        if (Capacitor.isNativePlatform()) {
            Filesystem.getUri({
                path: 'mushaf_assets',
                directory: Directory.Data
            }).then(result => {
                this.localBaseUri = result.uri;
                console.log('[MushafAsset] Resolved localBaseUri:', this.localBaseUri);
            }).catch(err => {
                console.error('[MushafAsset] Failed to resolve local base URI:', err);
            });
        }
    }

    /**
     * Helper methods to manage selected Mushaf ID
     */
    getSelectedMushafId(): string {
        if (typeof window !== 'undefined' && window.localStorage) {
            return localStorage.getItem('selectedMushafId') || 'hafs_v1';
        }
        return 'hafs_v1';
    }

    setSelectedMushafId(id: string): void {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('selectedMushafId', id);
            // Bump version to bust cached JSON chunks for the new mushaf
            const prev = parseInt(localStorage.getItem('mushafVersion') || '1', 10);
            localStorage.setItem('mushafVersion', String(prev + 1));
        }
    }

    getMushafFolder(mushafId: string): string {
        return mushafId === 'hafs_v1' ? '' : `${mushafId}/`;
    }

    fetchMushafList(): Observable<any[]> {
        if (!Capacitor.isNativePlatform()) {
            return this.http.get<any[]>('/api/mushafs');
        }
        return this.http.get<any[]>(`${environment.apiBaseUrl}/mushafs`);
    }

    getRemotePageImageUrl(pageNumber: number, mushafId: string): string {
        if (mushafId === 'warsh') {
            return `https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/kfgqpc/warsh/${pageNumber}.jpg`;
        }
        if (mushafId === 'tajweed') {
            return `https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/easyquran.com/hafs-tajweed/${pageNumber}.jpg`;
        }
        return '';
    }

    /**
     * Checks if the Mushaf assets are already downloaded on the device.
     * On Web, it always returns true (as we load from CDN/Server directly).
     */
    async checkForAssets(mushafId?: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) {
            return true;
        }

        const id = mushafId || this.getSelectedMushafId();
        const folder = this.getMushafFolder(id);
        const pathPrefix = `mushaf_assets/${folder}`;

        try {
            // Check for a marker file first
            await Filesystem.stat({
                path: `${pathPrefix}completed.marker`,
                directory: Directory.Data
            });

            // Verify essential files exist to prevent false positives from corrupt downloads
            await Filesystem.stat({
                path: `${pathPrefix}data/mushaf.json`,
                directory: Directory.Data
            });

            if (id === 'warsh' || id === 'tajweed') {
                // For image mushafs, verify the first page image exists
                await Filesystem.stat({
                    path: `${pathPrefix}images/1.jpg`,
                    directory: Directory.Data
                });
            } else {
                // For font mushafs, verify the basmalah font exists
                await Filesystem.stat({
                    path: `${pathPrefix}fonts/QCF_BSML.woff2`,
                    directory: Directory.Data
                });
            }

            return true;
        } catch (e) {
            // If any check fails, consider assets missing/corrupt
            try {
                // Try to clean up the marker if it exists but other files are missing
                await Filesystem.deleteFile({
                    path: `${pathPrefix}completed.marker`,
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

        const currentMushafId = this.getSelectedMushafId();
        const hasAssets = await this.checkForAssets(currentMushafId);
        if (hasAssets) return;

        // Start download and wait for it
        this.isInitialSetupSubject.next(true);
        try {
            await this.downloadAssets(currentMushafId);
            this.isInitialSetupSubject.next(false); // Only clear on success
        } catch (error) {
            console.error('Initial assets download failed:', error);
            // Keep isInitialSetup true so error overlay remains visible for retry
        }
    }

    /**
     * Starts the download process for all necessary assets of a specific mushaf.
     */
    async downloadAssets(mushafId?: string): Promise<void> {
        const id = mushafId || this.getSelectedMushafId();
        const folder = this.getMushafFolder(id);
        const pathPrefix = `mushaf_assets/${folder}`;

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

        // Set correct total files count per mushaf type
        // warsh/tajweed: 604 images + 2 JSON + 1 search JSON + 30 chunks + 1 basmalah font
        // hafs: 604 fonts + 1 basmalah + 2 JSON + 1 search + 30 chunks
        this.totalFiles = 604 + 1 + 3 + 30;

        this.loadingSubject.next(true);
        this.progressSubject.next(0);
        this.completedFiles = 0;
        this.errorSubject.next(null); // Clear previous errors
        this.messageSubject.next('بدء تحميل المصحف الشريف...');

        try {
            // Create directories first
            await this.ensureDirectory(pathPrefix);
            await this.ensureDirectory(`${pathPrefix}fonts`);
            await this.ensureDirectory(`${pathPrefix}data/mushaf_chunks`);
            if (id === 'warsh' || id === 'tajweed') {
                await this.ensureDirectory(`${pathPrefix}images`);
            }

            // 1. Download Data Files
            this.messageSubject.next('تحميل بيانات المصحف...');
            await this.downloadFile('data/mushaf.json', `${pathPrefix}data/mushaf.json`, id);
            await this.downloadFile('data/mushaf-metadata.json', `${pathPrefix}data/mushaf-metadata.json`, id);

            // 1a. Optional: Search Data (Don't let failures here stop the whole app)
            try {
                await this.downloadFile('data/quran-search.json', `${pathPrefix}data/quran-search.json`, id);
            } catch (searchErr) {
                console.warn('Search database not available on server, app will use online search fallback.', searchErr);
                // Increment completed files anyway to keep progress bar moving if it was counted
                this.completedFiles++;
            }

            // 1b. Download Juz Chunks
            for (let i = 1; i <= 30; i++) {
                await this.downloadFile(`data/mushaf_chunks/juz_${i}.json`, `${pathPrefix}data/mushaf_chunks/juz_${i}.json`, id);
            }

            // 2. Download Basmalah Font
            this.messageSubject.next('تحميل ملفات الخطوط...');
            // Download from the main hafs_v1 folder to guarantee the file exists on the server
            await this.downloadFile('fonts/QCF_BSML.woff2', `${pathPrefix}fonts/QCF_BSML.woff2`, 'hafs_v1');

            // 3. Download Page Fonts OR Images (via ZIP batches)
            if (id === 'warsh' || id === 'tajweed') {
                const totalGroups = Math.ceil(this.TOTAL_PAGES / this.PAGES_PER_ZIP);
                // totalFiles = ZIP groups + data files + basmalah font
                this.totalFiles = totalGroups + 3 + 30 + 1;
                this.messageSubject.next('تحميل حزم صفحات المصحف...');

                for (let g = 0; g < totalGroups; g++) {
                    const startPage = g * this.PAGES_PER_ZIP + 1;
                    const endPage   = Math.min(startPage + this.PAGES_PER_ZIP - 1, this.TOTAL_PAGES);
                    const zipFileName = `pages_${String(startPage).padStart(3, '0')}_${String(endPage).padStart(3, '0')}.zip`;
                    const zipUrl = `${environment.mushafBaseUrl}/${folder}images/${zipFileName}`;

                    this.messageSubject.next(`تحميل صفحات ${startPage}–${endPage}...`);
                    await this.downloadAndExtractZip(zipUrl, `${pathPrefix}images`, startPage, endPage);
                }
            } else {
                // Hafs v1 / Hafs v2 - Download zipped data and fonts directly!
                this.totalFiles = 100; // Represented as 100% total progress
                this.completedFiles = 0;

                // 1. Download and Extract Data Zip (contains all data files, maps to 0-30% progress)
                this.messageSubject.next('تحميل بيانات المصحف الشريف...');
                const dataZipUrl = `${environment.mushafBaseUrl}/${folder}data.zip`;
                await this.downloadAndExtractFolderZip(dataZipUrl, pathPrefix, 0, 30);

                // 2. Download and Extract Fonts Zip (contains all font files, maps to 30-100% progress)
                this.messageSubject.next('تحميل ملفات خطوط المصحف...');
                const fontsZipUrl = `${environment.mushafBaseUrl}/${folder}fonts.zip`;
                await this.downloadAndExtractFolderZip(fontsZipUrl, pathPrefix, 30, 70);
            }

            // Write marker file
            await Filesystem.writeFile({
                path: `${pathPrefix}completed.marker`,
                data: 'completed',
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });

            this.messageSubject.next('تم التحميل بنجاح');
            this.progressSubject.next(100);
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error: any) {
            console.error('Asset download failed:', error);
            const detail = error?.message || (typeof error === 'string' ? error : JSON.stringify(error)) || '';
            const errMsg = `حدث خطأ: ${detail.substring(0, 100)}`;
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

    private async downloadFile(remotePath: string, localPath: string, mushafId: string = 'hafs_v1'): Promise<void> {
        const folder = this.getMushafFolder(mushafId);
        const url = `${environment.mushafBaseUrl}/${folder}${remotePath}`;
        await this.downloadWithRetry(url, localPath);
    }

    /**
     * Downloads a ZIP archive from the server, extracts all images,
     * and writes them individually to the local filesystem.
     * Uses Filesystem.downloadFile to avoid CapacitorHttp ArrayBuffer incompatibility.
     */
    private async downloadAndExtractZip(
        zipUrl: string,
        imagesDir: string,
        startPage: number,
        endPage: number
    ): Promise<void> {
        const tempZipPath = `${imagesDir}/_temp_${startPage}.zip`;
        let lastError: any;

        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                // Step 1: Download ZIP as a native file (bypasses CapacitorHttp ArrayBuffer issue)
                await Filesystem.downloadFile({
                    url: zipUrl,
                    path: tempZipPath,
                    directory: Directory.Data,
                    headers: { 'Cache-Control': 'no-cache' }
                });

                // Step 2: Get native URI and read as ArrayBuffer (avoids base64 memory overhead ~33% savings)
                const uriResult = await Filesystem.getUri({
                    path: tempZipPath,
                    directory: Directory.Data,
                });
                const nativeUrl = Capacitor.convertFileSrc(uriResult.uri);
                const fetchResponse = await fetch(nativeUrl);
                const arrayBuffer = await fetchResponse.arrayBuffer();

                // Step 3: Load into JSZip using ArrayBuffer (more memory efficient than base64)
                const JSZipModule = await import('jszip');
                const JSZipConstructor = JSZipModule.default || JSZipModule;
                const zip = await JSZipConstructor.loadAsync(arrayBuffer);

                // Step 4: Extract and write each image file in parallel
                const writePromises: Promise<void>[] = [];
                for (let p = startPage; p <= endPage; p++) {
                    const filename = `${p}.jpg`;
                    const zipEntry = zip.file(filename);
                    if (!zipEntry) {
                        console.warn(`[ZIP] Missing ${filename} in ${zipUrl}`);
                        continue;
                    }
                    writePromises.push(
                        zipEntry.async('base64').then(base64Data =>
                            Filesystem.writeFile({
                                path: `${imagesDir}/${filename}`,
                                data: base64Data,
                                directory: Directory.Data,
                            })
                        ).then(() => {})
                    );
                }
                await Promise.all(writePromises);

                // Step 5: Clean up temp ZIP file
                try {
                    await Filesystem.deleteFile({ path: tempZipPath, directory: Directory.Data });
                } catch (cleanupErr) {
                    // Ignore cleanup errors
                }

                // Update progress
                this.completedFiles++;
                const percent = Math.round((this.completedFiles / this.totalFiles) * 100);
                this.progressSubject.next(percent);
                return; // success

            } catch (err: any) {
                // Clean up temp file on error
                try {
                    await Filesystem.deleteFile({ path: tempZipPath, directory: Directory.Data });
                } catch (e) {}

                lastError = err;
                console.warn(`[ZIP] Attempt ${attempt}/${this.MAX_RETRIES} failed for ${zipUrl}:`, err?.message || err);
                if (attempt < this.MAX_RETRIES) {
                    const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    this.messageSubject.next(`إعادة المحاولة... (${attempt}/${this.MAX_RETRIES - 1})`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw lastError;
    }

    /**
     * Downloads a ZIP file containing folders/files and extracts it relative to the pathPrefix.
     * Extracts in batches of 30 files to avoid Android IO thread blocks and timeouts.
     */
    private async downloadAndExtractFolderZip(
        zipUrl: string,
        pathPrefix: string,
        progressOffset: number = 0,
        progressScale: number = 100
    ): Promise<void> {
        const tempZipPath = `${pathPrefix}temp_archive.zip`;
        let lastError: any;

        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                // Set explicit status message to prevent user from thinking it froze
                const isFonts = zipUrl.includes('fonts');
                if (isFonts) {
                    this.messageSubject.next('جاري تحميل ملفات الخطوط (قد يستغرق دقائق)...');
                } else {
                    this.messageSubject.next('جاري تحميل ملف البيانات المصحف...');
                }

                // Step 1: Download ZIP to native storage
                await Filesystem.downloadFile({
                    url: zipUrl,
                    path: tempZipPath,
                    directory: Directory.Data,
                    headers: { 'Cache-Control': 'no-cache' }
                });

                // Extraction starts, update message
                if (isFonts) {
                    this.messageSubject.next('جاري فك ضغط وتجهيز الخطوط...');
                } else {
                    this.messageSubject.next('جاري فك ضغط ملف البيانات...');
                }

                // Step 2: Get native URI and read as ArrayBuffer (avoids base64 memory overhead ~33% savings)
                const uriResult = await Filesystem.getUri({
                    path: tempZipPath,
                    directory: Directory.Data,
                });
                const nativeUrl = Capacitor.convertFileSrc(uriResult.uri);
                const fetchResponse = await fetch(nativeUrl);
                const arrayBuffer = await fetchResponse.arrayBuffer();

                // Step 3: Parse ZIP with JSZip using ArrayBuffer (more memory efficient than base64)
                const JSZipModule = await import('jszip');
                const JSZipConstructor = JSZipModule.default || JSZipModule;
                const zip = await JSZipConstructor.loadAsync(arrayBuffer);

                // Step 4: Extract and write files in batches (grouped to prevent filesystem/IO overload)
                const files = Object.keys(zip.files).filter(filePath => {
                    const entry = zip.file(filePath);
                    return entry && !entry.dir;
                });
                
                const batchSize = 30;
                for (let i = 0; i < files.length; i += batchSize) {
                    const batch = files.slice(i, i + batchSize);
                    const writePromises: Promise<void>[] = [];
                    
                    for (const relativeFilePath of batch) {
                        const zipEntry = zip.file(relativeFilePath);
                        if (!zipEntry) continue;

                        // Create subdirectories if needed (e.g. data/mushaf_chunks/)
                        const parts = relativeFilePath.split('/');
                        if (parts.length > 1) {
                            const dirToCreate = parts.slice(0, -1).join('/');
                            await this.ensureDirectory(`${pathPrefix}${dirToCreate}`);
                        }

                        writePromises.push(
                            zipEntry.async('base64').then(base64Data =>
                                Filesystem.writeFile({
                                    path: `${pathPrefix}${relativeFilePath}`,
                                    data: base64Data,
                                    directory: Directory.Data,
                                })
                            ).then(() => {})
                        );
                    }
                    
                    await Promise.all(writePromises);

                    // Update progress dynamically during extraction!
                    const extractPercent = Math.round(((i + batch.length) / files.length) * progressScale);
                    const currentPercent = progressOffset + extractPercent;
                    this.progressSubject.next(Math.min(currentPercent, progressOffset + progressScale));
                }
                
                // Step 5: Clean up temp ZIP file
                try {
                    await Filesystem.deleteFile({ path: tempZipPath, directory: Directory.Data });
                } catch (cleanupErr) {
                    // Ignore
                }

                return; // success
            } catch (err: any) {
                try {
                    await Filesystem.deleteFile({ path: tempZipPath, directory: Directory.Data });
                } catch (e) {}
                lastError = err;
                console.warn(`[FolderZIP] Attempt ${attempt}/${this.MAX_RETRIES} failed for ${zipUrl}:`, err?.message || err);
                if (attempt < this.MAX_RETRIES) {
                    const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    this.messageSubject.next(`إعادة المحاولة... (${attempt}/${this.MAX_RETRIES - 1})`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw lastError;
    }

    private async downloadRemoteImage(url: string, localPath: string): Promise<void> {
        await this.downloadWithRetry(url, localPath);
    }

    /**
     * Downloads a file from a URL to a local path with exponential backoff retry.
     */
    private async downloadWithRetry(url: string, localPath: string): Promise<void> {
        let lastError: any;
        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                await Filesystem.downloadFile({
                    url,
                    path: localPath,
                    directory: Directory.Data,
                    // readTimeout and connectTimeout not supported on all versions,
                    // but adding headers helps with GitHub raw rate limits
                    headers: { 'Cache-Control': 'no-cache' }
                });
                this.completedFiles++;
                const percent = Math.round((this.completedFiles / this.totalFiles) * 100);
                this.progressSubject.next(percent);
                return; // success
            } catch (err: any) {
                lastError = err;
                console.warn(`[Download] Attempt ${attempt}/${this.MAX_RETRIES} failed for ${url}:`, err?.message || err);
                if (attempt < this.MAX_RETRIES) {
                    // Exponential backoff: 1.5s, 3s, 6s
                    const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    this.messageSubject.next(`إعادة المحاولة... (${attempt}/${this.MAX_RETRIES - 1})`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        console.error(`[Download] All ${this.MAX_RETRIES} attempts failed for ${url}`, lastError);
        throw lastError;
    }

    /**
     * Returns the local URI for a font file.
     */
    async getFontUri(fontName: string): Promise<string> {
        const id = this.getSelectedMushafId();
        const folder = this.getMushafFolder(id);
        const pathPrefix = `mushaf_assets/${folder}`;

        if (!Capacitor.isNativePlatform()) {
            return `${environment.mushafBaseUrl}/${folder}fonts/${fontName}.woff2`;
        }

        const path = `${pathPrefix}fonts/${fontName}.woff2`;
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
            return `${environment.mushafBaseUrl}/${folder}fonts/${fontName}.woff2`;
        }
    }

    /**
     * Loads JSON data from local filesystem on Native or Backend on Web.
     */
    async getJsonData<T>(path: string): Promise<T> {
        const id = this.getSelectedMushafId();
        const folder = this.getMushafFolder(id);
        const pathPrefix = `mushaf_assets/${folder}`;

        const url = `${environment.mushafBaseUrl}/${folder}${path}`;
        // Append a cache-buster so stale browser-cached versions (e.g. empty []) are never served
        // after server-side regeneration. The version key changes only when the mushaf selection changes.
        const mushafVersion = localStorage.getItem('mushafVersion') || '1';
        const bustUrl = `${url}?v=${id}_${mushafVersion}`;
        const cacheKey = `mushaf_cache_${id}_${path}`;
        console.log(`[MushafAsset] Fetching JSON: ${path} for ${id} (Native: ${Capacitor.isNativePlatform()})`);

        if (!Capacitor.isNativePlatform()) {
            try {
                const data = await firstValueFrom(this.http.get<T>(bustUrl));
                // Cache it for offline use on Web
                try {
                    if (isPlatformBrowser(this.platformId)) {
                        localStorage.setItem(cacheKey, JSON.stringify(data));
                    }
                } catch (e) {
                    console.warn('[MushafAsset] LocalStorage quota exceeded, skipping cache.');
                }
                return data;
            } catch (err) {
                console.warn(`[MushafAsset] Web fetch failed for ${path}, trying localStorage cache.`);
                const cached = isPlatformBrowser(this.platformId) ? localStorage.getItem(cacheKey) : null;
                if (cached) {
                    return JSON.parse(cached);
                }
                throw err;
            }
        }

        try {
            const result = await Filesystem.readFile({
                path: `${pathPrefix}${path}`,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            const data = JSON.parse(result.data as string);
            // Also update localStorage cache for consistency
            try {
                if (isPlatformBrowser(this.platformId)) {
                    localStorage.setItem(cacheKey, JSON.stringify(data));
                }
            } catch (e) {
                console.warn('[MushafAsset] LocalStorage quota exceeded (Native file read), skipping cache update.');
            }
            console.log(`[MushafAsset] Loaded ${path} from local persistent storage.`);
            return data;
        } catch (e) {
            // Check cache FIRST before attempting any network requests if file is missing from filesystem
            const cached = isPlatformBrowser(this.platformId) ? localStorage.getItem(cacheKey) : null;
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

    /**
     * Clears the error state so the UI overlay can be dismissed after a failed download.
     */
    clearError(): void {
        this.errorSubject.next(null);
        this.loadingSubject.next(false);
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
