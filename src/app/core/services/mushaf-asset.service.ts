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

    private totalFiles = 604 + 1 + 2 + 30; // 604 pages + Basmalah + 2 JSONs + 30 juz chunks
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

            // 1b. Download Juz Chunks
            for (let i = 1; i <= 30; i++) {
                await this.downloadFile(`data/mushaf_chunks/juz_${i}.json`, `mushaf_assets/data/mushaf_chunks/juz_${i}.json`);
            }

            // 2. Download Basmalah Font
            this.messageSubject.next('تحميل ملفات الخطوط...');
            await this.downloadFile('fonts/QCF_BSML.woff2', 'mushaf_assets/fonts/QCF_BSML.woff2');

            // 3. Download Page Fonts (1 to 604)
            // Batch them to avoid hitting connection limits but keep it fast
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

            // Small delay to let UI show 100%
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error('Asset download failed:', error);
            this.messageSubject.next('حدث خطأ أثناء التحميل. يرجى التحقق من الإنترنت.');
            throw error;
        } finally {
            this.loadingSubject.next(false);
        }
    }

    private async ensureDirectory(path: string): Promise<void> {
        try {
            await Filesystem.mkdir({
                path,
                directory: Directory.Data,
                recursive: true
            });
        } catch (e) {
            // Ignore if exists
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

        try {
            const uriResult = await Filesystem.getUri({
                path: `mushaf_assets/fonts/${fontName}.woff2`,
                directory: Directory.Data
            });
            return Capacitor.convertFileSrc(uriResult.uri);
        } catch (e) {
            // Fallback to remote if missing (should not happen if check passed)
            console.warn(`Font ${fontName} not found locally, using remote.`);
            return `${environment.mushafBaseUrl}/fonts/${fontName}.woff2`;
        }
    }

    /**
     * Loads JSON data from local filesystem on Native or Backend on Web.
     */
    async getJsonData<T>(path: string): Promise<T> {
        const url = `${environment.mushafBaseUrl}/${path}`;
        console.log(`[MushafAsset] Fetching JSON: ${path} (Native: ${Capacitor.isNativePlatform()})`);

        if (!Capacitor.isNativePlatform()) {
            return firstValueFrom(this.http.get<T>(url));
        }

        try {
            const result = await Filesystem.readFile({
                path: `mushaf_assets/${path}`,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            console.log(`[MushafAsset] Loaded ${path} from local storage.`);
            return JSON.parse(result.data as string);
        } catch (e) {
            console.warn(`[MushafAsset] File ${path} not found locally, falling back to remote: ${url}`);
            return firstValueFrom(this.http.get<T>(url));
        }
    }
}
