import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
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

@Component({
    selector: 'app-epub-reader',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './epub-reader.component.html',
    styleUrls: ['./epub-reader.component.css']
})
export class EpubReaderComponent implements OnInit, OnDestroy, AfterViewInit {
    @ViewChild('readerContainer', { static: false }) readerContainer!: ElementRef;

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
    contentWidth = 900; // Default width
    readonly minContentWidth = 300;
    readonly maxContentWidth = 1200;
    readonly contentWidthStep = 100;

    // Animation State
    animationClass: string = '';

    // Calculate max allowed width based on screen size with responsive margin
    get effectiveMaxWidth(): number {
        const sideMargin = window.innerWidth < 600 ? 20 : (window.innerWidth < 900 ? 50 : 100);
        const availableWidth = window.innerWidth - (sideMargin * 2);
        return Math.max(this.minContentWidth, Math.min(this.maxContentWidth, availableWidth));
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
        backgroundImage: null
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

    // Temporary variable for background image input
    tempBackgroundImage: string = '';

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
        private hostEl: ElementRef
    ) { }

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
        this.contentWidth = Math.min(900, this.effectiveMaxWidth);

        this.checkAccessAndLoad();
        this.readingStartTime = Date.now();

        this.saveProgressInterval = setInterval(() => {
            this.saveProgress();
        }, 10000);
    }

    ngAfterViewInit(): void {
        document.addEventListener('keydown', this.handleKeydown.bind(this));
        document.addEventListener('selectionchange', this.handleSelectionChange);
    }

    ngOnDestroy(): void {
        this.saveProgress();
        if (this.saveProgressInterval) clearInterval(this.saveProgressInterval);
        if (this.book) this.book.destroy();
        document.removeEventListener('keydown', this.handleKeydown.bind(this));
        document.removeEventListener('selectionchange', this.handleSelectionChange);
    }

    // Listen for window resize to adjust content width
    @HostListener('window:resize')
    onWindowResize() {
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
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') this.nextPage();
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') this.prevPage();
        else if (event.key === 'Escape') this.closeAllPanels();
    }

    private async checkAccessAndLoad(): Promise<void> {
        this.isLoading = true;

        // --- BOK File Logic ---
        if (this.bookType === 'bok') {
            this.ebook = {
                _id: this.ebookId,
                title: 'الكتاب الشامل',
                author: 'غير معروف',
                accessType: 'owned'
            } as any;

            // Simple check for subscription (no persistent store for sub status here, assume if library component let us here, we might have access)
            // But we should double check real access rights if possible.
            // For now, load file.
            this.userLibraryService.checkAccess(this.ebookId).subscribe({
                next: (res) => {
                    this.hasAccess = res.hasAccess;
                    // Only disable preview if explicitly granted access and not 'preview' type
                    this.isPreviewMode = res.accessType === 'preview' || !this.hasAccess;
                    this.loadBokFile();
                },
                error: (err) => {
                    console.warn('Access check failed, defaulting to preview mode', err);
                    this.hasAccess = false;
                    this.isPreviewMode = true;
                    this.loadBokFile();
                }
            });
            return;
        }

        // --- EPUB Logic ---
        try {
            // 1. Get cached status if available
            const isCached = await this.offlineEbookService.isBookCached(this.ebookId);
            const cachedMetadata = isCached ? await this.offlineEbookService.getMetadata(this.ebookId) : null;

            let accessResponse: any = null;
            let ebookDetails: any = null;
            let networkSuccess = false;

            // 2. Try fetching access rights & metadata (Network)
            try {
                // We use Promise.allSettled to try both but not fail completely if one fails
                const [accessRes, ebookRes] = await Promise.allSettled([
                    this.userLibraryService.checkAccess(this.ebookId).toPromise(),
                    this.ebookService.getEbookById(this.ebookId).toPromise()
                ]);

                if (accessRes.status === 'fulfilled') {
                    accessResponse = accessRes.value;
                    networkSuccess = true;
                }
                if (ebookRes.status === 'fulfilled') ebookDetails = ebookRes.value?.data;

            } catch (networkErr) {
                console.warn('Network requests failed (likely offline):', networkErr);
            }

            // 3. Determine Access Mode
            if (networkSuccess && accessResponse) {
                // Online Authoritative Check
                this.hasAccess = accessResponse.hasAccess === true;
                this.isPreviewMode = accessResponse.accessType === 'preview' || !this.hasAccess;
                console.log('KENOUZ DEBUG: Online Access Check. HasAccess:', this.hasAccess, 'IsPreview:', this.isPreviewMode, 'Type:', accessResponse.accessType);

                // Update cached metadata with new confirmed status
                if (isCached && cachedMetadata) {
                    cachedMetadata.accessType = this.hasAccess && !this.isPreviewMode ? 'owned' : 'preview';

                    // SAVE EXPIRY DATE
                    if (this.hasAccess && accessResponse.accessType === 'subscription' && accessResponse.subscription?.endDate) {
                        cachedMetadata.subscriptionExpiry = accessResponse.subscription.endDate;
                    } else if (this.hasAccess && accessResponse.accessType === 'owned') {
                        cachedMetadata.subscriptionExpiry = undefined; // Permanent access
                    }

                    this.offlineEbookService.saveMetadata(this.ebookId, cachedMetadata);
                }

            } else if (isCached) {
                // Offline Fallback
                console.log('Using offline cached metadata for access rights');
                if (cachedMetadata && cachedMetadata.accessType === 'owned') {
                    // CHECK EXPIRY if subscription
                    if (cachedMetadata.subscriptionExpiry) {
                        const expiry = new Date(cachedMetadata.subscriptionExpiry);
                        const now = new Date();
                        if (now > expiry) {
                            console.warn('Offline subscription expired:', expiry);
                            this.hasAccess = false;
                            this.isPreviewMode = true;
                            this.error = 'انتهت صلاحية اشتراكك (محفوظ محلياً). يرجى الاتصال بالإنترنت للتجديد.';
                        } else {
                            this.hasAccess = true;
                            this.isPreviewMode = false;
                        }
                    } else {
                        // Critical Pass: Check if it's truly permanent ownership
                        if (cachedMetadata.isOwned) {
                            this.hasAccess = true;
                            this.isPreviewMode = false;
                        } else {
                            // It was likely a subscription access (cached as 'owned') but has no expiry date saved.
                            // To be strict/safe and prevent the loophole, we default to PREVIEW.
                            // User must go online once to refresh the metadata and save the expiry date.
                            console.warn('Offline: Subscription access found but no expiry date. Defaulting to preview for security.');
                            this.hasAccess = false;
                            this.isPreviewMode = true;
                            this.error = 'يرجى الاتصال بالإنترنت لتحديث حالة اشتراكك.';
                        }
                    }
                } else {
                    this.hasAccess = false;
                    this.isPreviewMode = true;
                }
            } else {
                // Guest/Offline fallback: Default to Preview
                console.warn('No authentication or offline data. Defaulting to Preview Mode.');
                this.hasAccess = false;
                this.isPreviewMode = true;
            }

            this.ebook = ebookDetails || cachedMetadata || this.ebook;

            // 5. Load Progress FIRST (to ensure saved CFI is ready for initial render)
            await this.loadReadingProgress();

            // 6. Load the File
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
            }

            // 7. Save metadata using the resolved access status
            if (this.ebook) {
                this.ebook.accessType = this.isPreviewMode ? 'preview' : 'owned';
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
        }
    }

    private async loadReadingProgress() {
        const localKey = `kenouz_progress_${this.ebookId}`;
        const localDataString = localStorage.getItem(localKey);
        let localProgress: any = null;

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

        try {
            // Background fetch from server
            const progressResponse = await this.readingProgressService.getProgress(this.ebookId).toPromise();
            if (progressResponse?.success && progressResponse.data) {
                const serverProgress = progressResponse.data;

                // Sync Logic: Favor Server only if it's strictly newer
                const serverTime = new Date(serverProgress.updatedAt || 0).getTime();
                const localTime = localProgress?.timestamp || 0;

                if (serverTime > localTime || !localProgress) {
                    this.progress = serverProgress;
                    this.bookmarks = serverProgress.bookmarks || [];
                    this.highlights = serverProgress.highlights || [];

                    if (serverProgress.settings) {
                        this.settings = { ...this.settings, ...serverProgress.settings };
                        if (this.bookType === 'epub') this.applyThemeToWrapper();
                    }

                    if (this.bookType === 'bok' && this.progress?.currentPage !== undefined) {
                        this.currentPage = this.progress.currentPage;
                        this.updateBokProgress();
                    } else if (this.bookType === 'epub' && this.progress?.currentCfi) {
                        this.currentCfi = this.progress.currentCfi;
                        // If book is already displayed, jump to the new CFI
                        if (this.rendition) {
                            this.rendition.display(this.currentCfi);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Could not sync with server, using local progress only.', e);
        } finally {
            this.isProgressLoaded = true;
        }
    }

    private async loadBokFile() {
        try {
            // Use full ebookId - DownloadManagerService stores with the ext_ prefix
            let content = await this.downloadManager.getBookContent(this.ebookId);

            if (!content) {
                // Genius Solution: Auto-download if not found!
                this.isLoading = true;
                // remove ext_ or ext- prefix to get original ID for lookup
                const originalId = this.ebookId.replace(/^ext[-_]/, '');

                try {
                    // Fetch Metadata first
                    const book = await this.externalLibraryService.getBookById(originalId).toPromise();

                    if (book) {
                        // Trigger Download/Extraction
                        await new Promise<void>((resolve, reject) => {
                            this.downloadManager.downloadAndProcessBook(
                                this.ebookId,
                                book.downloadUrl,
                                { title: book.title, author: book.author, category: book.category }
                            ).subscribe({
                                next: (p) => {
                                    if (p.state === 'DONE') resolve();
                                },
                                error: (err) => reject(err)
                            });
                        });

                        // Try to get content again
                        content = await this.downloadManager.getBookContent(this.ebookId);
                    }
                } catch (err) {
                    console.warn('Auto-download failed', err);
                }
            }

            if (!content) {
                throw new Error('File not found locally and could not be downloaded.');
            }

            this.bokContentFull = content;
            // Simple Paginator (Words based)
            // A more advanced BOK parser would parse pages based on markers, but for text files we split by words
            const words = content.split(/\s+/);
            const wordsPerPage = 250;
            this.bokPages = [];
            for (let i = 0; i < words.length; i += wordsPerPage) {
                this.bokPages.push(words.slice(i, i + wordsPerPage).join(' '));
            }

            this.totalPages = this.bokPages.length;
            this.isLoading = false;

            // Load Progress FIRST for BOK
            await this.loadReadingProgress();

            // Load TOC for BOK
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
                    const navItem: NavItem = {
                        id: tItem.id,
                        href: `bok:${tItem.id}`,
                        label: tItem.title,
                        subitems: []
                    };

                    // Find parent
                    while (stack.length > 0 && stack[stack.length - 1].level >= tItem.level) {
                        stack.pop();
                    }

                    if (stack.length > 0) {
                        stack[stack.length - 1].item.subitems?.push(navItem);
                    } else {
                        rootedToc.push(navItem);
                    }
                    stack.push({ item: navItem, level: tItem.level });
                });

                if (rootedToc.length > 0) this.toc = this.processToc(rootedToc);
            } else {
                this.toc = [];
            }

            // Restore progress ensures UI reflects what was loaded
            if (this.currentPage >= this.totalPages) this.currentPage = 0;
            this.updateBokProgress();

        } catch (e: any) {
            console.error(e);
            this.error = 'تعذر قراءة ملف الكتاب (BOK)';
            this.isLoading = false;
        }
    }

    private async loadEpubFile(): Promise<void> {
        try {
            let blob: Blob | undefined;

            try {
                blob = await this.offlineEbookService.getOrFetchBook(this.ebookId).toPromise();
            } catch (err: any) {
                if (err.message === 'NO_INTERNET') {
                    this.error = 'لا يوجد اتصال بالإنترنت. يرجى الاتصال لتحميل الكتاب لأول مرة.';
                    this.isLoading = false;
                    return;
                }
                throw err;
            }

            if (!blob) throw new Error('No content');

            const arrayBuffer = await blob.arrayBuffer();
            this.book = ePub(arrayBuffer);
            await this.book.ready;

            this.toc = this.processToc((await this.book.loaded.navigation).toc);

            // Wait for the container to be available in the DOM
            let attempts = 0;
            let containerElement: any = null;

            while (!containerElement && attempts < 50) {
                this.cdr.detectChanges(); // Force view check
                containerElement = this.readerContainer?.nativeElement || document.getElementById('epub-reader-frame');
                if (!containerElement) await new Promise(r => setTimeout(r, 50));
                attempts++;
            }

            if (!containerElement) {
                throw new Error('تعذر العثور على عنصر عرض الكتاب (Timeout)');
            }

            this.rendition = this.book.renderTo(containerElement, {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'paginated',
                allowScriptedContent: true
            });


            if (this.progress?.currentCfi) {
                await this.rendition.display(this.progress.currentCfi);
            } else {
                await this.rendition.display();
            }

            // CRITICAL FIX: Ensure theme and highlights are applied AFTER rendition is ready
            // This handles the case where loadReadingProgress finished before rendition was created
            setTimeout(() => {
                this.applyThemeToWrapper();
                if (this.highlights && this.highlights.length > 0) {
                    console.log('KENOUZ: Restoration trigger from loadEpubFile', this.highlights.length);
                    this.restoreHighlights(null);
                }
            }, 500);

            this.bindRenditionEvents();

            this.isLoading = false;

            // Generate locations in background after load
            this.book.locations.generate(1000);

        } catch (e: any) {
            console.error(e);
            this.error = `فشل تحميل الملف: ${e.message || e}`;
            this.isLoading = false;
        }
    }

    private bindRenditionEvents() {
        if (!this.rendition) return;

        // Hook for applying styles and event listeners on every chapter load
        this.rendition.hooks.content.register((contents: any) => {
            this.applyStyleToFrame(contents);

            // Access both document and window of the iframe
            const doc = contents.document;
            const win = contents.window; // Sometimes needed for selection

            // Re-bind touch handlers to the IFRAME document directly
            doc.addEventListener('touchstart', (e: TouchEvent) => {
                this.touchStartX = e.changedTouches[0].clientX;
                this.touchStartY = e.changedTouches[0].clientY;
            });

            doc.addEventListener('touchend', (e: TouchEvent) => {
                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;
                this.handleSwipe(this.touchStartX, this.touchStartY, touchEndX, touchEndY);
            });
        });

        this.rendition.on('relocated', (location: any) => {
            this.updateProgress(location);
        });

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
        this.rendition.on('click', () => {
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
            }
            lastClickTime = now;
        });
    }

    private handleSwipe(startX: number, startY: number, endX: number, endY: number) {
        const diffX = startX - endX;
        const diffY = startY - endY;

        // Check if movement is horizontal enough (ignore vertical scrolls)
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > this.SWIPE_THRESHOLD) {
            // Arabic RTL Logic (Like Physical Book):
            // Swipe Right (diffX < 0) -> Next Page (Flip page from left to right)
            // Swipe Left (diffX > 0) -> Prev Page (Flip page from right to left)

            if (diffX < 0) {
                // Swipe Right -> Next Page
                this.nextPage();
            } else {
                // Swipe Left -> Prev Page
                this.prevPage();
            }
        }
    }

    // Public touch handlers for template binding
    onTouchStart(event: TouchEvent) {
        this.touchStartX = event.changedTouches[0].clientX;
        this.touchStartY = event.changedTouches[0].clientY;
        // Only track drag for BOK mode (EPUB uses iframe touch handlers)
        if (this.bookType === 'bok') {
            this.isDragging = true;
            this.dragOffset = 0;
        }
    }

    onTouchMove(event: TouchEvent) {
        if (!this.isDragging || this.bookType !== 'bok') return;
        const currentX = event.changedTouches[0].clientX;
        const currentY = event.changedTouches[0].clientY;
        const diffX = currentX - this.touchStartX;
        const diffY = currentY - this.touchStartY;

        // Only track horizontal movement
        if (Math.abs(diffX) > Math.abs(diffY)) {
            this.dragOffset = diffX;
        }
    }

    onTouchEnd(event: TouchEvent) {
        const touchEndX = event.changedTouches[0].clientX;
        const touchEndY = event.changedTouches[0].clientY;
        const diffX = this.touchStartX - touchEndX;

        // BOK Mode: Use drag animation
        if (this.bookType === 'bok') {
            this.isDragging = false;
            if (Math.abs(diffX) > this.SWIPE_THRESHOLD && Math.abs(diffX) > Math.abs(this.touchStartY - touchEndY)) {
                // Arabic RTL: Swipe Right -> Next, Swipe Left -> Prev
                if (diffX < 0) {
                    this.nextPage();
                } else {
                    this.prevPage();
                }
            }
            setTimeout(() => {
                this.dragOffset = 0;
            }, 50);
        }
        // EPUB Mode: Simple swipe (iframe handles rendering)
        else if (this.bookType === 'epub') {
            if (Math.abs(diffX) > this.SWIPE_THRESHOLD && Math.abs(diffX) > Math.abs(this.touchStartY - touchEndY)) {
                if (diffX < 0) {
                    this.nextPage();
                } else {
                    this.prevPage();
                }
            }
        }
    }

    private applyStyleToFrame(contents?: any) {


        const styles = {
            'body': { 'padding': '0 10px !important' }
        };

        if (this.rendition) {
            this.rendition.themes.default(styles);

            this.rendition.views().forEach((view: any) => {
                if (view.pane) view.pane.render();
            });

            if (contents) {
                this.injectUserPreferences(contents);
                this.injectHighlightStyles(contents);
            } else {
                const currentView = (this.rendition as any).manager?.current();
                if (currentView) {
                    const iframe = this.hostEl.nativeElement.querySelector('iframe');
                    if (iframe && iframe.contentDocument) {
                        const mockContents = { document: iframe.contentDocument };
                        this.injectUserPreferences(mockContents);
                        this.injectHighlightStyles(mockContents);
                    }
                }
            }
        }
    }

    private injectUserPreferences(contents: any) {
        const doc = contents.document;
        const oldStyle = doc.getElementById('kenouz-user-styles');
        if (oldStyle) oldStyle.remove();

        let bgColor = '#ffffff';
        let textColor = '#000000';
        let bgImage = 'none';

        switch (this.settings.theme) {
            case 'sepia': bgColor = '#f8f1e3'; textColor = '#5b4636'; break;
            case 'dark': bgColor = '#1a1a1a'; textColor = '#d1d5db'; break;
            case 'black': bgColor = '#000000'; textColor = '#9ca3af'; break;
            default: bgColor = '#ffffff'; textColor = '#1a1a1a'; break;
        }

        if (this.settings.backgroundImage) {
            bgImage = `url('${this.settings.backgroundImage}')`;
            bgColor = 'transparent';
        }

        const styleEl = doc.createElement('style');
        styleEl.id = 'kenouz-user-styles';
        styleEl.textContent = `
            body {
                background-color: ${bgColor} !important;
                background-image: ${bgImage} !important;
                background-size: cover !important;
                background-position: center !important;
                background-repeat: no-repeat !important;
                color: ${textColor} !important;
                font-family: ${this.settings.fontFamily} !important;
                padding: 0 10px !important;
                direction: rtl !important;
                text-align: right !important;
            }
            p, span, div, h1, h2, h3, h4, h5, h6, li, a { 
                font-family: ${this.settings.fontFamily} !important;
                line-height: ${this.settings.lineHeight} !important;
                text-align: ${this.settings.textAlign} !important;
                color: ${textColor} !important;
            }
            p, span, div, li, a {
                font-size: ${this.settings.fontSize}px !important;
            }
        `;
        doc.head.appendChild(styleEl);
    }

    private injectHighlightStyles(contents: any) {
        const doc = contents.document;
        // Always try to remove old style element to ensure update if chapter reloads or multiple calls
        const oldStyle = doc.getElementById('kenouz-highlight-styles');
        if (oldStyle) oldStyle.remove();

        // Determine blend mode based on theme for better visibility
        // Light/Sepia: Multiply (Classic highlighter effect)
        // Dark/Black: Difference (Inverts text color to dark, keeps highlight visible) is ideal for "making text dark"
        const isDark = this.settings.theme === 'dark' || this.settings.theme === 'black';
        const blendMode = isDark ? 'difference' : 'multiply';
        const opacity = isDark ? '1.0' : '0.3'; // Difference needs higher opacity to effectively invert

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
            }

            /* Fix misalignment - sometimes removing padding/margin from HL helps */
            g.epubjs-hl {
                 
            }

            .kenouz-hl-fef08a, .kenouz-hl-fef08a *, g.kenouz-hl-fef08a path, g.kenouz-hl-fef08a rect { 
                fill: #fef08a !important; 
                background-color: #fef08a !important; 
                stroke: #fef08a !important; 
            }
            .kenouz-hl-bbf7d0, .kenouz-hl-bbf7d0 *, g.kenouz-hl-bbf7d0 path, g.kenouz-hl-bbf7d0 rect { 
                fill: #bbf7d0 !important; 
                background-color: #bbf7d0 !important; 
                stroke: #bbf7d0 !important;
            }
            .kenouz-hl-bfdbfe, .kenouz-hl-bfdbfe *, g.kenouz-hl-bfdbfe path, g.kenouz-hl-bfdbfe rect { 
                fill: #bfdbfe !important; 
                background-color: #bfdbfe !important; 
                stroke: #bfdbfe !important;
            }
            .kenouz-hl-fbcfe8, .kenouz-hl-fbcfe8 *, g.kenouz-hl-fbcfe8 path, g.kenouz-hl-fbcfe8 rect { 
                fill: #fbcfe8 !important; 
                background-color: #fbcfe8 !important; 
                stroke: #fbcfe8 !important;
            }
            .kenouz-hl-fed7aa, .kenouz-hl-fed7aa *, g.kenouz-hl-fed7aa path, g.kenouz-hl-fed7aa rect { 
                fill: #fed7aa !important; 
                background-color: #fed7aa !important; 
                stroke: #fed7aa !important;
            }
        `;
        doc.head.appendChild(styleEl);
    }

    private updateProgress(location: any) {
        // Calculate percentage: Use reliable locations if available, else fall back to Spine Index
        let percent = location.start.percentage;

        if ((!percent || percent === 0) && this.book) {
            // Fallback: Calculate based on Chapter/Spine Index
            const cfi = location.start.cfi;
            const spineItem = this.book.spine.get(cfi);
            if (spineItem) {
                const index = (this.book.spine as any).spineItems.indexOf(spineItem);
                const total = (this.book.spine as any).spineItems.length;
                if (total > 0) {
                    percent = index / total;
                }
            }
        }

        this.progressPercent = Math.round((percent || 0) * 100);
        this.currentPage = location.start.displayed.page;
        this.totalPages = location.start.displayed.total;

        // Attempt to find current chapter name
        const chapter = location.start.displayed.chapter;
        if (chapter) {
            this.currentChapter = chapter;
        } else {
            // Fallback to TOC finding if chapter irrelevant
            const href = location.start.href;
            const tocItem = this.toc.find(item => href.includes(item.href));
            if (tocItem) this.currentChapter = tocItem.label;
        }
    }

    private updateBokProgress() {
        this.progressPercent = Math.round(((this.currentPage + 1) / this.totalPages) * 100);
        this.currentChapter = `صفحة ${this.currentPage + 1}`;
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
        if (this.bookType === 'bok') {
            const targetPage = Math.floor((percent / 100) * this.totalPages);
            this.currentPage = Math.min(Math.max(0, targetPage), this.totalPages - 1);
            this.updateBokProgress();
            window.scrollTo(0, 0);
            this.saveProgress();
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
                currentCfi: `bok:${this.currentPage}`,
                progressPercent: this.progressPercent,
                currentPage: this.currentPage,
                totalPages: this.totalPages
            };

            // Calculate words in current BOK page
            if (this.bokPages && this.bokPages[this.currentPage]) {
                const text = this.bokPages[this.currentPage];
                visibleWordCount = text.trim().split(/\s+/).length;
            }
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
            // Instant Local Save
            const localKey = `kenouz_progress_${this.ebookId}`;
            const localSaveObj = {
                ...progressData,
                settings: this.settings,
                timestamp: Date.now()
            };
            localStorage.setItem(localKey, JSON.stringify(localSaveObj));

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

                    console.log(`[Gamification Debug] Session Duration: ${formattedDuration} min (Words: ${visibleWordCount})`);
                    if (formattedDuration > 0.05) { // Min 3 seconds
                        console.log(`[Gamification Debug] Syncing progress...`);
                        this.gamificationService.syncProgress({
                            minutesRead: formattedDuration,
                            pagesRead: 0,
                            ebookId: this.ebookId
                        }).subscribe({
                            next: (res) => {
                                console.log('[Gamification Debug] Sync success:', res);
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
            // Enter fullscreen
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(err => console.log(err));
            }
        } else {
            // Exit fullscreen if active
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => console.log(err));
            }
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
        // BOK Mode
        if (this.bookType === 'bok') {
            const nextPageIndex = this.currentPage + 1;
            const progress = (nextPageIndex / this.totalPages) * 100;

            if (this.isPreviewMode && progress > 20) {
                this.showSubscriptionPrompt = true;
                return;
            }

            if (this.currentPage < this.totalPages - 1) {
                this.currentPage++;
                this.updateBokProgress();
                window.scrollTo(0, 0);

                // Add slide-in animation for BOK (next comes from left in RTL)
                this.animationClass = 'slide-in-left';
                setTimeout(() => { this.animationClass = ''; }, 300);

                this.saveProgress();
            }
            return;
        }

        // EPUB Mode - Simple navigation without animation delays
        if (this.rendition && !this.isNavigating) {
            if (this.isPreviewMode && this.progressPercent >= 20) {
                this.showSubscriptionPrompt = true;
                return;
            }

            this.isNavigating = true;
            try {
                await this.rendition.next();
                // Slide in from left (RTL: next comes from left)
                this.animationClass = 'slide-in-left';
                setTimeout(() => { this.animationClass = ''; }, 300);
                this.saveProgress();
            } catch (e) {
                console.error('EPUB next error:', e);
            } finally {
                this.isNavigating = false;
            }
        }
    }

    async prevPage() {
        // BOK Mode
        if (this.bookType === 'bok') {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.updateBokProgress();
                window.scrollTo(0, 0);

                // Add slide-in animation for BOK (prev comes from right in RTL)
                this.animationClass = 'slide-in-right';
                setTimeout(() => { this.animationClass = ''; }, 300);

                this.saveProgress();
            }
            return;
        }

        // EPUB Mode - Simple navigation with slide-in animation
        if (this.rendition && !this.isNavigating) {
            this.isNavigating = true;
            try {
                await this.rendition.prev();
                // Slide in from right (RTL: prev comes from right)
                this.animationClass = 'slide-in-right';
                setTimeout(() => { this.animationClass = ''; }, 300);
                this.saveProgress();
            } catch (e) {
                console.error('EPUB prev error:', e);
            } finally {
                this.isNavigating = false;
            }
        }
    }

    goToSubscription() {
        this.router.navigate(['/subscription']);
    }

    closeSubscriptionPrompt() {
        this.showSubscriptionPrompt = false;
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
        this.settings.fontSize = Math.max(12, Math.min(36, this.settings.fontSize + delta));
        this.applyStyleToFrame();
        this.saveSettings();
        if (this.bookType === 'epub') this.resizeRendition();
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

    private resizeRendition() {
        // Optimized resize prevents jarring jumps
        if (this.rendition) {
            const availableHeight = window.innerHeight - 74 - 80;
            const currentLocation: any = this.rendition.currentLocation();

            this.rendition.resize(this.contentWidth, availableHeight);

            // Only re-display if strictly necessary, but often resize handles it.
            // If we force display here, it might fix the "misalignment" but trigger a flash.
            // Let's try NOT forcing display, assuming resize works, 
            // OR if alignment is the issue, we might need to wait for resize to settle.
        }
    }

    // Navigation
    goToChapter(item: NavItem) {
        if (this.bookType === 'bok' && item.href.startsWith('bok:')) {
            const id = item.href.replace('bok:', '');
            const wordIndex = this.idMap[id];
            if (wordIndex !== undefined) {
                const wordsPerPage = 250;
                const page = Math.floor(wordIndex / wordsPerPage);

                // Preview Limit Check (BOK)
                if (this.isPreviewMode) {
                    const progress = (page / this.totalPages) * 100;
                    if (progress > 20) {
                        this.showSubscriptionPrompt = true;
                        return;
                    }
                }

                this.currentPage = Math.min(Math.max(0, page), this.totalPages - 1);
                this.updateBokProgress();
                window.scrollTo(0, 0);
                this.closeAllPanels();
                return;
            }
        }

        // Preview Limit Check (EPUB)
        // Preview Limit Check (EPUB)
        if (this.isPreviewMode && this.book) {
            if (this.progressPercent >= 20) {
                this.showSubscriptionPrompt = true;
                return;
            }
        }


        this.rendition?.display(item.href).then(() => {
            // Post-navigation check
            // Post-navigation check
            if (this.isPreviewMode && this.progressPercent > 20) {
                this.showSubscriptionPrompt = true;
            }

        });
        this.closeAllPanels();
    }

    goToPage(cfi: string) {
        if (this.bookType === 'bok') {
            // Unify format: remove 'bok:' prefix if present
            const pageStr = cfi.replace('bok:', '');
            const page = parseInt(pageStr, 10);

            if (!isNaN(page)) {
                this.currentPage = Math.min(Math.max(0, page), this.totalPages - 1);
                this.updateBokProgress();
                window.scrollTo(0, 0);
            }
            this.closeAllPanels();
            return;
        }

        this.rendition?.display(cfi);
        this.closeAllPanels();
    }

    private processToc(items: any[], level: number = 0): any[] {
        let result: any[] = [];
        if (!items) return result;

        items.forEach(item => {
            // Add level property for indentation
            item.level = level;
            result.push(item);

            // Process subitems if they exist
            if (item.subitems && item.subitems.length > 0) {
                result = result.concat(this.processToc(item.subitems, level + 1));
            }
        });
        return result;
    }

    goBack() {
        this.router.navigate(['/library']);
    }

    // Bookmarks
    addBookmark() {
        if (this.bookType === 'bok') {
            const label = `صفحة ${this.currentPage + 1}`;
            this.readingProgressService.addBookmark(this.ebookId, this.currentPage.toString(), label).subscribe(r => {
                if (r.success) this.bookmarks = r.data.bookmarks || [];
            });
            return;
        }

        if (!this.rendition) return;

        const currentLocation: any = this.rendition.currentLocation();
        if (currentLocation && currentLocation.start) {
            const cfi = currentLocation.start.cfi;
            const label = this.currentChapter || `صفحة ${this.currentPage}`;

            this.readingProgressService.addBookmark(this.ebookId, cfi, label).subscribe({
                next: (response) => {
                    if (response.success) {
                        this.bookmarks = response.data.bookmarks || [];
                    }
                },
                error: (err: any) => console.error('Failed to add bookmark', JSON.stringify(err))
            });
        }
    }

    removeBookmark(id: string) {
        this.readingProgressService.removeBookmark(this.ebookId, id).subscribe({
            next: (response) => {
                if (response.success) {
                    this.bookmarks = response.data.bookmarks || [];
                }
            },
            error: (err: any) => console.error('Failed to remove bookmark', err)
        });
    }

    // Highlights
    // Note: Advanced highlighting for BOK not implemented yet, using EPUB only
    addHighlight(color: string) {
        // Auth Check
        const userStr = localStorage.getItem('user');
        const merchantToken = localStorage.getItem('merchant_token');
        let isLoggedIn = false;

        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                isLoggedIn = !!(user && (user.token || user.accessToken));
            } catch (e) { isLoggedIn = false; }
        } else if (merchantToken) {
            isLoggedIn = true;
        }

        if (!isLoggedIn) {
            this.showAuthModal = true;
            this.showSelectionPopup = false;
            return;
        }

        if (!this.selectedText || !this.selectedCfiRange) {
            this.showSelectionPopup = false;
            return;
        }

        // DUPLICATION CHECK: Prevent adding if exact CFI exists
        const existing = this.highlights.find(h => h.cfi === this.selectedCfiRange);
        if (existing) {
            // If different color, we might update, but here we just return to avoid double stacking
            if (color === 'remove' || color === 'transparent') {
                this.removeHighlight(existing._id);
            }
            this.showSelectionPopup = false;
            return;
        }

        // Check if removing
        if (color === 'remove' || color === 'transparent') {
            this.removeHighlightSelection();
            return;
        }

        // --- OPTIMISTIC UPDATE START ---
        // Create a temporary highlight object to show immediately
        const tempHighlight: Highlight = {
            _id: 'temp_' + Date.now(),
            cfi: this.selectedCfiRange,
            text: this.selectedText,
            color: color,
            note: '',
            createdAt: new Date()
        };

        // 1. Update local state
        this.highlights.push(tempHighlight);

        // 2. Visual Render (Optimistic)
        if (this.bookType === 'epub') {
            const data = { color: color }; // No styles here to avoid DOMStringMap error
            const className = 'kenouz-hl-' + color.replace('#', '').toLowerCase();

            // Add specific annotation immediately
            this.rendition?.annotations.add('highlight', this.selectedCfiRange, data, (e: any) => {
                this.handleHighlightClick(e, this.selectedCfiRange);
            }, className);

            // Clear selection
            if (this.currentSelectionContents) {
                const sel = this.currentSelectionContents.window.getSelection();
                if (sel) sel.removeAllRanges();
            }
        } else if (this.bookType === 'bok') {
            // Force UI update for BOK
            this.cdr.detectChanges();
        }

        // Close popup immediately
        this.showSelectionPopup = false;
        const note = '';

        // 3. API Call (Background)
        this.readingProgressService.addHighlight(this.ebookId, this.selectedCfiRange, this.selectedText, color, note).subscribe({
            next: (response) => {
                if (response.success) {
                    // Sync with server response
                    this.highlights = response.data.highlights || [];
                }
            },
            error: (err: any) => {
                console.error('Failed to save highlight (keeping optimistic version)', JSON.stringify(err));
            }
        });

        // Reset selection state
        this.selectedText = '';
        this.selectedCfiRange = '';
        // --- OPTIMISTIC UPDATE END ---
    }

    // --- Auth Prompt Methods ---
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
        // "Eraser" logic

        // 1. Exact Match Removal
        // Check if there is a highlight that matches the current selection exactly
        const exactMatch = this.highlights.find(h => h.cfi === this.selectedCfiRange);
        if (exactMatch) {
            this.removeHighlight(exactMatch._id);
            this.showSelectionPopup = false;
            return;
        }

        // 2. BOK Overlap Removal
        if (this.bookType === 'bok') {
            const parts = this.selectedCfiRange.split(':');
            if (parts.length === 4) {
                const p = parseInt(parts[1]);
                const s = parseInt(parts[2]);
                const e = parseInt(parts[3]);

                // Find overlapping
                const overlapping = this.highlights.find(h => {
                    if (!h.cfi.startsWith(`bok:${p}:`)) return false;
                    const hParts = h.cfi.split(':');
                    const hS = parseInt(hParts[2]);
                    const hE = parseInt(hParts[3]);
                    // Check overlap
                    return (s < hE && e > hS);
                });

                if (overlapping) {
                    this.removeHighlight(overlapping._id);
                    this.showSelectionPopup = false;
                    return;
                }
            }
        }

        // 3. Fallback: Just close
        this.showSelectionPopup = false;
    }

    copySelectedText() {
        if (this.selectedText) {
            navigator.clipboard.writeText(this.selectedText).then(() => {
                this.showSelectionPopup = false;
                // Toast logic
            });
        }
    }

    removeHighlight(id: string) {
        const highlight = this.highlights.find(h => h._id === id);
        if (highlight && highlight.cfi) {
            this.rendition?.annotations.remove(highlight.cfi, 'highlight');
            this.readingProgressService.removeHighlight(this.ebookId, id).subscribe({
                next: (res) => {
                    if (res.success) this.highlights = res.data.highlights || [];
                }
            });
        }
    }

    restoreHighlights(contents: any) {
        if (!this.rendition) return;

        this.highlights.forEach(h => {
            // Only add if it belongs to EPUB
            if (!h.cfi.startsWith('bok:')) {
                // Check if already added? (Hard with epub.js blindly, but adding again usually duplicates visual unless underlying mechanism prevents it)
                // We rely on epub.js to manage or minimal performance impact for now.

                const data = { color: h.color };
                const className = 'kenouz-hl-' + h.color.replace('#', '').toLowerCase();

                try {
                    this.rendition?.annotations.add('highlight', h.cfi, data, (e: any) => {
                        this.handleHighlightClick(e, h.cfi);
                    }, className);
                } catch (e: any) {
                    // Ignore errors if CFI invalid for current chapter (epub.js might throw)
                }
            }
        });
    }

    // --- BOK (Shamela/Text) Selection Handling ---

    // Handle mouse/touch up on the BOK content container
    // Handle mouse/touch up on the BOK content container
    handleBokMouseUp(event: Event) {
        // Legacy handler kept for template reference but logic moved to selectionchange
    }

    private handleSelectionChange = () => {
        if (this.bookType !== 'bok') return;

        const selection = document.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            // Debounce slightly to ensure selection is stable
            if (this.selectionTimeout) clearTimeout(this.selectionTimeout);
            this.selectionTimeout = setTimeout(() => {
                this.processBokSelection(selection);
            }, 200);
        }
    }

    private processBokSelection(selection: Selection) {
        const text = selection.toString().trim();

        // Calculate Range relative to the page content
        const contentContainer = document.querySelector('.bok-text-content');
        if (!contentContainer) return;

        // Check if selection is inside our container
        if (!contentContainer.contains(selection.anchorNode)) return;

        // Get offsets
        const range = selection.getRangeAt(0);
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(contentContainer);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);

        const start = preSelectionRange.toString().length;
        const end = start + text.length;

        this.selectedText = text;
        this.selectedCfiRange = `bok:${this.currentPage}:${start}:${end}`;

        // Calculate popup position
        const rect = range.getBoundingClientRect();

        // Adjust for mobile viewport
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        this.selectionPopupPosition = {
            x: Math.min(Math.max(10, rect.left + (rect.width / 2) - 100), window.innerWidth - 210), // Center but keep onscreen
            y: rect.top + scrollTop - 60 // Position above text
        };

        this.showSelectionPopup = true;
        this.cdr.detectChanges();
    }

    // Process BOK page to inject highlight spans
    get outputBokPage(): SafeHtml {
        if (this.bookType !== 'bok' || !this.bokPages[this.currentPage]) return '';

        const originalText = this.bokPages[this.currentPage];
        const pageHighlights = this.highlights
            .filter(h => h.cfi.startsWith(`bok:${this.currentPage}:`))
            .map(h => {
                const parts = h.cfi.split(':');
                return {
                    start: parseInt(parts[2]),
                    end: parseInt(parts[3]),
                    color: h.color,
                    id: h._id
                };
            })
            .sort((a, b) => a.start - b.start);

        if (pageHighlights.length === 0) return originalText;

        let result = '';
        let currentIndex = 0;

        // Simple non-overlapping logic for now
        pageHighlights.forEach(h => {
            if (h.start >= currentIndex) {
                // Add text before highlight
                result += originalText.substring(currentIndex, h.start);
                // Add highlight
                const highlightText = originalText.substring(h.start, h.end);
                // We use inline style for background to ensure it applies
                result += `<span class="kenouz-highlight" style="background-color: ${h.color}; cursor: pointer;" title="click to remove" data-id="${h.id}">${highlightText}</span>`;
                currentIndex = h.end;
            }
        });

        // Add remaining text
        if (currentIndex < originalText.length) {
            result += originalText.substring(currentIndex);
        }

        return this.sanitizer.bypassSecurityTrustHtml(result);
    }

    // Initial BOK highlight click handler (if using event delegation)
    // For simplicity, we might iterate highlights in the view or handle clicks on container
    // Initial BOK highlight click handler (if using event delegation)
    // For simplicity, we might iterate highlights in the view or handle clicks on container
    handleBokClick(event: MouseEvent) {
        // Prevent event bubbling to avoid triggering global click handlers
        event.stopPropagation();

        const target = event.target as HTMLElement;

        // Check for double tap
        const now = Date.now();
        if (this.lastBokClickTime && (now - this.lastBokClickTime < 300)) {
            // Double tap detected!
            this.toggleControls();
            this.lastBokClickTime = 0; // Reset
            return;
        }
        this.lastBokClickTime = now;

        if (target.classList.contains('kenouz-highlight')) {
            const id = target.getAttribute('data-id');
            if (id) {
                // Direct remove for better UX on mobile
                this.removeHighlight(id);
            }
        }
    }

    private lastBokClickTime = 0;

    // Helper to handle highlight clicks (EPUB)
    private handleHighlightClick(e: MouseEvent, cfiRange: string) {
        e.stopPropagation(); // CRITICAL: Stop event from bubbling to 'selected' handler

        // Try to find the highlight object by CFI
        const highlight = this.highlights.find(h => h.cfi === cfiRange);
        if (highlight) {
            // Directly remove or show small custom UI. For now, matching user request:
            this.removeHighlight(highlight._id);
        }
    }
}
