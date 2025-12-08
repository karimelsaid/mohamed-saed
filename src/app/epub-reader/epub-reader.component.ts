import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import ePub, { Book, Rendition, NavItem } from 'epubjs';
import { EbookService } from '../services/ebook.service';
import { ReadingProgressService } from '../services/reading-progress.service';
import { UserLibraryService } from '../services/user-library.service';
import { Ebook, ReadingProgress, ReaderSettings, Bookmark, Highlight } from '../models/ebook.model';
import { OfflineEbookService } from '../services/offline-ebook.service'; // Import service

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

    // State
    isLoading = true;
    isNavigating = false; // لتتبع حالة التنقل بين الصفحات
    error: string | null = null;
    hasAccess = false;

    // Preview/Subscription State
    showSubscriptionPrompt = false;
    isPreviewMode = false;
    prices = { monthly: 50, yearly: 500 };

    // UI State
    isControlsVisible = true;
    activeSection: 'toc' | 'settings' | 'bookmarks' | 'highlights' | null = null;
    isFullscreen = false;

    // Content Width Control
    contentWidth = 900; // Default width
    readonly minContentWidth = 300;
    readonly maxContentWidth = 1200;
    readonly contentWidthStep = 100;

    // Calculate max allowed width based on screen size with responsive margin
    get effectiveMaxWidth(): number {
        // Use smaller margin on small screens, larger on big screens
        const sideMargin = window.innerWidth < 600 ? 20 : (window.innerWidth < 900 ? 50 : 100);
        const availableWidth = window.innerWidth - (sideMargin * 2);
        return Math.max(this.minContentWidth, Math.min(this.maxContentWidth, availableWidth));
    }

    // Reader State
    currentPage = 0;
    totalPages = 0;
    progressPercent = 0;
    currentChapter = '';

    // Table of Contents
    toc: NavItem[] = [];

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
        private offlineEbookService: OfflineEbookService, // Inject service
        private cdr: ChangeDetectorRef,
        private hostEl: ElementRef
    ) { }

    ngOnInit(): void {
        this.ebookId = this.route.snapshot.paramMap.get('ebookId') || '';
        if (!this.ebookId) {
            this.router.navigate(['/library']);
            return;
        }

        // Set initial content width based on screen size
        this.contentWidth = Math.min(900, this.effectiveMaxWidth);

        this.checkAccessAndLoad();
        this.readingStartTime = Date.now();

        this.saveProgressInterval = setInterval(() => {
            this.saveProgress();
        }, 30000);
    }

    ngAfterViewInit(): void {
        document.addEventListener('keydown', this.handleKeydown.bind(this));
    }

    ngOnDestroy(): void {
        this.saveProgress();
        if (this.saveProgressInterval) clearInterval(this.saveProgressInterval);
        if (this.book) this.book.destroy();
        document.removeEventListener('keydown', this.handleKeydown.bind(this));
    }

    // Listen for window resize to adjust content width
    @HostListener('window:resize')
    onWindowResize() {
        // If current width exceeds new effective max, adjust it
        if (this.contentWidth > this.effectiveMaxWidth) {
            this.contentWidth = this.effectiveMaxWidth;
            this.resizeRendition();
        }
    }

    private handleKeydown(event: KeyboardEvent): void {
        if (this.isNavigating) return; // منع التنقل أثناء تحميل صفحة جديدة
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') this.nextPage();
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') this.prevPage();
        else if (event.key === 'Escape') this.closeAllPanels();
    }

    private async checkAccessAndLoad(): Promise<void> {
        try {
            // Check access
            const accessResponse = await this.userLibraryService.checkAccess(this.ebookId).toPromise().catch(() => null);

            // Determine if user has full access
            this.hasAccess = accessResponse?.hasAccess === true;

            // Preview mode: when accessType is 'preview' OR user doesn't have access
            this.isPreviewMode = accessResponse?.accessType === 'preview' || !this.hasAccess;

            console.log('Access Check:', { hasAccess: this.hasAccess, accessType: accessResponse?.accessType, isPreviewMode: this.isPreviewMode });

            // Get ebook details
            const ebookResponse = await this.ebookService.getEbookById(this.ebookId).toPromise();
            this.ebook = ebookResponse?.data || null;

            // Get saved reading progress
            try {
                const progressResponse = await this.readingProgressService.getProgress(this.ebookId).toPromise();
                if (progressResponse?.success && progressResponse.data) {
                    this.progress = progressResponse.data;
                    this.bookmarks = progressResponse.data.bookmarks || [];
                    this.highlights = progressResponse.data.highlights || [];
                    console.log('Loaded highlights from backend:', this.highlights);
                    // Restore settings if saved
                    if (progressResponse.data.settings) {
                        this.settings = { ...this.settings, ...progressResponse.data.settings };
                        this.applyThemeToWrapper();
                    }
                }
            } catch (e) {
                console.log('No saved progress found, starting fresh');
            }

            await this.loadEpubFile();

        } catch (error: any) {
            console.error('Error loading book:', error);
            this.error = 'حدث خطأ أثناء تحميل الكتاب';
            this.isLoading = false;
        }
    }

    private async loadEpubFile(): Promise<void> {
        try {
            let blob: Blob | undefined;

            // Try to get book from secure cache or network

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

            this.toc = (await this.book.loaded.navigation).toc;

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

            this.applyStyleToFrame(); // Apply initial styles
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

        this.rendition.on('relocated', (location: any) => {
            this.updateProgress(location);
        });

        // Hook for applying styles on every chapter load
        this.rendition.hooks.content.register((contents: any) => {
            this.applyStyleToFrame(contents);
            // Restore highlights for this chapter after short delay to ensure DOM is ready
            setTimeout(() => {
                this.restoreHighlights(contents);
                // Trigger change detection to ensure highlights appear
                this.cdr.detectChanges();
            }, 100);
        });

        // Listen for text selection
        this.rendition.on('selected', (cfiRange: string, contents: any) => {
            const selection = contents.window.getSelection();
            if (selection && selection.toString().trim() && selection.rangeCount > 0) {
                this.selectedText = selection.toString().trim();
                this.selectedCfiRange = cfiRange;

                // Store the Range and contents for direct DOM manipulation
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

    private applyStyleToFrame(contents?: any) {
        // We need to inject styles into the epub iframe to match our themes
        // effectively passing down the CSS vars or setting specific props

        /*
           Since epubjs contents are in an iframe, we typically use:
           this.rendition.themes.default({ ... })
           But specific CSS vars might not pass through easily unless we inject a stylesheet or style block.
        */

        let bgColor = '#ffffff';
        let textColor = '#000000';
        let bgImage = '';

        switch (this.settings.theme) {
            case 'sepia': bgColor = '#f8f1e3'; textColor = '#5b4636'; break;
            case 'dark': bgColor = '#1a1a1a'; textColor = '#d1d5db'; break;
            case 'black': bgColor = '#000000'; textColor = '#9ca3af'; break;
            default: bgColor = '#ffffff'; textColor = '#1a1a1a'; break;
        }

        // If background image is set, use it instead of color
        if (this.settings.backgroundImage) {
            bgImage = `url('${this.settings.backgroundImage}')`;
            bgColor = 'transparent'; // Make background transparent to show image
        } else {
            // Explicitly ensure no background image when a color theme is active
            bgImage = 'none';
        }

        const styles = {
            'body': {
                'background-color': `${bgColor} !important`,
                'background-image': `${bgImage} !important`,
                'background-size': 'cover !important',
                'background-position': 'center !important',
                'background-repeat': 'no-repeat !important',
                'color': `${textColor} !important`,
                'font-family': `${this.settings.fontFamily} !important`,
                'padding': '0 10px !important'
            },
            'p': {
                'font-family': `${this.settings.fontFamily} !important`,
                'line-height': `${this.settings.lineHeight} !important`,
                'font-size': `${this.settings.fontSize}px !important`,
            }
        };

        if (this.rendition) {
            this.rendition.themes.default(styles);

            // Inject highlight CSS directly into each content document
            this.rendition.hooks.content.register((contents: any) => {
                const doc = contents.document;
                if (!doc.getElementById('kenouz-highlight-styles')) {
                    const styleEl = doc.createElement('style');
                    styleEl.id = 'kenouz-highlight-styles';
                    styleEl.textContent = `
                        .kenouz-highlight, mark.kenouz-highlight {
                            padding: 2px 0;
                            border-radius: 2px;
                        }
                        /* epub.js annotation highlight SVG styling */
                        .epubjs-hl { fill-opacity: 0.35 !important; }
                        .hl-fef08a { fill: #fef08a !important; }
                        .hl-bbf7d0 { fill: #bbf7d0 !important; }
                        .hl-bfdbfe { fill: #bfdbfe !important; }
                        .hl-fbcfe8 { fill: #fbcfe8 !important; }
                        .hl-fed7aa { fill: #fed7aa !important; }
                    `;
                    doc.head.appendChild(styleEl);
                }
            });
        }
    }

    private updateProgress(location: any) {
        this.progressPercent = Math.round((location.start.percentage || 0) * 100);
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

    onProgressChange(event: any) {
        const percent = event.target.value;
        const cfi = this.book?.locations.cfiFromPercentage(percent / 100);
        if (cfi) {
            this.rendition?.display(cfi);
        }
    }

    // Save progress to backend/local storage
    // Save progress to backend/local storage
    saveProgress() {
        if (!this.rendition) return;
        const currentLocation: any = this.rendition.currentLocation();
        if (currentLocation && currentLocation.start) {
            const progressData = {
                currentCfi: currentLocation.start.cfi,
                progressPercent: this.progressPercent,
                currentPage: this.currentPage,
                totalPages: this.totalPages
            };

            // Call service to save
            this.readingProgressService.updateProgress(this.ebookId, progressData).subscribe({
                error: (err: any) => console.error('Failed to save progress', err)
            });
        }
    }

    // Interactions
    toggleControls() {
        this.isControlsVisible = !this.isControlsVisible;
        if (!this.isControlsVisible) this.closeAllPanels();
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
        if (this.isPreviewMode && this.rendition) {
            const currentLocation: any = this.rendition.currentLocation();
            // Check if we're at the end of preview (last page of current chapter in preview)
            if (currentLocation?.atEnd || this.progressPercent >= 100) {
                // Show subscription prompt at ~100% for preview
                this.showSubscriptionPrompt = true;
                return;
            }
        }
        if (this.rendition && !this.isNavigating) {
            this.isNavigating = true;
            try {
                await this.rendition.next();
            } finally {
                this.isNavigating = false;
            }
        }
    }

    async prevPage() {
        if (this.rendition && !this.isNavigating) {
            this.isNavigating = true;
            try {
                await this.rendition.prev();
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
        this.settings.backgroundImage = null; // Reset background image when selecting color theme
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
            // Remove all theme classes first
            wrapper.classList.remove('theme-light', 'theme-sepia', 'theme-dark', 'theme-black');
            // Add the current theme class
            wrapper.classList.add(`theme-${this.settings.theme}`);

            // Apply background image to the wrapper for full component coverage
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

    changeFontSize(delta: number) {
        this.settings.fontSize = Math.max(12, Math.min(36, this.settings.fontSize + delta));
        this.applyStyleToFrame();
        this.resizeRendition();
    }

    changeFontFamily(font: string) {
        this.settings.fontFamily = font;
        this.applyStyleToFrame();
        this.resizeRendition();
    }

    changeLineHeight(delta: number) {
        this.settings.lineHeight = Math.max(1.0, Math.min(2.5, this.settings.lineHeight + delta));
        this.applyStyleToFrame();
        this.resizeRendition();
    }

    // Content Width Controls
    increaseContentWidth() {
        if (this.contentWidth < this.effectiveMaxWidth) {
            this.contentWidth = Math.min(this.contentWidth + this.contentWidthStep, this.effectiveMaxWidth);
            this.resizeRendition();
        }
    }

    decreaseContentWidth() {
        if (this.contentWidth > this.minContentWidth) {
            this.contentWidth = Math.max(this.contentWidth - this.contentWidthStep, this.minContentWidth);
            this.resizeRendition();
        }
    }

    private resizeRendition() {
        // Give Angular and epub.js time to update styles, then resize
        setTimeout(() => {
            if (this.rendition) {
                // Get current location before resize
                const currentLocation: any = this.rendition.currentLocation();
                const currentCfi = currentLocation?.start?.cfi;

                // Calculate available height (total height - header - footer with margin)
                const availableHeight = window.innerHeight - 74 - 80; // 74px header, 80px footer space

                // Resize the rendition to new dimensions
                this.rendition.resize(this.contentWidth, availableHeight);

                // Re-display at current location to ensure proper pagination
                if (currentCfi) {
                    setTimeout(() => {
                        this.rendition?.display(currentCfi);
                    }, 100);
                }
            }
        }, 100);
    }

    // Navigation
    goToChapter(item: NavItem) {
        this.rendition?.display(item.href);
        this.closeAllPanels();
    }

    goToPage(cfi: string) {
        this.rendition?.display(cfi);
        this.closeAllPanels();
    }

    goBack() {
        this.router.navigate(['/library']);
    }

    // Bookmarks
    addBookmark() {
        if (!this.rendition) return;

        const currentLocation: any = this.rendition.currentLocation();
        if (currentLocation && currentLocation.start) {
            const cfi = currentLocation.start.cfi;
            const label = this.currentChapter || `صفحة ${this.currentPage}`;

            this.readingProgressService.addBookmark(this.ebookId, cfi, label).subscribe({
                next: (response) => {
                    if (response.success) {
                        this.bookmarks = response.data.bookmarks || [];
                        // Optional: Show success toast/notification
                    }
                },
                error: (err: any) => console.error('Failed to add bookmark', err)
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
    addHighlight(color: string) {
        console.log('addHighlight called with color:', color);

        if (!this.selectedText || !this.selectedCfiRange) {
            console.log('Missing selectedText or selectedCfiRange, returning');
            return;
        }

        // Check if this is a remove action
        if (color === 'remove') {
            this.removeHighlightByText(this.selectedText);
            this.showSelectionPopup = false;
            this.cdr.detectChanges();
            return;
        }

        // Apply visual highlight immediately via DOM manipulation
        this.applyDirectHighlight(color);

        // Save to backend
        this.readingProgressService.addHighlight(
            this.ebookId,
            this.selectedCfiRange,
            this.selectedText,
            color
        ).subscribe({
            next: (response) => {
                console.log('Backend response:', response);
                if (response.success) {
                    this.highlights = response.data.highlights || [];
                }
            },
            error: (err: any) => console.error('Failed to add highlight', err)
        });

        // Clear selection and hide popup
        this.showSelectionPopup = false;
        this.currentSelectionRange = null;
        this.currentSelectionContents = null;
        this.cdr.detectChanges();
    }

    private applyDirectHighlight(color: string) {
        if (!this.currentSelectionRange || !this.currentSelectionContents) return;

        try {
            const doc = this.currentSelectionContents.document;
            const range = this.currentSelectionRange.cloneRange();

            // Create a highlight span element
            const highlightSpan = doc.createElement('mark');
            highlightSpan.style.backgroundColor = color;
            highlightSpan.style.padding = '2px 0';
            highlightSpan.style.borderRadius = '2px';
            highlightSpan.className = 'kenouz-highlight';
            highlightSpan.setAttribute('data-cfi', this.selectedCfiRange);

            // Try surroundContents first
            try {
                range.surroundContents(highlightSpan);
                console.log('Successfully applied direct highlight with color:', color);
            } catch (surroundError) {
                // If surroundContents fails, use alternative method
                console.log('surroundContents failed, trying alternative method');
                range.deleteContents();
                highlightSpan.textContent = this.selectedText;
                range.insertNode(highlightSpan);
                console.log('Successfully applied highlight using alternative method');
            }

            // Clear the selection in the iframe
            const selection = this.currentSelectionContents.window.getSelection();
            if (selection) {
                selection.removeAllRanges();
            }
        } catch (e) {
            console.error('Direct highlight failed:', e);
            this.applyHighlightToRendition(this.selectedCfiRange, color);
        }
    }

    removeHighlight(id: string) {
        const highlight = this.highlights.find(h => h._id === id);

        this.readingProgressService.removeHighlight(this.ebookId, id).subscribe({
            next: (response) => {
                if (response.success) {
                    this.highlights = response.data.highlights || [];
                    if (highlight) {
                        this.removeVisualHighlight(highlight.text);
                    }
                }
            },
            error: (err: any) => console.error('Failed to remove highlight', err)
        });
    }

    private removeHighlightByText(text: string) {
        console.log('removeHighlightByText called with text:', text);
        const highlight = this.highlights.find(h => h.text?.trim() === text.trim());

        if (highlight) {
            this.removeHighlight(highlight._id);
        } else {
            console.warn('No highlight found matching text:', text);
        }
    }

    private removeVisualHighlight(text: string) {
        if (!this.rendition) return;

        try {
            const iframe = document.querySelector('#epub-reader-frame iframe');
            if (!iframe) return;

            const doc = (iframe as HTMLIFrameElement).contentDocument;
            if (!doc) return;

            const marks = doc.querySelectorAll('mark.kenouz-highlight');

            marks.forEach((mark: Element) => {
                const markText = (mark.textContent || '').trim();
                const searchText = text.trim();

                if (markText === searchText) {
                    const parent = mark.parentNode;
                    if (parent) {
                        // Unwrap mark element - move children to parent
                        while (mark.firstChild) {
                            parent.insertBefore(mark.firstChild, mark);
                        }
                        parent.removeChild(mark);
                        console.log('Successfully removed highlight');
                    }
                }
            });
        } catch (e) {
            console.error('Error removing visual highlight:', e);
        }
    }

    private applyHighlightToRendition(cfiRange: string, color: string) {
        if (!this.rendition) return;
        try {
            const className = 'hl-' + color.replace('#', '');
            this.rendition.annotations.highlight(
                cfiRange,
                { color: color },
                (e: any) => { /* click handler */ },
                className
            );
        } catch (e) {
            console.error('Error applying highlight via epub.js:', e);
        }
    }

    private restoreHighlights(contents?: any) {
        console.log('restoreHighlights called, highlights count:', this.highlights.length);
        if (!this.rendition || this.highlights.length === 0) return;

        try {
            // If contents parameter is provided (from hook), use it directly
            if (contents) {
                const doc = contents.document;
                const body = doc.body;
                console.log('Restoring highlights to chapter, body element:', body);

                // Apply each highlight to current chapter
                for (const highlight of this.highlights) {
                    if (!highlight.text) continue;
                    console.log('Applying highlight:', highlight.text.substring(0, 50) + '...');
                    this.findAndHighlightText(body, highlight.text, highlight.color);
                }
            } else {
                console.log('No contents parameter provided, skipping');
            }
        } catch (e) {
            console.error('Error restoring highlights:', e);
        }
    }

    private findAndHighlightText(element: HTMLElement, searchText: string, color: string) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null
        );

        const nodesToHighlight: { node: Text; start: number; end: number }[] = [];
        let currentNode: Text | null;

        // Normalize search text (preserve original but create normalized version for comparison)
        const normalizedSearch = searchText.replace(/\s+/g, ' ').trim();

        // First pass: find all matching text nodes
        while ((currentNode = walker.nextNode() as Text)) {
            const textContent = currentNode.textContent || '';

            // Try exact match first
            let index = textContent.indexOf(searchText);

            // If exact match fails, try normalized match
            if (index === -1) {
                const normalizedText = textContent.replace(/\s+/g, ' ');
                index = normalizedText.indexOf(normalizedSearch);
            }

            if (index !== -1) {
                nodesToHighlight.push({
                    node: currentNode,
                    start: index,
                    end: index + searchText.length
                });
                console.log('Found text match in node:', textContent.substring(0, 100));
                break; // Only highlight first occurrence to avoid duplicates
            }
        }

        if (nodesToHighlight.length === 0) {
            console.warn('Text not found in chapter:', searchText.substring(0, 50));
        }

        // Second pass: wrap the matching text
        for (const { node, start, end } of nodesToHighlight) {
            try {
                const range = node.ownerDocument!.createRange();
                range.setStart(node, start);
                range.setEnd(node, end);

                const mark = node.ownerDocument!.createElement('mark');
                mark.className = 'kenouz-highlight';
                mark.style.backgroundColor = color;
                mark.style.padding = '2px 0';
                mark.style.borderRadius = '2px';

                range.surroundContents(mark);
                console.log('Successfully applied highlight');
            } catch (e) {
                console.error('Error wrapping highlight text:', e);
                // If surroundContents fails, try the extract/insert method
                try {
                    const range = node.ownerDocument!.createRange();
                    range.setStart(node, start);
                    range.setEnd(node, end);

                    const contents = range.extractContents();
                    const mark = node.ownerDocument!.createElement('mark');
                    mark.className = 'kenouz-highlight';
                    mark.style.backgroundColor = color;
                    mark.style.padding = '2px 0';
                    mark.style.borderRadius = '2px';
                    mark.appendChild(contents);
                    range.insertNode(mark);
                    console.log('Successfully applied highlight using fallback method');
                } catch (e2) {
                    console.error('Fallback highlight method also failed:', e2);
                }
            }
        }
    }

    copySelectedText() {
        if (!this.selectedText) return;

        navigator.clipboard.writeText(this.selectedText).then(() => {
            this.showSelectionPopup = false;
            this.cdr.detectChanges();
            // Optional: show success toast
        }).catch((err) => {
            console.error('Failed to copy text:', err);
        });
    }

    hideSelectionPopup() {
        this.showSelectionPopup = false;
    }

}
