import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, HostListener, Inject, PLATFORM_ID } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import ePub, { Book, Rendition, NavItem } from 'epubjs';
import { EbookService } from '../services/ebook.service';
import { ReadingProgressService } from '../services/reading-progress.service';
import { UserLibraryService } from '../services/user-library.service';
import { Ebook, ReadingProgress, ReaderSettings, Bookmark, Highlight } from '../models/ebook.model';
import { OfflineEbookService } from '../services/offline-ebook.service';
import { DownloadManagerService } from '../services/download-manager.service';
import { ExternalLibraryService } from '../services/external-library.service';
import { GamificationService } from '../services/gamification.service';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
@Component({
    selector: 'app-epub-reader',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './epub-reader.component.html',
    styleUrls: ['./epub-reader.component.css']
})
export class EpubReaderComponent implements OnInit, OnDestroy, AfterViewInit {

    ebookId: string = '';
    ebook: Ebook | null = null;
    book: Book | null = null;
    rendition: Rendition | null = null;
    progress: ReadingProgress | null = null;

    // Book Type State
    bookType: 'epub' | 'bok' = 'epub';
    bokPages: string[] = [];
    bokContentFull: string = '';
    idMap: { [key: string]: number } = {};

    // State
    isLoading = true;
    isNavigating = false;
    error: string | null = null;
    hasAccess = false;

    // Preview/Subscription State
    showSubscriptionPrompt = false;
    showAuthModal = false;
    isPreviewMode = true;
    private initialLocation: string | null = null;
    private selectionTimeout: any;
    prices = { monthly: 50, yearly: 500 };

    // Touch Handling
    private touchStartX: number = 0;
    private touchStartY: number = 0;
    private readonly SWIPE_THRESHOLD = 50; // Minimum distance for swipe
    dragOffset: number = 0; // Real-time drag offset for smooth animation
    isDragging: boolean = false; // Track if user is actively dragging

    // UI State
    isControlsVisible = true;
    activeSection: 'toc' | 'settings' | 'bookmarks' | 'highlights' | null = null;
    isFullscreen = false;

    // Content Width Control
    contentWidth = 900; // Will be set to effectiveMaxWidth in ngOnInit
    readonly minContentWidth = 300;
    readonly maxContentWidth = 9999; // No practical cap — fill the screen
    readonly contentWidthStep = 100;

    // Animation State
    animationClass: string = '';

    // Auto-Scroll Feature
    isAutoScrolling = false;
    autoScrollSpeed = 0.5; // pixels per frame — gentle reading pace
    readonly autoScrollMinSpeed = 0.1;
    readonly autoScrollMaxSpeed = 2;
    readonly autoScrollSpeedStep = 0.1;
    private autoScrollAnimationId: number | null = null;

    // Calculate max allowed width based on screen size with responsive margin
    get effectiveMaxWidth(): number {
        if (!this.isBrowser) return 900;
        // Very minimal margins — content fills almost the entire screen width
        const sideMargin = window.innerWidth < 600 ? 4 : 6;
        const availableWidth = window.innerWidth - (sideMargin * 2);
        return Math.max(this.minContentWidth, availableWidth);
    }

    // Reader State
    currentPage = 0;
    totalPages = 0;
    currentCfi: string | null = null;
    progressPercent = 0;
    currentChapter = '';

    // Table of Contents
    toc: NavItem[] = [];

    // Persistence State
    private isProgressLoaded = false;
    private lastSaveTime = 0;
    private readonly SAVE_DEBOUNCE_MS = 2000;

    // Settings
    settings: ReaderSettings = {
        fontSize: 18,
        fontFamily: 'Cairo', // Better default for Arabic
        theme: 'light',
        backgroundColor: '#ffffff',
        textColor: '#1a1a1a',
        lineHeight: 1.6,
        autoScrollSpeed: 0,
        textAlign: 'justify',
        margin: 'normal',
        backgroundImage: null,
        layoutMode: 'scroll'
    };

    bookmarks: Bookmark[] = [];
    highlights: Highlight[] = [];

    // Selection/Highlight State
    showSelectionPopup = false;
    selectionPopupPosition = { x: 0, y: 0 };
    selectedText = '';
    selectedCfiRange = '';
    currentSelectionRange: Range | null = null; // Store the actual Range for DOM manipulation
    currentSelectionContents: any = null; // Store the epub contents object
    highlightColors = [
        { name: 'أصفر', color: '#fef08a' },
        { name: 'أخضر', color: '#bbf7d0' },
        { name: 'أزرق', color: '#bfdbfe' },
        { name: 'وردي', color: '#fbcfe8' },
        { name: 'برتقالي', color: '#fed7aa' },
        { name: 'مسح التظليل', color: 'remove', isRemove: true }
    ];

    private saveProgressInterval: any = null;
    private readingStartTime: number = 0;
    private pagesReadSinceLastSync = new Set<number>();
    private spinePageCounts: number[] = []; // Track visual page count per spine item (chapter)

    // Temporary variable for background image input
    tempBackgroundImage: string = '';

    isBrowser: boolean;
    private boundHandleKeydown: any;

    @ViewChild('readerContainer') readerContainer!: ElementRef;
    @ViewChild('bokReaderContainer') bokReaderContainer!: ElementRef;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private ebookService: EbookService,
        private readingProgressService: ReadingProgressService,
        private userLibraryService: UserLibraryService,
        private offlineEbookService: OfflineEbookService,
        private downloadManager: DownloadManagerService,
        private externalLibraryService: ExternalLibraryService,
        private gamificationService: GamificationService,
        private cdr: ChangeDetectorRef,
        private sanitizer: DomSanitizer,
        private hostEl: ElementRef,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        this.isBrowser = isPlatformBrowser(this.platformId);
        if (this.isBrowser) {
            this.boundHandleKeydown = this.handleKeydown.bind(this);
        }
    }

    ngOnInit(): void {
        this.ebookId = this.route.snapshot.paramMap.get('ebookId') || '';
        if (!this.ebookId) {
            this.router.navigate(['/library']);
            return;
        }

        // Check if BOK (Shamela) - support both ext- and ext_ prefixes
        // Also check for source=shamela query param
        const source = this.route.snapshot.queryParamMap.get('source');
        if (this.ebookId.startsWith('ext-') || this.ebookId.startsWith('ext_') || source === 'shamela') {
            this.bookType = 'bok';
        }

        // Set initial content width based on screen size
        this.contentWidth = this.effectiveMaxWidth; // Fill the screen by default

        this.checkAccessAndLoad().catch(err => {
            console.error('Initial load failed', err);
            this.isLoading = false;
            this.error = 'فشل تحميل الكتاب. يرجى إعادة المحاولة.';
            this.cdr.detectChanges();
        });

        if (this.isBrowser) {
            this.readingStartTime = Date.now();
            this.saveProgressInterval = setInterval(() => {
                this.saveProgress();
            }, 10000);
        }
    }

    ngAfterViewInit(): void {
        if (this.isBrowser) {
            document.addEventListener('keydown', this.boundHandleKeydown);
            document.addEventListener('selectionchange', this.handleSelectionChange);
            
            // Add scroll listener to BOK container if it exists
            if (this.bokReaderContainer) {
                this.bokReaderContainer.nativeElement.addEventListener('scroll', this.handleScroll, { passive: true });
            }
        }
    }

    ngOnDestroy(): void {
        this.stopAutoScroll(); // Clean up auto-scroll animation
        this.saveProgress();
        if (this.saveProgressInterval) clearInterval(this.saveProgressInterval);
        if (this.book) this.book.destroy();
        if (this.isBrowser) {
            document.removeEventListener('keydown', this.boundHandleKeydown);
            document.removeEventListener('selectionchange', this.handleSelectionChange);
            if (this.bokReaderContainer) {
                this.bokReaderContainer.nativeElement.removeEventListener('scroll', this.handleScroll);
            }
        }
    }

    // Listen for window resize to adjust content width
    @HostListener('window:resize')
    onWindowResize() {
        if (!this.isBrowser) return;
        // If current width exceeds new effective max, adjust it
        if (this.contentWidth > this.effectiveMaxWidth) {
            this.contentWidth = this.effectiveMaxWidth;
            if (this.bookType === 'epub') this.resizeRendition();
        }
    }

    @HostListener('window:beforeunload')
    onBeforeUnload() {
        this.saveProgress();
    }
    private handleKeydown(event: KeyboardEvent): void {
        if (this.isNavigating) return;

        // Arabic RTL books navigation: ArrowRight (and ArrowDown) -> Next Page, ArrowLeft (and ArrowUp) -> Prev Page
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            if (this.settings.layoutMode === 'pages' && this.rendition) {
                const view = (this.rendition as any).manager?.current();
                const doc = view?.document;
                if (doc && event.key === 'ArrowDown') {
                    const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
                    const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop;
                    const clientHeight = doc.documentElement.clientHeight || doc.body.clientHeight;
                    // If not at bottom, let the default vertical scroll happen
                    if (scrollHeight - (scrollTop + clientHeight) > 20) {
                        return;
                    }
                }
            }
            this.nextPage();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            if (this.settings.layoutMode === 'pages' && this.rendition) {
                const view = (this.rendition as any).manager?.current();
                const doc = view?.document;
                if (doc && event.key === 'ArrowUp') {
                    const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop;
                    // If not at top, let the default vertical scroll happen
                    if (scrollTop > 10) {
                        return;
                    }
                }
            }
            this.prevPage();
        } else if (event.key === 'Escape') {
            this.closeAllPanels();
        }
    }

    private async checkAccessAndLoad(): Promise<void> {
        this.isLoading = true;
        this.cdr.detectChanges();

        try {
            // --- BOK File Logic ---
            if (this.bookType === 'bok') {
                // Check if the book is downloaded locally first
                const isBokDownloaded = await this.downloadManager.isBookAvailable(this.ebookId);
                
                this.hasAccess = isBokDownloaded ? true : false;
                this.isPreviewMode = isBokDownloaded ? false : true;

                this.ebook = {
                    _id: this.ebookId,
                    title: 'الكتاب الشامل',
                    author: 'غير معروف',
                    accessType: isBokDownloaded ? 'owned' : 'preview'
                } as any;

                // Fire and forget access check to not block the reader
                this.userLibraryService.checkAccess(this.ebookId).pipe(
                    // Short timeout for the observable itself
                    timeout(3000),
                    catchError(err => {
                        console.warn('Access check background failed', err);
                        // If it's already downloaded, we default to full offline access
                        if (isBokDownloaded) {
                            return of({ hasAccess: true, accessType: 'owned' });
                        }
                        return of({ hasAccess: false, accessType: 'preview' });
                    })
                ).subscribe((res: any) => {
                    if (res) {
                        this.hasAccess = res.hasAccess;
                        this.isPreviewMode = res.accessType === 'preview' || !this.hasAccess;
                        this.cdr.detectChanges();
                    }
                });

                // Load the file (has its own internal timeouts)
                await this.loadBokFile();
                this.isLoading = false;
                this.cdr.detectChanges();
                return;
            }

            // --- EPUB Logic ---
            // 1. Get cached status if available
            const isCached = await this.offlineEbookService.isBookCached(this.ebookId);
            const cachedMetadata = isCached ? await this.offlineEbookService.getMetadata(this.ebookId) : null;

            // 2. Determine Initial Access Mode from Cache (INSTANT)
            if (isCached) {
                console.log('Using offline cached metadata for immediate access');
                if (cachedMetadata && cachedMetadata.accessType === 'owned') {
                    if (cachedMetadata.subscriptionExpiry) {
                        const expiry = new Date(cachedMetadata.subscriptionExpiry);
                        const now = new Date();
                        if (now > expiry) {
                            console.warn('Offline subscription expired:', expiry);
                            this.hasAccess = false;
                            this.isPreviewMode = true;
                            // Don't error immediately, let the background network check verify
                        } else {
                            this.hasAccess = true;
                            this.isPreviewMode = false;
                        }
                    } else {
                        // Cached as owned but no expiry
                        this.hasAccess = true; 
                        this.isPreviewMode = false;
                    }
                } else {
                    this.hasAccess = false;
                    this.isPreviewMode = true;
                }
            } else {
                this.hasAccess = false;
                this.isPreviewMode = true;
            }

            this.ebook = cachedMetadata || this.ebook;

            // 3. Fire Background Network Check (Silent - DOES NOT BLOCK UI)
            if (this.isBrowser) {
                Promise.allSettled([
                    this.userLibraryService.checkAccess(this.ebookId).pipe(timeout(3000)).toPromise(),
                    this.ebookService.getEbookById(this.ebookId).pipe(timeout(3000)).toPromise()
                ]).then(([accessRes, ebookRes]) => {
                    let networkSuccess = false;
                    let accessResponse: any = null;

                    if (accessRes.status === 'fulfilled') {
                        accessResponse = accessRes.value;
                        networkSuccess = true;
                    }
                    if (ebookRes.status === 'fulfilled') {
                        this.ebook = ebookRes.value?.data || this.ebook;
                    }

                    if (networkSuccess && accessResponse) {
                        this.hasAccess = accessResponse.hasAccess === true;
                        this.isPreviewMode = accessResponse.accessType === 'preview' || !this.hasAccess;
                        
                        if (this.ebook) {
                            this.ebook.accessType = this.isPreviewMode ? 'preview' : 'owned';
                            
                            // Save expiry for offline use
                            if (this.hasAccess && accessResponse.accessType === 'subscription' && accessResponse.subscription?.endDate) {
                                (this.ebook as any).subscriptionExpiry = accessResponse.subscription.endDate;
                            }
                            this.offlineEbookService.saveMetadata(this.ebookId, this.ebook);
                        }
                        
                        // If it turns out user has no access, enforce preview on the reader immediately
                        if (this.isPreviewMode && this.rendition) {
                            console.warn('Network confirmed no access. Enforcing preview mode.');
                            // Optional: Refresh rendition or alert user if they were illegally reading past preview
                        }
                    }
                }).catch(err => console.warn('Background network check failed', err));
            }

            // 4. Load Progress FIRST (to ensure saved CFI is ready for initial render)
            await this.loadReadingProgress();

            // 5. Load the File (Instantly from cache if available)
            await this.loadEpubFile();

            // 6. If metadata was missing (Offline), fill it from EPUB package
            if (!this.ebook && this.book && (this.book as any).package && (this.book as any).package.metadata) {
                const meta = (this.book as any).package.metadata;
                this.ebook = {
                    _id: this.ebookId,
                    title: meta.title,
                    author: meta.creator,
                    description: meta.description,
                    favorite: false,
                    accessType: this.isPreviewMode ? 'preview' : 'owned'
                } as any;
                this.offlineEbookService.saveMetadata(this.ebookId, this.ebook);
            }

        } catch (error: any) {
            console.error('Error loading book:', error);
            if (error.message === 'NO_INTERNET' || error === 'NO_INTERNET') {
                this.error = 'لا يوجد اتصال بالإنترنت. يرجى الاتصال لتحميل الكتاب لأول مرة.';
            } else {
                this.error = 'حدث خطأ أثناء تحميل الكتاب';
            }
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    private async loadReadingProgress() {
        const localKey = `kenouz_progress_${this.ebookId}`;
        let localProgress: any = null;

        if (this.isBrowser) {
            const localDataString = localStorage.getItem(localKey);
            if (localDataString) {
                try {
                    localProgress = JSON.parse(localDataString);

                    // Instantly apply local progress to UI
                    this.progress = localProgress;
                    if (localProgress.settings) {
                        this.settings = { ...this.settings, ...localProgress.settings };
                        if (this.bookType === 'epub') this.applyThemeToWrapper();
                    }

                    if (this.bookType === 'bok' && localProgress.currentPage !== undefined) {
                        this.currentPage = localProgress.currentPage;
                        this.updateBokProgress();
                    } else if (this.bookType === 'epub' && localProgress.currentCfi) {
                        this.currentCfi = localProgress.currentCfi;
                    }

                    this.isProgressLoaded = true;
                } catch (e) {
                    console.warn('Failed to parse local progress', e);
                }
            }
        }

        // Background fetch from server - WITHOUT blocking the reader initialization
        if (this.isBrowser) {
            this.readingProgressService.getProgress(this.ebookId).pipe(
                timeout(3000),
                catchError(() => of(null))
            ).subscribe(progressResponse => {
                if (progressResponse?.success && progressResponse.data) {
                    const serverProgress = progressResponse.data;
                    const serverTime = new Date(serverProgress.updatedAt || 0).getTime();
                    const localTime = localProgress?.timestamp || 0;

                    // 1. Sync Progress & Settings based on timestamp
                    if (serverTime > localTime || !localProgress) {
                        this.progress = serverProgress;
                        if (serverProgress.settings) {
                            this.settings = { ...this.settings, ...serverProgress.settings };
                            if (this.bookType === 'epub') this.applyThemeToWrapper();
                        }
                    }

                    // 2. ALWAYS sync bookmarks and highlights from server (authoritative)
                    this.bookmarks = serverProgress.bookmarks || [];
                    this.highlights = serverProgress.highlights || [];

                    // 3. Apply position if it hasn't been set yet or if server is newer
                    if (this.progress) {
                        if (this.bookType === 'bok' && this.progress?.progressPercent !== undefined) {
                            // Restore scroll position for BOK
                            setTimeout(() => {
                                if (this.bokReaderContainer) {
                                    const container = this.bokReaderContainer.nativeElement;
                                    const targetScroll = (this.progress!.progressPercent! / 100) * (container.scrollHeight - container.clientHeight);
                                    container.scrollTo({ top: targetScroll, behavior: 'auto' });
                                    this.updateBokProgress();
                                }
                            }, 500);
                        } else if (this.bookType === 'epub' && this.progress?.currentCfi) {
                            // If the background progress fetch brings a newer CFI and we haven't rendered it
                            const currentRenderedCfi = (this.rendition?.currentLocation() as any)?.start?.cfi;
                            if (currentRenderedCfi !== this.progress.currentCfi) {
                                this.currentCfi = this.progress.currentCfi;
                                if (this.rendition && !this.isLoading) {
                                    this.rendition.display(this.currentCfi).catch((err: any) => console.warn('Background CFI render failed', err));
                                }
                            }
                        }
                    }

                    // RE-APPLY HIGHLIGHTS immediately after loading from server
                    if (this.bookType === 'epub' && this.rendition) {
                        this.restoreHighlights(null);
                    }
                }
            });
        }
        
        // Don't wait for server, just mark as loaded so epub.js can start
        this.isProgressLoaded = true;
    }

    private async loadBokFile() {
        try {
            // Safety: timeout after 10 seconds if content doesn't load
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT')), 10000)
            );

            // Use full ebookId - DownloadManagerService stores with the ext_ prefix
            let contentPromise = this.downloadManager.getBookContent(this.ebookId);
            let content: string | null = await Promise.race([contentPromise, timeoutPromise]) as any;

            if (!content) {
                // Genius Solution: Auto-download if not found!
                this.isLoading = true;
                const originalId = this.ebookId.replace(/^ext[-_]/, '');

                try {
                    // Timeout for external book metadata
                    const book = await Promise.race([
                        this.externalLibraryService.getBookById(originalId).toPromise(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_EXT')), 5000))
                    ]) as any;

                    if (book) {
                        await new Promise<void>((resolve, reject) => {
                            // Timeout for download process
                            const dlTimeout = setTimeout(() => reject(new Error('TIMEOUT_DL')), 30000); // 30s for download
                            
                            this.downloadManager.downloadAndProcessBook(
                                this.ebookId,
                                book.downloadUrl,
                                { title: book.title, author: book.author, category: book.category }
                            ).subscribe({
                                next: (p) => { 
                                    if (p.state === 'DONE') {
                                        clearTimeout(dlTimeout);
                                        resolve(); 
                                    }
                                },
                                error: (err) => {
                                    clearTimeout(dlTimeout);
                                    reject(err);
                                }
                            });
                        });
                        content = await this.downloadManager.getBookContent(this.ebookId);
                    }
                } catch (err) {
                    console.warn('Auto-download or metadata fetch failed/timed out', err);
                }
            }

            if (!content) {
                throw new Error('File not found locally and could not be downloaded.');
            }

            this.bokContentFull = content || '';
            
            // Optimization: If book is huge (>100k chars), chunk it for the initial view
            // but keep the 'vertical without flipping' requirement by allowing to load more.
            if (this.bokContentFull.length > 100000) {
                this.bokPages = [this.bokContentFull.substring(0, 100000)];
            } else {
                this.bokPages = [this.bokContentFull];
            }
            
            this.totalPages = 1;
            this.currentPage = 0;

            // Load TOC and ID Map BEFORE setting isLoading = false
            try {
                const tocData = await this.downloadManager.getBookTOC(this.ebookId);
                this.idMap = await this.downloadManager.getBookIdMap(this.ebookId);

                if (tocData && tocData.length > 0) {
                // Map to NavItem
                this.toc = tocData.map(item => ({
                    id: item.id,
                    href: `bok:${item.id}`, // Custom scheme for BOK navigation
                    label: item.title,
                    subitems: [] // Flat for now or handle hierarchy if lvl > 0
                }));

                // Basic hierarchy handling (simple nesting based on level)
                const rootedToc: NavItem[] = [];
                const stack: { item: NavItem, level: number }[] = [];

                tocData.forEach(tItem => {
                    const level = tItem.level || 0;
                    const navItem: NavItem = {
                        id: tItem.id,
                        href: `bok:${tItem.id}`,
                        label: tItem.title,
                        subitems: []
                    };

                    // Find parent with safety
                    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                        stack.pop();
                    }

                    if (stack.length > 0) {
                        stack[stack.length - 1].item.subitems?.push(navItem);
                    } else {
                        rootedToc.push(navItem);
                    }
                    stack.push({ item: navItem, level: level });
                });

                if (rootedToc.length > 0) this.toc = this.processToc(rootedToc);
                }
            } catch (tocErr) {
                console.warn('BOK TOC load failed', tocErr);
            }

            this.isLoading = false;
            this.cdr.detectChanges();
            this.updateBokProgress();

        } catch (e: any) {
            console.error('BOK Load Error:', e);
            if (e.message === 'TIMEOUT') {
                this.error = 'استغرق تحميل الكتاب وقتاً طويلاً. يرجى إعادة المحاولة.';
            } else {
                this.error = 'تعذر قراءة ملف الكتاب (BOK)';
            }
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    private async loadEpubFile(): Promise<void> {
        try {
            let blob: Blob | undefined;

            const withTimeout = (promise: Promise<any>, ms: number, msg: string) => {
                return Promise.race([
                    promise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: ' + msg)), ms))
                ]);
            };

            try {
                blob = await withTimeout(
                    this.offlineEbookService.getOrFetchBook(this.ebookId).toPromise(), 
                    60000, 
                    'Fetching book data took too long'
                );
            } catch (err: any) {
                if (err.message === 'NO_INTERNET') {
                    this.error = 'لا يوجد اتصال بالإنترنت. يرجى الاتصال لتحميل الكتاب لأول مرة.';
                    this.isLoading = false;
                    return;
                }
                throw err;
            }

            if (!blob) throw new Error('No content');

            const arrayBuffer = await withTimeout(blob.arrayBuffer(), 15000, 'Reading file buffer');
            
            // --- KENOUZ: Check File Signature to Prevent Hangs ---
            // ePub.js relies on JSZip which can hang indefinitely if fed an invalid file format (like a PDF or HTML error page).
            if (arrayBuffer.byteLength > 4) {
                const view = new DataView(arrayBuffer);
                const magic = view.getUint32(0, false); // Big-endian

                if (magic === 0x25504446) { // '%PDF'
                    throw new Error('الملف المحمل هو ملف PDF وليس EPUB. الرجاء التأكد من صحة الملف على الخادم.');
                }
                if (magic === 0x3C21444F || magic === 0x3C68746D || magic === 0x3C3F786D) { // '<!DO', '<htm', '<?xm'
                    throw new Error('الملف المحمل عبارة عن صفحة ويب أو خطأ من الخادم، وليس كتاب EPUB.');
                }
                if (magic === 0x7B227375 || magic === 0x7B0A2020 || String.fromCharCode(view.getUint8(0)) === '{') { 
                    throw new Error('الخادم أرجع استجابة نصية (JSON) تشير إلى خطأ بدلاً من ملف الكتاب.');
                }
                // Check for standard ZIP signature (PK..)
                if (magic !== 0x504B0304 && magic !== 0x504B0506 && magic !== 0x504B0708) {
                    console.warn(`Unknown file signature: ${magic.toString(16)}`);
                    throw new Error('الملف المحمل ليس بصيغة EPUB صالحة (الملف معطوب أو صيغته غير مدعومة).');
                }
            }

            this.book = ePub(arrayBuffer);
            
            await withTimeout(this.book.ready, 20000, 'EPUB parsing (book.ready)');

            const nav = await withTimeout(this.book.loaded.navigation, 15000, 'EPUB navigation loading');
            this.toc = this.processToc(nav.toc);

            // Extract page-list from EPUB navigation (publisher's actual page mapping)
            // This gives us the REAL page count matching the print edition
            const pageList = (nav as any).pageList || (nav as any).page_list || [];
            if (pageList && pageList.length > 0) {
                console.log(`KENOUZ: Found EPUB page-list with ${pageList.length} pages`);
                if (this.ebook) {
                    this.ebook.pages = pageList.length;
                }
                // Store pageList for precise page lookup by CFI
                (this as any)._epubPageList = pageList;
            }

            // Wait for the container to be available in the DOM
            let attempts = 0;
            let containerElement: any = null;

            while (!containerElement && attempts < 100) { // Increased to 5 seconds max
                this.cdr.detectChanges(); // Force view check
                containerElement = this.readerContainer?.nativeElement || (this.isBrowser ? document.getElementById('epub-reader-frame') : null);
                if (!containerElement) await new Promise(r => setTimeout(r, 50));
                attempts++;
            }

            if (!containerElement) {
                throw new Error('تعذر العثور على عنصر عرض الكتاب (Timeout)');
            }

            // Match EXACTLY with CSS: top: 64px, bottom: 80px
            const topBarHeight = 64;
            const bottomBarHeight = 80;
            const availableHeight = window.innerHeight - topBarHeight - bottomBarHeight;
            
            const isPaginated = this.settings.layoutMode === 'pages';

            this.rendition = this.book.renderTo(containerElement, {
                width: '100%',
                height: '100%',
                spread: 'none', 
                flow: isPaginated ? 'paginated' : 'scrolled-doc', // Dynamic based on theme layout
                direction: 'rtl',
                allowScriptedContent: true,
                minSpreadWidth: 0,
                allowStartOver: true,
                manager: isPaginated ? 'default' : 'continuous', // Dynamic manager
                gap: isPaginated ? 20 : 0
            } as any);


            this.bindRenditionEvents();

            // HIDE LOADING FIRST: epub.js hangs if we try to display into an invisible/zero-opacity container in some browsers!
            this.isLoading = false;
            this.cdr.detectChanges();

            // Give browser time to paint the container with opacity=1 so epub.js can calculate dimensions
            await new Promise(resolve => setTimeout(resolve, 100));

            if (this.progress?.currentCfi) {
                try {
                    await withTimeout(this.rendition.display(this.progress.currentCfi), 15000, 'Rendition display with CFI');
                } catch (e) {
                    console.warn('KENOUZ: Failed to render saved CFI. Falling back...', e);
                    const firstSpineItem = this.book.spine?.first();
                    if (firstSpineItem && firstSpineItem.href) {
                        await withTimeout(this.rendition.display(firstSpineItem.href), 15000, 'Rendition display fallback');
                    } else {
                        await withTimeout(this.rendition.display(), 15000, 'Rendition display empty fallback');
                    }
                }
            } else {
                const firstSpineItem = this.book.spine?.first();
                if (firstSpineItem && firstSpineItem.href) {
                    await withTimeout(this.rendition.display(firstSpineItem.href), 15000, 'Rendition display first spine');
                } else {
                    await withTimeout(this.rendition.display(), 15000, 'Rendition display no CFI');
                }
            }

            // Force a resize calculation to ensure the manager populates the view correctly
            setTimeout(() => {
                if (this.rendition) {
                    (this.rendition as any).resize();
                }
            }, 200);

            // Restore the continuous scroll behavior: load all chapters smoothly and disable pruning
            if (!isPaginated) {
                setTimeout(() => {
                    const manager = (this.rendition as any).manager;
                    if (manager) {
                        // Disable trimming — never remove loaded chapters
                        manager.trim = () => Promise.resolve();
                        
                        // Override update() — prevent destroying off-screen views to preserve full scroll history
                        manager.update = function(_offset: any) {
                            const views = this.views.all();
                            for (let i = 0; i < views.length; i++) {
                                const view = views[i];
                                if (view.displayed) {
                                    view.show();
                                }
                            }
                            return Promise.resolve();
                        };
                    }
                    this.forceLoadAllChapters();
                }, 500);
            }

            // Theme and highlights delay
            setTimeout(() => {
                this.applyThemeToWrapper();
                if (this.highlights && this.highlights.length > 0) {
                    console.log('KENOUZ: Restoration trigger from loadEpubFile', this.highlights.length);
                    this.restoreHighlights(null);
                }
            }, 1000);

            // Initialize spinePageCounts with zeros for all spine items
            const spineItems = (this.book.spine as any).items || (this.book.spine as any).spineItems || [];
            this.spinePageCounts = new Array(spineItems.length).fill(0);
            console.log('KENOUZ: Initialized spinePageCounts for', spineItems.length, 'spine items');

            // Generate locations in background (for percentage-based navigation slider only, NOT for page numbering)
            const savedLocationsKey = `kenouz_locations_${this.ebookId}`;
            if (this.isBrowser) {
                const savedLocations = localStorage.getItem(savedLocationsKey);
                if (savedLocations) {
                    try {
                        (this.book.locations as any).load(savedLocations);
                        console.log('KENOUZ: Cached locations loaded for navigation slider.');
                    } catch (loadErr) {
                        console.warn('Failed to load cached locations', loadErr);
                    }
                }
            }
            // Only generate locations if NOT already cached (expensive operation)
            const hasCachedLocations = this.isBrowser && localStorage.getItem(savedLocationsKey);
            if (!hasCachedLocations) {
                // Delay generation significantly to not block initial reading experience
                setTimeout(() => {
                    if (this.book) {
                        (this.book.locations as any).generate(3200).then(() => {
                            try {
                                const serialized = (this.book!.locations as any).save();
                                if (this.isBrowser) {
                                    localStorage.setItem(savedLocationsKey, serialized);
                                }
                                console.log('KENOUZ: Locations generated for navigation slider.');
                                
                                // Dynamically assign pages from generated locations if metadata is missing
                                if (this.ebook && (!this.ebook.pages || this.ebook.pages === 0)) {
                                    this.ebook.pages = (this.book!.locations as any).length;
                                    const currentLocation = this.rendition?.currentLocation();
                                    if (currentLocation) {
                                        this.updateProgress(currentLocation);
                                        this.cdr.detectChanges();
                                    }
                                }
                            } catch (saveErr) {
                                console.warn('Failed to save locations to cache', saveErr);
                            }
                        }).catch((err: any) => console.warn('Failed to generate locations in background', err));
                    }
                }, 5000); // 5 seconds delay - let the reader render first
            }

        } catch (e: any) {
            console.error('EPUB Load Error:', e);
            
            // If the error is a parsing timeout, the cached file is likely corrupted (e.g. interrupted download or invalid file).
            // Delete it from cache so the user can re-download it fresh.
            if (e.message && (e.message.includes('Timeout: EPUB parsing') || e.message.includes('No content'))) {
                console.warn('KENOUZ: Corrupted EPUB detected! Clearing from cache...');
                this.offlineEbookService.deleteBook(this.ebookId).catch(() => {});
                this.error = 'ملف الكتاب تالف أو لم يكتمل تحميله. قمنا بمسحه من الذاكرة، يرجى تحديث الصفحة لإعادة تحميله.';
            } else {
                this.error = `فشل تحميل الملف: ${e.message || e}`;
            }

            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    private bindRenditionEvents() {
        if (!this.rendition) return;

        // Hook for applying styles and event listeners on every chapter load
        this.rendition.hooks.content.register((contents: any) => {
            this.applyStyleToFrame(contents);

            // Access both document and window of the iframe
            const doc = contents.document;
            const win = contents.window;

            // Ensure the iframe has focus for immediate touch responsiveness
            if (win) {
                win.focus();
                if (doc.body) doc.body.focus();
            }

            // Register touch & wheel handlers inside the iframe for smooth navigation
            if (doc) {
                this.bindScrollGestures(doc);
                this.bindSwipeGestures(doc);
                
                // Bind keydown so arrow keys work when focus is inside the iframe
                doc.addEventListener('keydown', this.boundHandleKeydown);
            }
        });

        this.rendition.on('relocated', (location: any) => {
            this.updateProgress(location);
        });

        // Fallback for continuous scroll mode: auto-load next chapter when near bottom
        setTimeout(() => {
            if (this.rendition) {
                const scrollContainer = this.getScrollContainer();
                
                if (scrollContainer) {
                    this.bindScrollGestures(scrollContainer);
                    this.bindSwipeGestures(scrollContainer);

                    if ((this as any)._fallbackScrollListener) {
                        scrollContainer.removeEventListener('scroll', (this as any)._fallbackScrollListener);
                    }
                    
                    (this as any)._fallbackScrollListener = () => {
                        if (this.settings.layoutMode !== 'scroll') return;
                        if ((this as any).isLoadingNextChapter || !this.rendition) return;
                        
                        const scrollBottom = scrollContainer.scrollTop + scrollContainer.clientHeight;
                        // When user is within 300px of the bottom, load next chapter
                        if (scrollContainer.scrollHeight - scrollBottom < 300) {
                            this.loadNextSpineSection();
                        }
                    };
                    
                    scrollContainer.addEventListener('scroll', (this as any)._fallbackScrollListener, { passive: true });
                }
            }
        }, 1000);

        // Listen for text selection
        this.rendition.on('selected', (cfiRange: string, contents: any) => {
            console.log('EPUB Selected:', cfiRange);
            const selection = contents.window.getSelection();
            if (selection && selection.toString().trim() && selection.rangeCount > 0) {
                this.selectedText = selection.toString().trim();
                this.selectedCfiRange = cfiRange;

                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0).cloneRange();
                    this.currentSelectionRange = range;
                    this.currentSelectionContents = contents;

                    // Get position for popup
                    const rect = range.getBoundingClientRect();
                    const iframeRect = contents.document.defaultView.frameElement.getBoundingClientRect();

                    this.selectionPopupPosition = {
                        x: iframeRect.left + rect.left + (rect.width / 2),
                        y: iframeRect.top + rect.top - 10
                    };

                    this.showSelectionPopup = true;
                    this.cdr.detectChanges();
                }
            }
        });

        // Hide popup and detect double-tap for controls toggle
        let lastClickTime = 0;
        this.rendition.on('click', (event: any) => {
            const now = Date.now();

            // Hide selection popup on any click
            if (this.showSelectionPopup) {
                this.showSelectionPopup = false;
                this.cdr.detectChanges();
            }

            // Double-tap detection (within 300ms)
            if (now - lastClickTime < 300) {
                this.toggleControls();
                this.cdr.detectChanges();
                lastClickTime = now;
                return;
            }
            lastClickTime = now;

            // Handle side click/tap zones when layoutMode is 'pages'
            if (this.settings.layoutMode === 'pages' && event) {
                const clientX = event.clientX;
                const viewWidth = event.view?.innerWidth || event.target?.ownerDocument?.defaultView?.innerWidth || window.innerWidth;
                
                if (viewWidth > 0 && clientX !== undefined) {
                    const ratio = clientX / viewWidth;
                    // Left 25% = nextPage(), Right 25% = prevPage()
                    if (ratio < 0.25) {
                        this.nextPage();
                        if (typeof event.preventDefault === 'function') event.preventDefault();
                    } else if (ratio > 0.75) {
                        this.prevPage();
                        if (typeof event.preventDefault === 'function') event.preventDefault();
                    }
                }
            }
        });

        // RE-APPLY HIGHLIGHTS ON EVERY RENDER
        // This is crucial for scrolled-doc mode where chapters load/unload
        this.rendition.on('rendered', (section: any) => {
            console.log('KENOUZ: Section rendered, restoring highlights');
            this.restoreHighlights(null);
        });
    }

    private bindScrollGestures(target: Document | HTMLElement) {
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;

        // 1. Wheel event handler
        target.addEventListener('wheel', (event: any) => {
            if (this.settings.layoutMode !== 'scroll' || !this.rendition || (this as any).isLoadingNextChapter) return;
            
            const isNotScrollable = scrollContainer.scrollHeight <= scrollContainer.clientHeight;
            
            if (event.deltaY > 0) {
                // Scrolling down
                const isAtBottom = scrollContainer.scrollHeight - (scrollContainer.scrollTop + scrollContainer.clientHeight) < 40;
                if (isAtBottom || isNotScrollable) {
                    this.loadNextSpineSection();
                }
            } else if (event.deltaY < 0) {
                // Scrolling up
                const isAtTop = scrollContainer.scrollTop <= 10;
                if (isAtTop || isNotScrollable) {
                    this.loadPrevSpineSection();
                }
            }
        }, { passive: true });

        // 2. Touch event handlers for swiping
        let touchStartY = 0;
        let touchStartX = 0;

        target.addEventListener('touchstart', (event: any) => {
            if (this.settings.layoutMode !== 'scroll' || event.touches.length === 0) return;
            touchStartY = event.touches[0].clientY;
            touchStartX = event.touches[0].clientX;
        }, { passive: true });

        target.addEventListener('touchend', (event: any) => {
            if (this.settings.layoutMode !== 'scroll' || !this.rendition || (this as any).isLoadingNextChapter || event.changedTouches.length === 0) return;
            
            const deltaY = event.changedTouches[0].clientY - touchStartY;
            const deltaX = event.changedTouches[0].clientX - touchStartX;
            
            // Check if vertical swipe is dominant and exceeds threshold (50px)
            if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 50) {
                const isNotScrollable = scrollContainer.scrollHeight <= scrollContainer.clientHeight;
                
                if (deltaY < 0) {
                    // Swiped up (scroll down intent)
                    const isAtBottom = scrollContainer.scrollHeight - (scrollContainer.scrollTop + scrollContainer.clientHeight) < 60;
                    if (isAtBottom || isNotScrollable) {
                        this.loadNextSpineSection();
                    }
                } else if (deltaY > 0) {
                    // Swiped down (scroll up intent)
                    const isAtTop = scrollContainer.scrollTop <= 20;
                    if (isAtTop || isNotScrollable) {
                        this.loadPrevSpineSection();
                    }
                }
            }
        }, { passive: true });
    }

    private bindSwipeGestures(target: Document | HTMLElement) {
        const frameEl = this.readerContainer?.nativeElement;
        if (!frameEl) return;

        let touchStartX = 0;
        let touchStartY = 0;
        let isDragging = false;
        let startTime = 0;

        target.addEventListener('touchstart', (event: any) => {
            if (this.settings.layoutMode !== 'pages' || event.touches.length === 0) return;
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
            isDragging = true;
            startTime = Date.now();
            frameEl.style.transition = 'none';
        }, { passive: true });

        target.addEventListener('touchmove', (event: any) => {
            if (!isDragging || this.settings.layoutMode !== 'pages' || event.touches.length === 0) return;
            
            const currentX = event.touches[0].clientX;
            const currentY = event.touches[0].clientY;
            const deltaX = currentX - touchStartX;
            const deltaY = currentY - touchStartY;

            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                // Smooth slow drag movement
                const dragTranslation = deltaX / 1.1;
                frameEl.style.transform = `translateX(${dragTranslation}px)`;
            }
        }, { passive: true });

        target.addEventListener('touchend', (event: any) => {
            if (!isDragging || this.settings.layoutMode !== 'pages' || event.changedTouches.length === 0) return;
            isDragging = false;

            const touchEndX = event.changedTouches[0].clientX;
            const touchEndY = event.changedTouches[0].clientY;
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            const duration = Date.now() - startTime;

            const isSwipe = Math.abs(deltaX) > Math.abs(deltaY) && (Math.abs(deltaX) > 60 || (Math.abs(deltaX) > 30 && duration < 250));

            if (isSwipe) {
                const isNext = deltaX > 0; // Swipe right (drag right) -> Next Page in Arabic RTL
                
                frameEl.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                const slideOutDistance = isNext ? window.innerWidth : -window.innerWidth;
                frameEl.style.transform = `translateX(${slideOutDistance}px)`;

                setTimeout(() => {
                    if (isNext) {
                        this.nextPage();
                    } else {
                        this.prevPage();
                    }
                    
                    frameEl.style.transition = 'none';
                    frameEl.style.transform = 'translateX(0)';
                    
                    frameEl.style.opacity = '0';
                    setTimeout(() => {
                        frameEl.style.transition = 'opacity 0.35s ease-out';
                        frameEl.style.opacity = '1';
                    }, 50);
                }, 400);
            } else {
                frameEl.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                frameEl.style.transform = 'translateX(0)';
            }
        }, { passive: true });
    }

    loadNextSpineSection(): void {
        if (!this.rendition || (this as any).isLoadingNextChapter) return;
        
        const location: any = this.rendition.currentLocation();
        const currentIndex = location?.start?.index;
        const spineItems = (this.book?.spine as any)?.items || (this.book?.spine as any)?.spineItems || [];
        
        if (currentIndex !== undefined && currentIndex + 1 < spineItems.length) {
            const nextItem = spineItems[currentIndex + 1];
            if (nextItem?.href) {
                (this as any).isLoadingNextChapter = true;
                console.log('KENOUZ: Loading next section:', nextItem.href);
                
                this.rendition.display(nextItem.href).then(() => {
                    const scrollContainer = this.getScrollContainer();
                    if (scrollContainer) {
                        scrollContainer.scrollTop = 0;
                    }
                    setTimeout(() => {
                        (this as any).isLoadingNextChapter = false;
                        this.saveProgress();
                    }, 800);
                }).catch((err: any) => {
                    console.warn('KENOUZ: display next failed', err);
                    (this as any).isLoadingNextChapter = false;
                });
            }
        }
    }

    loadPrevSpineSection(): void {
        if (!this.rendition || (this as any).isLoadingNextChapter) return;
        
        const location: any = this.rendition.currentLocation();
        const currentIndex = location?.start?.index;
        const spineItems = (this.book?.spine as any)?.items || (this.book?.spine as any)?.spineItems || [];
        
        if (currentIndex !== undefined && currentIndex - 1 >= 0) {
            const prevItem = spineItems[currentIndex - 1];
            if (prevItem?.href) {
                (this as any).isLoadingNextChapter = true;
                console.log('KENOUZ: Loading previous section:', prevItem.href);
                
                this.rendition.display(prevItem.href).then(() => {
                    setTimeout(() => {
                        const scrollContainer = this.getScrollContainer();
                        if (scrollContainer) {
                            scrollContainer.scrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight - 15;
                        }
                    }, 150);
                    setTimeout(() => {
                        (this as any).isLoadingNextChapter = false;
                        this.saveProgress();
                    }, 800);
                }).catch((err: any) => {
                    console.warn('KENOUZ: display prev failed', err);
                    (this as any).isLoadingNextChapter = false;
                });
            }
        }
    }



    private applyStyleToFrame(contents?: any) {
        if (this.rendition) {
            this.rendition.views().forEach((view: any) => {
                if (view.pane) view.pane.render();
            });

            if (contents) {
                this.injectUserPreferences(contents);
                this.injectHighlightStyles(contents);
            } else {
                // Style ALL loaded iframes in the reader view to support scrolling / multi-chapter styling
                const iframes = this.hostEl.nativeElement.querySelectorAll('iframe');
                iframes.forEach((iframe: any) => {
                    if (iframe && iframe.contentDocument) {
                        const mockContents = { document: iframe.contentDocument };
                        this.injectUserPreferences(mockContents);
                        this.injectHighlightStyles(mockContents);
                    }
                });
            }
        }
    }

    private injectUserPreferences(contents: any) {
        const doc = contents.document;
        const head = doc.head;
        
        const oldStyle = doc.getElementById('kenouz-user-styles');
        if (oldStyle) oldStyle.remove();

        let bgColor = '#ffffff';
        let textColor = '#1a1a1a';

        switch (this.settings.theme) {
            case 'sepia': bgColor = '#f8f1e3'; textColor = '#423223'; break;
            case 'dark': bgColor = '#1a1a1a'; textColor = '#f3f4f6'; break;
            case 'black': bgColor = '#000000'; textColor = '#d1d5db'; break;
            default: bgColor = '#ffffff'; textColor = '#1a1a1a'; break;
        }

        // If a background image is set, inner iframes must be transparent to let the background image shine through
        const finalBgColor = this.settings.backgroundImage ? 'transparent' : bgColor;

        // Apply shared themes to the rendition for cleaner, consistent reflow
        if (this.rendition) {
            this.rendition.themes.register('custom', {
                'body': {
                    'background-color': `${finalBgColor} !important`,
                    'color': `${textColor} !important`,
                    'font-family': `${this.settings.fontFamily} !important`,
                    'font-size': `${this.settings.fontSize}px !important`,
                    'line-height': `${this.settings.lineHeight} !important`,
                    'text-align': `${this.settings.textAlign} !important`,
                    'direction': 'rtl !important',
                    'padding': `${this.settings.layoutMode === 'pages'
                        ? '8px 4px'
                        : (window.innerWidth < 600 ? '30px 15px' : '40px 35px')} !important`,
                    'margin': '0 !important',
                    'hyphens': 'auto !important',
                    'word-break': 'break-word !important',
                    'word-wrap': 'break-word !important',
                    'white-space': 'normal !important',
                    'unicode-bidi': 'isolate !important',
                    'box-sizing': 'border-box !important',
                    'overflow-x': this.settings.layoutMode === 'scroll' ? 'hidden !important' : 'visible !important', // Allow horizontal flow in paginated mode
                    'overflow-y': this.settings.layoutMode === 'scroll' ? 'hidden !important' : 'auto !important', // Let vertical scroll occur inside the page in paginated mode if font scales
                    'scrollbar-width': 'none !important', // Hide in Firefox
                    '-ms-overflow-style': 'none !important' // Hide in IE/Edge
                },
                'body::-webkit-scrollbar': {
                    'display': 'none !important' // Hide in Chrome/Safari
                },
                'p, div, span, li, a, h1, h2, h3, h4, h5, h6, article, section, main': {
                    'font-family': 'inherit !important',
                    'line-height': 'inherit !important',
                    'text-align': 'inherit !important',
                    'direction': 'inherit !important',
                    'max-width': '100% !important',
                    'height': 'auto !important',
                    'overflow': 'visible !important',
                    'word-wrap': 'break-word !important',
                    'word-break': 'break-word !important',
                    'white-space': 'normal !important',
                    'box-sizing': 'border-box !important'
                },
                'span, a, b, i, strong, em': {
                    'display': 'inline !important' // Keep inline elements inline
                },
                'img': {
                    'max-width': '100% !important',
                    'height': 'auto !important',
                    'display': 'block !important',
                    'margin': '15px auto !important',
                    'border-radius': '8px !important',
                    'float': 'none !important',
                    'position': 'static !important'
                }
            });
            this.rendition.themes.select('custom');
        }

        const styleEl = doc.createElement('style');
        styleEl.id = 'kenouz-user-styles';
        styleEl.textContent = `
            html {
                direction: rtl !important;
                writing-mode: horizontal-tb !important;
                background-color: ${finalBgColor} !important;
                color: ${textColor} !important;
            }
            body {
                margin: 0 !important;
                overflow-x: hidden !important;
                overflow-y: hidden !important; /* Let the manager handle scroll */
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
                background-color: ${finalBgColor} !important;
                color: ${textColor} !important;
            }
            body::-webkit-scrollbar {
                display: none !important;
            }
            /* Force theme colors on ALL elements — prevents white patches in dark mode */
            *, *::before, *::after {
                box-sizing: border-box !important;
                background-color: transparent !important;
                color: inherit !important;
            }
            /* Restore background only on html and body */
            html, body {
                background-color: ${finalBgColor} !important;
            }
            /* Keep images visible */
            img, svg, video, canvas {
                background-color: transparent !important;
                color: unset !important;
            }
            /* Brand-consistent text selection color */
            ::selection {
                background-color: rgba(216, 173, 66, 0.4) !important;
                color: inherit !important;
            }
            ::-moz-selection {
                background-color: rgba(216, 173, 66, 0.4) !important;
                color: inherit !important;
            }
        `;
        head.appendChild(styleEl);
    }

    private injectHighlightStyles(contents: any) {
        const doc = contents.document;
        // Always try to remove old style element to ensure update if chapter reloads or multiple calls
        const oldStyle = doc.getElementById('kenouz-highlight-styles');
        if (oldStyle) oldStyle.remove();

        // Determine blend mode based on theme for better visibility
        // Light/Sepia: Multiply (Classic highlighter effect)
        // Dark/Black: Screen (Makes highlights glow on dark backgrounds)
        const isDark = this.settings.theme === 'dark' || this.settings.theme === 'black';
        const blendMode = isDark ? 'screen' : 'multiply';
        const opacity = isDark ? '0.7' : '0.3';

        // For dark mode, use darker/richer versions of the colors so they show on dark bg
        const darkYellow = isDark ? '#b8960a' : '#fef08a';
        const darkGreen = isDark ? '#22a558' : '#bbf7d0';
        const darkBlue = isDark ? '#3b82f6' : '#bfdbfe';
        const darkPink = isDark ? '#db2777' : '#fbcfe8';
        const darkOrange = isDark ? '#ea7e2e' : '#fed7aa';

        const styleEl = doc.createElement('style');
        styleEl.id = 'kenouz-highlight-styles';
        styleEl.textContent = `
            /* Force visibility on epub.js highlight containers */
            .epubjs-hl { 
                fill: transparent !important; 
                fill-opacity: 0 !important; 
            }

            /* Specific color classes */
            [class*="kenouz-hl-"] {
                fill-opacity: ${opacity} !important;
                mix-blend-mode: ${blendMode} !important;
                background-color: transparent !important; 
            }
            
            /* Target both the group and the specific paths/rects inside */
            .epubjs-annotation [class*="kenouz-hl-"],
            .epubjs-annotation [class*="kenouz-hl-"] * {
                fill-opacity: ${opacity} !important;
            }

            g.epubjs-hl {
                 
            }

            .kenouz-hl-fef08a, .kenouz-hl-fef08a *, g.kenouz-hl-fef08a path, g.kenouz-hl-fef08a rect { 
                fill: ${darkYellow} !important; 
                background-color: ${darkYellow} !important; 
                stroke: ${darkYellow} !important; 
            }
            .kenouz-hl-bbf7d0, .kenouz-hl-bbf7d0 *, g.kenouz-hl-bbf7d0 path, g.kenouz-hl-bbf7d0 rect { 
                fill: ${darkGreen} !important; 
                background-color: ${darkGreen} !important; 
                stroke: ${darkGreen} !important;
            }
            .kenouz-hl-bfdbfe, .kenouz-hl-bfdbfe *, g.kenouz-hl-bfdbfe path, g.kenouz-hl-bfdbfe rect { 
                fill: ${darkBlue} !important; 
                background-color: ${darkBlue} !important; 
                stroke: ${darkBlue} !important;
            }
            .kenouz-hl-fbcfe8, .kenouz-hl-fbcfe8 *, g.kenouz-hl-fbcfe8 path, g.kenouz-hl-fbcfe8 rect { 
                fill: ${darkPink} !important; 
                background-color: ${darkPink} !important; 
                stroke: ${darkPink} !important;
            }
            .kenouz-hl-fed7aa, .kenouz-hl-fed7aa *, g.kenouz-hl-fed7aa path, g.kenouz-hl-fed7aa rect { 
                fill: ${darkOrange} !important; 
                background-color: ${darkOrange} !important; 
                stroke: ${darkOrange} !important;
            }
        `;
        doc.head.appendChild(styleEl);
    }

    private updateProgress(location: any) {
        if (!location || !location.start) return;

        const currentCfi = location.start.cfi;
        this.currentCfi = currentCfi;

        // 1. Get the actual total pages of the EPUB file from the metadata (backend estimate)
        // Fallback to book locations length (character count based pages) or a default.
        let totalPages = 0;
        if (this.ebook && this.ebook.pages && this.ebook.pages > 0) {
            totalPages = this.ebook.pages;
        } else if (this.book && (this.book as any).pages && (this.book as any).pages > 0) {
            totalPages = (this.book as any).pages;
        } else if (this.book?.locations && (this.book.locations as any).length > 0) {
            totalPages = (this.book.locations as any).length;
        } else {
            // Fallback estimation: using spine count
            const spineItems = (this.book?.spine as any)?.items || (this.book?.spine as any)?.spineItems || [];
            totalPages = Math.max(1, spineItems.length * 10); // Assume average of 10 pages per chapter
        }

        // 2. Determine current percentage progress
        let percentage = 0;
        if (this.book?.locations && (this.book.locations as any).length > 0) {
            try {
                percentage = (this.book.locations as any).percentageFromCfi(currentCfi);
            } catch (e) {
                percentage = location.start.percentage ?? 0;
            }
        } else {
            percentage = location.start.percentage ?? 0;
        }

        // Clip percentage to safe range [0, 1]
        percentage = Math.min(Math.max(percentage, 0), 1);

        // 3. Calculate current page based on percentage and totalPages
        let currentPage = Math.max(1, Math.round(percentage * totalPages));

        // Make sure currentPage does not exceed totalPages
        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        // 4. Update component state
        this.totalPages = totalPages;
        this.currentPage = currentPage;
        this.progressPercent = Math.min(Math.round(percentage * 100), 100);

        // Record the page read (for achievements sync)
        if (this.currentPage) {
            this.pagesReadSinceLastSync.add(this.currentPage);
        }

        // Attempt to find current chapter name
        const chapter = location.start.displayed?.chapter;
        if (chapter) {
            this.currentChapter = chapter;
        } else {
            // Fallback to TOC finding
            const href = location.start.href;
            if (href) {
                const tocItem = this.toc.find((item: any) => href.includes(item.href));
                if (tocItem) this.currentChapter = tocItem.label;
            }
        }
    }

    private updateBokProgress() {
        // Scroll-based calculation
        const scrollContainer = document.documentElement;
        const totalHeight = scrollContainer.scrollHeight - window.innerHeight;
        const currentScroll = window.scrollY;
        this.progressPercent = Math.round((currentScroll / totalHeight) * 100);

        // Show subscription prompt if in preview mode and progress exceeds 20%
        if (this.isPreviewMode && this.progressPercent > 20) {
            this.showSubscriptionPrompt = true;
        }
    }

    displayChapter(chapter: any) {
        // Preview Restriction for TOC
        if (this.isPreviewMode) {
            const spineIndex = (this.book?.spine as any)?.spineItems?.findIndex((item: any) => item.href.includes(chapter.href));
            console.log('KENOUZ DEBUG: TOC Check. Preview:', this.isPreviewMode, 'SpineIndex:', spineIndex);
            // If index found and > 3, block
            if (spineIndex !== undefined && spineIndex > 3) {
                this.showSubscriptionPrompt = true;
                return;
            }
        }


        this.rendition?.display(chapter.href);
        this.currentChapter = chapter.label;
        if (window.innerWidth < 768) {
            this.activeSection = null; // Close menu on mobile
        }
    }

    onProgressChange(event: any) {
        const percent = event.target.value;

        // Preview Restriction for Slider
        if (this.isPreviewMode && percent > 20) {
            this.showSubscriptionPrompt = true;
            return;
        }

        // BOK Mode Navigation
        if (this.bookType === 'bok' && this.bokReaderContainer) {
            const container = this.bokReaderContainer.nativeElement;
            const targetScroll = (percent / 100) * (container.scrollHeight - container.clientHeight);
            container.scrollTo({ top: targetScroll, behavior: 'auto' });
            return;
        }

        // EPUB Mode Navigation
        let cfi = null;
        try {
            cfi = this.book?.locations.cfiFromPercentage(percent / 100);
        } catch (e) { console.warn('Locations not ready for CFI', e); }

        if (cfi) {
            this.rendition?.display(cfi);
        } else if (this.book) {
            // Fallback: Jump to approximate chapter
            const total = (this.book.spine as any).spineItems.length;
            if (total > 0) {
                const index = Math.floor((percent / 100) * total);
                const safeIndex = Math.min(Math.max(index, 0), total - 1);
                const spineItem = (this.book.spine as any).spineItems[safeIndex];
                if (spineItem) {
                    this.rendition?.display(spineItem.href);
                }
            }
        }
    }

    // Save progress to backend/local storage
    saveProgress(force: boolean = false) {
        if (!this.isProgressLoaded || !this.ebookId) return;

        const now = Date.now();
        if (!force && (now - this.lastSaveTime < this.SAVE_DEBOUNCE_MS)) {
            return;
        }
        this.lastSaveTime = now;

        let progressData: any = null;
        let visibleWordCount = 0;

        // BOK Mode Save
        if (this.bookType === 'bok') {
            progressData = {
                progressPercent: this.progressPercent
            };
        }
        // EPUB Mode Save
        else if (this.rendition) {
            const currentLocation: any = this.rendition.currentLocation();
            if (currentLocation && currentLocation.start) {
                progressData = {
                    currentCfi: currentLocation.start.cfi,
                    progressPercent: this.progressPercent,
                    currentPage: this.currentPage,
                    totalPages: this.totalPages
                };

                // Calculate words in current EPUB view (Anti-Cheat)
                try {
                    // Try to get text range for current view
                    if (currentLocation.end && currentLocation.start.cfi && currentLocation.end.cfi) {
                        try {
                            const range = this.rendition.getRange(currentLocation.start.cfi, currentLocation.end.cfi);
                            if (range) {
                                visibleWordCount = range.toString().trim().split(/\s+/).length;
                            }
                        } catch (cfiErr) {
                            // Only log once to avoid console flood if it's a persistent mismatch
                            // console.warn('KENOUZ DEBUG: EPUB Range calculation failed');
                        }
                    }

                    // Fallback: If range fails or is empty, estimate from chapter text (rough average)
                    if (visibleWordCount === 0 && this.currentSelectionContents) {
                        try {
                            const chapterText = this.currentSelectionContents.document.body.innerText;
                            if (chapterText) {
                                // If we can see the whole chapter, let's assume a page is ~1/10th or just use a fixed number
                                visibleWordCount = 250;
                            }
                        } catch (docErr) {
                            visibleWordCount = 200;
                        }
                    }
                } catch (e) {
                    visibleWordCount = 200; // Safe default
                }
            }
        }

        if (progressData) {
            if (this.isBrowser) {
                // Instant Local Save
                const localKey = `kenouz_progress_${this.ebookId}`;
                const localSaveObj = {
                    ...progressData,
                    settings: this.settings,
                    bookmarks: this.bookmarks,
                    highlights: this.highlights,
                    timestamp: Date.now()
                };
                localStorage.setItem(localKey, JSON.stringify(localSaveObj));
            }

            // Background API Sync
            this.readingProgressService.updateProgress(this.ebookId, progressData).subscribe({
                next: () => {
                    // Sync Gamification (XP & Streak) with Anti-Cheat
                    const now = Date.now();
                    // Actual time spent since last sync
                    let sessionDurationMinutes = (now - this.readingStartTime) / 1000 / 60;

                    // --- ANTI-CHEAT LOGIC ---
                    // Rule: Max 1 minute for every 50 words (Very generous "slow reader" limit)
                    // e.g. 200 words page -> max 4 mins allowed.
                    // Minimum cap: 1 minute (for images/short text)
                    if (visibleWordCount > 0) {
                        const maxAllowedMinutes = Math.max(1, (visibleWordCount / 50));

                        if (sessionDurationMinutes > maxAllowedMinutes) {
                            console.warn(`[Anti-Cheat] Capping reading time. Actual: ${sessionDurationMinutes.toFixed(2)}m, Allowed: ${maxAllowedMinutes.toFixed(2)}m (Words: ${visibleWordCount})`);
                            sessionDurationMinutes = maxAllowedMinutes;
                            // We reset start time to "now" minus the capped duration to artificially maintain continuity? 
                            // No, just reset start time to now for the next interval.
                        }
                    }

                    const formattedDuration = parseFloat(sessionDurationMinutes.toFixed(2));
                    const pagesCount = this.pagesReadSinceLastSync.size;

                    console.log(`[Gamification Debug] Session Duration: ${formattedDuration} min (Words: ${visibleWordCount}), Pages Read: ${pagesCount}`);
                    if (formattedDuration > 0.05) { // Min 3 seconds
                        console.log(`[Gamification Debug] Syncing progress...`);
                        this.gamificationService.syncProgress({
                            minutesRead: formattedDuration,
                            pagesRead: pagesCount,
                            ebookId: this.ebookId
                        }).subscribe({
                            next: (res) => {
                                console.log('[Gamification Debug] Sync success:', res);
                                if (res.success) {
                                    this.pagesReadSinceLastSync.clear();
                                    if (this.currentPage) {
                                        this.pagesReadSinceLastSync.add(this.currentPage);
                                    }
                                }
                                if (res.success && res.data.xpEarned > 0) console.log('XP Earned:', res.data.xpEarned);
                            },
                            error: (err) => console.error('[Gamification Debug] Sync error:', err)
                        });
                        this.readingStartTime = now;
                    } else {
                        console.log('[Gamification Debug] Duration too short (< 0.1 min)');
                    }
                },
                error: (err: any) => console.error('Failed to save progress', JSON.stringify(err))
            });
        }
    }

    // Interactions
    toggleControls() {
        this.isControlsVisible = !this.isControlsVisible;
        if (!this.isControlsVisible) {
            this.closeAllPanels();
            this.toggleFullscreen();
        } else {
            // Exit fullscreen if active
            if (this.isBrowser && document.fullscreenElement) {
                document.exitFullscreen().catch(err => console.log(err));
            }
        }
    }

    toggleFullscreen() {
        if (!this.isBrowser) return;
        try {
            const elem = document.documentElement;
            if (!this.isFullscreen) {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen();
                }
            } else {
                if (document.fullscreenElement) {
                    document.exitFullscreen().catch(err => console.log(err));
                }
            }
            this.isFullscreen = !this.isFullscreen;
        } catch (e) {
            console.error('Fullscreen toggle failed', e);
        }
    }

    toggleSection(section: 'toc' | 'settings' | 'bookmarks' | 'highlights') {
        if (this.activeSection === section) {
            this.activeSection = null;
        } else {
            this.activeSection = section;
        }
    }

    closeAllPanels() {
        this.activeSection = null;
    }

    async nextPage() {
        // BOK Mode - Scroll instead of page flip
        if (this.bookType === 'bok') {
            window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
            return;
        }

        const isPaginated = this.settings.layoutMode === 'pages';
        if (isPaginated && this.rendition) {
            try {
                await this.rendition.next();
                this.saveProgress();
            } catch (e) {
                console.error('EPUB next error:', e);
            }
            return;
        }

        // EPUB Scroll Mode — smart next chapter loading
        if (this.rendition && !this.isNavigating) {
            if (this.isPreviewMode && this.progressPercent >= 20) {
                this.showSubscriptionPrompt = true;
                return;
            }

            this.isNavigating = true;

            try {
                const locationBefore: any = this.rendition.currentLocation();
                const cfiBefore = locationBefore?.start?.cfi;

                // First, try epub.js's built-in next()
                await this.rendition.next();

                const locationAfter: any = this.rendition.currentLocation();
                const cfiAfter = locationAfter?.start?.cfi;

                // If CFI didn't change, epub.js failed to advance (common with image-heavy pages).
                // Use rendition.display(href) to jump to the next spine section — same as TOC navigation.
                if (cfiBefore && cfiAfter && cfiBefore === cfiAfter) {
                    const spineItems = (this.book?.spine as any)?.items || (this.book?.spine as any)?.spineItems || [];
                    const currentIndex = locationBefore?.start?.index;
                    if (currentIndex !== undefined && currentIndex + 1 < spineItems.length) {
                        const nextSpineItem = spineItems[currentIndex + 1];
                        if (nextSpineItem?.href) {
                            console.log('KENOUZ: rendition.next() stuck. Jumping to next spine item:', nextSpineItem.href);
                            await this.rendition!.display(nextSpineItem.href);
                        }
                    }
                }

                this.saveProgress();
            } catch (e) {
                console.error('EPUB next error:', e);
            } finally {
                this.isNavigating = false;
                this.cdr.detectChanges();
            }
        }
    }

    async prevPage() {
        // BOK Mode - Scroll instead of page flip
        if (this.bookType === 'bok') {
            window.scrollBy({ top: -(window.innerHeight * 0.8), behavior: 'smooth' });
            return;
        }

        const isPaginated = this.settings.layoutMode === 'pages';
        if (isPaginated && this.rendition) {
            try {
                await this.rendition.prev();
                this.saveProgress();
            } catch (e) {
                console.error('EPUB prev error:', e);
            }
            return;
        }

        // EPUB Scroll Mode — smart previous chapter loading
        if (this.rendition && !this.isNavigating) {
            this.isNavigating = true;

            try {
                const locationBefore: any = this.rendition.currentLocation();
                const cfiBefore = locationBefore?.start?.cfi;

                await this.rendition.prev();

                const locationAfter: any = this.rendition.currentLocation();
                const cfiAfter = locationAfter?.start?.cfi;

                // If CFI didn't change, jump to the previous spine section (same as TOC)
                if (cfiBefore && cfiAfter && cfiBefore === cfiAfter) {
                    const spineItems = (this.book?.spine as any)?.items || (this.book?.spine as any)?.spineItems || [];
                    const currentIndex = locationBefore?.start?.index;
                    if (currentIndex !== undefined && currentIndex - 1 >= 0) {
                        const prevSpineItem = spineItems[currentIndex - 1];
                        if (prevSpineItem?.href) {
                            console.log('KENOUZ: rendition.prev() stuck. Jumping to previous spine item:', prevSpineItem.href);
                            await this.rendition!.display(prevSpineItem.href);
                        }
                    }
                }

                this.saveProgress();
            } catch (e) {
                console.error('EPUB prev error:', e);
            } finally {
                this.isNavigating = false;
                this.cdr.detectChanges();
            }
        }
    }

    goToSubscription() {
        this.router.navigate(['/subscription']);
    }

    closeSubscriptionPrompt() {
        this.showSubscriptionPrompt = false;
    }

    setLayoutMode(mode: 'scroll' | 'pages') {
        this.settings.layoutMode = mode;
        this.saveSettings();
        // Reset page counts — different layout mode = different visual page sizes
        this.spinePageCounts = new Array(this.spinePageCounts.length).fill(0);
        
        // Reload/re-render the book with the new mode
        if (this.bookType === 'epub' && this.rendition) {
            this.isLoading = true;
            this.cdr.detectChanges();
            
            // Get current CFI to display it after reload
            const currentLocation: any = this.rendition.currentLocation();
            const currentCfi = currentLocation?.start?.cfi || null;
            
            // Destroy current rendition
            try {
                this.rendition.destroy();
            } catch (err) {
                console.warn('Rendition destroy error:', err);
            }
            
            // Re-render
            const containerElement = this.readerContainer?.nativeElement || (this.isBrowser ? document.getElementById('epub-reader-frame') : null);
            if (containerElement) {
                // Clear container innerHTML
                containerElement.innerHTML = '';
                
                const isPaginated = mode === 'pages';
                this.rendition = this.book!.renderTo(containerElement, {
                    width: '100%',
                    height: '100%',
                    spread: 'none', 
                    flow: isPaginated ? 'paginated' : 'scrolled-doc',
                    direction: 'rtl',
                    allowScriptedContent: true,
                    minSpreadWidth: 0,
                    allowStartOver: true,
                    manager: isPaginated ? 'default' : 'continuous',
                    gap: isPaginated ? 20 : 0
                } as any);
                
                this.bindRenditionEvents();

                // Restore custom overrides if switching to scroll mode
                if (!isPaginated) {
                    setTimeout(() => {
                        const manager = (this.rendition as any).manager;
                        if (manager) {
                            manager.trim = () => Promise.resolve();
                            manager.update = function(_offset: any) {
                                const views = this.views.all();
                                for (let i = 0; i < views.length; i++) {
                                    const view = views[i];
                                    if (view.displayed) {
                                        view.show();
                                    }
                                }
                                return Promise.resolve();
                            };
                        }
                        this.forceLoadAllChapters();
                    }, 500);
                }
                
                const displayPromise = currentCfi 
                    ? this.rendition.display(currentCfi).catch(() => {
                        console.warn('Failed to display current CFI in new layout, falling back...');
                        const firstSpineItem = this.book!.spine?.first();
                        return firstSpineItem && firstSpineItem.href ? this.rendition!.display(firstSpineItem.href) : this.rendition!.display();
                    })
                    : this.rendition.display();
                    
                displayPromise.then(() => {
                    this.applyThemeToWrapper();
                    this.applyStyleToFrame();
                    this.isLoading = false;
                    this.cdr.detectChanges();
                }).catch(err => {
                    console.error('Failed to change layout mode:', err);
                    this.isLoading = false;
                    this.cdr.detectChanges();
                });
            }
        }
    }

    // Settings
    setTheme(theme: 'light' | 'dark' | 'sepia' | 'black') {
        this.settings.theme = theme;
        this.settings.backgroundImage = null;

        // Explicitly update text and background colors for BOK/Text renderers
        switch (theme) {
            case 'light':
                this.settings.textColor = '#1a1a1a';
                this.settings.backgroundColor = '#ffffff';
                break;
            case 'sepia':
                this.settings.textColor = '#423223'; // Darker Sepia text for better contrast
                this.settings.backgroundColor = '#f8f1e3';
                break;
            case 'dark':
                this.settings.textColor = '#e5e7eb'; // Lighter text for dark mode
                this.settings.backgroundColor = '#1a1a1a';
                break;
            case 'black':
                this.settings.textColor = '#d1d5db';
                this.settings.backgroundColor = '#000000';
                break;
        }

        this.applyThemeToWrapper();
        this.applyStyleToFrame();
    }

    setBackgroundImage(imageUrl: string | null) {
        this.settings.backgroundImage = imageUrl;
        this.applyThemeToWrapper();
        this.applyStyleToFrame();
    }

    private applyThemeToWrapper() {
        // Apply theme class to the host element for full UI theming
        const wrapper = this.hostEl.nativeElement.querySelector('.reader-wrapper');
        if (wrapper) {
            wrapper.classList.remove('theme-light', 'theme-sepia', 'theme-dark', 'theme-black');
            wrapper.classList.add(`theme-${this.settings.theme}`);

            if (this.settings.backgroundImage) {
                wrapper.style.backgroundImage = `url('${this.settings.backgroundImage}')`;
                wrapper.style.backgroundSize = 'cover';
                wrapper.style.backgroundPosition = 'center';
                wrapper.style.backgroundRepeat = 'no-repeat';
                wrapper.style.backgroundAttachment = 'fixed';
            } else {
                wrapper.style.backgroundImage = '';
            }
        }
    }

    // Save settings to backend
    saveSettings() {
        if (!this.ebookId) return;
        this.readingProgressService.updateSettings(this.ebookId, this.settings).subscribe({
            error: (err: any) => console.error('Failed to save settings', err)
        });
    }

    setTextAlign(align: 'left' | 'right' | 'justify' | 'center') {
        this.settings.textAlign = align;
        this.applyStyleToFrame();
        this.saveSettings();
        if (this.bookType === 'epub') this.resizeRendition();
    }

    // Font & Style Controls
    changeFontSize(delta: number) {
        this.settings.fontSize = Math.max(12, Math.min(48, this.settings.fontSize + delta));
        
        if (this.bookType === 'epub' && this.rendition) {
            // First apply via native fontSize for speed
            this.rendition.themes.fontSize(this.settings.fontSize + 'px');
            
            // Then force a full style re-injection to ensure 'custom' theme is updated with new size
            this.applyStyleToFrame();
            
            // Finally resize to ensure pagination is correct
            this.resizeRendition();
        } else if (this.bookType === 'bok') {
            this.applyStyleToFrame();
        } else {
            this.applyStyleToFrame();
        }
        this.saveSettings();
    }

    async loadHighlights() {
        if (!this.ebookId) return;
        try {
            const progressResponse = await this.readingProgressService.getProgress(this.ebookId).toPromise();
            if (progressResponse?.success && progressResponse.data) {
                this.highlights = progressResponse.data.highlights || [];
                this.cdr.detectChanges(); // Ensure UI updates immediately
            }
        } catch (err) {
            console.error('Error loading highlights:', err);
        }
    }

    async goToPage(cfi: string) {
        if (!cfi) return;

        if (this.bookType === 'bok') {
            const id = cfi.replace('bok:', '');
            const wordIndex = this.idMap[id];
            if (wordIndex !== undefined) {
                // Find element with data-id or equivalent
                const el = document.getElementById(id);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
            this.closeAllPanels();
            return;
        }

        if (!this.rendition) return;

        try {
            this.isLoading = true;
            this.cdr.detectChanges();
            
            await this.rendition.display(cfi);
            
            // For scrolled-doc, sometimes we need an extra nudge to get the exact position
            // especially after a font size change or initial load.
            setTimeout(() => {
                if (this.rendition) {
                    const currentLocation: any = this.rendition.currentLocation();
                    if (currentLocation && currentLocation.start && currentLocation.start.cfi !== cfi) {
                        this.rendition.display(cfi);
                    }
                }
                this.isLoading = false;
                this.isControlsVisible = false;
                this.cdr.detectChanges();
            }, 300);
            
        } catch (err) {
            console.error('Error navigating to CFI:', err);
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    changeFontFamily(font: string) {
        this.settings.fontFamily = font;
        this.applyStyleToFrame();
        this.saveSettings();
        if (this.bookType === 'epub') this.resizeRendition();
    }

    changeLineHeight(delta: number) {
        this.settings.lineHeight = Math.max(1.0, Math.min(3.0, Number((this.settings.lineHeight + delta).toFixed(1))));
        this.applyStyleToFrame();
        this.saveSettings();
        if (this.bookType === 'epub') this.resizeRendition();
    }

    // Content Width Controls
    increaseContentWidth() {
        if (this.contentWidth < this.effectiveMaxWidth) {
            this.contentWidth = Math.min(this.contentWidth + this.contentWidthStep, this.effectiveMaxWidth);
            if (this.bookType === 'epub') this.resizeRendition();
        }
    }

    decreaseContentWidth() {
        if (this.contentWidth > this.minContentWidth) {
            this.contentWidth = Math.max(this.contentWidth - this.contentWidthStep, this.minContentWidth);
            if (this.bookType === 'epub') this.resizeRendition();
        }
    }

    // ==========================================
    // Auto-Scroll Feature
    // ==========================================
    toggleAutoScroll() {
        if (this.isAutoScrolling) {
            this.stopAutoScroll();
        } else {
            this.startAutoScroll();
        }
    }

    startAutoScroll() {
        this.isAutoScrolling = true;
        this.cdr.detectChanges();
        
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;

        // Use a float accumulator because scrollContainer.scrollTop is an integer
        // Adding < 1 values directly to scrollTop gets rounded down to 0, which halts scrolling.
        let currentScrollY = scrollContainer.scrollTop;

        // Pause on user touch
        const pauseHandler = () => {
            if (this.isAutoScrolling) {
                this.stopAutoScroll();
            }
        };
        scrollContainer.addEventListener('touchstart', pauseHandler, { once: true });
        scrollContainer.addEventListener('mousedown', pauseHandler, { once: true });

        const animate = () => {
            if (!this.isAutoScrolling) return;
            
            currentScrollY += this.autoScrollSpeed;
            scrollContainer.scrollTop = Math.round(currentScrollY);
            
            // Check if we've reached the bottom
            if (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 5) {
                this.stopAutoScroll();
                return;
            }
            
            this.autoScrollAnimationId = requestAnimationFrame(animate);
        };

        this.autoScrollAnimationId = requestAnimationFrame(animate);
    }

    stopAutoScroll() {
        this.isAutoScrolling = false;
        if (this.autoScrollAnimationId) {
            cancelAnimationFrame(this.autoScrollAnimationId);
            this.autoScrollAnimationId = null;
        }
        this.cdr.detectChanges();
    }

    increaseAutoScrollSpeed() {
        this.autoScrollSpeed = Math.min(
            Math.round((this.autoScrollSpeed + this.autoScrollSpeedStep) * 10) / 10,
            this.autoScrollMaxSpeed
        );
    }

    decreaseAutoScrollSpeed() {
        this.autoScrollSpeed = Math.max(
            Math.round((this.autoScrollSpeed - this.autoScrollSpeedStep) * 10) / 10,
            this.autoScrollMinSpeed
        );
    }

    private getScrollContainer(): HTMLElement | null {
        // epub.js creates .epub-container as the scroll element
        const container = this.readerContainer?.nativeElement?.querySelector('.epub-container');
        if (container) return container;
        // Fallback: BOK reader uses .reader-content directly
        return this.bokReaderContainer?.nativeElement || null;
    }

    private resizeRendition() {
        if (!this.rendition) return;

        const currentLocation: any = this.rendition.currentLocation();
        const cfi = currentLocation?.start?.cfi;
        const container = this.readerContainer?.nativeElement;
        const containerWidth = container ? container.offsetWidth : this.contentWidth;
        
        const topBarHeight = 64;
        const bottomBarHeight = 80;
        const availableHeight = window.innerHeight - topBarHeight - bottomBarHeight;
        const finalHeight = Math.max(availableHeight, 300);
        
        setTimeout(async () => {
            if (this.rendition) {
                try {
                    const finalHeightMeasured = container ? container.offsetHeight : finalHeight;
                    await (this.rendition.resize(containerWidth, finalHeightMeasured) as any);
                    if (cfi) await this.rendition.display(cfi);
                    this.isNavigating = false;
                    this.cdr.detectChanges();
                } catch (err: any) {
                    this.isNavigating = false;
                }
            }
        }, 50);
    }

    // Navigation
    goToChapter(item: NavItem) {
        if (this.bookType === 'bok' && item.href.startsWith('bok:')) {
            const id = item.href.replace('bok:', '');
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            this.closeAllPanels();
            return;
        }

        if (this.isPreviewMode && this.progressPercent >= 20) {
            this.showSubscriptionPrompt = true;
            return;
        }

        this.rendition?.display(item.href).then(() => {
            if (this.isPreviewMode && this.progressPercent > 20) {
                this.showSubscriptionPrompt = true;
            }
        });
        this.closeAllPanels();
    }

    private processToc(items: any[], level: number = 0): any[] {
        let result: any[] = [];
        if (!items) return result;
        items.forEach(item => {
            item.level = level;
            result.push(item);
            if (item.subitems && item.subitems.length > 0) {
                result = result.concat(this.processToc(item.subitems, level + 1));
            }
        });
        return result;
    }

    goBack() {
        this.router.navigate(['/library']);
    }

    addBookmark() {
        if (this.bookType === 'bok') {
            const label = `موضع ${this.progressPercent}%`;
            this.readingProgressService.addBookmark(this.ebookId, window.scrollY.toString(), label).subscribe(r => {
                if (r.success) this.bookmarks = r.data.bookmarks || [];
            });
            return;
        }
        if (!this.rendition) return;
        const currentLocation: any = this.rendition.currentLocation();
        if (currentLocation?.start) {
            const cfi = currentLocation.start.cfi;
            const label = this.currentChapter || `صفحة ${this.currentPage}`;
            this.readingProgressService.addBookmark(this.ebookId, cfi, label).subscribe({
                next: (response) => {
                    if (response.success) this.bookmarks = response.data.bookmarks || [];
                }
            });
        }
    }

    removeBookmark(id: string) {
        this.readingProgressService.removeBookmark(this.ebookId, id).subscribe({
            next: (response) => {
                if (response.success) this.bookmarks = response.data.bookmarks || [];
            }
        });
    }

    addHighlight(color: string) {
        const userStr = localStorage.getItem('user');
        const merchantToken = localStorage.getItem('merchant_token');
        let isLoggedIn = false;

        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                isLoggedIn = !!(user && (user.token || user.accessToken));
            } catch (e) { isLoggedIn = false; }
        } else if (merchantToken) isLoggedIn = true;

        if (!isLoggedIn) {
            this.showAuthModal = true;
            this.showSelectionPopup = false;
            return;
        }

        if (!this.selectedText || !this.selectedCfiRange) {
            this.showSelectionPopup = false;
            return;
        }

        const existing = this.highlights.find(h => h.cfi === this.selectedCfiRange);
        if (existing) {
            if (color === 'remove' || color === 'transparent') this.removeHighlight(existing._id);
            this.showSelectionPopup = false;
            return;
        }

        if (color === 'remove' || color === 'transparent') {
            this.removeHighlightSelection();
            return;
        }

        const tempHighlight: Highlight = {
            _id: 'temp_' + Date.now(),
            cfi: this.selectedCfiRange,
            text: this.selectedText,
            color: color,
            note: '',
            createdAt: new Date()
        };

        this.highlights.push(tempHighlight);

        if (this.bookType === 'epub') {
            const data = { color: color };
            const className = 'kenouz-hl-' + color.replace('#', '').toLowerCase();
            this.rendition?.annotations.add('highlight', this.selectedCfiRange, data, (e: any) => {
                this.handleHighlightClick(e, this.selectedCfiRange);
            }, className);

            if (this.currentSelectionContents) {
                const sel = this.currentSelectionContents.window.getSelection();
                if (sel) sel.removeAllRanges();
            }
        } else {
            this.cdr.detectChanges();
        }

        this.showSelectionPopup = false;
        this.readingProgressService.addHighlight(this.ebookId, this.selectedCfiRange, this.selectedText, color, '').subscribe({
            next: (response) => {
                if (response.success) {
                    this.highlights = response.data.highlights || [];
                    this.cdr.detectChanges();
                }
            }
        });

        this.selectedText = '';
        this.selectedCfiRange = '';
    }

    goToLogin() {
        this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
    }

    goToSignup() {
        this.router.navigate(['/create-account'], { queryParams: { returnUrl: this.router.url } });
    }

    closeAuthPrompt() {
        this.showAuthModal = false;
    }

    private removeHighlightSelection() {
        const exactMatch = this.highlights.find(h => h.cfi === this.selectedCfiRange);
        if (exactMatch) {
            this.removeHighlight(exactMatch._id);
            this.showSelectionPopup = false;
            return;
        }

        this.showSelectionPopup = false;
    }

    copySelectedText() {
        if (this.selectedText) {
            navigator.clipboard.writeText(this.selectedText).then(() => {
                this.showSelectionPopup = false;
            });
        }
    }

    expandSelection(direction: 'start' | 'end') {
        const contents = this.currentSelectionContents;
        const isBok = !contents; // BOK reader uses main document selection
        const win = isBok ? window : contents.window;
        const sel = win.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        
        if (direction === 'start') {
            // Expand start (in RTL Arabic, start boundary is on the right, we move it backwards in characters)
            this.moveRangeBoundary(range, 'start', -1);
        } else {
            // Expand end (in RTL Arabic, end boundary is on the left, we move it forwards in characters)
            this.moveRangeBoundary(range, 'end', 1);
        }
        
        sel.removeAllRanges();
        sel.addRange(range);
        
        this.selectedText = sel.toString().trim();
        this.currentSelectionRange = range;
        
        // Re-calculate position
        const rect = range.getBoundingClientRect();
        if (isBok) {
            this.selectionPopupPosition = {
                x: rect.left + (rect.width / 2),
                y: rect.top - 10 + window.scrollY
            };
        } else {
            const iframeRect = contents.document.defaultView.frameElement.getBoundingClientRect();
            this.selectionPopupPosition = {
                x: iframeRect.left + rect.left + (rect.width / 2),
                y: iframeRect.top + rect.top - 10
            };
        }
        this.cdr.detectChanges();
    }

    selectFullSentence() {
        const contents = this.currentSelectionContents;
        const isBok = !contents;
        const win = isBok ? window : contents.window;
        const sel = win.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        
        // Expand start backwards until sentence punctuation
        this.expandToSentenceBoundary(range, 'start');
        // Expand end forwards until sentence punctuation
        this.expandToSentenceBoundary(range, 'end');
        
        sel.removeAllRanges();
        sel.addRange(range);
        
        this.selectedText = sel.toString().trim();
        this.currentSelectionRange = range;
        
        // Re-calculate position
        const rect = range.getBoundingClientRect();
        if (isBok) {
            this.selectionPopupPosition = {
                x: rect.left + (rect.width / 2),
                y: rect.top - 10 + window.scrollY
            };
        } else {
            const iframeRect = contents.document.defaultView.frameElement.getBoundingClientRect();
            this.selectionPopupPosition = {
                x: iframeRect.left + rect.left + (rect.width / 2),
                y: iframeRect.top + rect.top - 10
            };
        }
        this.cdr.detectChanges();
    }

    private moveRangeBoundary(range: Range, boundary: 'start' | 'end', direction: -1 | 1) {
        let node = boundary === 'start' ? range.startContainer : range.endContainer;
        let offset = boundary === 'start' ? range.startOffset : range.endOffset;
        
        if (node.nodeType === 3) { // TEXT_NODE
            let text = node.textContent || '';
            if (direction === -1) {
                // Move start backwards to the previous word boundary
                if (offset === 0) {
                    const prevNode = this.getAdjacentTextNode(node, -1);
                    if (prevNode) {
                        node = prevNode;
                        text = node.textContent || '';
                        offset = text.length;
                    }
                }
                
                if (offset > 0) {
                    const sub = text.substring(0, offset).trimEnd();
                    const lastSpace = sub.lastIndexOf(' ');
                    if (lastSpace !== -1) {
                        offset = lastSpace;
                    } else {
                        offset = 0;
                    }
                }
            } else {
                // Move end forwards to the next word boundary
                if (offset >= text.length) {
                    const nextNode = this.getAdjacentTextNode(node, 1);
                    if (nextNode) {
                        node = nextNode;
                        text = node.textContent || '';
                        offset = 0;
                    }
                }
                
                if (offset < text.length) {
                    const sub = text.substring(offset).trimStart();
                    const firstSpace = sub.indexOf(' ');
                    if (firstSpace !== -1) {
                        offset = offset + (text.substring(offset).length - sub.length) + firstSpace;
                    } else {
                        offset = text.length;
                    }
                }
            }
            
            if (boundary === 'start') {
                range.setStart(node, offset);
            } else {
                range.setEnd(node, offset);
            }
        }
    }

    private expandToSentenceBoundary(range: Range, boundary: 'start' | 'end') {
        let node = boundary === 'start' ? range.startContainer : range.endContainer;
        let offset = boundary === 'start' ? range.startOffset : range.endOffset;
        const punctuation = ['.', '!', '؟', '?', '\n', '\r', ':', '•'];
        
        if (node.nodeType === 3) { // TEXT_NODE
            let text = node.textContent || '';
            if (boundary === 'start') {
                while (offset > 0) {
                    const char = text[offset - 1];
                    if (punctuation.includes(char)) {
                        break;
                    }
                    offset--;
                }
                range.setStart(node, offset);
            } else {
                while (offset < text.length) {
                    const char = text[offset];
                    if (punctuation.includes(char)) {
                        break;
                    }
                    offset++;
                }
                range.setEnd(node, offset);
            }
        }
    }

    private getAdjacentTextNode(node: Node, direction: -1 | 1): Node | null {
        let current: Node | null = node;
        while (current) {
            let next: Node | null = null;
            if (direction === -1) {
                next = current.previousSibling;
                if (!next && current.parentNode) {
                    current = current.parentNode;
                    continue;
                }
            } else {
                next = current.nextSibling;
                if (!next && current.parentNode) {
                    current = current.parentNode;
                    continue;
                }
            }
            
            if (next) {
                const textNode = this.findTextNodeDeep(next, direction);
                if (textNode) return textNode;
                current = next;
            } else {
                break;
            }
        }
        return null;
    }

    private findTextNodeDeep(node: Node, direction: -1 | 1): Node | null {
        if (node.nodeType === 3 && node.textContent?.trim()) {
            return node;
        }
        const children = Array.from(node.childNodes);
        if (direction === -1) {
            children.reverse();
        }
        for (const child of children) {
            const found = this.findTextNodeDeep(child, direction);
            if (found) return found;
        }
        return null;
    }

    removeHighlight(id: string) {
        const highlight = this.highlights.find(h => h._id === id);
        if (highlight && highlight.cfi) {
            this.rendition?.annotations.remove(highlight.cfi, 'highlight');
            this.readingProgressService.removeHighlight(this.ebookId, id).subscribe({
                next: (res) => {
                    if (res.success) {
                        this.highlights = res.data.highlights || [];
                        this.cdr.detectChanges();
                    }
                }
            });
        }
    }

    restoreHighlights(contents: any) {
        if (!this.rendition) return;
        this.highlights.forEach(h => {
            if (!h.cfi.startsWith('bok:')) {
                const data = { color: h.color };
                const className = 'kenouz-hl-' + h.color.replace('#', '').toLowerCase();
                try {
                    this.rendition?.annotations.add('highlight', h.cfi, data, (e: any) => {
                        this.handleHighlightClick(e, h.cfi);
                    }, className);
                } catch (e: any) {}
            }
        });
    }

    handleBokMouseUp(event: Event) { }

    private handleScroll = () => {
        if (this.bookType === 'bok') {
            this.updateBokProgress();
            this.cdr.detectChanges();
        }
    };

    private handleSelectionChange = () => {
        if (!this.isBrowser || this.bookType !== 'bok') return;
        const selection = document.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            if (this.selectionTimeout) clearTimeout(this.selectionTimeout);
            this.selectionTimeout = setTimeout(() => {
                this.processBokSelection(selection);
            }, 200);
        }
    }

    private processBokSelection(selection: Selection) {
        if (!this.isBrowser) return;
        const text = selection.toString().trim();
        const contentContainer = document.querySelector('.bok-text-content');
        if (!contentContainer || !contentContainer.contains(selection.anchorNode)) return;

        const range = selection.getRangeAt(0);
        
        // Calculate offsets relative to the full text content
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(contentContainer);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);

        const start = preSelectionRange.toString().length;
        const end = start + text.length;

        this.selectedText = text;
        this.selectedCfiRange = `bok:0:${start}:${end}`;

        const rect = range.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        this.selectionPopupPosition = {
            x: Math.min(Math.max(10, rect.left + (rect.width / 2) - 100), window.innerWidth - 210),
            y: rect.top + scrollTop - 60
        };

        this.showSelectionPopup = true;
        this.cdr.detectChanges();
    }

    get outputBokPage(): SafeHtml {
        if (this.bookType !== 'bok' || this.bokPages.length === 0) return '';
        
        const originalText = this.bokPages[0]; // Currently showing the active chunk
        const allHighlights = this.highlights
            .filter(h => h.cfi.startsWith('bok:0:')) 
            .map(h => {
                const parts = h.cfi.split(':');
                return { start: parseInt(parts[2]), end: parseInt(parts[3]), color: h.color, id: h._id };
            })
            .filter(h => h.start < originalText.length) // Only show highlights in visible chunk
            .sort((a, b) => a.start - b.start);

        if (allHighlights.length === 0) return this.sanitizer.bypassSecurityTrustHtml(originalText);
        
        let result = '';
        let currentIndex = 0;
        
        allHighlights.forEach(h => {
            if (h.start >= currentIndex && h.start < originalText.length) {
                result += originalText.substring(currentIndex, h.start);
                const end = Math.min(h.end, originalText.length);
                const highlightText = originalText.substring(h.start, end);
                result += `<span class="kenouz-highlight" style="background-color: ${h.color}; cursor: pointer;" data-id="${h.id}">${highlightText}</span>`;
                currentIndex = end;
            }
        });
        
        if (currentIndex < originalText.length) {
            result += originalText.substring(currentIndex);
        }
        
        return this.sanitizer.bypassSecurityTrustHtml(result);
    }

    handleBokClick(event: MouseEvent) {
        event.stopPropagation();
        const target = event.target as HTMLElement;
        const now = Date.now();
        if (this.lastBokClickTime && (now - this.lastBokClickTime < 300)) {
            this.toggleControls();
            this.lastBokClickTime = 0;
            return;
        }
        this.lastBokClickTime = now;
        if (target.classList.contains('kenouz-highlight')) {
            const id = target.getAttribute('data-id');
            if (id) this.removeHighlight(id);
        }
    }

    private lastBokClickTime = 0;

    private handleHighlightClick(e: MouseEvent, cfiRange: string) {
        e.stopPropagation();
        const highlight = this.highlights.find(h => h.cfi === cfiRange);
        if (highlight) this.removeHighlight(highlight._id);
    }

    loadMoreBok() {
        if (!this.bokContentFull) return;
        const currentLen = this.bokPages[0].length;
        const nextChunk = this.bokContentFull.substring(0, currentLen + 100000);
        this.bokPages = [nextChunk];
        this.cdr.detectChanges();
    }

    get hasMoreBok(): boolean {
        return !!(this.bokContentFull && this.bokPages[0] && this.bokPages[0].length < this.bokContentFull.length);
    }

    forceLoadAllChapters(): void {
        const manager = (this.rendition as any).manager;
        if (!manager || this.settings.layoutMode === 'pages') return;

        const spineItems = (this.book?.spine as any)?.items || (this.book?.spine as any)?.spineItems || [];
        const totalSections = spineItems.length;
        let loaded = 0;

        console.log(`KENOUZ: Background loading all ${totalSections} chapters to ensure smooth scrolling...`);

        const loadNext = () => {
            if (!this.rendition || !manager) return;
            const views = manager.views;
            if (!views) return;
            
            const lastView = views.last();
            if (!lastView || !lastView.section) {
                manager.q.enqueue(() => manager.update(0));
                return;
            }
            
            const nextSection = lastView.section.next();
            if (nextSection) {
                const view = manager.append(nextSection);
                if (view && typeof view.display === 'function') {
                    view.display(manager.request).then(() => {
                        loaded++;
                        setTimeout(loadNext, 10);
                    }).catch((err: any) => {
                        loaded++;
                        setTimeout(loadNext, 10);
                    });
                } else {
                    loaded++;
                    setTimeout(loadNext, 10);
                }
            } else {
                console.log(`KENOUZ: Finished loading all chapters.`);
                manager.q.enqueue(() => manager.update(0));
            }
        };

        // Start loading next chapters recursively
        setTimeout(loadNext, 100);
    }
}
