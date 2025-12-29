import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { MutabaaTrackerComponent } from './mutabaa-tracker/mutabaa-tracker.component';
import { MushafDataService } from '../../../core/services/mushaf-data.service';
import { MushafFontService } from '../../../core/services/mushaf-font.service';
import { VoiceRecognitionService } from '../../../core/services/voice-recognition.service';
import { QuranMatchingService } from '../../../core/services/quran-matching.service';
import { MushafPage, SurahMetadata, JuzMetadata, MushafMetadata, MushafSegment } from '../../../core/models/mushaf.model';
import { Observable, firstValueFrom, of, Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { QuranProgressService } from '../../../services/quran-progress.service';
import { MutabaaService } from '../../../services/mutabaa.service';
import { HifzPlanService } from '../../../services/hifz-plan.service';
import { Router } from '@angular/router';

@Component({
    selector: 'app-mushaf-page',
    standalone: false,
    templateUrl: './mushaf-page.component.html',
    styleUrls: ['./mushaf-page.component.css']
})
export class MushafPageComponent implements OnInit, OnChanges, OnDestroy {
    @Input() pageNumber: number = 1;

    // Virtual Slider State
    currentPageData$?: Observable<MushafPage | undefined>;
    prevPageData$?: Observable<MushafPage | undefined>;
    nextPageData$?: Observable<MushafPage | undefined>;

    currentSurah$?: Observable<SurahMetadata | undefined>;
    currentJuz$?: Observable<JuzMetadata | undefined>;
    mushafMetadata$?: Observable<MushafMetadata>;
    currentMushafPage: MushafPage | null = null; // NEW: Local copy for sync checks

    fontFamily: string = '';
    isFontReady: boolean = false;
    isSidebarOpen: boolean = false;
    isSettingsOpen: boolean = false; // NEW: Settings sidebar state
    sidebarTab: 'surahs' | 'juzs' | 'pages' = 'surahs';
    currentTheme: string = 'cream'; // NEW: Default Mushaf theme
    themes = ['cream', 'white', 'green', 'sky', 'blue', 'dark']; // Added 'sky' for Madina Blue style
    isLoggedIn: boolean = false; // User login status
    isMobileApp: boolean = false; // Check if running as native/pwa app
    activeWirdTab: 'recitation' | 'memorization' | 'revision' | 'mutabaa' = 'mutabaa'; // Dashboard active tab


    isMemorizationMode: boolean = false;
    showOptionsSheet: boolean = false;
    selectedVerseKey: string | null = null;

    @ViewChild(MutabaaTrackerComponent) mutabaaTracker!: MutabaaTrackerComponent;

    // Memorization Settings
    memorizationSettings = {
        type: 'hifz' as 'hifz' | 'muraaja',
        range: 'page' as 'page' | 'surah' | 'juz' | 'quran' | 'custom',
        hideType: 'ayah' as 'ayah' | 'word',
        inputMethod: 'touch' as 'touch' | 'voice', // NEW: Voice support
        difficulty: 'easy' as 'easy' | 'hard',
        ayahRepeat: 3,
        groupRepeat: 3,
        customStartVerse: '',
        customEndVerse: ''
    };

    // Active Session State
    sessionAyahs: string[] = [];
    currentAyahIndex: number = 0;
    currentWordIndex: number = 0; // NEW: Track word within Ayah
    currentRepetition: number = 1;
    isGroupPhase: boolean = false;
    isTestPhase: boolean = false;
    testOptions: string[] = [];
    correctAnswer: string = '';

    // Enhanced Test Phase state
    testQuestions: any[] = [];
    currentTestQuestionIndex: number = 0;
    correctAnswersCount: number = 0;
    showTestResult: boolean = false;
    verseDataMap: Map<string, { text: string, font: string }[]> = new Map();

    // Touch and Swipe properties
    private touchStartX: number = 0;
    private touchStartY: number = 0;
    private touchStartTime: number = 0;
    private sheetStartY: number = 0;
    slideOffset: number = 0;
    private isVerticalScroll: boolean = false;
    sheetOffset: number = 0;
    sidebarOffset: number = 0; // NEW: Horizontal offset for sidebar swipe
    settingsOffset: number = 0; // NEW: Horizontal offset for settings swipe
    private sidebarTouchStartX: number = 0; // NEW: Start X position for sidebar swipe
    private settingsTouchStartX: number = 0; // NEW: Start X position for settings swipe
    pageVerticalShift: number = 0; // NEW: Vertical shift to keep active verse visible
    isAnimating: boolean = false;
    swipeDirection: 'none' | 'next' | 'prev' = 'none';
    private versePageMap: Map<string, number> = new Map(); // Tracks which page each verse belongs to

    // Voice Mode State
    voiceState: 'inactive' | 'listening' | 'processing' | 'error' | 'idle' = 'inactive';
    private voiceSubscription?: Subscription;
    lastSpokenTranscript: string = '';

    // Error Tracking (for red highlights during session)
    // Keys are "verseKey:wordIndex" for individual words, or just "verseKey" for skipped ayahs
    errorWords: Set<string> = new Set();
    skippedAyahs: Set<string> = new Set();
    failedAttempts: number = 0; // Consecutive failed recognition attempts
    private ignoreVoiceUntil: number = 0; // Timestamp: ignore voice results until this time

    // Anti-Cheat & Dynamic Progress State
    private pageStartTime: number = Date.now();
    private sessionCounters = {
        pagesRead: 0,
        versesMemorized: 0,
        pagesReviewed: 0
    };
    private readonly MIN_PAGE_STAY_MS = 20000; // 20 seconds
    private userPlan: any = null;
    private integrityRefreshInterval: any;
    isReadingActive: boolean = false; // Manual session toggle
    showHifzWizard: boolean = false; // Setup wizard visibility
    hifzPlanSetupComplete: boolean = false; // Whether user has completed hifz plan setup
    dailyTasks: any = null; // Daily tasks from hifz plan API
    hifzPlanStats: any = null; // Stats from hifz plan





    constructor(
        public dataService: MushafDataService,
        private fontService: MushafFontService,
        private voiceService: VoiceRecognitionService,
        private matchingService: QuranMatchingService,
        private cdr: ChangeDetectorRef,
        public quranProgressService: QuranProgressService,
        private mutabaaService: MutabaaService,
        private hifzPlanService: HifzPlanService,
        private router: Router
    ) { }

    ngOnInit(): void {
        // Check if user is logged in
        const user = localStorage.getItem('user');
        this.isLoggedIn = !!user;

        // Check if running as Mobile App (PWA Standalone or Webview)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const isCapacitor = (window as any).Capacitor !== undefined;
        this.isMobileApp = isStandalone || isCapacitor;

        this.pageStartTime = Date.now();
        this.loadUserPlan();

        // Restore saved theme from localStorage
        const savedTheme = localStorage.getItem('mushaf_theme');
        if (savedTheme && this.themes.includes(savedTheme)) {
            this.currentTheme = savedTheme;
        }

        this.fontService.loadBasmalahFont();
        this.loadPage();

        // Refresh progress data
        if (this.isLoggedIn) {
            this.quranProgressService.getProgress().subscribe();

            // Subscribe to progress changes to trigger view updates in the sidebar tabs
            this.quranProgressService.progress$.subscribe(() => {
                this.cdr.detectChanges();
            });

            // Timer for reading integrity bar updates
            this.integrityRefreshInterval = setInterval(() => {
                if (this.isLoggedIn && this.isReadingActive && !this.isMemorizationMode && !this.isTestPhase) {
                    this.cdr.detectChanges();
                }
            }, 1000);

            // Check if hifz plan setup is needed
            this.hifzPlanService.getPlan().subscribe({
                next: (res) => {
                    if (res.success) {
                        this.hifzPlanSetupComplete = res.isSetupComplete;
                        this.hifzPlanStats = res.plan?.stats || null;
                        if (!res.isSetupComplete) {
                            this.showHifzWizard = true;
                        } else {
                            this.loadDailyTasks();
                        }
                    }
                },
                error: () => { /* Silently fail - user can access wizard manually */ }
            });
        }
    }

    toggleReadingSession(): void {
        this.isReadingActive = !this.isReadingActive;
        // Reset timer when starting a new manual session
        if (this.isReadingActive) {
            this.pageStartTime = Date.now();
        }
    }

    onWizardComplete(): void {
        this.showHifzWizard = false;
        this.hifzPlanSetupComplete = true; // Optimistic update
        this.loadDailyTasks();
    }

    closeWizard(): void {
        this.showHifzWizard = false;
    }

    loadDailyTasks(): void {
        this.hifzPlanService.getDailyTasks().subscribe({
            next: (res) => {
                if (res.success) {
                    this.dailyTasks = {
                        newMemorization: res.tasks?.find((t: any) => t.type === 'new_memorization'),
                        consolidation: res.tasks?.find((t: any) => t.type === 'consolidation'),
                        revision: res.tasks?.find((t: any) => t.type === 'revision'),
                        recitation: res.tasks?.find((t: any) => t.type === 'recitation'),
                        streak: res.streak,
                        stats: res.stats
                    };
                }
            },
            error: () => { }
        });
    }

    markTaskDone(taskType: string): void {
        console.log('[HifzPlan] Task marked done:', taskType);
        // TODO: Implement task completion API call
    }

    // Helper methods for dashboard display
    getNewMemorizationLabel(): string {
        return this.dailyTasks?.newMemorization?.label || 'الحفظ الجديد';
    }

    getNewMemorizationDetails(): string {
        // Backend provides a specific label now e.g. "Surah 2 - Verse 142"
        if (this.dailyTasks?.newMemorization?.label) {
            return `مطلوب حفظ: ${this.dailyTasks.newMemorization.label}`;
        }
        return 'اضغط للبدء';
    }

    getRecitationUnitLabel(): string {
        const unit = this.dailyTasks?.recitation?.unit;
        if (unit === 'page') return 'صفحة';
        if (unit === 'half_hizb') return 'نصف حزب';
        if (unit === 'hizb') return 'حزب';
        if (unit === 'juz') return 'جزء';
        return 'صفحة';
    }

    getRecitationDetails(): string {
        // Use backend label which contains specific page range e.g. "Page 10 to 12"
        if (this.dailyTasks?.recitation?.label) {
            return `ورد اليوم: ${this.dailyTasks.recitation.label}`;
        }
        const currentPage = this.quranProgressService.getCurrentProgress()?.lastPage || 1;
        return `متابعك عند صفحة ${currentPage}`;
    }

    getConsolidationDetails(): string {
        const verses = this.dailyTasks?.consolidation?.verses;
        if (!verses || verses.length === 0) return 'لا توجد مراجعة اليوم';
        return `مراجعة ${verses.length} آية (آخر 14 يوم)`;
    }

    getRevisionLabel(): string {
        // Use backend label e.g. "Page 50 to 52"
        if (this.dailyTasks?.revision?.label) {
            return this.dailyTasks.revision.label;
        }
        return 'المراجعة البعيدة';
    }

    getRevisionDetails(): string {
        if (this.dailyTasks?.revision?.startPage) {
            return 'التالي في خطتك (تلقائي)';
        }
        return 'الصفحات التالية في خطتك';
    }

    getHifzProgressPercent(): number {
        const memorized = this.hifzPlanStats?.totalVersesMemorized || 0;
        const total = 6236; // Total verses in Quran
        return (memorized / total) * 100;
    }

    getTilawoProgressPercent(): number {
        // Use the quranProgress from the service
        const pagesRead = this.quranProgressService.getCurrentProgress()?.pagesRead || 0;
        const total = 604; // Total pages in Quran
        return (pagesRead / total) * 100;
    }

    ngOnDestroy(): void {
        this.stopVoiceSession();
        if (this.integrityRefreshInterval) clearInterval(this.integrityRefreshInterval);
    }

    private loadUserPlan(): void {
        if (!this.isLoggedIn) return;
        this.mutabaaService.getMutabaaData().subscribe({
            next: (res) => {
                if (res.success) {
                    this.userPlan = res.plan;
                }
            },
            error: (err) => console.error('[Mushaf] Failed to load user plan:', err)
        });
    }

    isPageVerified(): boolean {
        return this.isReadingActive && (Date.now() - this.pageStartTime) >= this.MIN_PAGE_STAY_MS;
    }

    getReadingProgressPercent(): number {
        if (!this.isReadingActive) return 0;
        const elapsed = Date.now() - this.pageStartTime;
        return Math.min(100, (elapsed / this.MIN_PAGE_STAY_MS) * 100);
    }

    getGlobalPercent(type: 'tilawo' | 'hifz' | 'muraja'): number {
        const p = this.quranProgressService.getCurrentProgress();
        if (!p) return 0;

        let val = 0;
        if (type === 'tilawo') {
            // Recitation: Use pagesRead (current khatma progress)
            val = ((p.pagesRead || 0) % 604) / 6.04;
        } else if (type === 'hifz') {
            val = ((p.versesMemorized || 0) / 6236) * 100;
        } else {
            // Revision: Use pagesReviewed
            val = ((p.pagesReviewed || 0) % 604) / 6.04;
        }
        return Math.min(100, val);
    }

    getProgressLabel(type: 'tilawo' | 'hifz' | 'muraja'): string {
        return this.getGlobalPercent(type).toFixed(1) + '%';
    }

    navigateToMutabaaSetup(type: 'tilawo' | 'hifz' | 'muraja' = 'tilawo') {
        this.activeWirdTab = 'mutabaa';
        this.cdr.detectChanges();
        setTimeout(() => {
            if (this.mutabaaTracker) {
                this.mutabaaTracker.openSetup();
            }
        });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['pageNumber'] && !changes['pageNumber'].firstChange) {
            this.loadPage();
        }
    }

    private async loadPages(): Promise<void> {
        try {
            const fontName = this.dataService.getFontName(this.pageNumber);
            this.fontFamily = `"${fontName}"`;

            // Preload current, next, and prev fonts
            const fontsToLoad = [fontName];
            if (this.pageNumber > 1) fontsToLoad.push(this.dataService.getFontName(this.pageNumber - 1));
            if (this.pageNumber < 604) fontsToLoad.push(this.dataService.getFontName(this.pageNumber + 1));

            const loadPromises = fontsToLoad.map(f => this.fontService.loadPageFont(this.getPageFromFont(f)));
            loadPromises.push(this.fontService.loadBasmalahFont());

            const allLoaded = fontsToLoad.every(f => this.fontService.isFontLoaded(f)) && this.fontService.isFontLoaded('QCF_BSML');

            if (!allLoaded) {
                await Promise.all(loadPromises);
                // Extra tick to let browser process the newly added fonts
                await (document as any).fonts.ready;
            }
            this.isFontReady = true;
        } catch (err) {
            console.error('Error loading page fonts', err);
            this.isFontReady = true;
        }

        // Load data for all 3 pages
        this.currentPageData$ = this.dataService.getPage(this.pageNumber);
        this.currentPageData$.subscribe(p => this.currentMushafPage = p || null);

        this.prevPageData$ = this.pageNumber > 1 ? this.dataService.getPage(this.pageNumber - 1) : undefined;
        this.nextPageData$ = this.pageNumber < 604 ? this.dataService.getPage(this.pageNumber + 1) : undefined;

        this.currentSurah$ = this.dataService.getSurahAtPage(this.pageNumber);
        this.currentJuz$ = this.dataService.getJuzAtPage(this.pageNumber);
        this.mushafMetadata$ = this.dataService.getMetadata();
    }

    private getPageFromFont(fontName: string): number {
        return parseInt(fontName.replace('QCF_P', ''), 10);
    }

    private loadPage(): void {
        this.showOptionsSheet = false;
        this.loadPages();
    }

    toggleSidebar(): void {
        this.isSidebarOpen = !this.isSidebarOpen;
        if (this.isSidebarOpen) {
            this.isSettingsOpen = false; // Close settings when opening index
        }
    }

    toggleSettings(): void {
        this.isSettingsOpen = !this.isSettingsOpen;
        if (this.isSettingsOpen) {
            this.isSidebarOpen = false; // Close index when opening settings
        }
    }

    setTheme(theme: string): void {
        this.currentTheme = theme;
        localStorage.setItem('mushaf_theme', theme);
    }

    goToPage(page: number): void {
        this.pageNumber = page;
        this.isSidebarOpen = false;
        this.loadPage();
    }

    openSidebarToTab(tab: 'surahs' | 'juzs' | 'pages'): void {
        this.sidebarTab = tab;
        this.isSidebarOpen = true;
    }

    nextPage(): void {
        if (this.pageNumber < 604 && !this.isAnimating) {
            this.triggerPageChange('next');
        }
    }

    prevPage(): void {
        if (this.pageNumber > 1 && !this.isAnimating) {
            this.triggerPageChange('prev');
        }
    }

    private triggerPageChange(direction: 'next' | 'prev'): void {
        this.isAnimating = true;
        this.swipeDirection = direction;
        // Shift is reset inside the timeout below at the swap moment

        if (direction === 'next') {
            this.slideOffset = window.innerWidth;
        } else {
            this.slideOffset = -window.innerWidth;
        }

        // Wait for the slide animation (400ms) to complete
        setTimeout(() => {
            // Atomic update: Change page and reset position instantly
            // Because the new "Center" looks like the old "Next/Prev", the swap is invisible.
            if (direction === 'next') {
                if (this.pageNumber < 604) this.pageNumber++;
            } else {
                if (this.pageNumber > 1) this.pageNumber--;
            }

            this.pageVerticalShift = 0;
            // INSTANT swap back to center
            this.isAnimating = false;
            this.swipeDirection = 'none';
            this.slideOffset = 0;

            this.loadPages();

            // Anti-Cheat & Dynamic Progress logic
            const timeSpent = Date.now() - this.pageStartTime;
            if (this.isReadingActive && timeSpent >= this.MIN_PAGE_STAY_MS) {
                console.log(`[Mushaf] Page ${this.pageNumber} verified (${Math.round(timeSpent / 1000)}s spent)`);

                // Award points for completing a page
                this.quranProgressService.addPointsIfLoggedIn('PAGE_COMPLETE', 1);
                this.sessionCounters.pagesRead++;
                this.checkAutoSync('tilawo');

                if (this.isMemorizationMode && this.memorizationSettings.type === 'muraaja') {
                    this.quranProgressService.addPointsIfLoggedIn('REVISION_PAGE_COMPLETE' as any, 1);
                    this.sessionCounters.pagesReviewed++;
                    this.checkAutoSync('muraja');
                }
            } else {
                console.warn(`[Mushaf] Page ${this.pageNumber} NOT counted (Only ${Math.round(timeSpent / 1000)}s spent - Anti-Cheat active)`);
            }

            // Reset timer for the new page
            this.pageStartTime = Date.now();

            // Reset scroll to top when changing pages
            const pageElements = document.querySelectorAll('.mushaf-page');
            pageElements.forEach((el) => {
                el.scrollTop = 0;
            });

            // Recalculate shift after transition is complete and new page is centered
            setTimeout(() => {
                this.calculateAutoShift();
                // If in voice mode, update text for the new page
                if (this.isMemorizationMode && this.memorizationSettings.inputMethod === 'voice') {
                    this.updateVerseDataWithStandardText();
                }
            }, 50);
        }, 400);
    }

    onTouchStart(event: TouchEvent): void {
        if (this.isAnimating) return;
        this.touchStartX = event.touches[0].clientX;
        this.touchStartY = event.touches[0].clientY;
        this.touchStartTime = Date.now();
        this.slideOffset = 0;
        this.isVerticalScroll = false;
    }



    onTouchMove(event: TouchEvent): void {
        if (this.isAnimating) return;
        const currentX = event.touches[0].clientX;
        const currentY = event.touches[0].clientY;
        const deltaX = currentX - this.touchStartX;
        const deltaY = currentY - this.touchStartY;

        // Determine if this is a vertical scroll (once per gesture)
        if (!this.isVerticalScroll && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
            this.isVerticalScroll = true;
        }

        // If scrolling vertically, don't move pages
        if (this.isVerticalScroll) {
            this.slideOffset = 0;
            return;
        }

        // Strict boundary checking:
        // No movement allowed beyond first/last page.
        if (this.pageNumber === 1 && deltaX < 0) {
            this.slideOffset = 0;
            return;
        }
        if (this.pageNumber === 604 && deltaX > 0) {
            this.slideOffset = 0;
            return;
        }

        this.slideOffset = deltaX;
    }

    onTouchEnd(event: TouchEvent): void {
        if (this.isAnimating) return;

        const deltaX = this.slideOffset;
        const deltaTime = Date.now() - this.touchStartTime;
        const velocity = Math.abs(deltaX) / deltaTime;

        // If it's a very small movement, it's likely a click
        if (Math.abs(deltaX) < 5 && deltaTime < 300) {
            console.log('Tap detected (not a swipe)');
            this.resetSwipe();
            return;
        }

        // Very sensitive snapping
        const threshold = window.innerWidth * 0.08;

        if (Math.abs(deltaX) > threshold || velocity > 0.3) {
            // Swipe Right (deltaX > 0) -> Next
            // Swipe Left (deltaX < 0) -> Prev
            if (deltaX > 0 && this.pageNumber < 604) {
                this.triggerPageChange('next');
            } else if (deltaX < 0 && this.pageNumber > 1) {
                this.triggerPageChange('prev');
            } else {
                this.resetSwipe();
            }
        } else {
            this.resetSwipe();
        }
    }

    onSheetTouchStart(event: TouchEvent): void {
        this.sheetStartY = event.touches[0].clientY;
        this.sheetOffset = 0;
    }

    onSheetTouchMove(event: TouchEvent): void {
        const currentY = event.touches[0].clientY;
        const deltaY = currentY - this.sheetStartY;
        // Only allow dragging down
        if (deltaY > 0) {
            this.sheetOffset = deltaY;
        }
    }

    onSheetTouchEnd(): void {
        if (this.sheetOffset > 100) {
            this.closeOptionsSheet();
        }
        this.sheetOffset = 0;
    }

    onSidebarTouchStart(event: TouchEvent): void {
        this.sidebarTouchStartX = event.touches[0].clientX;
        this.sidebarOffset = 0;
    }

    onSidebarTouchMove(event: TouchEvent): void {
        const currentX = event.touches[0].clientX;
        const deltaX = currentX - this.sidebarTouchStartX;
        // Only allow dragging to the right (deltaX > 0)
        if (deltaX > 0) {
            this.sidebarOffset = deltaX;
        }
    }

    onSidebarTouchEnd(): void {
        if (this.sidebarOffset > 100) {
            this.toggleSidebar();
        }
        this.sidebarOffset = 0;
    }

    onSettingsTouchStart(event: TouchEvent): void {
        this.settingsTouchStartX = event.touches[0].clientX;
        this.settingsOffset = 0;
    }

    onSettingsTouchMove(event: TouchEvent): void {
        const currentX = event.touches[0].clientX;
        const deltaX = currentX - this.settingsTouchStartX;
        // Settings sidebar is on the LEFT, swipe LEFT to close (deltaX < 0)
        // Offset should represent how much we've pulled it LEFT
        if (deltaX < 0) {
            this.settingsOffset = deltaX;
        }
    }

    onSettingsTouchEnd(): void {
        // If swiped more than 100px to the left
        if (this.settingsOffset < -100) {
            this.toggleSettings();
        }
        this.settingsOffset = 0;
    }

    onAyahClick(verseKey: string): void {
        console.log('[Mushaf] Ayah clicked:', verseKey, 'isMemorizationMode:', this.isMemorizationMode);
        if (this.isMemorizationMode) return;
        this.selectedVerseKey = verseKey;
        this.showOptionsSheet = true;
    }

    closeOptionsSheet(): void {
        console.log('[Mushaf] Closing options sheet');
        this.showOptionsSheet = false;
    }

    startMemorization(): void {
        this.showOptionsSheet = false;
        this.isMemorizationMode = true;
        this.isTestPhase = false;
        this.isGroupPhase = false;
        this.currentAyahIndex = 0;
        this.currentWordIndex = (this.memorizationSettings.type === 'muraaja' && this.memorizationSettings.hideType === 'word') ? -1 : 0;
        this.currentRepetition = 1;

        // Clear error tracking for new session
        this.errorWords.clear();
        this.skippedAyahs.clear();

        if (this.memorizationSettings.type === 'muraaja') {
            this.memorizationSettings.ayahRepeat = 1;
            this.memorizationSettings.groupRepeat = 1;
        }

        // Logic to determine sessionAyahs based on range
        this.prepareSessionAyahs().then(() => {
            // After preparing ayahs, decide whether to jump to test or start review
            if (this.memorizationSettings.difficulty === 'hard') {
                this.startTestPhase();
            } else {
                if (this.sessionAyahs.length > 0) {
                    const firstAyahPage = this.versePageMap.get(this.sessionAyahs[0]);
                    if (firstAyahPage && firstAyahPage !== this.pageNumber) {
                        this.goToPage(firstAyahPage);
                    }
                }
                setTimeout(() => this.calculateAutoShift(), 200);

                // Initialize Voice if selected
                if (this.memorizationSettings.inputMethod === 'voice') {
                    this.startVoiceSession();
                }
            }
        });

        this.pageVerticalShift = 0;
    }

    private async prepareSessionAyahs(): Promise<void> {
        const range = this.memorizationSettings.range;
        const pageNumber = this.pageNumber;

        if (range === 'page') {
            const page = await firstValueFrom(this.currentPageData$?.pipe(take(1)) || of(undefined));
            if (page) this.sessionAyahs = this.extractVerseKeys([page]);
        } else if (range === 'surah') {
            const surah = await firstValueFrom(this.dataService.getSurahAtPage(pageNumber).pipe(take(1)));
            if (surah) {
                const pages = await firstValueFrom(this.dataService.getMushaf().pipe(take(1)));
                const surahPages = pages.filter(p => p.page_number >= surah.start_page && p.page_number <= surah.end_page);
                this.sessionAyahs = this.extractVerseKeys(surahPages, surah.id);
            }
        } else if (range === 'juz') {
            const juz = await firstValueFrom(this.dataService.getJuzAtPage(pageNumber).pipe(take(1)));
            if (juz) {
                const meta = await firstValueFrom(this.dataService.getMetadata().pipe(take(1)));
                const juzIdx = meta.juzs.findIndex(j => j.id === juz.id);
                const endPage = (juzIdx + 1 < meta.juzs.length) ? meta.juzs[juzIdx + 1].start_page - 1 : 604;
                const pages = await firstValueFrom(this.dataService.getMushaf().pipe(take(1)));
                const juzPages = pages.filter(p => p.page_number >= juz.start_page && p.page_number <= endPage);
                this.sessionAyahs = this.extractVerseKeys(juzPages);
            }
        }
    }

    private extractVerseKeys(pages: MushafPage[], filterSurahId?: number): string[] {
        const tempMap = new Map<string, { text: string, font: string }[]>();
        const keysOrder: string[] = [];

        this.versePageMap.clear();
        this.verseDataMap.clear();

        pages.forEach(page => {
            const fontName = `'${this.dataService.getFontName(page.page_number)}'`;
            page.lines.forEach(line => {
                line.segments?.forEach(seg => {
                    const vKey = seg.verse_key;
                    if (filterSurahId) {
                        const [surahId] = vKey.split(':').map(Number);
                        if (surahId !== filterSurahId) return;
                    }

                    if (!tempMap.has(vKey)) {
                        tempMap.set(vKey, []);
                        keysOrder.push(vKey);
                    }

                    tempMap.get(vKey)!.push({ text: seg.text, font: fontName });
                    this.versePageMap.set(vKey, page.page_number);
                });
            });
        });

        keysOrder.forEach(vKey => {
            const segments = tempMap.get(vKey)!;
            // Remove last segment marker and cleanup symbols
            const cleaned = segments.slice(0, -1).map(s => ({
                text: s.text.replace(/"/g, '').replace(/'/g, ''),
                font: s.font
            }));
            this.verseDataMap.set(vKey, cleaned);
        });

        return keysOrder;
    }

    incrementRepetition(): void {
        const isWordMode = this.memorizationSettings.hideType === 'word';
        const isMuraaja = this.memorizationSettings.type === 'muraaja';

        if (isMuraaja && isWordMode) {
            // In review word mode, we increment word by word
            const currentVerseKey = this.sessionAyahs[this.currentAyahIndex];

            // Fix: Use standard word count from map if available, otherwise fallback to segment count
            let totalWords = 0;
            if (this.verseDataMap.has(currentVerseKey)) {
                totalWords = this.verseDataMap.get(currentVerseKey)!.length;
            } else {
                totalWords = this.getVerseSegmentCount(currentVerseKey);
            }

            if (this.currentWordIndex < totalWords - 1) {
                this.currentWordIndex++;
                setTimeout(() => this.calculateAutoShift(), 50);
            } else {
                this.nextAyah();
            }
        } else {
            // Normal repetition mode
            if (this.currentRepetition < this.memorizationSettings.ayahRepeat) {
                this.currentRepetition++;
                // Reset word index to restart the ayah
                const isWordMode = this.memorizationSettings.hideType === 'word';
                this.currentWordIndex = (isWordMode) ? -1 : 0;
            } else {
                // Ayah complete (Touch Mode) - Award points
                if (this.memorizationSettings.type === 'hifz') {
                    this.quranProgressService.addPointsIfLoggedIn('VERSE_MEMORIZED', 1);
                    this.sessionCounters.versesMemorized++;
                    this.checkAutoSync('hifz');
                } else if (this.memorizationSettings.type === 'muraaja') {
                    this.quranProgressService.addPointsIfLoggedIn('REVISION_VERSE_COMPLETE' as any, 1);
                }

                this.nextAyah();
            }
        }
    }

    private nextAyah(): void {
        if (this.currentAyahIndex < this.sessionAyahs.length - 1) {
            this.currentAyahIndex++;
            this.currentRepetition = 1;
            // When moving to next ayah in word-review, jump directly to showing the first word (index 0)
            const isWordMode = this.memorizationSettings.hideType === 'word';
            this.currentWordIndex = (isWordMode) ? -1 : 0;

            // Page navigation logic
            const nextVerseKey = this.sessionAyahs[this.currentAyahIndex];
            const targetPage = this.versePageMap.get(nextVerseKey);
            if (targetPage && targetPage !== this.pageNumber) {
                // If the next verse is on a different page, navigate to it
                if (targetPage > this.pageNumber) {
                    this.triggerPageChange('next');
                } else {
                    this.triggerPageChange('prev');
                }
                return; // Important: triggerPageChange will handle the final calculateAutoShift
            }

            setTimeout(() => this.calculateAutoShift(), 100);
        } else {
            if (this.memorizationSettings.difficulty === 'hard') {
                this.startTestPhase();
            } else {
                this.exitMemorization();
            }
        }
    }

    private calculateAutoShift(): void {
        if (!this.isMemorizationMode || this.isAnimating) {
            if (!this.isMemorizationMode) this.pageVerticalShift = 0;
            return;
        }

        const activeElements = document.querySelectorAll('.current-page-wrapper .active-verse');
        if (activeElements.length === 0) return;

        // Get absolute bottom (compensating for current shift)
        let maxBottom = 0;
        activeElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.bottom > maxBottom) maxBottom = rect.bottom;
        });

        const footerHeight = 85;
        const viewportHeight = window.innerHeight;
        const threshold = viewportHeight - footerHeight - 40;

        // Calculate what the bottom would be if shift was 0
        const absoluteBottom = maxBottom - this.pageVerticalShift;

        if (absoluteBottom > threshold) {
            // Shift upward needed
            this.pageVerticalShift = threshold - absoluteBottom;
        } else {
            // No shift needed - reset to top
            this.pageVerticalShift = 0;
        }
    }

    private syncWithMutabaa(): void {
        if (!this.isLoggedIn || !this.sessionAyahs.length) return;

        const type = this.memorizationSettings.type;
        const taskType = type === 'hifz' ? 'hifz' : 'muraja';

        console.log(`[Mushaf] Auto-syncing Mutabaa log for ${taskType}...`);
        this.mutabaaService.updateTaskStatus(taskType, 'done').subscribe({
            next: (res) => {
                if (res.success) {
                    console.log('[Mushaf] Mutabaa Log synced successfully');
                }
            },
            error: (err) => console.error('[Mushaf] Sync failed:', err)
        });
    }

    private checkAutoSync(type: 'tilawo' | 'hifz' | 'muraja'): void {
        if (!this.userPlan || !this.isLoggedIn) return;

        let target = 0;
        let current = 0;

        if (type === 'tilawo') {
            target = this.userPlan.tilawoTarget;
            current = this.sessionCounters.pagesRead;
        } else if (type === 'hifz') {
            target = this.userPlan.hifzTarget;
            current = this.sessionCounters.versesMemorized;
        } else if (type === 'muraja') {
            target = this.userPlan.murajaTarget;
            current = this.sessionCounters.pagesReviewed;
        }

        if (target > 0 && current >= target) {
            console.log(`[Mushaf] AUTO-SYNC: Target for ${type} reached (${current}/${target})!`);
            this.mutabaaService.updateTaskStatus(type as any, 'done').subscribe({
                next: (res) => {
                    if (res.success) {
                        console.log(`[Mushaf] ${type} task marked as DONE automatically.`);
                        // Optional: show a small toast or toast via CDR
                    }
                }
            });
        }
    }

    private getVerseSegmentCount(verseKey: string): number {
        let count = 0;
        this.currentPageData$?.subscribe(page => {
            if (!page) return;
            page.lines.forEach(line => {
                if (line.segments) {
                    count += line.segments.filter(s => s.verse_key === verseKey).length;
                }
            });
        });
        return count;
    }

    private getSegmentIndexInVerse(segment: MushafSegment, verseKey: string, page: MushafPage): number {
        let index = -1;
        let runningIdx = 0;
        for (const line of page.lines) {
            if (line.segments) {
                for (const s of line.segments) {
                    if (s.verse_key === verseKey) {
                        if (s === segment) {
                            index = runningIdx;
                            return index;
                        }
                        runningIdx++;
                    }
                }
            }
        }
        return index;
    }

    private startGroupPhase(): void {
        this.isGroupPhase = true;
        this.currentRepetition = 1;
    }

    incrementGroupRepetition(): void {
        if (this.currentRepetition < this.memorizationSettings.groupRepeat) {
            this.currentRepetition++;
        } else {
            if (this.memorizationSettings.difficulty === 'hard') {
                this.startTestPhase();
            } else {
                this.exitMemorization();
            }
        }
    }

    private async startTestPhase(): Promise<void> {
        this.isTestPhase = true;
        this.showTestResult = false;
        this.currentTestQuestionIndex = 0;
        this.correctAnswersCount = 0;
        this.testQuestions = [];

        const totalSessionAyahs = this.sessionAyahs.length;
        if (totalSessionAyahs < 2) {
            this.exitMemorization();
            return;
        }

        // Dynamic count: ~50% of session ayahs, min 5, max 25
        const count = Math.min(25, Math.max(5, Math.floor(totalSessionAyahs / 2)));
        const shuffledAyahs = [...this.sessionAyahs].sort(() => Math.random() - 0.5);
        const selectedForQuiz = shuffledAyahs.slice(0, count);

        selectedForQuiz.forEach(verseKey => {
            this.testQuestions.push(this.generateQuestionData(verseKey));
        });

        // Preload all required fonts for the selected questions and options
        const pagesToLoad = new Set<number>();
        const collectPages = (verseKey: string) => {
            const segments = this.verseDataMap.get(verseKey);
            segments?.forEach(s => {
                const match = s.font.match(/P(\d+)/);
                if (match) pagesToLoad.add(parseInt(match[1]));
            });
        };

        this.testQuestions.forEach(q => {
            collectPages(q.baseVerseKey);
            q.options?.forEach((opt: string) => collectPages(opt));
        });

        for (const pageNum of pagesToLoad) {
            await this.fontService.loadPageFont(pageNum);
        }

        this.loadQuestion(0);
    }

    private generateQuestionData(verseKey: string): any {
        const idx = this.sessionAyahs.indexOf(verseKey);
        const isHard = this.memorizationSettings.difficulty === 'hard';
        const typeLabel = this.memorizationSettings.hideType === 'word' ? 'الكلمة' : 'الآية';

        let targetVerseKey: string;
        let prefix: string;
        let qType: 'next' | 'prev';

        // Sequence testing is always at Ayah level as per user examples
        if (isHard && Math.random() > 0.5 && idx > 0) {
            targetVerseKey = this.sessionAyahs[idx - 1];
            prefix = 'ما هي الآية التي تسبق:';
            qType = 'prev';
        } else {
            if (idx === this.sessionAyahs.length - 1) {
                targetVerseKey = this.sessionAyahs[idx - 1];
                prefix = 'ما هي الآية التي تسبق:';
                qType = 'prev';
            } else {
                targetVerseKey = this.sessionAyahs[idx + 1];
                prefix = 'ما هي الآية التي تلي:';
                qType = 'next';
            }
        }

        // Generate choices
        const choices = new Set<string>();
        choices.add(targetVerseKey);

        while (choices.size < Math.min(4, this.sessionAyahs.length)) {
            const rIdx = Math.floor(Math.random() * this.sessionAyahs.length);
            choices.add(this.sessionAyahs[rIdx]);
        }

        return {
            prefix: prefix,
            type: qType,
            baseVerseKey: verseKey,
            correctAnswer: targetVerseKey,
            options: Array.from(choices).sort(() => Math.random() - 0.5)
        };
    }

    private loadQuestion(index: number): void {
        const q = this.testQuestions[index];
        this.correctAnswer = q.prefix; // Actually used as prefix now
        this.testOptions = q.options;
    }

    submitAnswer(choiceKey: string): void {
        const q = this.testQuestions[this.currentTestQuestionIndex];
        q.userAnswer = choiceKey;
        q.isCorrect = (choiceKey === q.correctAnswer);

        if (q.isCorrect) {
            this.correctAnswersCount++;
            this.quranProgressService.addPointsIfLoggedIn('REVISION_VERSE_COMPLETE' as any, 1);
        }

        if (this.currentTestQuestionIndex < this.testQuestions.length - 1) {
            this.currentTestQuestionIndex++;
            this.loadQuestion(this.currentTestQuestionIndex);
        } else {
            this.showTestResult = true;
        }
    }


    shouldHideLine(line: any, pageNum: number): boolean {
        // Hide Bismillah for Al-Fatihah (ID: 1) as requested (similar to Al-Tawbah)
        if (line.type === 'bismillah') {
            return pageNum === 1; // Use passed pageNum instead of this.pageNumber
        }


        // Hide empty lines or lines with only whitespace for first 2 pages
        if (pageNum <= 2) {
            if (line.type === 'verse' && (!line.segments || line.segments.length === 0)) return true;
            if (line.type !== 'verse' && (!line.text || line.text.trim().length === 0)) return true;
        }
        return false;
    }

    exitMemorization(): void {
        // If they reached the end of session ayahs, it's a success! sync it.
        if (this.currentAyahIndex >= this.sessionAyahs.length - 1 && this.sessionAyahs.length > 0) {
            this.syncWithMutabaa();
        }

        this.isMemorizationMode = false;
        this.isTestPhase = false;
        this.isGroupPhase = false;
        this.pageVerticalShift = 0;
        this.stopVoiceSession();
    }

    getSegmentClass(segment: MushafSegment, verseKey: string, page: MushafPage): string {
        let classes = '';

        // Check for ayah marker (last segment of the verse)
        if (this.isLastSegmentOfVerse(segment, verseKey, page)) {
            classes += 'ayah-marker ';
        }

        if (!this.isMemorizationMode) return classes.trim();
        if (this.isTestPhase || this.isGroupPhase) return classes.trim();

        const currentVerseKey = this.sessionAyahs[this.currentAyahIndex];
        const nextVerseKey = this.currentAyahIndex + 1 < this.sessionAyahs.length ? this.sessionAyahs[this.currentAyahIndex + 1] : null;
        const isMuraaja = this.memorizationSettings.type === 'muraaja';

        // 1. Handle Past Verses (Persistence)
        const verseIdx = this.sessionAyahs.indexOf(verseKey);
        if (verseIdx !== -1 && verseIdx < this.currentAyahIndex) {
            return classes + 'active-verse'; // Already completed verses stay visible
        }

        // Current verse visibility
        if (verseKey === currentVerseKey) {
            // In Review mode, always show the Ayah number (last segment) to help user identify position
            if (isMuraaja && this.isLastSegmentOfVerse(segment, verseKey, page)) {
                return classes + 'active-verse';
            }

            if (isMuraaja) {
                if (this.memorizationSettings.hideType === 'word') {
                    const segIdx = this.getSegmentIndexInVerse(segment, verseKey, page);
                    const isRevealed = segIdx <= this.currentWordIndex;

                    // Check if this word was skipped (error)
                    const errorKey = `${verseKey}:${segIdx}`;
                    const isError = this.errorWords.has(errorKey);

                    if (isRevealed) {
                        return classes + (isError ? 'error-verse' : 'active-verse');
                    } else {
                        return classes + 'hidden-verse';
                    }
                } else if (this.memorizationSettings.hideType === 'ayah') {
                    // Check if this entire Ayah was skipped
                    if (this.skippedAyahs.has(verseKey)) {
                        return classes + 'error-verse'; // Red highlight for skipped verse
                    }
                    return classes + 'hidden-verse';
                }
            }

            return classes + 'active-verse'; // Hifz mode or fully revealed
        }

        // Next verse shows hint only in Hifz mode (as per user request: hide hints in review)
        // Show ONLY the first word as hint
        if (verseKey === nextVerseKey && !isMuraaja) {
            if (this.isFirstSegmentOfVerse(segment, verseKey, page)) {
                return classes + 'hint-verse';
            }
        }

        // Everything else is hidden
        return classes + 'hidden-verse';
    }

    private isFirstSegmentOfVerse(segment: MushafSegment, verseKey: string, page: MushafPage): boolean {
        // Check if this segment is the first occurrence of verseKey in the whole page
        let globalFirst: MushafSegment | null = null;
        for (const line of page.lines) {
            if (line.segments) {
                const firstInLine = line.segments.find(s => s.verse_key === verseKey);
                if (firstInLine) {
                    globalFirst = firstInLine;
                    break;
                }
            }
        }
        return globalFirst === segment;
    }

    private isLastSegmentOfVerse(segment: MushafSegment, verseKey: string, page: MushafPage): boolean {
        // Check if this segment is the last occurrence of verseKey in the whole page
        let globalLast: MushafSegment | null = null;
        for (const line of page.lines) {
            if (line.segments) {
                const results = line.segments.filter(s => s.verse_key === verseKey);
                if (results.length > 0) {
                    globalLast = results[results.length - 1];
                }
            }
        }
        return globalLast === segment;
    }

    private resetSwipe(): void {
        this.isAnimating = true;
        this.slideOffset = 0;
        setTimeout(() => {
            this.isAnimating = false;
        }, 300);
    }

    // --- Voice Recognition Logic ---

    async updateVerseDataWithStandardText() {
        if (this.memorizationSettings.inputMethod !== 'voice') return;

        try {
            const response: any = await firstValueFrom(this.dataService.getPageText(this.pageNumber));
            response.verses.forEach((verse: any) => {
                // Filter out non-word segments if any (API sometimes returns end markers)
                const words = verse.words.filter((w: any) => w.char_type_name === 'word');
                // Flatten and expand Muqatta'at (e.g. Alif Lam Mim -> 3 words)
                const standardWords: string[] = [];
                words.forEach((w: any) => {
                    const expanded = this.matchingService.expandMuqattaat(w.text_imlaei_simple);
                    standardWords.push(...expanded);
                });

                if (this.verseDataMap.has(verse.verse_key)) {
                    // CRITICAL: We must replace the segments entirely to match the count of STANDARD words.
                    // If we just patch, we get mismatching lengths (font segments vs real words),
                    // causing the logic to wait for extra "ghost" segments that don't exist in speech.
                    const newSegments = standardWords.map((txt: string) => ({
                        text: txt,
                        font: '' // Font not needed for matching logic
                    }));
                    this.verseDataMap.set(verse.verse_key, newSegments);
                }
            });
            this.cdr.detectChanges();
            console.log('[Voice] Standard text loaded from API successfully');
        } catch (e) {
            console.error('Failed to load standard text from API', e);
            console.log('[Voice] Using fallback: local verse data with normalization');
            // Fallback: Use local verse data but apply normalization to text
            // The matching service will handle the comparison
        }
    }

    async startVoiceSession(): Promise<void> {
        // IMPORTANT: Wait for standard text to load BEFORE starting voice recognition
        await this.updateVerseDataWithStandardText();
        this.voiceState = 'listening';

        // Use browser's Web Speech API directly (faster and more reliable)
        console.log('[Voice] Starting browser voice recognition');
        this.startBrowserVoiceSession();
    }

    // API voice session removed - using browser-only mode

    toggleVoiceMode(): void {
        if (this.memorizationSettings.inputMethod === 'voice') {
            // Switch to Touch
            this.memorizationSettings.inputMethod = 'touch';
            if (this.voiceSubscription) {
                this.voiceSubscription.unsubscribe();
                this.voiceService.stop();
            }
            this.voiceState = 'idle';
        } else {
            // Switch to Voice
            this.memorizationSettings.inputMethod = 'voice';
            this.startVoiceSession();
        }
    }





    private startBrowserVoiceSession(): void {
        this.voiceService.start();

        if (this.voiceSubscription) {
            this.voiceSubscription.unsubscribe();
        }

        this.voiceSubscription = this.voiceService.voiceEvents$.subscribe(event => {
            if (event.type === 'error') {
                console.error('Voice Error:', event.error);
                this.voiceState = 'error';
                // Try to restart if generic error, or just show UI
                if (event.error === 'no-speech') {
                    // Silent fail, just keep listening loop or prompt user
                }
            } else if (event.type === 'start') {
                this.voiceState = 'listening';
                this.cdr.detectChanges();
            } else if (event.type === 'end') {
                // If we are still in voice mode, restart listening (continuous mode helper)
                if (this.isMemorizationMode && this.memorizationSettings.inputMethod === 'voice') {
                    this.voiceService.start();
                }
            } else if (event.type === 'result') {
                this.processVoiceInput(event.transcript || '', event.isFinal || false);
            }
        });
    }

    stopVoiceSession(): void {
        // Stop browser-based recognition
        if (this.voiceSubscription) {
            this.voiceSubscription.unsubscribe();
            this.voiceSubscription = undefined;
        }
        this.voiceService.stop();
        this.voiceState = 'inactive';
    }

    processVoiceInput(transcript: string, isFinal: boolean = false): void {
        this.lastSpokenTranscript = transcript;
        this.voiceState = 'processing';

        // Get expected words for the current Ayah
        const currentVerseKey = this.sessionAyahs[this.currentAyahIndex];
        const verseSegments = this.verseDataMap.get(currentVerseKey);

        if (!verseSegments) return;

        // Skip stale buffer results for 500ms after verse change
        if (Date.now() < this.ignoreVoiceUntil) {
            console.log('[Voice] Skipping stale buffer result (cooldown):', transcript);
            return;
        }

        // Extract pure text for matching
        const expectedWords = verseSegments.map(s => s.text);

        const nextIndex = this.currentWordIndex + 1;

        console.log('[Voice] Transcript:', transcript);
        console.log('[Voice] Current Index (Revealed):', this.currentWordIndex);
        console.log('[Voice] Next Expected Index:', nextIndex);
        if (nextIndex < expectedWords.length) {
            console.log('[Voice] Expected Word:', expectedWords[nextIndex]);
        }

        // Find if the spoken text matches the NEXT word(s)
        const matchIndex = this.matchingService.findProgress(transcript, expectedWords, nextIndex);

        console.log('[Voice] Match Result:', matchIndex);

        if (matchIndex !== -1) {
            // Correct word(s) spoken!

            // TRACK SKIPPED WORDS: If user jumped ahead, mark skipped words as errors
            const currentVerseKey = this.sessionAyahs[this.currentAyahIndex];
            for (let i = nextIndex; i < matchIndex; i++) {
                this.errorWords.add(`${currentVerseKey}:${i}`);
            }

            // Reset failed attempts on successful match
            this.failedAttempts = 0;

            // Reveal up to the matched index
            this.currentWordIndex = matchIndex;

            // Checks if we reached or exceeded the last word
            if (this.currentWordIndex >= expectedWords.length - 1) {
                // Ayah complete - Move to next Ayah
                this.incrementRepetition();

                // Award points for verse completion (only if logged in)
                if (this.memorizationSettings.type === 'hifz') {
                    this.quranProgressService.addPointsIfLoggedIn('VERSE_MEMORIZED', 1);
                    this.sessionCounters.versesMemorized++;
                    this.checkAutoSync('hifz');
                } else {
                    this.quranProgressService.addPointsIfLoggedIn('REVISION_VERSE_COMPLETE' as any, 1);
                }

                // IMPORTANT: Restart voice recognition to clear the transcript buffer
                // This prevents old words from matching in the new Ayah
                if (this.memorizationSettings.inputMethod === 'voice') {
                    // Ignore voice results for 500ms to clear stale buffer
                    this.ignoreVoiceUntil = Date.now() + 500;
                    this.voiceService.stop();
                    setTimeout(() => {
                        if (this.memorizationSettings.inputMethod === 'voice' && this.isMemorizationMode) {
                            this.voiceService.start();
                        }
                    }, 300); // Increased timeout for better buffer clearing
                }

            } else {
                // Important: We do NOT increment currentWordIndex here anymore.
                // currentWordIndex represents the last REVEALED word.
                // The view will show words <= currentWordIndex.
                this.calculateAutoShift();
            }
        } else {
            // No progress or wrong word - only count FINAL results (not interim)
            const hasActualSpeech = transcript && transcript.trim().length > 0;
            if (hasActualSpeech && isFinal) {
                this.failedAttempts++;
            }

            const MAX_FAILED_ATTEMPTS = 3;
            const isLastWord = (this.currentWordIndex + 1) >= expectedWords.length - 1;

            // Use lower threshold for last word to avoid user waiting too long
            const threshold = isLastWord ? 2 : MAX_FAILED_ATTEMPTS;

            if (this.failedAttempts >= threshold) {
                // Auto-skip: Mark current expected word as error and advance
                const currentVerseKey = this.sessionAyahs[this.currentAyahIndex];
                const nextExpectedIndex = this.currentWordIndex + 1;

                // Mark as error
                this.errorWords.add(`${currentVerseKey}:${nextExpectedIndex}`);

                // Advance to show the word (now revealed but marked red)
                this.currentWordIndex = nextExpectedIndex;
                this.failedAttempts = 0; // Reset counter

                // Check if we completed the ayah
                if (this.currentWordIndex >= expectedWords.length - 1) {
                    this.incrementRepetition();
                } else {
                    this.calculateAutoShift();
                }

                this.cdr.detectChanges();
            } else {
                // Still trying - just update state
                setTimeout(() => {
                    this.voiceState = 'listening';
                    this.cdr.detectChanges();
                }, 500);
            }
        }

        // Ensure UI returns to listening state
        if (this.voiceState === 'processing') {
            this.voiceState = 'listening';
            this.cdr.detectChanges();
        }
    }

    get currentExpectedWords(): string[] {
        if (!this.sessionAyahs || this.sessionAyahs.length === 0) return [];
        const key = this.sessionAyahs[this.currentAyahIndex];
        // Ensure we try to get from data map first (which might have updated standard text)
        const segs = this.verseDataMap.get(key);
        return segs ? segs.map(s => s.text) : [];
    }
}
