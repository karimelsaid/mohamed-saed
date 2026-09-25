import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy, ChangeDetectorRef, ViewChild, ChangeDetectionStrategy, AfterViewInit, NgZone, Renderer2, ElementRef } from '@angular/core';
import { MutabaaTrackerComponent } from './mutabaa-tracker/mutabaa-tracker.component';
import { MushafDataService } from '../../../core/services/mushaf-data.service';
import { MushafFontService } from '../../../core/services/mushaf-font.service';
import { MushafAssetService } from '../../../core/services/mushaf-asset.service'; // Added Import
import { VoiceRecognitionService } from '../../../core/services/voice-recognition.service';
import { QuranMatchingService } from '../../../core/services/quran-matching.service';
import { MushafPage, SurahMetadata, JuzMetadata, MushafMetadata, MushafSegment, MushafLine } from '../../../core/models/mushaf.model';
import { Observable, firstValueFrom, of, from, Subscription, forkJoin, Subject, combineLatest } from 'rxjs';
import { take, filter, map, throttleTime, takeUntil } from 'rxjs/operators';
import { QuranProgressService } from '../../../services/quran-progress.service';
import { MutabaaService } from '../../../services/mutabaa.service';
import { HifzPlanService } from '../../../services/hifz-plan.service';
import { PushNotificationService } from '../../../services/push-notification.service';
import { LocalReminderService } from '../../../services/local-reminder.service';
import { QuranAudioService, PlaybackState } from '../../../core/services/quran-audio.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { NativeAudio } from '@capgo/native-audio';
import { BookmarkService } from '../../../core/services/bookmark.service';
import { Bookmark } from '../../../core/models/bookmark.model';
import { faUsers, faUser, faSignOutAlt, faSignInAlt, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../../auth/auth.service';
import { PresenceService } from '../../../core/services/presence.service';
import { AsrReviewService, ASRReviewResponse } from '../../../services/asr-review.service';

// --- Performance Optimization Interfaces ---
export interface EnrichedMushafSegment extends MushafSegment {
    isSecondHalf: boolean;
    staticClasses: string;
    isFirstSegment?: boolean;
    isLastSegment?: boolean;
}

export interface EnrichedMushafLine extends MushafLine {
    segments: EnrichedMushafSegment[]; // Override with enriched version
    backgroundStyle: string;
    shouldHide: boolean;
}

export interface EnrichedMushafPage extends MushafPage {
    lines: EnrichedMushafLine[]; // Override with enriched version
}
// -------------------------------------------

export type VoiceState = 'inactive' | 'listening' | 'processing' | 'error' | 'idle';

export interface ReminderSettings {
    recitation: { enabled: boolean; time: string };
    memorization: { enabled: boolean; time: string };
    revision: { enabled: boolean; time: string };
    kahfFriday: { enabled: boolean; time: string };
    bedtimeMulkSajda: { enabled: boolean; time: string };
}

export interface MemorizationSettings {
    type: 'hifz' | 'muraaja' | 'recitation';
    range: 'page' | 'surah' | 'juz' | 'quran' | 'custom' | 'half_page' | 'daily_ward';
    hideType: 'ayah' | 'word';
    inputMethod: 'touch' | 'voice';
    difficulty: 'easy' | 'hard';
    ayahRepeat: number;
    groupRepeat: number;
    customStartVerse: string;
    customEndVerse: string;
    surahStartVerse: number;
    surahEndVerse: number;
    selectedHalf: 'first' | 'second' | null;
    targetSurah: number;
}

@Component({
    selector: 'app-mushaf-page',
    standalone: false,
    templateUrl: './mushaf-page.component.html',
    styleUrls: ['./mushaf-page.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MushafPageComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
    @Input() pageNumber: number = 1;

    // Virtual Slider State
    currentPageData$?: Observable<EnrichedMushafPage | undefined>;
    prevPageData$?: Observable<EnrichedMushafPage | undefined>;
    nextPageData$?: Observable<EnrichedMushafPage | undefined>;

    currentSurah$?: Observable<SurahMetadata | undefined>;
    currentJuz$?: Observable<JuzMetadata | undefined>;
    mushafMetadata$?: Observable<MushafMetadata>;
    currentMushafPage: EnrichedMushafPage | null = null; // NEW: Local copy for sync checks
    private destroy$ = new Subject<void>(); // Added for memory leak fix
    isLoadingPage: boolean = false;
    pageLoadError: string | null = null;

    fontFamily: string = '';
    tafsirFontFamily: string = '';
    isFontReady: boolean = false;
    isSidebarOpen: boolean = false;
    isSettingsOpen: boolean = false; // NEW: Settings sidebar state
    settingsMode: 'wird' | 'stats' = 'stats';
    showSupportModal: boolean = false;
    supportModalTab: 'support' | 'book' = 'support';
    sidebarTab: 'surahs' | 'juzs' | 'pages' | 'bookmarks' = 'surahs';
    currentTheme: string = 'cream'; // NEW: Default Mushaf theme
    themes = ['cream', 'white', 'green', 'sky', 'blue', 'dark']; // Added 'sky' for Madina Blue style
    isLoggedIn: boolean = false; // User login status
    isMobileApp: boolean = false; // Check if running as native/pwa app
    isAndroid: boolean = false; // Check if running specifically on Android
    activeWirdTab: 'recitation' | 'memorization' | 'revision' | 'mutabaa' = 'mutabaa'; // Dashboard active tab
    totalUsers: number = 0; // NEW: Total readers count
    guestModeAccepted: boolean = localStorage.getItem('guestModeAccepted') === 'true'; // Guest mode flag

    // ---- Mushaf Selector State ----
    availableMushafs: any[] = [];
    selectedMushafId: string = 'hafs_v1';
    imageFitMode: 'contain' | 'fill' = 'contain';
    mushafDownloadStatus: { [id: string]: boolean } = {};
    isMushafDownloading: boolean = false;
    mushafDownloadMessage: string = '';
    mushafDownloadProgress: number = 0;
    mushafDownloadError: string | null = null;
    downloadingMushafId: string | null = null;
    failedDownloadMushafId: string | null = null;
    hifzMuyassarPageData: { image: string; coordinates: any[]; verses: any[] } | null = null;
    private readonly hifzMuyassarImageWidth = 1447;
    private readonly hifzMuyassarImageHeight = 2297;

    isMemorizationMode: boolean = false;
    showOptionsSheet: boolean = false;
    selectedVerseKey: string | null = null;
    private lastSurahReciterNavigationKey: string | null = null;

    @ViewChild(MutabaaTrackerComponent) mutabaaTracker!: MutabaaTrackerComponent;
    @ViewChild('pageContainer', { static: false }) pageContainerEl?: ElementRef;
    @ViewChild('mushafSlider', { static: false }) mushafSliderEl?: ElementRef;

    memorizationSettings: MemorizationSettings = {
        type: 'hifz',
        range: 'page',
        hideType: 'ayah',
        inputMethod: 'touch',
        difficulty: 'easy',
        ayahRepeat: 3,
        groupRepeat: 3,
        customStartVerse: '',
        customEndVerse: '',
        surahStartVerse: 1,
        surahEndVerse: 7,
        selectedHalf: null,
        targetSurah: 0
    };

    // Active Session State
    sessionAyahs: string[] = [];
    availableSurahs: { id: number, nameAr: string, nameEn: string }[] = [];
    currentAyahIndex: number = 0;
    currentWordIndex: number = 0;
    currentRepetition: number = 1;
    currentGroupRepetition: number = 1; // Track group loop count
    isGroupPhase: boolean = false;
    isSeeking: boolean = false;
    tempSeekPosition: number = 0;
    memoMethod: 'manual' | 'auto' = 'manual';
    isTestPhase: boolean = false;
    testOptions: string[] = [];
    correctAnswer: string = '';

    // Enhanced Test Phase state
    testQuestions: any[] = [];
    currentTestQuestionIndex: number = 0;
    correctAnswersCount: number = 0;
    showTestResult: boolean = false;
    verseDataMap: Map<string, { text: string, font: string }[]> = new Map();
    ripples: { x: number, y: number, id: number }[] = [];
    private rippleId = 0;

    // Voice State
    voiceState: VoiceState = 'inactive';

    // ASR Voice Review State (Integrated)
    isAsrReviewEnabled: boolean = false; // Enable ASR in review mode
    isAsrRecording: boolean = false;
    asrRecordingDuration: number = 0;
    asrRecordingInterval: any = null;
    asrReviewResult: ASRReviewResponse | null = null;
    asrReviewLoading: boolean = false;
    asrReviewError: string | null = null;
    showAsrModal: boolean = false; // Show detailed results modal
    mediaRecorder: MediaRecorder | null = null;
    audioChunks: Blob[] = [];
    recordedAudioBlob: Blob | null = null;

    filteredReciters: any[] = [];
    recitationFilter: 'hafs' | 'warsh' = 'hafs';

    // Touch and Swipe properties
    private touchStartX: number = 0;
    private touchStartY: number = 0;
    private touchStartTime: number = 0;
    private sheetStartY: number = 0;
    slideOffset: number = 0;
    private isVerticalScroll: boolean = false;
    private hasMoved: boolean = false;
    private touchEndX: number = 0;
    private touchEndY: number = 0;
    sheetOffset: number = 0;
    sidebarOffset: number = 0;
    isDownloadMode: boolean = false;
    downloadingSurahs: Set<number> = new Set();
    downloadedSurahs: Set<number> = new Set();
    settingsOffset: number = 0;
    private sidebarTouchStartX: number = 0;
    private settingsTouchStartX: number = 0;
    pageVerticalShift: number = 0;
    isAnimating: boolean = false;
    swipeDirection: 'none' | 'next' | 'prev' = 'none';
    private versePageMap: Map<string, number> = new Map();
    private isProcessingAutoRepeat: boolean = false;
    isWaitingForPageTurn: boolean = false;
    showTaskDoneToast: boolean = false;

    private voiceSubscription?: Subscription;

    // Error Tracking
    errorWords: Set<string> = new Set();
    skippedAyahs: Set<string> = new Set();
    memorizedVerses: string[] = [];
    failedAttempts: number = 0;
    private ignoreVoiceUntil: number = 0;
    pageSplits: Map<number, { surah: number, ayah: number }> = new Map();

    // Anti-Cheat & Dynamic Progress State
    private pageStartTime: number = Date.now();

    // Audio State
    audioState$?: Observable<PlaybackState>;
    currentReciterId: number = 12;
    hifzReciterId: number = 12;
    reciterSelectionContext: 'global' | 'hifz' = 'global';
    availableReciters: any[] = [];
    showAudioPlayer: boolean = localStorage.getItem('showAudioPlayer') !== 'false';
    playingVerseKey: string | null = null;
    private isCurrentPageAwarded: boolean = false;
    private sessionCounters = {
        pagesRead: 0,
        versesMemorized: 0,
        pagesReviewed: 0,
        versesReviewed: 0
    };
    private readonly MIN_PAGE_STAY_MS = 30000; // 30 seconds (as requested, except first 2 pages)
    private userPlan: any = null;
    private integrityRefreshInterval: any;
    private keepOptionsSheet = false; // Flag to prevent loadPage from closing the sheet during task navigation
    isReadingActive: boolean = false; // Manual session toggle
    showHifzWizard: boolean = false; // Setup wizard visibility
    hifzPlanSetupComplete: boolean = false; // Whether user has completed hifz plan setup
    dailyTasks: any = null; // Daily tasks from hifz plan API
    hifzPlanStats: any = null; // Stats from hifz plan
    quranProgress: any = null; // Syncs from daily-tasks response
    reminderSettings: ReminderSettings = {
        recitation: { enabled: false, time: '08:00' },
        memorization: { enabled: false, time: '09:00' },
        revision: { enabled: false, time: '10:00' },
        kahfFriday: { enabled: false, time: '08:00' },
        bedtimeMulkSajda: { enabled: false, time: '22:00' }
    };
    pushEnabled: boolean = false; // Track browser permission
    pushSubscribed: boolean = false; // Track actual push registration
    isMobile: boolean = false;

    // Search State
    isSearchOpen: boolean = false;
    searchQuery: string = '';
    searchResults: any[] = [];
    private searchTimeout: any;
    isSearching: boolean = false;
    flashVerseKey: string | null = null; // Temporary highlight after search
    private searchSubject = new Subscription(); // Will use for debouncing if needed, or just simple Subject

    // --- Continuous Scroll & Auto-Scroll State ---
    isContinuousMode: boolean = false;
    isAutoRepeat: boolean = false;
    isAutoScrolling: boolean = false;
    showScrollControls: boolean = false; // Toggle for expanded controls
    autoScrollSpeed: number = 1.0; // multiplier (1.0 = ~1 min/page)
    verticalPages: any[] = [];
    isVerticalLayoutReady: boolean = false; // Hide content until fonts are loaded
    private rafId: any = null;

    // Track auto-synced tasks to prevent repeat calls
    private completedTasks: Set<string> = new Set();
    currentTaskType: 'new_memorization' | 'hifz' | 'consolidation' | 'revision' | 'recitation' | 'tilawo' | 'muraja' | 'deepMuraja' | 'rabt' | null = null;
    private initialTaskProgress: { [key: string]: number } = {
        hifz: 0,
        muraja: 0,
        tilawo: 0
    };





    private lastSyncedPage: number = -1;
    private lastSyncedVerseKey: string = '';
    private sessionStartPage: number = 1;
    private sessionTargetAmount: number = 1;
    private lastIncrementTime: number = 0; // Debounce for clicks

    // Tafsir State
    isTafsirOpen: boolean = false;
    currentTafsir: any = null;
    pageTafsirs: any[] = [];
    availableTafsirs: any[] = [
        { id: 16, name: 'التفسير الميسر', downloaded: false },
        { id: 901, name: 'التفسير الميسر (بالعامية)', downloaded: true }, // Local asset
        { id: 91, name: 'تفسير السعدي', downloaded: false },
        { id: 14, name: 'تفسير ابن كثير', downloaded: false },
        { id: 15, name: 'تفسير الطبري', downloaded: false },
        { id: 90, name: 'تفسير القرطبي', downloaded: false },
        { id: 94, name: 'تفسير البغوي', downloaded: false },
        { id: 900, name: 'أسباب النزول (الواحدي)', downloaded: true } // Local asset
    ];
    selectedTafsirId: number = 16;

    get getActiveTafsirName(): string {
        const found = this.availableTafsirs.find(t => t.id === this.selectedTafsirId);
        return found ? found.name : 'مصادر التفسير';
    }
    loadingTafsir: boolean = false;
    tafsirPageNumber: number = 0;
    showTafsirSources: boolean = false;
    tafsirDownloadProgress: { [id: number]: { current: number, total: number, loading: boolean } } = {};
    private pagesWithAsbab: number[] = []; // Store unique pages that have Asbab Al-Nuzul data
    private pagesWithMuyassar: number[] = []; // Store unique pages that have Muyassar (Amia) data
    showAsbabIndex: boolean = false;
    asbabIndexData: any[] = [];
    asbabSearchQuery: string = '';

    // Tafsir Swipe State
    private tafsirTouchStartX: number = 0;
    private tafsirTouchStartY: number = 0;
    private tafsirTouchEndX: number = 0;
    private tafsirTouchEndY: number = 0;

    public downloadProgressMap: Map<string, number> = new Map();


    feedbackModal: {
        show: boolean;
        content: string;
        loading: boolean;
        success: boolean;
        error: string;
    } = {
            show: false,
            content: '',
            loading: false,
            success: false,
            error: ''
        };

    showInfoModal: boolean = false;
    showSurahModal: boolean = false; // NEW: Premium Surah selector state
    surahSearchQuery: string = ''; // NEW: For filtering surahs

    showSleepTimerModal: boolean = false;
    sleepTimerRemaining: number = 0; // seconds
    sleepTimerInterval: any = null;

    // Audio Settings Modal
    audioSettingsModal = {
        show: false,
        tempRepeatAyah: 1,
        tempRepeatGroup: 1,
        tempRange: 'page' as any,
        tempSpeed: 1.0,

        // Custom Range Selection
        startSurah: 1,
        startAyah: 1,
        endSurah: 1,
        endAyah: 7,
        availableAyahsForStart: [] as number[],
        availableAyahsForEnd: [] as number[]
    };

    showAudioManager: boolean = false;
    showReciterModal: boolean = false;
    private isExiting: boolean = false;
    allSurahs: any[] = [];
    allJuzs: any[] = [];


    // Bookmark State
    showBookmarkDialog: boolean = false;
    bookmarkTitle: string = '';
    userBookmarks: Bookmark[] = [];
    isPageBookmarked: boolean = false;

    Math = Math;
    faUsers = faUsers;
    faUser = faUser;
    faSignOutAlt = faSignOutAlt;
    faSignInAlt = faSignInAlt;
    faUserPlus = faUserPlus;

    // State for Wizard Synchronization
    private isPlanLoaded: boolean = false;
    private isMetadataLoaded: boolean = false;
    private isAssetsLoaded: boolean = false;

    constructor(
        public dataService: MushafDataService,
        private fontService: MushafFontService,
        public assetService: MushafAssetService, // Injected Asset Service
        private voiceService: VoiceRecognitionService,
        private matchingService: QuranMatchingService,
        private cdr: ChangeDetectorRef,
        public quranProgressService: QuranProgressService,
        private mutabaaService: MutabaaService,
        private hifzPlanService: HifzPlanService,
        private pushService: PushNotificationService,
        private localReminderService: LocalReminderService,
        public audioService: QuranAudioService,
        private router: Router,
        private http: HttpClient,
        private asrReviewService: AsrReviewService,
        private ngZone: NgZone,
        private renderer: Renderer2,
        public bookmarkService: BookmarkService,
        private authService: AuthService,
        private presenceService: PresenceService
    ) { }

    private nextVerseKeyToPlay: string | null = null;

    private tryShowWizard() {
        // Only show if:
        // 1. Plan data has been fetched
        // 2. Metadata (Surahs) is available
        // 3. Assets are done loading (loading overlay gone)
        // 4. Wizard hasn't been dismissed manually

        if (this.isPlanLoaded && this.isMetadataLoaded && this.isAssetsLoaded) {
            if (!this.hifzPlanSetupComplete && !localStorage.getItem('wizard_dismissed')) {
                console.log('[MushafPage] Conditions met. Showing Hifz Wizard.');
                this.showHifzWizard = true;
                this.showNavbar = false; // Hide navbar when wizard is active
                this.cdr.detectChanges();
            }
        }
    }

    async ngOnInit(): Promise<void> {
        this.isFontReady = true; // Ensure content is visible by default (optimization)
        this.isAndroid = Capacitor.getPlatform() === 'android';

        // Setup Audio State
        this.audioState$ = this.audioService.state$;
        this.audioState$.pipe(takeUntil(this.destroy$)).subscribe(state => {
            // AUTO-HIDE UI: Hide navbar when audio starts playing
            if (state.isPlaying && this.showNavbar) {
                this.showNavbar = false;
                this.cdr.detectChanges();
            }

            const newKey = state.currentVerseKey;

            // SURAH RECITER OVERRIDE: Navigate to the selected surah, but
            // disable verse-level highlighting/selection for full-surah files.
            if (state.reciterId && this.audioService.isSurahReciter(state.reciterId)) {
                // A full-surah file still starts from a real verse key. Use it
                // for navigation, but never expose verse-level highlighting.
                if (newKey && this.lastSurahReciterNavigationKey !== newKey) {
                    this.lastSurahReciterNavigationKey = newKey;
                    this.autoNavigateToVerse(newKey);
                }
                this.playingVerseKey = null;
                this.selectedVerseKey = null;
                this.selectedVersesSet.clear();
                this.computedRange = null;
                this.cdr.detectChanges();
                return;
            }

            this.lastSurahReciterNavigationKey = null;

            if (this.playingVerseKey !== newKey) {
                this.playingVerseKey = newKey;
                this.cdr.detectChanges();

                // Sync repetition counters from service (for Android native sync)
                // ONLY sync if NOT in manual/external control mode (Hifz/AutoRepeat)
                // Otherwise, the component manages the counters, and service state might be stale/reset.
                if (!this.isMemorizationMode && !this.isAutoRepeat) {
                    if (state.isGroupPhase) {
                        this.currentRepetition = state.currentAyahRepeatCount + 1;
                        this.currentGroupRepetition = state.currentGroupRepeatCount + 1;
                    } else {
                        this.currentRepetition = state.currentAyahRepeatCount + 1;
                    }
                }

                if (newKey) {
                    this.autoNavigateToVerse(newKey);
                }

                // Auto-scroll to current verse
                if (this.playingVerseKey) {
                    setTimeout(() => {
                        this.scrollToPlayingVerse();
                    }, 250);
                }
            }
        });

        // Load all surahs and juzs for labels
        this.dataService.getMetadata().pipe(takeUntil(this.destroy$)).subscribe({
            next: (meta) => {
                if (meta) {
                    this.allSurahs = meta.surahs;
                    this.allJuzs = meta.juzs;

                    // Load last selected Tafsir
                    const savedTafsir = localStorage.getItem('lastSelectedTafsirId');
                    if (savedTafsir) {
                        this.selectedTafsirId = Number(savedTafsir);
                    }

                    // Updates for Wizard Sync
                    this.isMetadataLoaded = true;
                    this.tryShowWizard();
                }
            },
            error: (err) => {
                console.error('❌ [MushafPage] Failed to load metadata:', err);
                const activeMushafId = this.assetService.getSelectedMushafId();
                if (activeMushafId !== 'hafs_v1') {
                    console.warn(`[MushafPage] Selected mushaf '${activeMushafId}' metadata failed. Falling back to 'hafs_v1'...`);
                    this.assetService.setSelectedMushafId('hafs_v1');
                    this.dataService.clearCache();
                    alert('عذراً، ملفات هذا المصحف غير متوفرة حالياً على الخادم. تم إرجاعك إلى المصحف الافتراضي.');
                    window.location.reload();
                }
            }
        });

        this.audioService.verseCompleted$
            .pipe(takeUntil(this.destroy$))
            .subscribe(async event => {
                if (event) {
                    const { verseKey, duration } = event;
                    console.log(`[MushafPage] Verse completed event: ${verseKey}`);

                    // Verse completed - handle normal flow

                    if (this.isAutoRepeat) {
                        await this.handleAutoRepeat(verseKey, duration);
                    } else {
                        await this.playNextVerseAudio(verseKey);
                    }
                }
            });

        // Track download progress
        this.audioService.downloadProgress$.pipe(takeUntil(this.destroy$)).subscribe(map => {
            this.downloadProgressMap = new Map(map);
            this.cdr.detectChanges();
        });

        // Fetch memorized content for indicators
        this.hifzPlanService.getPlan().pipe(takeUntil(this.destroy$)).subscribe(res => {
            if (res.success && res.plan?.memorizedContent) {
                this.memorizedVerses = res.plan.memorizedContent.map(v => v.verseKey);
            }
        });

        // Initialize downloaded status
        this.updateDownloadedStatus();

        // Load page splits for half-page highlighting
        this.dataService.getPageSplits().pipe(takeUntil(this.destroy$)).subscribe(splits => {
            if (splits) {
                splits.forEach(s => {
                    if (s.page && s.split) {
                        this.pageSplits.set(s.page, s.split);
                    }
                });
                console.log(`[MushafPage] Loaded ${this.pageSplits.size} page splits.`);
                this.cdr.detectChanges();
            }
        });

        // Restore saved reciter
        const savedReciter = localStorage.getItem('lastReciterId');
        if (savedReciter) {
            this.currentReciterId = parseInt(savedReciter, 10);
            this.audioService.setReciter(this.currentReciterId);
        }

        const savedHifzReciter = localStorage.getItem('hifzReciterId');
        if (savedHifzReciter) {
            this.hifzReciterId = parseInt(savedHifzReciter, 10);
        }

        // Restore repetition delay preference
        const savedDelay = localStorage.getItem('mushaf_repetition_delay');
        if (savedDelay !== null) {
            this.delayBetweenRepetitions = parseInt(savedDelay, 10);
        }

        // Restore image fit preference
        this.imageFitMode = (localStorage.getItem('mushafImageFitMode') as 'contain' | 'fill') || 'contain';

        this.loadReciters();

        // Load all surahs for Audio Manager
        this.dataService.getMetadata().pipe(take(1)).subscribe(meta => {
            this.allSurahs = meta.surahs;
        });


        const savedPage = localStorage.getItem('lastMushafPage');
        if (savedPage) {
            this.pageNumber = parseInt(savedPage, 10);
            console.log(`[Mushaf] Restored last page: ${this.pageNumber}`);
        }

        // Restore saved Mushaf Theme
        const savedTheme = localStorage.getItem('mushaf_theme');
        if (savedTheme) {
            this.currentTheme = savedTheme;
            // console.log(`[Mushaf] Restored theme: ${this.currentTheme}`);
        }

        // Restore selected Mushaf ID
        this.selectedMushafId = this.assetService.getSelectedMushafId();

        // جلب قائمة المصاحف في الخلفية مبكراً
        this.loadAvailableMushafs();

        this.fontService.loadBasmalahFont();
        this.loadPage();

        // Ensure assets are downloaded in background (Native only)
        // We don't await here to prevent blocking the initial page load UI
        this.assetService.ensureAssets().catch(error => {
            console.error('Failed to verify/download assets:', error);
        });

        // Watch for download completion to refresh data if it was missing
        combineLatest([this.assetService.loading$, this.assetService.error$])
            .pipe(takeUntil(this.destroy$))
            .subscribe(([loading, error]) => {
                if (!loading && !error && !this.currentMushafPage && !this.isLoadingPage) {
                    console.log('🔄 [Mushaf] Assets ready and page data missing. Refreshing...');
                    this.dataService.clearCache();
                    this.loadPage();
                }

                // Updates for Wizard Sync
                if (!loading && !error) {
                    this.isAssetsLoaded = true;
                    this.tryShowWizard();
                }
            });

        // Pre-fetch search database for high-performance offline search
        this.dataService.getSearchData().pipe(takeUntil(this.destroy$)).subscribe();

        // Check Push Permission Status
        this.pushService.getPermissionStatus().then(statusRes => {
            this.pushEnabled = (statusRes.permission === 'granted');
            this.pushSubscribed = statusRes.hasSubscription;
            this.cdr.detectChanges();
        });

        // Refresh progress data
        // Refresh progress data
        console.log('📡 [MushafPage] Requesting Quran progress update...');
        this.quranProgressService.getProgress().pipe(takeUntil(this.destroy$)).subscribe({
            next: (res) => console.log('✅ [MushafPage] Quran progress update success'),
            error: (err) => console.error('❌ [MushafPage] Quran progress update error:', err)
        });

        // Subscribe to progress changes to trigger view updates in the sidebar tabs
        this.quranProgressService.progress$.pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.cdr.detectChanges();
        });


        // Listen for task updates from anywhere (dashboard, other components)
        this.mutabaaService.taskUpdated$.pipe(takeUntil(this.destroy$)).subscribe(() => {
            console.log('🔄 [Mushaf] Task Update Notification Received. Reloading Tasks & Plan...');
            this.loadDailyTasks();

            // Also refresh local plan data to ensure 'memorizedVerses' (used in index) is up to date
            this.hifzPlanService.getPlan().pipe(takeUntil(this.destroy$)).subscribe(res => {
                if (res.success && res.plan?.memorizedContent) {
                    this.memorizedVerses = res.plan.memorizedContent.map(v => v.verseKey);
                    this.cdr.detectChanges();
                }
            });
        });


        // Timer for reading integrity bar updates AND immediate point awarding
        this.integrityRefreshInterval = setInterval(() => {
            if (!this.isTestPhase) {
                if (this.isReadingActive || this.isMemorizationMode) {
                    this.checkImmediatePointAwarding();
                }
                this.cdr.detectChanges();
            }
        }, 1000); // Check every second for better precision

        // Check if hifz plan setup is needed and load initial plan status
        this.hifzPlanService.getPlan().pipe(takeUntil(this.destroy$)).subscribe({
            next: (res) => {
                if (res.success) {
                    this.hifzPlanSetupComplete = res.isSetupComplete;
                    this.hifzPlanStats = res.plan?.stats || null;
                    if (res.plan?.reminders) {
                        const reminders = res.plan.reminders as any;
                        this.reminderSettings = {
                            recitation: reminders.recitation || { enabled: false, time: '08:00' },
                            memorization: reminders.memorization || { enabled: false, time: '09:00' },
                            revision: reminders.revision || { enabled: false, time: '10:00' },
                            kahfFriday: reminders.kahfFriday || { enabled: false, time: '08:00' },
                            bedtimeMulkSajda: reminders.bedtimeMulkSajda || { enabled: false, time: '22:00' }
                        };
                        // Schedule local reminders
                        this.localReminderService.scheduleReminders(this.reminderSettings);
                    } else {
                        // Try to load from local storage if server doesn't have reminders
                        const localReminders = this.localReminderService.getStoredReminders();
                        if (localReminders) {
                            this.reminderSettings = localReminders;
                            this.localReminderService.scheduleReminders(this.reminderSettings);
                        }
                    }
                    if (!res.isSetupComplete && !localStorage.getItem('wizard_dismissed')) {
                        // this.showHifzWizard = true; // MOVED TO tryShowWizard
                    }

                    // Updates for Wizard Sync
                    this.isPlanLoaded = true;
                    this.tryShowWizard();

                    // Always load user plan data/tasks if success
                    this.loadUserPlan();
                }
            },
            error: () => {
                this.loadUserPlan(); // Still try to load mutabaa data
            }
        });

        // Stats are now public
        this.loadTotalUsers();

        // FIX: Populate versePageMap for Touch Interaction Logic
        // We subscribe to page data streams to map verse keys to page numbers
        const mapPopulator = (page: any) => {
            if (page && page.lines) {
                page.lines.forEach((line: any) => {
                    if (line.type === 'verse' && line.segments) {
                        line.segments.forEach((seg: any) => {
                            if (seg.verse_key) {
                                this.versePageMap.set(seg.verse_key, page.page_number);
                            }
                        });
                    }
                });
            }
        };

        if (this.currentPageData$) this.currentPageData$.pipe(takeUntil(this.destroy$)).subscribe(mapPopulator);
        if (this.nextPageData$) this.nextPageData$.pipe(takeUntil(this.destroy$)).subscribe(mapPopulator);
        if (this.prevPageData$) this.prevPageData$.pipe(takeUntil(this.destroy$)).subscribe(mapPopulator);

        // Bookmark Subscription
        this.bookmarkService.bookmarks$.pipe(takeUntil(this.destroy$)).subscribe(bookmarks => {
            this.userBookmarks = bookmarks;
            this.updateBookmarkStatus();
            this.cdr.detectChanges();
        });

        // Keep screen awake while Mushaf is active
        if (Capacitor.isNativePlatform()) {
            KeepAwake.keepAwake().catch(err => console.error('[KeepAwake] Failed to keep awake:', err));
        }

        // Record daily activity for streak tracking (just by visiting/browsing)
        this.hifzPlanService.recordDailyActivity().pipe(takeUntil(this.destroy$)).subscribe({
            next: (res) => {
                if (res.increased) {
                    console.log('🔥 [Mushaf] Daily Streak active! Current streak:', res.streak);
                    // Refresh daily tasks to reflect new streak
                    this.loadDailyTasks();
                }
            },
            error: (err) => console.error('Failed to record daily activity:', err)
        });

        // Initialize user login status
        this.authService.user$.pipe(takeUntil(this.destroy$)).subscribe((user: any) => {
            this.isLoggedIn = !!user;
            this.cdr.detectChanges();
        });

        // Listen for Mushaf Page Sync updates from Halaqa
        this.presenceService.pageSync$.pipe(takeUntil(this.destroy$)).subscribe(data => {
            this.handleRemotePageSync(data);
        });
    }

    public remoteSyncData: any = null;
    showSyncPrompt: boolean = false;

    handleRemotePageSync(data: any) {
        // Don't prompt if it's our own sync (though the backend should handle this, extra safety)
        const currentUser = this.authService.currentUserValue;
        if (data.userId === currentUser?.id) return;

        // Only show if the page is different
        if (data.pageNumber !== this.pageNumber) {
            this.remoteSyncData = data;
            this.showSyncPrompt = true;
            this.cdr.detectChanges();

            // Auto-hide prompt after 10 seconds
            setTimeout(() => {
                this.showSyncPrompt = false;
                this.cdr.detectChanges();
            }, 10000);
        }
    }

    jumpToRemotePage() {
        if (this.remoteSyncData) {
            this.goToPage(this.remoteSyncData.pageNumber);
            this.showSyncPrompt = false;
        }
    }

    broadcastPageSync() {
        const activeHalaqaId = localStorage.getItem('active_halaqa_id');
        const currentUser = this.authService.currentUserValue;

        if (activeHalaqaId && currentUser) {
            console.log(`📤 Broadcasting page sync: Page ${this.pageNumber} for Halaqa ${activeHalaqaId}`);
            this.presenceService.syncPage(activeHalaqaId, currentUser.id, this.pageNumber);
        }
    }

    ngAfterViewInit(): void {
        console.log('[Mushaf] Initialized. Slider ready:', !!this.mushafSliderEl);
    }

    // TrackBy functions for better performance
    trackByLine(index: number, line: any): string {
        return line.id || index;
    }

    trackBySegment(index: number, segment: any): string {
        return segment.verse_key + '-' + index;
    }

    trackByRipple(index: number, ripple: any): number {
        return ripple.id;
    }

    trackBySurah(index: number, surah: any): number {
        return surah.id;
    }

    openFeedbackModal(): void {
        this.feedbackModal = {
            show: true,
            content: '',
            loading: false,
            success: false,
            error: ''
        };
        this.isSettingsOpen = false;
    }

    openReciterModal(context: 'global' | 'hifz' = 'global'): void {
        this.reciterSelectionContext = context;
        const selectedId = context === 'hifz' ? this.hifzReciterId : this.currentReciterId;
        const selectedReciter = this.availableReciters.find(r => r.id === selectedId);
        this.recitationFilter = this.isWarshReciter(selectedReciter) ? 'warsh' : 'hafs';
        this.updateFilteredReciters();
        this.showReciterModal = true;
        this.cdr.detectChanges();
    }

    isWarshReciter(reciter: any): boolean {
        if (!reciter) return false;
        return reciter.source === 'mp3quran' || reciter.source === 'everyayah' ||
            /ورش|warsh/i.test(`${reciter.name || ''} ${reciter.style || ''}`);
    }

    setRecitationFilter(filter: 'hafs' | 'warsh'): void {
        this.recitationFilter = filter;
        this.updateFilteredReciters();
        this.cdr.detectChanges();
    }

    private updateFilteredReciters(): void {
        this.filteredReciters = this.availableReciters.filter(reciter => {
            const matchesNarration = this.recitationFilter === 'warsh'
                ? this.isWarshReciter(reciter)
                : !this.isWarshReciter(reciter);
            const matchesContext = this.reciterSelectionContext === 'hifz'
                ? reciter.recitationType === 'ayah'
                : true;
            return matchesNarration && matchesContext;
        });
    }

    closeReciterModal(): void {
        this.showReciterModal = false;
        this.cdr.detectChanges();
    }

    getHifzReciterImage(): string | null {
        const reciter = this.availableReciters.find(r => r.id === this.hifzReciterId);
        return reciter ? this.getReciterImage(reciter) : null;
    }

    getFilteredReciters(): any[] {
        return this.filteredReciters;
    }

    closeFeedbackModal(): void {
        this.feedbackModal.show = false;
    }

    rateApp(): void {
        // Open Google Play link
        window.open('https://play.google.com/store/apps/details?id=com.kenouz.mushafwird&pcampaignid=web_share', '_blank');
        this.closeFeedbackModal();
    }

    submitFeedback(): void {
        if (!this.feedbackModal.content.trim()) {
            this.feedbackModal.error = 'يرجى كتابة ملاحظاتك أولاً';
            return;
        }

        this.feedbackModal.loading = true;
        this.feedbackModal.error = '';

        this.http.post<any>(`${environment.apiBaseUrl}/feedback/submit`, {
            content: this.feedbackModal.content,
            page: this.pageNumber
        }).subscribe({
            next: (res) => {
                this.feedbackModal.loading = false;
                if (res.success) {
                    this.feedbackModal.success = true;
                    setTimeout(() => this.closeFeedbackModal(), 2000);
                } else {
                    this.feedbackModal.error = res.message || 'حدث خطأ أثناء الإرسال';
                }
            },
            error: (err) => {
                this.feedbackModal.loading = false;
                this.feedbackModal.error = 'فشل الاتصال بالخادم، يرجى المحاولة لاحقاً';
            }
        });
    }


    acceptGuestMode(): void {
        this.guestModeAccepted = true;
        localStorage.setItem('guestModeAccepted', 'true');
        this.cdr.detectChanges();
    }

    onWizardComplete(): void {
        this.showHifzWizard = false;
        this.showNavbar = true; // Restore navbar
        this.hifzPlanSetupComplete = true; // Optimistic update

        // CRITICAL: Reset all session state to prevent stale data from triggering instant completion
        this.sessionCounters = {
            pagesRead: 0,
            versesMemorized: 0,
            pagesReviewed: 0,
            versesReviewed: 0
        };
        this.completedTasks.clear();
        this.errorWords.clear();
        this.skippedAyahs.clear();

        // Reload everything fresh
        this.loadDailyTasks();

        // Refresh hifz plan status and stats
        this.hifzPlanService.getPlan().subscribe({
            next: (res) => {
                if (res.success) {
                    this.hifzPlanSetupComplete = res.isSetupComplete;
                    this.hifzPlanStats = res.plan?.stats || null;
                    if (res.plan?.reminders) {
                        const reminders = res.plan.reminders as any;
                        this.reminderSettings = {
                            recitation: reminders.recitation || { enabled: false, time: '08:00' },
                            memorization: reminders.memorization || { enabled: false, time: '09:00' },
                            revision: reminders.revision || { enabled: false, time: '10:00' },
                            kahfFriday: reminders.kahfFriday || { enabled: false, time: '08:00' },
                            bedtimeMulkSajda: reminders.bedtimeMulkSajda || { enabled: false, time: '22:00' }
                        };
                        // Schedule local reminders
                        this.localReminderService.scheduleReminders(this.reminderSettings);
                    } else {
                        // Try to load from local storage if server doesn't have reminders
                        const localReminders = this.localReminderService.getStoredReminders();
                        if (localReminders) {
                            this.reminderSettings = localReminders;
                            this.localReminderService.scheduleReminders(this.reminderSettings);
                        }
                    }
                    if (res.plan?.memorizedContent) {
                        this.memorizedVerses = res.plan.memorizedContent.map(v => v.verseKey);
                    }
                    this.cdr.detectChanges();
                }
            }
        });

    }

    closeWizard(): void {
        this.showHifzWizard = false;
        this.showNavbar = true; // Restore navbar
    }

    loadDailyTasks(): void {
        console.log('📡 [MushafPage] loadDailyTasks starting...');

        // 1. Load Daily Tasks (today's progress)
        this.hifzPlanService.getDailyTasks().pipe(takeUntil(this.destroy$)).subscribe({
            next: async (res: any) => {
                console.log('✅ [MushafPage] Daily Tasks Response:', res.success ? 'Success' : 'Failed', res);

                // Set hifzPlanSetupComplete based on whether setup is needed
                if (res.needsSetup !== undefined) {
                    this.hifzPlanSetupComplete = !res.needsSetup;
                }

                const oldTasks = { ...this.dailyTasks };

                this.dailyTasks = {
                    new_memorization: res.tasks?.find((t: any) => t.type === 'new_memorization'),
                    consolidation: res.tasks?.find((t: any) => t.type === 'consolidation'),
                    revision: res.tasks?.find((t: any) => t.type === 'revision'),
                    recitation: res.tasks?.find((t: any) => t.type === 'recitation'),
                    stats: res.stats,
                    streak: res.streak
                };

                if (this.dailyTasks.stats) {
                    const s = this.dailyTasks.stats;
                    this.hifzPlanStats = s; // Sync with component's hifzPlanStats
                    if (s.mem !== undefined && s.totalVersesMemorized === undefined) {
                        s.totalVersesMemorized = s.mem;
                        s.percentage = s.pct;
                    }

                    // Update global quranProgress for consistency
                    this.quranProgress = {
                        ...this.quranProgress,
                        totalVersesMemorized: s.totalVersesMemorized,
                        currentStreak: s.currentStreak || res.streak || 0,
                        percentage: s.percentage || Math.round((s.totalVersesMemorized / 6236) * 100)
                    };
                }

                // FIX: Only update initialTaskProgress if we are NOT currently in a session for that specific task type.
                // Otherwise, we risk overwriting the baseline 'amountDone' while the user is adding to it,
                // leading to double counting in checkAutoSync.
                if (!this.isMemorizationMode || this.currentTaskType !== 'new_memorization') {
                    this.initialTaskProgress['hifz'] = this.dailyTasks.new_memorization?.amountDone || 0;
                }
                if (!this.isMemorizationMode || this.currentTaskType !== 'consolidation') {
                    this.initialTaskProgress['rabt'] = this.dailyTasks.consolidation?.amountDone || 0;
                }
                if (!this.isMemorizationMode || (this.currentTaskType !== 'revision' && this.currentTaskType !== 'deepMuraja')) {
                    this.initialTaskProgress['deepMuraja' as any] = this.dailyTasks.revision?.amountDone || 0;
                }
                if (!this.isMemorizationMode || this.currentTaskType !== 'recitation') {
                    this.initialTaskProgress['tilawo'] = this.dailyTasks.recitation?.amountDone || 0;
                }

                this.cdr.detectChanges();

                // 2. Resolve Pages Asynchronously
                for (const task of res.tasks) {
                    try {
                        const resolved = await this.resolveTaskStartVerse(task);
                        if (resolved) {
                            (task as any).resolvedPage = resolved.page;
                            (task as any).resolvedVerseKey = resolved.verseKey;
                        }
                    } catch (e) {
                        console.warn('[Mushaf] Could not resolve page for task:', task.label, e);
                    }
                }

                this.cdr.detectChanges();

                // 3. Detect Transitions
                const oldHifz = oldTasks?.new_memorization;
                const newHifz = this.dailyTasks.new_memorization;
                if (oldHifz && newHifz) {
                    const oldStart = (oldHifz as any).resolvedVerseKey || (oldHifz as any).verse;
                    const newStart = (newHifz as any).resolvedVerseKey || (newHifz as any).verse;
                    if (oldStart !== newStart) {
                        console.log('🔄 [Mushaf] Hifz Task Changed. Resetting Session Counter.');
                        this.sessionCounters.versesMemorized = 0;
                        // Reset: Clear verse key guard but NOT the page guard if we are still on that page
                        if (this.lastSyncedVerseKey.startsWith(`${oldStart}:`)) {
                            this.lastSyncedVerseKey = '';
                        }

                        if (this.isMemorizationMode && (this.currentTaskType === 'hifz' || this.currentTaskType === 'new_memorization')) {
                            console.log(`🚀 [Mushaf] Sabiq Advance: Auto-navigating to new Hifz task location.`);
                            this.navigateToTask('hifz', true, true); // Pass seamless=true and resume=true
                        }
                    }
                }

                // Others (Revision/Recitation)
                ['muraja', 'tilawo', 'deepMuraja'].forEach(type => {
                    let taskType = '';
                    if (type === 'muraja') taskType = 'consolidation';
                    else if (type === 'deepMuraja') taskType = 'revision';
                    else taskType = 'recitation';

                    const oldT = (oldTasks as any)[taskType];
                    const newT = (this.dailyTasks as any)[taskType];

                    if (oldT && newT) {
                        const oldStart = (oldT as any).startPage || (oldT as any).resolvedPage;
                        const newStart = (newT as any).startPage || (newT as any).resolvedPage;
                        if (oldStart !== newStart) {
                            console.log(`🔄 [Mushaf] ${type} Task Changed. Resetting Session Counter.`);
                            if (type === 'muraja' || type === 'deepMuraja') {
                                this.sessionCounters.pagesReviewed = 0;
                                this.sessionCounters.versesReviewed = 0;
                            } else {
                                this.sessionCounters.pagesRead = 0;
                            }
                            (this.initialTaskProgress as any)[type] = (newT as any).dailyAmountDone || 0;
                            // CRITICAL: Do NOT reset this.lastSyncedPage here. 
                            // Resetting it allows a second sync of the same page against the new task,
                            // causing a double-advance (skipped page).

                            // AUTO-NAVIGATE: If the task advanced while in session, move to the new page!
                            // This prevents the current page verses from becoming "Inactive" and losing revision logic.
                            if (this.isMemorizationMode) {
                                // NEW: We only auto-advance for New Memorization (hifz).
                                // For Revision and Recitation, we let the user finish their session.
                                // Auto-navigation here causes the "Jump to extra" bug.
                                /*
                                const activeTaskType = (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') ? 'revision' :
                                    (this.currentTaskType === 'recitation' || this.currentTaskType === 'tilawo') ? 'recitation' : 'consolidation';
                                const syncTypeToCompare = (activeTaskType === 'revision') ? 'deepMuraja' : (activeTaskType === 'recitation' ? 'tilawo' : 'muraja');
     
                                if (type === syncTypeToCompare && type !== 'tilawo') {
                                    console.log(`🚀 [Mushaf] Sabiq Advance: Auto-navigating to new ${activeTaskType} task location.`);
                                    this.navigateToTask(activeTaskType, true); // Pass seamless=true
                                }
                                */
                            }
                        }
                    }
                });

                // 5. Rebuild session ayahs if task changed (GUARDED)
                if (!this.isMemorizationMode) {
                    this.prepareSessionAyahs();
                } else {
                    console.log('[Mushaf] Session Active. Delaying sessionAyahs rebuild until session exit.');
                }

                if (res.quranProgress) {
                    this.quranProgress = res.quranProgress;
                }
                this.cdr.detectChanges();
            },
            error: (err) => console.error('❌ [MushafPage] loadDailyTasks failed:', err)
        });

        // 2. Load Plan Config (for setup status and content)
        this.hifzPlanService.getPlan().pipe(takeUntil(this.destroy$)).subscribe(res => {
            if (res.success && res.plan) {
                this.hifzPlanSetupComplete = res.plan.isSetupComplete;
                this.hifzPlanStats = res.plan.stats;
                if (res.plan.memorizedContent) {
                    this.memorizedVerses = res.plan.memorizedContent.map(v => v.verseKey);
                }
                this.cdr.detectChanges();
            }
        });
    }

    markTaskDone(taskType: string): void {
        console.log('[HifzPlan] Task marked done:', taskType);

        const task = (taskType === 'hifz' || taskType === 'new_memorization') ? this.dailyTasks?.new_memorization :
            (taskType === 'muraja' || taskType === 'consolidation') ? this.dailyTasks?.consolidation :
                (taskType === 'deepMuraja' || taskType === 'revision') ? this.dailyTasks?.revision :
                    this.dailyTasks?.recitation;

        if (!task) return;

        // Determine final sync type
        let syncType: 'tilawo' | 'hifz' | 'muraja' | 'deepMuraja' = 'tilawo';
        if (taskType === 'hifz' || taskType === 'new_memorization') syncType = 'hifz';
        else if (taskType === 'muraja' || taskType === 'consolidation') syncType = 'muraja';
        else if (taskType === 'deepMuraja' || taskType === 'revision') syncType = 'deepMuraja';

        const targetAmount = this.getTaskTargetInBaseUnits(task);
        const unit = (syncType === 'hifz') ? 'verses' : (task.unit || 'page');

        // NEW: If we have session ayahs, pass them to ensure wardHistory is updated!
        const versesToSync = (syncType === 'hifz') ? this.sessionAyahs : [];

        // FIX: For Hifz, pass the LAST verse of the session as currentPosition so Mutabaa advances from there
        let currentPos = null;
        if (syncType === 'hifz' && versesToSync.length > 0) {
            currentPos = { verseKey: versesToSync[versesToSync.length - 1] };
        }

        this.mutabaaService.updateTaskStatus(syncType, 'done', targetAmount, unit, currentPos, versesToSync).subscribe({
            next: (res) => {
                if (res.success) {
                    this.loadDailyTasks(); // Refresh UI
                }
            }
        });
    }

    // Helper methods for dashboard display
    getNewMemorizationLabel(): string {
        const task = this.dailyTasks?.new_memorization;
        const totalMemorized = this.quranProgress?.versesMemorized || 0;
        if (totalMemorized >= 6236) {
            return 'الحمد لله الذي بنعمته تتم الصالحات (تم ختم القرآن الكريم)';
        }
        if (task && task.surah && task.verse) {
            const surah = this.allSurahs.find(s => s.id === task.surah);
            const surahName = surah ? surah.name : `سورة ${task.surah}`;
            const startLabel = (task.status === 'done') ? 'البداية التالية' : 'البداية';
            return `${task.label} (${startLabel}: ${surahName} آية ${task.verse})`;
        }
        return task?.label || 'الحفظ الجديد';
    }


    getRecitationUnitLabel(): string {
        const unit = this.dailyTasks?.recitation?.unit;
        if (unit === 'page') return 'صفحة';
        if (unit === 'half_hizb') return 'نصف حزب';
        if (unit === 'hizb') return 'حزب';
        if (unit === 'juz') return 'جزء';
        return 'صفحة';
    }

    getRecitationLabel(): string {
        return this.dailyTasks?.recitation?.label || 'ورد التلاوة';
    }

    getRecitationDetails(): string {
        // If done, we just show the backend label which ALREADY advanced because the cursor moved
        if (this.dailyTasks?.recitation?.status === 'done' || this.getTilawoProgressPercent() >= 100) {
            return this.dailyTasks?.recitation?.label || 'ورد التلاوة';
        }

        // Use backend label but strip "من" if present for consistency
        if (this.dailyTasks?.recitation?.label) {
            let label = this.dailyTasks.recitation.label;
            if (label.startsWith('من ')) label = label.substring(3);
            return label;
        }
        const currentPage = this.quranProgressService.getCurrentProgress()?.lastPage || 1;
        return `متابعك عند صفحة ${currentPage}`;
    }

    getTaskStatusText(task: any): string {
        if (!task) return 'بانتظار البدء';

        const total = task.amount || 1;
        let unit = 'صفحة';
        const unitType = task.unit || task.target;

        if (unitType === 'juz') unit = 'جزء';
        else if (unitType === 'hizb') unit = 'حزب';
        else if (unitType === 'verse' || unitType === 'verses') unit = 'آية';
        else if (unitType === 'half_page') unit = 'نصف صفحة';

        // Logic moved to final percent calculation below

        // FIX: Use session counters for active tasks to match progress bar
        // FIX: Use dailyAmountDone (today's progress) instead of amountDone when not in active session
        let done = (task.dailyAmountDone !== undefined ? task.dailyAmountDone : task.amountDone) || 0;

        // Add session progress if we're actively in this task type
        if (task.type === 'recitation' && this.currentTaskType === 'recitation') {
            done = (this.initialTaskProgress['tilawo'] || 0) + this.sessionCounters.pagesRead;
            // FIX: Update task.dailyAmountDone locally for immediate UI update
            if (task.dailyAmountDone !== done) {
                task.dailyAmountDone = done;
            }
        } else if ((task.type === 'revision' || task.type === 'deepMuraja') &&
            (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja')) {
            done = (this.initialTaskProgress['deepMuraja' as any] || 0) + this.sessionCounters.pagesReviewed;
            // FIX: Update task.dailyAmountDone locally for immediate UI update
            if (task.dailyAmountDone !== done) {
                task.dailyAmountDone = done;
            }
        } else if (task.type === 'consolidation' && this.currentTaskType === 'consolidation') {
            const initial = this.initialTaskProgress['rabt'] || 0;
            done = initial + (task.unit === 'verses' ? this.sessionCounters.versesReviewed : this.sessionCounters.pagesReviewed);
            // FIX: Update task.dailyAmountDone locally for immediate UI update
            if (task.dailyAmountDone !== done) {
                task.dailyAmountDone = done;
            }
        }

        // NORMALIZE: If the task is in Juz/Hizb, the 'done' value (often in pages internally) 
        // needs to be scaled back to the unit for display accuracy.
        let displayDone = done;
        const label = task.label || '';
        const isPageHifz = (task.type === 'new_memorization' || task.type === 'hifz') &&
            (unitType === 'page' || unitType === 'pages' || label.includes('صفحة') || label.includes('صفحه') || label.includes('صفحات'));
        const isHalfPageHifz = (task.type === 'new_memorization' || task.type === 'hifz') &&
            (unitType === 'half_page' || label.includes('نصف صفحة') || label.includes('نصف صفحه'));

        if (unitType === 'juz') displayDone = done / 20;
        else if (unitType === 'hizb') displayDone = done / 10;
        else if (unitType === 'half_hizb') displayDone = done / 5;
        else if (unitType === 'rub_hizb') displayDone = done / 2.5;
        else if (isPageHifz) {
            displayDone = done / 15; // Rough page conversion for UI consistency
        } else if (isHalfPageHifz) {
            displayDone = done / 8; // Rough half-page conversion
        }

        const visualDone = displayDone;
        const formattedDone = Number.isInteger(visualDone) ? visualDone : visualDone.toFixed(1);

        // Use base target for accurate percentage
        const baseTarget = this.getTaskTargetInBaseUnits(task);
        let finalPercent = Math.min(Math.round((done / baseTarget) * 100), 100);

        // FIX: If task is explicitly done, force 100% display even if count is low (e.g. short page)
        if (task.status === 'done') {
            finalPercent = Math.max(finalPercent, 100);
            // Also ensure the text reflects completion if it's lagging
            if (visualDone < total) {
                return `100% (${total} ${unit} من أصل ${total})`;
            }
        }

        return `${finalPercent}% (${formattedDone} ${unit} من أصل ${total})`;
    }

    getAllTasksCompletedStreak(): number {
        // FIX: Calculate streak only if all four daily tasks are completed
        if (!this.dailyTasks) return 0;

        const allTasks = [
            this.dailyTasks.recitation,
            this.dailyTasks.revision,
            this.dailyTasks.consolidation,
            this.dailyTasks.new_memorization
        ];

        // Check if all tasks exist and are done
        const allCompleted = allTasks.every(task => task && task.status === 'done');

        // Only return streak if all tasks are completed, otherwise return 0
        return allCompleted ? (this.dailyTasks?.streak || 0) : 0;
    }

    getConsolidationDetails(): string {
        // If done, show next proposed action
        if (this.dailyTasks?.consolidation?.status === 'done' || this.getConsolidationProgressPercent() >= 100) {
            return 'القادم: مراجعة مجموعة جديدة';
        }

        const verses = this.dailyTasks?.consolidation?.verses;
        if (!verses || verses.length === 0) return 'لا توجد مراجعة اليوم';
        return `مراجعة ${verses.length} آية (آخر 7 أوراد)`;
    }

    private calculateNextVerseKey(currentVerseKey: string): string {
        const parts = currentVerseKey.split(':');
        if (parts.length < 2) return currentVerseKey;

        const surahId = parseInt(parts[0]);
        const verseNum = parseInt(parts[1]);
        const surah = this.allSurahs.find(s => s.id === surahId);

        if (!surah) return currentVerseKey;

        if (verseNum < surah.verses_count) {
            return `${surahId}:${verseNum + 1}`;
        } else if (surahId < 114) {
            // Next Surah
            return `${surahId + 1}:1`;
        }

        return currentVerseKey; // End of Quran
    }

    getRevisionLabel(): string {
        const label = this.dailyTasks?.revision?.label;
        return label ? `${label} (محفوظ سابقاً)` : 'محفوظ سابقاً';
    }

    getRevisionDetails(): string {
        // If done, show next proposed action
        if (this.getRevisionProgressPercent() >= 100) {
            const amount = this.dailyTasks?.revision?.amount || 1;
            const unitType = this.dailyTasks?.revision?.unit || this.dailyTasks?.revision?.target;
            const unit = unitType === 'juz' ? 'أجزاء' : (unitType === 'half_page' ? 'أنصاف صفحات' : 'صفحات');
            return `القادم: ${amount} ${unit} إضافية للمراجعة`;
        }

        if (this.dailyTasks?.revision?.label) {
            return `مطلوب مراجعة: ${this.dailyTasks.revision.label}`;
        }
        return 'التالي في خطتك (تلقائي)';
    }

    getNewMemorizationDetails(): string {
        const task = this.dailyTasks?.new_memorization;
        if (!task) return 'اضغط للبدء';

        const currentRange = this.memorizationSettings.range;
        const preferredUnit = (currentRange === 'page') ? 'page' : ((currentRange === 'surah' || currentRange === 'custom') ? 'verse' : ((currentRange === 'half_page') ? 'half_page' : 'verse'));

        // If done, show specific next proposed action
        if (task.status === 'done' || this.getHifzProgressPercent() >= 100) {
            const next = this.calculateNextTaskStart(task, preferredUnit, true);
            if (next.surahName) {
                return `القادم: سورة ${next.surahName} - آية ${next.verse}`;
            }
            if (next.page) {
                return `القادم: صفحة ${next.page}`;
            }
            if (next.verse) {
                return `القادم: آية ${next.verse}`;
            }

            const amount = task.amount || 1;
            const unitType = preferredUnit as string;
            let unit = 'صفحات';
            if (unitType === 'verse' || unitType === 'verses') unit = 'آيات';
            else if (unitType === 'half_page') unit = 'أنصاف صفحات';

            return `القادم: ${amount} ${unit} جديدة للحفظ`;
        }

        if (task.label) return `مطلوب حفظ: ${task.label}`;
        return 'اضغط للبدء';
    }

    private calculateNextTaskStart(task: any, preferredUnit?: string, isSabiq: boolean = false): { surah?: number, verse?: number, page?: number, surahName?: string } {
        const unit = preferredUnit || task.unit || task.target || 'verse';
        const startSurah = Number(task.surah || task.surahId || task.surah_id || task.position?.surah || 1);
        const startVerse = Number(task.verse || task.verseNumber || task.verse_number || task.position?.verse || 1);
        const startPage = Number(task.resolvedPage || task.page || task.startPage || task.start_page || task.position?.page || 1);

        // 1. Coordinates from backend (startSurah/verse/page) already reflect the live cursor.
        // Even for Sabiq, we just start at the current cursor because it points to the next pending unit.
        // Adding 'done' here would result in a double-jump (skipping content).

        if (unit === 'page' || unit === 'half_page' || unit === 'juz') {
            return { page: startPage };
        }

        // Default: Verse-based
        return { surah: startSurah, verse: startVerse };
    }

    private getTaskTargetInBaseUnits(task: any): number {
        if (!task) return 1;
        const unit = task.unit || task.target || 'verse';
        const amount = task.amount || 1;

        if (task.type === 'new_memorization' || task.type === 'hifz') {
            // Hifz logic: base unit is 'verses'
            const label = task.label || '';
            const isPageUnit = unit === 'page' || unit === 'half_page' || unit === 'pages' ||
                label.includes('صفحة') || label.includes('صفحه') || label.includes('صفحات');

            if (isPageUnit) {
                const isHalfPage = unit === 'half_page' || label.includes('نصف صفحة') || label.includes('نصف صفحه');
                // Priority 1: If we have an active session, use CURRENT session length 
                // (This is the actual count of verses extracted from the page(s))
                if (this.isMemorizationMode && this.sessionAyahs.length > 0) {
                    return this.sessionAyahs.length;
                }

                // Priority 2: Rough estimate based on typical Mushaf page/half-page
                return isHalfPage ? (amount * 8) : (amount * 15);
            }
            return amount; // Already in verses
        }

        if (task.type === 'recitation' || task.type === 'tilawo' || task.type === 'revision' || task.type === 'consolidation' || task.type === 'deepMuraja') {
            // Recitation/Revision logic: base unit is 'pages'
            if (unit && unit.toLowerCase().includes('verse')) {
                // For Rabt (Linking), we return amount as verses
                return amount || 1;
            }
            if (unit === 'juz') return amount * 20;
            if (unit === 'hizb') return amount * 10;
            if (unit === 'half_hizb') return amount * 5;
            if (unit === 'rub_hizb') return amount * 2.5;
            return Math.max(1, amount); // Already in pages
        }

        return amount;
    }

    getHifzProgressPercent(): number {
        if (!this.dailyTasks?.new_memorization) return 0;

        // Session Stability: Use session counters relative to session length when in session
        if (this.isMemorizationMode && this.sessionAyahs.length > 0) {
            return Math.min(100, Math.round((this.sessionCounters.versesMemorized / this.sessionAyahs.length) * 100));
        }

        const task = this.dailyTasks.new_memorization;
        const target = this.getTaskTargetInBaseUnits(task);
        const done = (task.amountDone || 0);

        // FIX: If marked done, ALWAYS return at least 100% to trigger "Sabiq" stats
        if (task.status === 'done') return 100;

        if (task.status === 'done' && done === 0) return 100;

        const pct = Math.min(Math.round((done / target) * 100), 100);
        // Only log if it's strangely 100 while done < target
        if (pct === 100 && done < target) {
            console.log(`[Mushaf] Hifz 100% mismatch? Done=${done}, Target=${target}, Unit=${task.unit}`);
        }
        return pct;
    }

    getConsolidationProgressPercent(): number {
        if (!this.dailyTasks?.consolidation) return 0;
        const task = this.dailyTasks.consolidation;

        // If status is done, always 100
        if (task.status === 'done') return 100;

        const target = task.amount || (task.verses ? task.verses.length : 0);
        if (target === 0) return 100;

        const done = task.amountDone || 0;
        return Math.min(Math.round((done / target) * 100), 100);
    }

    get isHifzBlocked(): boolean {
        // FAIL-SAFE: If dailyTasks is loading (undefined/null), we must assume BLOCKED 
        // to prevent the lock from flickering/disappearing during plan transitions (e.g. changing settings).
        if (!this.dailyTasks) return true;

        // STRICT LOCK: Hifz is blocked only IF Al-Rabt (Linking) is pending AND 7 wards reached.
        const con = this.dailyTasks.consolidation;
        const unlinkedCount = this.dailyTasks.stats?.unlinkedWardsCount || 0;

        if (!con) return false;

        // If explicitly done, not blocked.
        if (con.status === 'done') return false;

        // Otherwise (pending status), block ONLY if we reached the 7-ward limit.
        return unlinkedCount >= 7;
    }

    get hasConsolidationContent(): boolean {
        // Show the card content if there are verses OR an amount OR a label.
        // This ensures "Half Page" tasks (which might lack explicit verses array initially) are shown.
        const con = this.dailyTasks?.consolidation;
        return !!(con && (con.verses?.length > 0 || con.amount > 0 || con.label));
    }

    getRevisionProgressPercent(): number {
        if (!this.dailyTasks?.revision && !this.dailyTasks?.consolidation) return 0;
        const isDeep = this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja';
        const isRabt = this.currentTaskType === 'consolidation';
        const task = isDeep ? this.dailyTasks.revision : this.dailyTasks.consolidation;
        if (!task) return 0;

        const target = this.getTaskTargetInBaseUnits(task);
        if (target <= 0) return 0;

        // Force 100% if status is done, unless actively exceeding
        if (task.status === 'done' && !this.isMemorizationMode) return 100;

        // Active Session Progress - Calculate dynamically from session counters
        if (this.isMemorizationMode) {
            if (isDeep) {
                const initial = this.initialTaskProgress['deepMuraja' as any] || 0;
                const done = initial + this.sessionCounters.pagesReviewed;
                // FIX: Update task.dailyAmountDone locally for immediate UI update
                if (task.dailyAmountDone !== done) {
                    task.dailyAmountDone = done;
                }
                return Math.min(Math.round((done / target) * 100), 100);
            }

            if (isRabt && this.sessionAyahs.length > 0) {
                // Rabt is usually verse-based. currentAyahIndex is 0-based index in sessionAyahs.
                // If the session covers the FULL Rabt task, index / length is correct.
                const initial = this.initialTaskProgress['rabt'] || 0;
                const sessionDone = this.sessionCounters.versesReviewed;
                const totalDone = initial + sessionDone;
                // FIX: Update task.dailyAmountDone locally for immediate UI update
                if (task.dailyAmountDone !== totalDone) {
                    task.dailyAmountDone = totalDone;
                }
                return Math.min(Math.round((totalDone / target) * 100), 100);
            }

            // Fallback for other revision modes
            if (this.currentTaskType === 'revision' || this.currentTaskType === 'consolidation' || this.currentTaskType === 'muraja' || this.currentTaskType === 'deepMuraja') {
                const typeKey = (this.currentTaskType === 'consolidation') ? 'rabt' :
                    (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') ? 'deepMuraja' : 'muraja';
                const initial = (this.initialTaskProgress as any)[typeKey] || 0;
                const done = initial + (task.unit === 'verses' ? this.sessionCounters.versesReviewed : this.sessionCounters.pagesReviewed);
                // FIX: Update task.dailyAmountDone locally for immediate UI update
                if (task.dailyAmountDone !== done) {
                    task.dailyAmountDone = done;
                }
                return Math.min(Math.round((done / target) * 100), 100);
            }
        }

        // FIX: Use dailyAmountDone (today's progress) instead of amountDone (total progress)
        // This ensures the progress reflects the actual daily completion
        const done = (task.dailyAmountDone !== undefined ? task.dailyAmountDone : task.amountDone) || 0;
        return Math.min(Math.round((done / target) * 100), 100);
    }

    getTilawoProgressPercent(): number {
        if (!this.dailyTasks?.recitation) return 0;
        const task = this.dailyTasks.recitation;

        const target = this.getTaskTargetInBaseUnits(task);
        if (target <= 0) return 0;

        // Force 100% if status is done, provided we aren't in an active "excess" session
        if (task.status === 'done' && this.currentTaskType !== 'recitation') return 100;

        // FIX: For recitation, use session counters if we are in a recitation session (regardless of isMemorizationMode)
        // isMemorizationMode is only for Hifz/Muraaja interactive modes
        // FIX: Use dailyAmountDone (today's progress) instead of amountDone when not in active session
        let done = (this.currentTaskType === 'recitation') ?
            ((this.initialTaskProgress['tilawo'] || 0) + this.sessionCounters.pagesRead) :
            (task.dailyAmountDone !== undefined ? task.dailyAmountDone : task.amountDone) || 0;

        // FIX: Update task.dailyAmountDone locally for immediate UI update during active session
        // This ensures the progress updates dynamically after each page, not just at the end
        // Similar to revision progress, this provides real-time feedback
        if (this.currentTaskType === 'recitation') {
            if (task.dailyAmountDone !== done) {
                task.dailyAmountDone = done;
            }
        }

        return Math.min(Math.round((done / target) * 100), 100);
    }

    async setHalfPageRange(half: 'first' | 'second'): Promise<void> {
        this.memorizationSettings.selectedHalf = half;
        const page = this.pageNumber;
        try {
            const splits = await firstValueFrom(this.dataService.getPageSplits());
            const pData = splits.find(s => s.page === page);

            if (pData && pData.split) {
                const splitAyah = Number(pData.split.ayah);
                const splitSurah = Number(pData.split.surah);

                // CRITICAL: Always sync targetSurah with the split's surah to ensure correct filtering
                this.memorizationSettings.targetSurah = splitSurah;

                if (half === 'first') {
                    this.memorizationSettings.surahStartVerse = 1;
                    this.memorizationSettings.surahEndVerse = splitAyah;
                } else {
                    this.memorizationSettings.surahStartVerse = splitAyah + 1;
                    const meta = await firstValueFrom(this.dataService.getMetadata());
                    const surahMeta = meta.surahs.find(s => s.id === splitSurah);
                    this.memorizationSettings.surahEndVerse = surahMeta ? surahMeta.verses_count : 999;
                }

                console.log(`[Mushaf] Set half-page: ${half}. Split at Surah ${splitSurah}, Verse ${splitAyah}`);
            } else {
                console.warn('No split data found for this page, defaulting to whole page.');
                this.memorizationSettings.surahStartVerse = 1;
                this.memorizationSettings.surahEndVerse = 999;

                // Fix: MushafPage doesn't have .verses, use extractVerseKeys
                // Fix: MushafPage doesn't have .verses, use extractVerseKeys
                const allAyahs = this.extractVerseKeys(
                    [this.currentMushafPage].filter((p): p is EnrichedMushafPage => !!p)
                );
                if (allAyahs.length > 0) {
                    const firstV = allAyahs[0];
                    this.memorizationSettings.targetSurah = Number(firstV.split(':')[0]);
                }
            }
        } catch (e) {
            console.error('Error setting half page:', e);
        }
    }

    onSurahSelected(surahId: any): void {
        const id = Number(surahId);
        this.memorizationSettings.targetSurah = id;
        this.memorizationSettings.surahStartVerse = 1;
        this.dataService.getMetadata().subscribe(meta => {
            const s = meta.surahs.find(x => x.id === id);
            if (s) this.memorizationSettings.surahEndVerse = s.verses_count;
        });
    }


    // Bookmark Methods
    updateBookmarkStatus(): void {
        this.isPageBookmarked = this.bookmarkService.isPageBookmarked(this.pageNumber);
    }

    openBookmarkDialog(): void {
        this.bookmarkTitle = `صفحة ${this.pageNumber}`;
        this.showBookmarkDialog = true;
        this.cdr.detectChanges();
    }

    closeBookmarkDialog(): void {
        this.showBookmarkDialog = false;
        this.cdr.detectChanges();
    }

    toggleBookmark(): void {
        if (this.isPageBookmarked) {
            const bookmark = this.bookmarkService.getBookmarkForPage(this.pageNumber);
            if (bookmark) {
                this.bookmarkService.deleteBookmark(bookmark.id);
            }
        } else {
            this.openBookmarkDialog();
        }
    }

    saveBookmark(): void {
        if (!this.bookmarkTitle.trim()) {
            this.bookmarkTitle = `صفحة ${this.pageNumber}`;
        }

        const surahName = this.getCurrentSurahNameByPage(this.pageNumber);
        const juzNumber = this.getCurrentJuzByPage(this.pageNumber);

        const newBookmark: Bookmark = {
            id: Date.now().toString(),
            pageNumber: this.pageNumber,
            surahName: surahName,
            juzNumber: juzNumber,
            title: this.bookmarkTitle,
            createdAt: Date.now()
        };

        this.bookmarkService.addBookmark(newBookmark);
        this.closeBookmarkDialog();
    }

    deleteBookmark(id: string, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        this.bookmarkService.deleteBookmark(id);
    }

    goToBookmark(bookmark: Bookmark): void {
        this.goToPage(bookmark.pageNumber);
        this.isSidebarOpen = false;
        this.cdr.detectChanges();
    }

    async navigateToTask(task: any, seamless: boolean = false, resume: boolean = false): Promise<void> {
        if (!task) return;

        // PREVENT starting Hifz if blocked by Al-Rabt (Linking)
        const isHifz = task.type === 'hifz' || task.type === 'new_memorization' || task === 'hifz' || task === 'new_memorization';
        if (isHifz && this.isHifzBlocked) {
            console.warn('⛔ [Mushaf] Navigation to Hifz blocked: Al-Rabt (Linking) is required first.');
            return;
        }

        // If 'task' is just a type string, find the actual task object
        if (typeof task === 'string') {
            const type = task;
            task = (type === 'hifz' || type === 'new_memorization') ? this.dailyTasks?.new_memorization :
                (type === 'revision' || type === 'deepMuraja') ? this.dailyTasks?.revision :
                    (type === 'recitation' || type === 'tilawo') ? this.dailyTasks?.recitation :
                        this.dailyTasks?.consolidation;
        }

        if (!task) return;

        // NEW: Check for explicit Lock property (from Rabt 7-wird logic)
        if (task.isLocked) {
            console.warn('⛔ [Mushaf] Navigation blocked: Task is locked (requires prerequisites).');
            return;
        }

        if (!seamless) this.isSettingsOpen = false;
        this.currentTaskType = task.type || null;
        const unit = task.unit || task.target || 'page';

        // --- 1. Intelligent Config & Target Resolution ---
        console.log('🤖 [Mushaf] Intelligent Navigation for Task:', task);

        // A. Resolve Target Page First (for accurate split data resolution)
        let target = await this.resolveTaskStartVerse(task, resume);

        // Check if truly complete based on type (using status from backend is more stable here)
        let isTrulyComplete = (task.status === 'done');

        if (isTrulyComplete) {
            const currentRange = this.memorizationSettings.range as string;
            const preferredUnit = (currentRange === 'page') ? 'page' : ((currentRange === 'surah' || currentRange === 'custom') ? 'verse' : ((currentRange === 'half_page') ? 'half_page' : 'verse'));

            const nextTarget = this.calculateNextTaskStart(task, preferredUnit, true);
            if (nextTarget) {
                target = {
                    page: nextTarget.page || (nextTarget.surah && nextTarget.verse ? await firstValueFrom(this.dataService.getPageNumberForVerse(nextTarget.surah, nextTarget.verse)) : 1),
                    verseKey: nextTarget.surah && nextTarget.verse ? `${nextTarget.surah}:${nextTarget.verse}` : (target?.verseKey || '')
                };

                // Update the task object temporarily so the range/unit logic below uses these new values
                if (nextTarget.surah) task.surahId = task.surah = nextTarget.surah;
                if (nextTarget.verse) task.verseNumber = task.verse = nextTarget.verse;
                if (nextTarget.page) {
                    task.page = task.startPage = nextTarget.page;
                    (task as any).resolvedPage = nextTarget.page; // CRITICAL: Sync resolvedPage for filtering logic
                    // FIX: Update label to reflect the jump, otherwise header says "Page 2" while showing Page 3.
                    if (task.summary) {
                        task.summary = task.summary.replace(/\d+/, nextTarget.page.toString());
                    }
                    if (task.description) {
                        task.description = `متابعة: صفحة ${nextTarget.page}`;
                    }
                }

                // If the next jump is into the middle of a page, ensure we use 'verses' unit for the logic below
                // FIX: DELETED incorrect override. Standard pages often start mid-surah (e.g. Page 2 starts at Verse 6).
                // Forced 'verses' unit broke the Page View mode. We should trust 'unit'.
                /*
                const vNum = nextTarget.verse || 1;
                if (vNum > 1 && (unit === 'page' || unit === 'pages')) {
                    (task as any).unit = 'verses';
                }
                */
            }
        }

        (task as any).resolvedPage = target?.page; // Store resolved page for progress tracking
        (task as any).resolvedVerseKey = target?.verseKey;

        // Reset session counters
        this.sessionCounters.pagesRead = 0;
        this.sessionCounters.versesMemorized = 0;
        this.sessionCounters.pagesReviewed = 0;
        this.lastSyncedPage = -1;
        this.lastSyncedVerseKey = '';
        this.sessionStartPage = Number(task.page || task.startPage || 1);
        this.sessionTargetAmount = this.getTaskTargetInBaseUnits(task); // FIX: Always use base units (pages/verses) for range checking
        this.completedTasks.delete(task.type);

        const targetPage = target?.page || Number(task.page || task.startPage || 1);
        if (!(task.surah || task.surahId || task.surah_id || (task.position && task.position.surah))) {
            if (targetPage === 1) this.memorizationSettings.targetSurah = 1;
        }

        // B. Set Mode & Header
        if (!seamless) {
            this.isMemorizationMode = false; // Always start with options selection
        }
        this.currentTaskType = task.type;

        if (task.type === 'new_memorization') {
            this.memorizationSettings.type = 'hifz';
            this.memorizationSettings.hideType = 'ayah'; // Force hide for new memorization
            // FIX: Reset initial progress for accurate session tracking
            this.initialTaskProgress['hifz'] = task.amountDone || 0;
        } else if (task.type === 'recitation') {
            this.memorizationSettings.type = 'recitation';
            this.initialTaskProgress['tilawo'] = task.amountDone || 0;
            // FIX: Automatically enable reading mode for recitation so timer-based awarding works
            this.isReadingActive = true;
            this.pageStartTime = Date.now();
        } else {
            // covers 'revision', 'consolidation', 'muraaja', etc.
            this.memorizationSettings.type = 'muraaja';
            this.memorizationSettings.hideType = 'ayah'; // Force hide for revision modes
            // FIX: Automatically enable reading mode for revision so timer-based awarding works
            this.isReadingActive = true;
            this.pageStartTime = Date.now();

            // FIX: Set initial baseline based on specific sub-type
            if (task.type === 'revision' || task.type === 'deepMuraja') {
                this.initialTaskProgress['deepMuraja' as any] = task.amountDone || 0;
            } else if (task.type === 'consolidation') {
                this.initialTaskProgress['rabt'] = task.amountDone || 0;
            } else {
                this.initialTaskProgress['muraja'] = task.amountDone || 0;
            }

            // SETTINGS ISOLATION: For Revision/Recitation, repetition is usually not desired
            // unless explicitly set. We reset it to 1 to prevent Hifz settings from bleeding.
            this.memorizationSettings.ayahRepeat = 1;
            this.memorizationSettings.groupRepeat = 1;
        }

        // SYNC RECITER: Proactively set the reciter for the audio service for Hifz/Muraaja tasks
        // This ensures the dashboard and background services show the correct reciter even before Play is pressed.
        const isHifzMode = task.type === 'hifz' || task.type === 'new_memorization' || task.type === 'revision' || task.type === 'consolidation' || task.type === 'muraaja';
        if (isHifzMode) {
            await this.audioService.setReciter(this.hifzReciterId, false);
        }

        // C. Set Range and Values
        // Backend might use 'unit' or 'target' for the range type (e.g. 'half_page', 'verses', 'page')
        console.log(`🎯 [Mushaf] Detected Task Unit/Target: ${unit}`);
        const sId = task.surah || task.surahId || task.surah_id || (task.position ? task.position.surah : 0);
        if (sId) this.memorizationSettings.targetSurah = Number(sId);

        if (unit === 'page' || unit === 'pages') {
            const multiSurah = task.surah_id === 0 || !task.surah_id; // Approximation, better check with availableSurahs if possible
            this.memorizationSettings.range = (task.type === 'new_memorization' || task.type === 'hifz') ? 'surah' : 'page';
            let resolvedStartVerse = target?.verseKey ? parseInt(target.verseKey.split(':')[1]) : Number(task.verse || 1);

            if (task.type !== 'new_memorization' && task.type !== 'hifz') {
                resolvedStartVerse = 1;
            }

            this.memorizationSettings.surahStartVerse = resolvedStartVerse;
            // NEW: Always store full start key for multi-surah robustness
            const startSurah = sId || target?.verseKey?.split(':')[0] || 1;
            this.memorizationSettings.customStartVerse = target?.verseKey ? target.verseKey : `${startSurah}:${resolvedStartVerse}`;

            // Resolve end verse of the LAST page of the task for strict boundary commitment
            const amount = task.amount || 1;
            const endPage = Math.min(604, targetPage + amount - 1);
            const pData = await firstValueFrom(this.dataService.getPage(endPage));
            if (pData) {
                const lastLine = [...pData.lines].reverse().find(l => l.type === 'verse');
                if (lastLine && lastLine.segments) {
                    const lastSeg = lastLine.segments[lastLine.segments.length - 1];
                    if (lastSeg && lastSeg.verse_key) {
                        this.memorizationSettings.surahEndVerse = parseInt(lastSeg.verse_key.split(':')[1]);
                        this.memorizationSettings.customEndVerse = lastSeg.verse_key;
                    } else {
                        this.memorizationSettings.surahEndVerse = 999;
                        this.memorizationSettings.customEndVerse = '';
                    }
                } else {
                    this.memorizationSettings.surahEndVerse = 999;
                    this.memorizationSettings.customEndVerse = '';
                }
            } else {
                this.memorizationSettings.surahEndVerse = 999;
                this.memorizationSettings.customEndVerse = '';
            }
        }
        else if (unit === 'verses' || unit === 'verse') {
            this.memorizationSettings.range = 'surah';
            if (task.verses && task.verses.length > 0) {
                const sortedKeys = (task.verses as string[]).map(v => {
                    const [s, a] = v.split(':').map(Number);
                    return { s, a, key: v };
                }).sort((a, b) => a.s !== b.s ? a.s - b.s : a.a - b.a);

                const first = sortedKeys[0];
                const last = sortedKeys[sortedKeys.length - 1];

                if (!sId) this.memorizationSettings.targetSurah = first.s;
                this.memorizationSettings.surahStartVerse = first.a;
                this.memorizationSettings.surahEndVerse = last.a;
            } else if (task.verse || task.verseNumber) {
                const v = Number(task.verse || task.verseNumber);
                const amount = task.amount || 1;
                this.memorizationSettings.surahStartVerse = v;
                this.memorizationSettings.surahEndVerse = v + amount - 1;
            }

            // NEW: Override for Al-Rabt to ensure it covers the FULL amount (7 units)
            // even if history verses were provided as a hint.
            if (task.isRabt) {
                this.memorizationSettings.range = 'daily_ward';
                const start = this.memorizationSettings.surahStartVerse || 1;
                // We set a large end verse to allow spanning; the Ayah selection logic in prepareSessionAyahs
                // will correctly slice exactly 'task.amount' verses.
                this.memorizationSettings.surahEndVerse = 999;
                console.log(`🔗 [Mushaf] Extended Rabt Range: Starting at ${this.memorizationSettings.targetSurah}:${start}, Amount: ${task.amount}`);
            }
        }
        else if (unit === 'half_page') {
            this.memorizationSettings.range = 'half_page';
            try {
                const splits = await firstValueFrom(this.dataService.getPageSplits());
                const pData = splits.find(s => s.page === targetPage);

                if (pData && pData.split) {
                    const splitAyah = Number(pData.split.ayah);
                    const startVerseNum = Number(task.verse || task.verseNumber || 1);

                    if (startVerseNum > splitAyah) {
                        this.memorizationSettings.selectedHalf = 'second';
                        this.memorizationSettings.surahStartVerse = splitAyah + 1;
                        const meta = await firstValueFrom(this.dataService.getMetadata().pipe(take(1)));
                        const s = meta.surahs.find(x => x.id === Number(sId || pData.split.surah));
                        if (s) this.memorizationSettings.surahEndVerse = s.verses_count;
                    } else {
                        this.memorizationSettings.selectedHalf = 'first';
                        this.memorizationSettings.surahStartVerse = 1;
                        this.memorizationSettings.surahEndVerse = splitAyah;
                    }
                }
            } catch (err) { console.warn('⚠️ [Mushaf] Failed splits config', err); }
        }
        else if (unit === 'juz') {
            this.memorizationSettings.range = 'juz';
        }

        // --- 2. Precise Navigation Logic ---
        this.keepOptionsSheet = true; // Prevent loadPage from closing the sheet
        if (target) {
            console.log(`📍 [Mushaf] Precise Target: Page ${target.page}, Verse ${target.verseKey}`);
            this.goToPage(target.page);

            this.currentPageData$?.pipe(
                filter((p: any) => !!p && p.page_number === target.page),
                take(1)
            ).subscribe(() => {
                // FIX: If Revision/Recitation in Page Mode, don't scroll to specific verse (like Verse 4).
                // Just stay at the top of the page.
                const isReview = task.type !== 'new_memorization' && task.type !== 'hifz';
                const isPageMode = this.memorizationSettings.range === 'page';

                if (isReview && isPageMode) {
                    // Do not scroll to verse. Page top is desired.
                } else {
                    this.scrollToVerse(target.verseKey);
                }
            });
        } else {
            console.warn('⚠️ [Mushaf] Fallback navigation.');
            this.handleStandardNavigation(task);
        }

        // --- 3. Finalize UI State ---
        if (seamless) {
            // FIX: Race Condition Protection
            // Ensure we have the target page data BEFORE starting the session.
            // This prevents sessionAyahs from being populated with stale (old page) data.
            const targetPage = target?.page || Number(task.page || task.startPage || 1);
            if (this.pageNumber !== targetPage) {
                console.log(`⏳ [Mushaf] Awaiting page data for Page ${targetPage} before session start...`);
                await firstValueFrom(this.currentPageData$?.pipe(
                    filter((p: any) => !!p && p.page_number === targetPage),
                    take(1)
                ) || of(undefined));
            }

            // Seamless Advance: Restart session immediately with new target
            console.log('🔄 [Mushaf] Seamless Restart for Sabiq Advance.');
            await this.startMemorization();
        } else {
            this.showOptionsSheet = true;
        }
        this.keepOptionsSheet = false; // Reset for standard interactions
        this.cdr.detectChanges();
    }

    handleStandardNavigation(task: any): void {
        // Priority 1: Direct Verse/Surah (Precise)
        let surahId = task.surah || task.surahId || task.surah_id || task.position?.surah;
        let verseNumber = task.verse || task.verseNumber || task.position?.verse;

        if (!surahId && task.verses && Array.isArray(task.verses) && task.verses.length > 0) {
            const first = task.verses[0];
            if (typeof first === 'string' && first.includes(':')) {
                const parts = first.split(':');
                surahId = parts[0];
                verseNumber = parts[1];
            }
        }

        if (surahId && verseNumber) {
            this.dataService.getPageNumberForVerse(Number(surahId), Number(verseNumber)).subscribe({
                next: (page: number) => {
                    if (page) this.goToPage(page);
                    else this.navigateToSurahStart(surahId);
                },
                error: () => this.navigateToSurahStart(surahId)
            });
            return;
        }

        // Priority 2: Label Parsing
        if (task.label) {
            const juzMatch = task.label.match(/(?:Juz|الجزء)\s+(\d+)/i);
            if (juzMatch) {
                const juzNum = Number(juzMatch[1]);
                this.goToPage(juzNum === 1 ? 1 : (juzNum - 1) * 20 + 2);
                return;
            }

            const surahMatch = task.label.match(/(?:Surah|سورة)\s+(\d+)/i);
            if (surahMatch) {
                this.navigateToSurahStart(surahMatch[1]);
                return;
            }
        }

        // Fallback: Default to last read page
        const lastPage = this.quranProgressService.getCurrentProgress()?.lastPage || 1;
        this.goToPage(lastPage);
    }

    /**
     * Resolves the exact starting verse key for a task.
     * Handles: 'page' (Verse 1), 'half_page' (Split Logic), 'verses' (First Verse).
     */
    private async resolveTaskStartVerse(task: any, resume: boolean = false): Promise<{ page: number, verseKey: string } | null> {
        let page = Number(task.page || task.startPage || task.start_page || task.position?.page);
        const surah = task.surah || task.surahId || task.surah_id || task.position?.surah;
        const verse = task.verse || task.verseNumber || task.verse_number || task.position?.verse;

        // RESUME FIX: For page-based tasks (recitation/revision), offset by daily progress
        // only when we explicitly want to resume an ongoing task session.
        // This prevents the dashboard button from jumping ahead to the next unread page.
        if (resume && page && task.status !== 'done') {
            const isPageBasedResumable = (task.type === 'recitation' || task.type === 'revision');
            if (isPageBasedResumable) {
                const progress = Number(task.dailyAmountDone || 0);
                const target = Number(task.amount || Infinity);
                if (progress > 0 && progress < target) {
                    page = page + progress;
                    if (page > 604) page = 1; // Wrap around to Al-Fatiha
                    console.log(`📖 [Mushaf] Resume offset applied: +${progress} pages → page ${page}`);
                }
            }
        }

        // If no explicit page, try to fetch it
        if (!page && surah && verse) {
            page = await firstValueFrom(this.dataService.getPageNumberForVerse(surah, verse));
        }

        // --- Rabt (Linking) Logic Override ---
        if (task.isRabt && this.dailyTasks?.new_memorization) {
            const hifzTask = this.dailyTasks.new_memorization;
            // Recursively resolve Hifz start, but HifzTask isn't Rabt so it's safe.
            const hifzStart = await this.resolveTaskStartVerse(hifzTask);

            if (hifzStart) {
                const unit = task.unit || 'page';
                let backPages = 0;
                let isSecondHalf = false;

                if (unit === 'page') {
                    backPages = 6;
                } else if (unit === 'half_page') {
                    // 6 half-pages = 3 full pages. 
                    backPages = 3;
                    isSecondHalf = this.isVerseInSecondHalf(hifzStart.verseKey, hifzStart.page);
                } else if (unit === 'verses' || unit === 'verse') {
                    // Precise verse lookback: task.amount is the total (7 units).
                    // We look back 6 units. Each unit = task.amount / 7.
                    const unitSize = Math.ceil(task.amount / 7);
                    const backVerses = unitSize * 6;

                    // We can use plan.memorizedContent if we are in the guest plan context
                    // and we have that data. But since we already have 'task.verses' 
                    // provided by HifzPlanService as a hint, we can use it.
                    if (task.verses && task.verses.length > 0) {
                        const firstKey = task.verses[0];
                        const [s, v] = firstKey.split(':').map(Number);
                        const p = await firstValueFrom(this.dataService.getPageNumberForVerse(s, v));
                        return { page: p || hifzStart.page, verseKey: firstKey };
                    }
                }

                const resolvedRabtPage = Math.max(1, hifzStart.page - backPages);
                const pageData = await firstValueFrom(this.dataService.getPage(resolvedRabtPage));

                if (pageData && pageData.lines) {
                    let startVerseKey = '';
                    if (unit === 'half_page' && isSecondHalf) {
                        const splits = await firstValueFrom(this.dataService.getPageSplits());
                        const pageSplit = splits.find(s => s.page === resolvedRabtPage);
                        if (pageSplit && pageSplit.split) {
                            // First verse AFTER the split
                            startVerseKey = `${pageSplit.split.surah}:${Number(pageSplit.split.ayah) + 1}`;
                        }
                    }

                    if (!startVerseKey) {
                        // First verse of the page
                        for (const line of pageData.lines) {
                            if (line.type === 'verse' && line.segments && line.segments.length > 0) {
                                startVerseKey = (line.segments as any)[0].verse_key;
                                break;
                            }
                        }
                    }

                    if (startVerseKey) {
                        return { page: resolvedRabtPage, verseKey: startVerseKey };
                    }
                }
            }
        }

        if (!page) return null;

        const unit = task.unit || task.target || 'page';

        // Case A: Specific Verses Array (highest priority)
        if (task.verses && task.verses.length > 0) {
            const verseKey = task.verses[0];
            const [vSurah, vNum] = verseKey.split(':').map(Number);
            const resolvedPage = await firstValueFrom(this.dataService.getPageNumberForVerse(vSurah, vNum));
            return { page: resolvedPage || page, verseKey };
        }

        // Case B: Single Verse (Direct)
        if (surah && verse && (unit === 'verse' || unit === 'verses')) {
            return { page, verseKey: `${surah}:${verse}` };
        }

        if (unit === 'half_page') {
            const splits = await firstValueFrom(this.dataService.getPageSplits());
            const pageSplit = splits.find(s => s.page === page);

            if (pageSplit && pageSplit.split) {
                const splitSurah = Number(pageSplit.split.surah);
                const splitAyah = Number(pageSplit.split.ayah);

                // If explicit verse is provided, use it
                if (surah && verse) {
                    return { page, verseKey: `${surah}:${verse}` };
                }

                // Default half-page behavior: 
                // If the task indicates it's the second half, or if our current position is in the second half
                const vNum = Number(verse || 1);
                if (surah == splitSurah && vNum > splitAyah) {
                    return { page, verseKey: `${surah}:${vNum}` };
                }

                // If we are navigating to a half_page and no verse is specified, we check if it's likely the 2nd half 
                // based on the task description or label (optional enhancement if needed)
            }
        }

        // Case D: Full Page (Start of Page)
        // We get the first verse of the page
        const pageData = await firstValueFrom(this.dataService.getPage(page));
        if (pageData && pageData.lines) {
            for (const line of pageData.lines) {
                if (line.type === 'verse' && line.segments && line.segments.length > 0) {
                    return { page, verseKey: (line.segments as any)[0].verse_key };
                }
            }
        }

        return null;
    }

    private scrollToVerse(verseKey: string): void {
        setTimeout(() => {
            const element = document.getElementById(`verse-${verseKey}`);
            if (element) {
                console.log(`📜 [Mushaf] Scrolling to ${verseKey}`);
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                console.warn(`⚠️ [Mushaf] Element verse-${verseKey} not found for scrolling.`);
            }
        }, 300); // Slight delay for render
    }

    private navigateToSurahStart(surahId: any): void {
        const finalSurahId = Number(surahId);
        this.dataService.getMetadata().subscribe(meta => {
            const surah = meta.surahs.find((s: any) => s.id === finalSurahId);
            if (surah) {
                this.goToPage(surah.start_page);
                this.isSettingsOpen = false;
            } else {
                this.isSettingsOpen = false;
            }
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        if (this.integrityRefreshInterval) clearInterval(this.integrityRefreshInterval);
        if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);
        if (this.rafId) cancelAnimationFrame(this.rafId);

        // Re-allow screen sleep when leaving Mushaf
        if (Capacitor.isNativePlatform()) {
            KeepAwake.allowSleep().catch(err => console.error('[KeepAwake] Failed to allow sleep:', err));
        }
        this.audioService.stop();
    }

    saveReminders(): void {
        // Save to local reminder service (works without server)
        this.localReminderService.scheduleReminders(this.reminderSettings);
        console.log('✅ [LocalReminder] Reminders scheduled locally:', this.reminderSettings);

        // Also try to save to server if available (optional)
        try {
            this.hifzPlanService.saveReminders(this.reminderSettings).subscribe({
                next: (res) => console.log('✅ Reminders saved to server:', res),
                error: (err) => console.warn('⚠️ Failed to save reminders to server (using local only):', err)
            });
        } catch (e) {
            console.warn('⚠️ Server not available, using local reminders only');
        }
    }

    async toggleAndroidNotifications(): Promise<void> {
        if (!this.isAndroid) return;
        try {
            await this.localReminderService.requestPermissions();
        } catch (e) {
            console.error('Error requesting notifications:', e);
        }
    }

    async togglePushNotifications(): Promise<void> {

        try {
            if (!this.pushEnabled) {
                // Subscribe
                const success = await this.pushService.subscribeToNotifications();
                if (success) {
                    this.pushEnabled = true;
                    this.pushSubscribed = true;
                }
            } else {
                // Unsubscribe
                await this.pushService.unsubscribeFromNotifications();
                this.pushEnabled = false;
                this.pushSubscribed = false;
            }
            this.cdr.detectChanges();
        } catch (err) {
            console.error('[Mushaf] Push toggle failed:', err);
            // Revert state on error
            this.pushService.getPermissionStatus().then(statusRes => {
                this.pushEnabled = (statusRes.permission === 'granted');
                this.pushSubscribed = statusRes.hasSubscription;
                this.cdr.detectChanges();
            });
        }
    }



    private loadUserPlan(): void {
        this.loadDailyTasks();
    }

    private getMinStayTime(): number {
        // Exception for first two pages (1 and 2): 5 seconds threshold instead of 30
        return this.pageNumber <= 2 ? 5000 : this.MIN_PAGE_STAY_MS;
    }

    private checkImmediatePointAwarding(): void {
        if (this.isCurrentPageAwarded || this.showOptionsSheet) return;

        const timeSpent = Date.now() - this.pageStartTime;
        const threshold = this.getMinStayTime();

        if (timeSpent >= threshold) {
            this.awardPagePoints();
        }
    }

    private awardPagePoints(): void {
        if (this.isCurrentPageAwarded) return;

        // Ensure the user has spent the minimum required time on the page
        const timeSpent = Date.now() - this.pageStartTime;
        const minRequired = this.getMinStayTime();
        if (timeSpent < minRequired) {
            // Do not award yet; caller may re-invoke after delay
            return;
        }

        if (this.currentTaskType === 'recitation' && this.dailyTasks?.recitation) {
            const task = this.dailyTasks.recitation;
            const target = this.getTaskTargetInBaseUnits(task);
            const currentDone = (this.initialTaskProgress['tilawo'] || 0) + this.sessionCounters.pagesRead;
            if (task.status === 'done' || (target > 0 && currentDone >= target)) {
                return;
            }
        }

        this.isCurrentPageAwarded = true;

        // Award points for completing a page
        this.quranProgressService.addPointsIfLoggedIn('PAGE_COMPLETE', 1);

        // RECITATION LOGIC: Count ALL pages if we are in a recitation session.
        // The range check is for highlighting purposes only; for counting, we trust the session.
        // This enables "Sabik bil Khairat" (Go Beyond) where the user reads extra pages.
        if (this.currentTaskType === 'recitation') {
            this.sessionCounters.pagesRead++;
            this.checkAutoSync('tilawo');
        } else {
            // General reading or other tasks still increment counter for local UI but don't force-sync recitation range
            this.sessionCounters.pagesRead++;
        }

        if (this.isMemorizationMode && this.memorizationSettings.type === 'muraaja') {
            this.quranProgressService.addPointsIfLoggedIn('REVISION_PAGE_COMPLETE' as any, 1);
            this.sessionCounters.pagesReviewed++;
            this.checkAutoSync('muraja');
        }
    }

    isPageVerified(): boolean {
        return this.isReadingActive && (Date.now() - this.pageStartTime) >= this.getMinStayTime();
    }

    isVerseInSecondHalf(verseKey: string, pageNum: number): boolean {
        if (!verseKey) return false;
        const split = this.pageSplits.get(pageNum);
        if (!split) return false;

        // FAST PARSING: Convert verseKey "surah:ayah" to a comparable number (S*1000 + V)
        // This is much faster than multiple split/map/Number calls in a loop
        const firstColon = verseKey.indexOf(':');
        const s = parseInt(verseKey.substring(0, firstColon), 10);
        const v = parseInt(verseKey.substring(firstColon + 1), 10);

        return s > split.surah || (s === split.surah && v > split.ayah);
    }

    // Audio Controls
    loadReciters(): void {
        this.audioService.getReciters().subscribe({
            next: reciters => {
                const validReciters = reciters; // Keeping all reciters now that 2000+ IDs are safe
                console.log(`[MushafPage] Reciters loaded: ${validReciters.length}`);

                // ... MIGRATION logic ...
                const migrations: { [key: number]: number } = {
                    211: 2004, 71: 2004, 210: 2001, 212: 2002, 286: 2003
                };

                if (migrations[this.currentReciterId]) {
                    this.currentReciterId = migrations[this.currentReciterId];
                    localStorage.setItem('selected_reciter_id', this.currentReciterId.toString());
                }

                this.availableReciters = validReciters;
                this.updateFilteredReciters(); // FIX: Update the filtered list immediately


            },
            error: err => {
                console.error('[MushafPage] Failed to load reciters:', err);
            }
        });
    }

    getReciterDisplayName(reciter: any): string {
        if (!reciter.style || reciter.style.trim() === '') {
            return reciter.name;
        }
        // Clean style: remove parentheses and extra spaces
        let cleanStyle = reciter.style.replace(/[()]/g, '').trim();
        // Remove extra spaces
        cleanStyle = cleanStyle.replace(/\s+/g, ' ');
        // If style is meaningful, add it with a dash separator
        if (cleanStyle && cleanStyle.length > 0) {
            return `${reciter.name} - ${cleanStyle}`;
        }
        return reciter.name;
    }

    getSelectedReciterName(): string {
        const reciter = this.availableReciters.find(r => r.id === this.currentReciterId);
        return reciter ? reciter.name : 'اختر القارئ';
    }

    getSelectedReciterImage(): string | null {
        const reciter = this.availableReciters.find(r => r.id === this.currentReciterId);
        return reciter ? this.getReciterImage(reciter) : null;
    }

    getReciterImage(reciter: any): string | null {
        // Map reciter identifiers to their image files
        const imageMap: { [key: string]: string } = {
            // Abdul Basit
            'Abdul Basit': 'abdelbasset-profile.jpeg',
            'Abdulbasit Abdulsamad': 'abdelbasset-profile.jpeg',
            'AbdulBaset AbdulSamad': 'abdelbasset-profile.jpeg',
            'عبد الباسط': 'abdelbasset-profile.jpeg',
            'عبدالباسط عبدالصمد': 'abdelbasset-profile.jpeg',
            // Sudais
            'Abdul Rahman Al-Sudais': 'abdul-rahman-al-sudais-profile.jpeg',
            'عبد الرحمن السديس': 'abdul-rahman-al-sudais-profile.jpeg',
            'Abdurrahman as-Sudais': 'abdul-rahman-al-sudais-profile.jpeg',
            'Sudais': 'abdul-rahman-al-sudais-profile.jpeg',
            // Shatri
            'Abu Bakr al-Shatri': 'abu-bakr-al-shatri-pofile.jpeg',
            'أبو بكر الشاطري': 'abu-bakr-al-shatri-pofile.jpeg',
            'أبو بكر الشاطرى': 'abu-bakr-al-shatri-pofile.jpeg',
            'Abu Bakr Ash-Shaatree': 'abu-bakr-al-shatri-pofile.jpeg',
            // Mishary
            'Mishary Rashid Alafasy': 'mishary-rashid-alafasy-profile.jpeg',
            'مشاري العفاسي': 'mishary-rashid-alafasy-profile.jpeg',
            'Mishary Alafasi': 'mishary-rashid-alafasy-profile.jpeg',
            'Mishari Rashid al-`Afasy': 'mishary-rashid-alafasy-profile.jpeg',
            'Mishari Alafasy': 'mishary-rashid-alafasy-profile.jpeg',
            'مشاري راشد العفاسي': 'mishary-rashid-alafasy-profile.jpeg',
            // Saad
            'Saad Al-Ghamdi': 'saad-al-ghamdi-profile.png',
            'سعد الغامدي': 'saad-al-ghamdi-profile.png',
            'Sa`d al-Ghamidi': 'saad-al-ghamdi-profile.png',
            // Shuraim
            'Saud Al-Shuraim': 'saoud-shuraim-profile.jpeg',
            'سعود الشريم': 'saoud-shuraim-profile.jpeg',
            'Shuraim': 'saoud-shuraim-profile.jpeg',
            // Husary
            'Mahmoud Khalil Al-Hussary': 'mahmoud-khalil-al-hussary-profile.avif',
            'محمود خليل الحصري': 'mahmoud-khalil-al-hussary-profile.avif',
            'Husary': 'mahmoud-khalil-al-hussary-profile.avif',
            'الحصري': 'mahmoud-khalil-al-hussary-profile.avif',
            // Hani
            'Hani ar-Rifai': 'hani-ar-rifai-profile.avif',
            'هاني الرفاعي': 'hani-ar-rifai-profile.avif',
            'Hani Rifai': 'hani-ar-rifai-profile.avif',
            // Minshawi
            'Mohamed Siddiq El-Minshawi': 'mohamed-siddiq-el-minshawi-profile.avif',
            'محمد صديق المنشاوي': 'mohamed-siddiq-el-minshawi-profile.avif',
            'Minshawi': 'mohamed-siddiq-el-minshawi-profile.avif',
            'المنشاوي': 'mohamed-siddiq-el-minshawi-profile.avif',
            // Yasser
            'Yasser Al-Dosari': 'yasser-profile.png',
            'ياسر الدوسري': 'yasser-profile.png',
            'Yasser Ad-Dossari': 'yasser-profile.png',
            // Maher
            'Maher Al-Muaiqly': 'Maher-al-Muaiqly-profile.png',
            'ماهر المعيقلي': 'Maher-al-Muaiqly-profile.png',
            'Maher al-Mueaqly': 'Maher-al-Muaiqly-profile.png',
            // Ahmed Ajmi
            'Ahmed ibn Ali al-Ajmi': 'Ahmed-ibn-Ali-al-Ajmy-profile.png',
            'أحمد العجمي': 'Ahmed-ibn-Ali-al-Ajmy-profile.png',
            'Ahmed Al-Ajmi': 'Ahmed-ibn-Ali-al-Ajmy-profile.png',
            'Ahmad ibn Ali Al-Ajami': 'Ahmed-ibn-Ali-al-Ajmy-profile.png',
            'أحمد بن علي العجمي': 'Ahmed-ibn-Ali-al-Ajmy-profile.png',
            // Bandar
            'Bandar Baleela': 'Bandar-Baleela-profile.png',
            'بندر بليلة': 'Bandar-Baleela-profile.png',
            // Khalifa
            'Khalifa Al-Tunaiji': 'khalifa-al-tunaiji-profile.jpeg',
            'خليفة الطنيجي': 'khalifa-al-tunaiji-profile.jpeg',
            // Abdullah Ali Jabir
            'Abdullah Ali Jabir': 'Abdullah-Ali-Jabir-profile.png',
            'عبدالله علي جابر': 'Abdullah-Ali-Jabir-profile.png',
            // Abdullah Hamad Abu Sharida
            'Abdullah Hamad Abu Sharida': 'Abdullah-Hamad-Abu-Sharida-profile.png',
            'عبدالله حمد أبو شريدة': 'Abdullah-Hamad-Abu-Sharida-profile.png',
            // Muhammad Al-Tablawi
            'Muhammad Al-Tablawi': 'Muhammad Al-Tablawi.jpg',
            'محمد الطبلاوي': 'Muhammad Al-Tablawi.jpg',
            'الطبلاوي': 'Muhammad Al-Tablawi.jpg',
            'Muhammad Tablawi': 'Muhammad Al-Tablawi.jpg',
            // Yasser Salama (EveryAyah)
            'Yasser Salama': 'Yaser_Salamah.jpg',
            'ياسر سلامة': 'Yaser_Salamah.jpg',
            // Mahmoud Ali Al-Banna (EveryAyah)
            'Mahmoud Ali Al-Banna': 'mahmoud_ali_al_banna.jpg',
            'محمود علي البنا': 'mahmoud_ali_al_banna.jpg',
            // Fares Abbad (EveryAyah)
            'Fares Abbad': 'Fares_Abbad.webp',
            'فارس عباد': 'Fares_Abbad.webp',
            // Ali Al-Hudhaify (EveryAyah)
            'Ali Al-Hudhaify': 'Hudhaify.webp',
            'علي عبد الرحمن الحذيفي': 'Hudhaify.webp',
            'الحذيفي': 'Hudhaify.webp',
            // Mustafa Ismail (Archive)
            'Mustafa Ismail': 'Mustafa-Ismail.jpg',
            'مصطفى إسماعيل': 'Mustafa-Ismail.jpg',
            // Hassan Saleh (Full Surah)
            'Hassan Saleh': 'hassan-saleh-profile.jpg',
            'حسن صالح': 'hassan-saleh-profile.jpg',
            // Abdullah Kamel
            'Abdullah Kamel': 'abdullah_kamel.jpg',
            'عبدالله كامل': 'abdullah_kamel.jpg',
            // Abdul Wadood Hanif
            'Abdul Wadood Hanif': 'abdul_wadood_hanif.png',
            'AbdulWadood Hanif': 'abdul_wadood_hanif.png',
            'عبدالودود حنيف': 'abdul_wadood_hanif.png',
            // Idris Abkar
            'Idris Abkar': 'idris_abkar.jpg',
            'إدريس أبكر': 'idris_abkar.jpg',
            // --- NEW RECITERS ---
            'إسلام صبحي': 'islam-sobhi-profile.jpg',
            'منصور السالمي': 'mansour-al-salimi-profile.jpg',
            'وديع اليمني': 'wadih-al-yamani-profile.jpg',
            'رعد الكردي': 'raad-al-kurdi-profile.jpg',
            'خالد الجليل': 'khalid-al-jaleel-profile.jpg',
            'ناصر القطامي': 'nasser-al-qatami-profile.png',
            'عبد الله بصفر': 'Abdullah-Ibn-Ali-Basfar.jpg',
            'محمد أيوب': 'Muhammad_ayop.jpeg'
        };

        // Try to find a matching image
        const imageName = imageMap[reciter.name];
        if (imageName) {
            return `/${imageName}`;
        }

        // Try partial match on name
        for (const [key, value] of Object.entries(imageMap)) {
            if (reciter.name.includes(key) || key.includes(reciter.name)) {
                return `/${value}`;
            }
        }

        return null;
    }

    selectReciter(reciterId: number): void {
        if (this.reciterSelectionContext === 'hifz') {
            this.hifzReciterId = reciterId;
            localStorage.setItem('hifzReciterId', reciterId.toString());

            // If currently playing in auto-repeat, sync immediately
            if (this.isAutoRepeat) {
                this.audioService.setReciter(reciterId);
            }
        } else {
            this.currentReciterId = reciterId;
            localStorage.setItem('lastReciterId', reciterId.toString());
            this.audioService.setReciter(reciterId);
        }

        this.showReciterModal = false;
        this.cdr.detectChanges();
    }

    // --- Custom Range Selection State ---
    selectedVersesSet: Set<string> = new Set();
    computedRange: { start: string, end: string } | null = null;

    onAyahClick(verseKey: string): void {
        if (this.isMemorizationMode) return;

        // Auto-Show Floating Player on Interaction
        this.showAudioPlayer = true;
        // Optionally save preference if needed (though ephemeral is better for context actions)
        // localStorage.setItem('showAudioPlayer', 'true');

        // Helper to get numeric value
        const getVal = (k: string) => {
            const parts = k.split(':').map(Number);
            return (parts[0] * 1000) + parts[1];
        };

        const clickedVal = getVal(verseKey);

        // CHECK: Is this verse already "covered" by the current range?
        // If yes, we interpret this click as a "Cut/Deselect" action at this point.
        // User Requirement: "Cancel it and cancel any verse after it".
        if (this.computedRange && this.isVerseInComputedRange(verseKey)) {
            // Logic: Remove 'verseKey' AND any verse in the set that is >= verseKey
            // Actually, if we just remove keys >= verseKey from the Set, the new Max will be < verseKey.
            const toRemove: string[] = [];
            this.selectedVersesSet.forEach(k => {
                if (getVal(k) >= clickedVal) {
                    toRemove.push(k);
                }
            });
            toRemove.forEach(k => this.selectedVersesSet.delete(k));
        } else {
            // Standard Add (Extend or Start New)
            this.selectedVersesSet.add(verseKey);
        }

        // Compute Range (Min ... Max)
        this.computeSelectionRange();

        // Update Visual Selection Focus
        if (this.computedRange) {
            this.selectedVerseKey = this.computedRange.start;
        } else {
            this.selectedVerseKey = this.selectedVersesSet.size > 0 ? Array.from(this.selectedVersesSet)[0] : null;
            // If Set is empty (user deselected everything), maybe hide player?
            // User didn't specify, but usually if no selection, no "Play Selection".
            // However, floating player also has "Play Page" context. Keep it visible.
        }

        this.cdr.detectChanges();



    }

    private computeSelectionRange(): void {
        if (this.selectedVersesSet.size === 0) {
            this.computedRange = null;
            return;
        }

        const verses = Array.from(this.selectedVersesSet).map(k => {
            const [s, v] = k.split(':').map(Number);
            return { key: k, surah: s, verse: v, val: s * 1000 + v };
        });

        // Sort by absolute position
        verses.sort((a, b) => a.val - b.val);

        const start = verses[0].key;
        const end = verses[verses.length - 1].key;

        this.computedRange = { start, end };
    }

    private syncAudioRange(): void {
        // If we have a computed range, we tell AudioService to use 'custom' mode with this range
        if (this.computedRange) {
            const specificRange = {
                start: this.computedRange.start,
                end: this.computedRange.end
            };
            // logic will be applied when play is clicked, but we can pre-set it
            // However, we should only forcefully override mode if user hits play.
            // For now, valid computedRange implies intent for custom range.
        }
    }

    isVerseInComputedRange(verseKey: string): boolean {
        if (!this.computedRange || !verseKey) return false;

        const parse = (k: string) => {
            const [s, v] = k.split(':').map(Number);
            return s * 1000 + v;
        };

        const curr = parse(verseKey);
        const start = parse(this.computedRange.start);
        const end = parse(this.computedRange.end);

        return curr >= start && curr <= end;
    }

    async playVerseAudio(verseKey: string): Promise<void> {
        const activeReciterId = (this.isMemorizationMode || this.isAutoRepeat) ? this.hifzReciterId : this.currentReciterId;

        // Check for Custom Range First
        if (this.computedRange && this.selectedVersesSet.size > 0) {
            console.log(`[MushafPage] Playing Computed Range: ${this.computedRange.start} -> ${this.computedRange.end}`);

            this.audioService.setPlaybackRange('custom', {
                start: this.computedRange.start,
                end: this.computedRange.end
            }, this.computedRange.end);

            // Start from the beginning of the range
            // Pass externalControl so playVerse's isNewSession reset uses the correct value
            const isExternal = this.isMemorizationMode || this.isAutoRepeat;
            this.audioService.playVerse(this.computedRange.start, activeReciterId, undefined, true, false, isExternal);
            this.selectedVerseKey = this.computedRange.start;

            // AUTO-HIDE UI: Promptly hide navbar
            this.showNavbar = false;

            // User Request: Clear the visual selection (shading) once playback starts
            this.computedRange = null;
            this.selectedVersesSet.clear();
            this.cdr.detectChanges();
        } else {
            // Default Behavior (Single/Context)
            await this.syncPlaybackBoundary(verseKey);

            // Fetch state to check for Group Repetition Phase (Recitation Mode)
            const state = await firstValueFrom(this.audioService.state$);
            const inGroupRepeatPhase = state.currentGroupRepeatCount > 0;

            // AUTO-REPEAT / HIFZ LOGIC
            // Only enforce external control if we actually NEED to intervene (repetitions > 1 or Group Phase active)
            // We enable this for Surah/Gapless reciters too in Hifz mode because we need precise control (breaks, waiting).
            const isSurahReciter = this.audioService.isSurahReciter(activeReciterId);
            const needsExternalControl = (this.isMemorizationMode || this.isAutoRepeat);

            // Pass needsExternalControl directly to playVerse so the isNewSession reset
            // uses the correct value (avoids overwriting the setExternalPlaybackControl call)
            await this.audioService.playVerse(verseKey, activeReciterId, undefined, true, false, needsExternalControl);
            this.selectedVerseKey = verseKey;

            // AUTO-HIDE UI: Promptly hide navbar
            this.showNavbar = false;
        }

        // --- GAPLESS OPTIMIZATION ---
        this.nextVerseKeyToPlay = null;
        const state = await firstValueFrom(this.audioService.state$);
        // Uses the NEW range state we just set
        const nextKey = await this.getNextVerseGlobal(state.currentVerseKey || verseKey, state.playbackRange);

        if (nextKey) {
            this.nextVerseKeyToPlay = nextKey;
            this.audioService.setNextVerseToPreload(nextKey);
        }
    }

    private async syncPlaybackBoundary(refKey: string): Promise<void> {
        if (!refKey) return;
        const state = await firstValueFrom(this.audioService.state$);
        let range = state.playbackRange; // We might override this locally if in memorization mode
        let rangeEndKey: string | null = null;
        let specificRange = state.specificRange;

        // CRITCAL FIX: In Memorization/Group Mode, the boundary MUST be the end of the session list.
        // We override whatever the global audio state thinks the range is (e.g. 'quran' or 'surah').
        if ((this.isMemorizationMode || this.isGroupPhase) && this.sessionAyahs.length > 0) {
            rangeEndKey = this.sessionAyahs[this.sessionAyahs.length - 1];
            // Force 'custom' or 'page' semantics to ensure strict enforcement in service
            range = 'custom';
            specificRange = {
                start: this.sessionAyahs[0],
                end: rangeEndKey
            };
            console.log(`[MushafPage] Memorization Mode Enforced Boundary: ${rangeEndKey}`);
        } else {
            // Standard Logic for non-memorization playback
            if (range === 'surah') {
                const surahId = parseInt(refKey.split(':')[0], 10);
                const surahMeta = this.allSurahs.find(sm => Number(sm.id) === surahId);
                if (surahMeta) {
                    rangeEndKey = `${surahId}:${surahMeta.verses_count}`;
                }
            } else if (range === 'page') {
                const pageNum = await this.getPageForVerseKey(refKey);
                if (pageNum) {
                    const pages = await firstValueFrom(this.dataService.getMushaf());
                    const pageData = pages.find(p => p.page_number === pageNum);
                    if (pageData) {
                        const keys = this.extractVerseKeys([pageData]);
                        if (keys.length > 0) {
                            rangeEndKey = keys[keys.length - 1];
                            // FIX: Pass proper specificRange for page mode
                            specificRange = {
                                start: keys[0],
                                end: rangeEndKey
                            };
                            console.log(`[MushafPage] Page range computed: ${keys[0]} -> ${rangeEndKey}`);
                        }
                    }
                }
            } else if (range === 'juz') {
                const pageNum = await this.getPageForVerseKey(refKey);
                const juz = pageNum ? await firstValueFrom(this.dataService.getJuzAtPage(pageNum)) : null;
                if (juz) {
                    const pages = await firstValueFrom(this.dataService.getMushaf());
                    const meta = await firstValueFrom(this.dataService.getMetadata());
                    const nextJuz = meta.juzs.find(j => j.id === juz.id + 1);
                    const endPage = nextJuz ? nextJuz.start_page - 1 : 604;
                    const juzPages = pages.filter(p => p.page_number >= juz.start_page && p.page_number <= endPage);
                    const keys = this.extractVerseKeys(juzPages);
                    if (keys.length > 0) {
                        rangeEndKey = keys[keys.length - 1];
                        // FIX: Pass proper specificRange for juz mode
                        specificRange = {
                            start: keys[0],
                            end: rangeEndKey
                        };
                        console.log(`[MushafPage] Juz range computed: ${keys[0]} -> ${rangeEndKey}`);
                    }
                }
            } else if (range === 'single') {
                rangeEndKey = refKey;
            } else if (range === 'quran') {
                rangeEndKey = "114:6";
                specificRange = { start: '1:1', end: '114:6' };
            } else if (range === 'custom') {
                rangeEndKey = state.rangeEndVerseKey || null;
                // FIX: Preserve existing specificRange for custom mode
                specificRange = state.specificRange;
            }
        }

        // Apply update: In Mem Mode, ALWAYS update to guarantee sync
        const isMemMode = this.isMemorizationMode || this.isGroupPhase;
        const shouldUpdate = rangeEndKey && (isMemMode || rangeEndKey !== state.rangeEndVerseKey);

        if (shouldUpdate) {
            console.log(`[MushafPage] SYNC: Setting boundary for ${range} to: ${rangeEndKey} (Session: ${this.sessionAyahs[0]} - ${this.sessionAyahs[this.sessionAyahs.length - 1]})`);
            this.audioService.setPlaybackRange(range, specificRange, rangeEndKey);
        }
    }

    toggleAudioPlayer(): void {
        this.showAudioPlayer = !this.showAudioPlayer;
        if (this.showAudioPlayer) {
            // Close other panels for exclusivity
            this.isSidebarOpen = false;
            this.isSettingsOpen = false;
            this.showOptionsSheet = false;
            this.isSearchOpen = false;
            this.showAudioManager = false; // NAVIGATION FIX
            this.closeTafsir();
        }
        localStorage.setItem('showAudioPlayer', this.showAudioPlayer.toString());
    }

    async toggleAudioPlayback(state: PlaybackState) {
        if (state.isPlaying) {
            this.audioService.pause();
        } else {
            if (state.currentVerseKey) {
                this.audioService.resume();
            } else {
                // If no active session, start from selected verse or current page
                if (this.selectedVerseKey) {
                    await this.playVerseAudio(this.selectedVerseKey);
                } else {
                    await this.startPlaybackFromContext();
                }
            }
        }
    }

    private async startPlaybackFromContext() {
        // Fallback: Smart lookup for current page
        const surah = await firstValueFrom(this.dataService.getSurahAtPage(this.pageNumber));
        const pages = await firstValueFrom(this.dataService.getMushaf());
        const currentPage = pages.find(p => p.page_number === this.pageNumber);
        const refKey = this.extractVerseKeys(currentPage ? [currentPage] : [])[0] || '1:1';

        await this.playVerseAudio(refKey);
    }

    exit(): void {
        // Clear the persistence flag so StartupGuard doesn't redirect back here
        localStorage.setItem('last_mushaf_state', 'home');
        this.router.navigate(['/Home']);
    }

    async openAudioSettings() {
        const state = await firstValueFrom(this.audioService.state$);
        this.audioSettingsModal.tempRepeatAyah = state.repeatAyah;
        this.audioSettingsModal.tempRepeatGroup = state.repeatGroup;
        this.audioSettingsModal.tempRange = state.playbackRange;
        this.audioSettingsModal.tempSpeed = state.playbackRate;

        // Sync Custom Selectors if applicable
        if (state.playbackRange === 'custom' && state.specificRange) {
            const [sS, sA] = state.specificRange.start.split(':').map(Number);
            const [eS, eA] = state.specificRange.end.split(':').map(Number);
            this.audioSettingsModal.startSurah = sS;
            this.audioSettingsModal.startAyah = sA;
            this.audioSettingsModal.endSurah = eS;
            this.audioSettingsModal.endAyah = eA;
        } else {
            // Default to current surah
            const surah = await firstValueFrom(this.dataService.getSurahAtPage(this.pageNumber));
            if (surah) {
                this.audioSettingsModal.startSurah = surah.id;
                this.audioSettingsModal.endSurah = surah.id;
                this.audioSettingsModal.endAyah = surah.verses_count;
            }
        }
        this.updateAudioSettingsAyahLists();
        this.audioSettingsModal.show = true;
        this.cdr.detectChanges();
    }

    getSurahMemorizationProgress(surah: SurahMetadata): number {
        if (!this.memorizedVerses || this.memorizedVerses.length === 0) return 0;

        const surahVerses = this.memorizedVerses.filter(v => v.startsWith(surah.id + ':'));
        if (surahVerses.length === 0) return 0;

        const percent = (surahVerses.length / surah.verses_count) * 100;
        return Math.min(100, Math.round(percent));
    }

    // Arabic Date Helpers
    getTodayArabicDayName(): string {
        const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        return arabicDays[new Date().getDay()];
    }

    getTodayArabicDate(): string {
        const date = new Date();
        const options: Intl.DateTimeFormatOptions = {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        };
        return date.toLocaleDateString('ar-EG', options);
    }

    async applyAudioSettings() {
        const s = this.audioSettingsModal;
        this.audioService.prime();
        this.audioService.setPlaybackRate(s.tempSpeed);

        // --- Use shared sync logic ---
        // --- Calculate Starting Verse ---
        let refKey = this.selectedVerseKey || (await firstValueFrom(this.audioService.state$)).currentVerseKey;

        if (!refKey) {
            // Fallback: Smart lookup for current page
            const surah = await firstValueFrom(this.dataService.getSurahAtPage(this.pageNumber));
            if (s.tempRange === 'surah' && surah) {
                refKey = `${surah.id}:1`;
            } else {
                const pages = await firstValueFrom(this.dataService.getMushaf());
                const currentPage = pages.find(p => p.page_number === this.pageNumber);
                refKey = this.extractVerseKeys(currentPage ? [currentPage] : [])[0] || '1:1';
            }
        } else if (s.tempRange === 'surah' && !this.selectedVerseKey) {
            // User explicitly wants Surah mode but didn't click a verse. 
            // If not already playing, start from beginning.
            const state = await firstValueFrom(this.audioService.state$);
            if (!state.isPlaying) {
                const surahId = parseInt(refKey.split(':')[0], 10);
                refKey = `${surahId}:1`;
            }
        }


        // CRITICAL: Apply repeat settings BEFORE starting playback
        // Otherwise playVerse/buildNativeQueue reads the old repeatAyah value (race condition)
        this.audioService.setRepeatSettings(s.tempRepeatAyah, s.tempRepeatGroup);
        // SYNC SETTINGS TO COMPONENT
        this.memorizationSettings.ayahRepeat = s.tempRepeatAyah;
        this.memorizationSettings.groupRepeat = s.tempRepeatGroup;
        this.currentRepetition = 1;

        // --- Use shared sync logic ---
        // Special case: Custom range needs its specific start/end from the modal
        if (s.tempRange === 'custom') {
            const specificRange = {
                start: `${s.startSurah}:${s.startAyah}`,
                end: `${s.endSurah}:${s.endAyah}`
            };
            this.audioService.setPlaybackRange('custom', specificRange, specificRange.end);
            this.playVerseAudio(specificRange.start);
        } else {
            // For surah, page, juz, etc. - set the mode first, then let playVerseAudio sync the boundary
            this.audioService.setPlaybackRange(s.tempRange, undefined, null); // Clear stale boundary
            this.playVerseAudio(refKey || '1:1');
        }

        this.audioSettingsModal.show = false;
        this.cdr.detectChanges();
    }

    stopAudio(): void {
        this.audioService.stop();
        this.playingVerseKey = null;
        this.selectedVerseKey = null; // Reset selection so next start uses range beginning

        // User Request: Return audio options to their default values
        this.audioSettingsModal.tempRepeatAyah = 1;
        this.audioSettingsModal.tempRepeatGroup = 1;
        this.audioSettingsModal.tempRange = 'page';
        this.audioSettingsModal.tempSpeed = 1.0;



        // Reset Service State
        this.audioService.setRepeatSettings(1, 1);
        this.audioService.setPlaybackRate(1.0);
        this.audioService.setPlaybackRange('page', undefined, null); // Reset range in service

        this.cdr.detectChanges();
    }

    isSurahMode(state: PlaybackState): boolean {
        return this.audioService.isSurahReciter(state.reciterId);
    }

    onSeekStart() {
        // Allow seeking unless we're buffering (don't block on isPlayingNewAudio as it may be stale on Android)
        if (this.audioService.snapshot.isBuffering) return;
        this.isSeeking = true;
        this.tempSeekPosition = this.audioService.snapshot.progress;
        console.log('[MushafPage] Seek started at:', this.tempSeekPosition);
    }

    onSeek(event: any) {
        if (!this.isSeeking) return;
        this.tempSeekPosition = parseFloat(event.target.value);
    }

    onSeekEnd(event: any) {
        if (!this.isSeeking) return;
        this.isSeeking = false;

        // v6: Use the local tempSeekPosition which is updated in real-time by onSeek.
        // event.target.value may be slightly delayed or imprecise on release.
        const seconds = this.tempSeekPosition;
        console.log(`[MushafPage] Seeking finalized to: ${seconds}s`);
        this.audioService.seekTo(seconds);
    }

    formatTime(seconds: number): string {
        if (!seconds || isNaN(seconds)) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    getCurrentSurahName(state: PlaybackState): string {
        if (!state.currentVerseKey) return '';
        const surahId = parseInt(state.currentVerseKey.split(':')[0], 10);
        const surah = this.allSurahs.find(s => s.id === surahId);
        return surah ? surah.name : '';
    }

    playNextGlobal() {
        const state = this.audioService.snapshot;
        if (!state.currentVerseKey) return;

        if (state.isShuffle) {
            this.playRandomSurah();
            return;
        }

        if (this.isSurahMode(state)) {
            const currentSurahId = parseInt(state.currentVerseKey.split(':')[0], 10);
            if (currentSurahId < 114) {
                this.onSurahChange(currentSurahId + 1);
            }
        } else {
            // Verse-by-Verse mode: Next Verse
            this.playNextVerseAudio(state.currentVerseKey);
        }
    }

    private playRandomSurah() {
        const randomSurahId = Math.floor(Math.random() * 114) + 1;
        this.onSurahChange(randomSurahId);
    }

    playPrevGlobal() {
        const state = this.audioService.snapshot;
        if (!state.currentVerseKey) return;

        if (this.isSurahMode(state)) {
            const currentSurahId = parseInt(state.currentVerseKey.split(':')[0], 10);
            if (currentSurahId > 1) {
                this.onSurahChange(currentSurahId - 1);
            }
        } else {
            // Verse-by-Verse mode: Previous Verse
            this.playPrevVerseAudio(state.currentVerseKey);
        }
    }

    async playPrevVerseAudio(currentKey: string): Promise<void> {
        const [surahId, verseNum] = currentKey.split(':').map(Number);

        let prevKey: string | null = null;
        if (verseNum > 1) {
            prevKey = `${surahId}:${verseNum - 1}`;
        } else if (surahId > 1) {
            // Get last verse of previous surah
            const meta = await firstValueFrom(this.dataService.getMetadata());
            const prevSurah = meta.surahs.find(s => s.id === surahId - 1);
            if (prevSurah) {
                prevKey = `${surahId - 1}:${prevSurah.verses_count}`;
            }
        }

        if (prevKey) {
            this.playVerseAudio(prevKey);
            await this.autoNavigateToVerse(prevKey);
        }
    }

    onSurahChange(event: any) {
        const id = event?.target ? parseInt(event.target.value, 10) : parseInt(event, 10);
        if (isNaN(id)) return;
        this.audioService.playVerse(`${id}:1`);
    }

    // --- Tafsir Methods ---
    openTafsir(verseKey?: string): void {
        // TOGGLE LOGIC: If Tafsir is already open and no specific verse requested (navbar click), close it
        if (this.isTafsirOpen && !verseKey) {
            this.closeTafsir();
            return;
        }

        let key = verseKey || this.selectedVerseKey || (this.audioService.snapshot.currentVerseKey);

        // If no key is found (initial state), fallback to the first verse of the current page
        if (!key && this.currentMushafPage) {
            const firstVerseLine = this.currentMushafPage.lines.find((l: EnrichedMushafLine) => l.type === 'verse');
            if (firstVerseLine && firstVerseLine.segments && firstVerseLine.segments.length > 0) {
                key = firstVerseLine.segments[0].verse_key;
            }
        }

        if (!key) return;

        this.selectedVerseKey = key;
        this.isTafsirOpen = true;

        // Close other panels
        this.showAudioManager = false; // NAVIGATION FIX
        this.isSidebarOpen = false;
        this.isSettingsOpen = false;

        this.loadTafsirContent(this.selectedTafsirId, key);
        this.cdr.detectChanges();
    }

    closeTafsir(): void {
        this.isTafsirOpen = false;
        this.showTafsirSources = false;
        this.showAsbabIndex = false;
        this.cdr.detectChanges();
    }

    loadTafsirContent(tafsirId: number, verseKey: string): void {
        this.loadingTafsir = true;
        this.pageTafsirs = [];
        this.cdr.detectChanges();

        const isPageDirect = verseKey.startsWith('page:');

        this.dataService.getMushaf().pipe(take(1)).subscribe(async pages => {


            let pageNum;
            if (isPageDirect) {
                pageNum = parseInt(verseKey.split(':')[1]);
            } else {
                const page = pages.find(p => p.lines.some(l => l.segments?.some(s => s.verse_key === verseKey)));
                pageNum = page ? page.page_number : this.pageNumber;
            }

            this.tafsirPageNumber = pageNum;

            // Ensure verseDataMap is populated for this page so verse texts appear in Tafsir
            const requestedPage = pages.find(p => p.page_number === pageNum);
            if (requestedPage) {
                requestedPage.lines.forEach(line => {
                    if (line.segments) {
                        line.segments.forEach(seg => {
                            if (seg.verse_key) {
                                if (!this.verseDataMap.has(seg.verse_key)) {
                                    this.verseDataMap.set(seg.verse_key, []);
                                }
                                // Check if segment already exists to avoid duplicates
                                const currentSegments = this.verseDataMap.get(seg.verse_key)!;
                                const exists = currentSegments.some(s => s.text === seg.text);
                                if (!exists && seg.text) {
                                    currentSegments.push({
                                        text: seg.text,
                                        font: ''
                                    });
                                }
                            }
                        });
                    }
                });
            }

            // Load font for the tafsir page to ensure Uthmani script
            const fontName = this.dataService.getFontName(pageNum);
            this.fontService.loadPageFont(pageNum).then(() => {
                this.tafsirFontFamily = this.createFontFamily(fontName);
                this.cdr.detectChanges();
            });

            // Handle Local JSON for Asbab Al-Nuzul (ID 900)
            if (tafsirId === 900) {
                try {
                    const localData = await firstValueFrom(this.http.get<any[]>('assets/data/tafsir/asbab_al_nuzul.json'));
                    if (localData && Array.isArray(localData)) {
                        // 1. Index the local data for fast lookup: "surahIndex:ayahIndex" -> text
                        const asbabMap = new Map<string, string>();
                        localData.forEach(item => {
                            if (item.ayahs && item.occasions) {
                                const text = item.occasions.join('<br><br>------------------<br><br>');
                                item.ayahs.forEach((ayahNum: number) => {
                                    const key = `${item.surah}:${ayahNum}`;
                                    asbabMap.set(key, text);
                                });
                            }
                        });

                        const result: any[] = [];
                        // 2. Iterate over page verses (using the already found 'requestedPage' which matches 'pageNum')
                        const targetPage = requestedPage || pages.find(p => p.page_number === pageNum);

                        // NEW: Pre-calculate pages with Asbab Al-Nuzul if not done yet
                        if (this.pagesWithAsbab.length === 0) {
                            const allPageNumbers = new Set<number>();
                            const tempVerseMap = new Map<string, number>();

                            // Map all verses to their pages
                            pages.forEach(p => {
                                p.lines.forEach(l => {
                                    if (l.segments) {
                                        l.segments.forEach(s => {
                                            if (s.verse_key) tempVerseMap.set(s.verse_key, p.page_number);
                                        });
                                    }
                                });
                            });

                            localData.forEach(item => {
                                if (item.ayahs && item.occasions && item.occasions.length > 0) {
                                    item.ayahs.forEach((v: number) => {
                                        const key = `${item.surah}:${v}`;
                                        const pNum = tempVerseMap.get(key);
                                        if (pNum) allPageNumbers.add(pNum);
                                    });
                                }
                            });
                            this.pagesWithAsbab = Array.from(allPageNumbers).sort((a, b) => a - b);
                        }

                        // NEW: Populate Index for the UI
                        if (this.asbabIndexData.length === 0) {
                            this.asbabIndexData = localData.map(item => ({
                                surah: item.surah,
                                ayahs: item.ayahs
                            }));
                        }

                        if (targetPage) {
                            const processedKeys = new Set<string>();
                            targetPage.lines.forEach(l => {
                                if (l.type === 'verse' && l.segments) {
                                    l.segments.forEach(s => {
                                        const key = s.verse_key;
                                        if (processedKeys.has(key)) return; // Skip if already added
                                        processedKeys.add(key);

                                        // Lookup Asbab
                                        const tafsirText = asbabMap.get(key);
                                        // FILTER: Only include if text exists
                                        if (tafsirText) {
                                            result.push({
                                                resource_id: 900,
                                                resource_name: 'أسباب النزول (الواحدي)',
                                                text: tafsirText,
                                                verse_key: key
                                            });
                                        }
                                    });
                                }
                            });
                        }

                        // Pass WRAPPED object to match API structure expected by processTafsirResponse
                        if (result.length === 0 && this.pagesWithAsbab.length > 0) {
                            const nearest = this.pagesWithAsbab.find(p => p >= pageNum) || this.pagesWithAsbab[0];
                            this.loadTafsirContent(900, `page:${nearest}`);
                            return;
                        }

                        this.processTafsirResponse({ tafsirs: result }, verseKey);
                        this.loadingTafsir = false;
                        this.cdr.detectChanges();
                        return;
                    }
                } catch (e) {
                    console.error('Failed to load local tafsir', e);
                    this.loadingTafsir = false;
                    this.cdr.detectChanges();
                    return;
                }
            }

            // Handle Local JSON for Muyassar (Amia) (ID 901)
            if (tafsirId === 901) {
                try {
                    const localData = await firstValueFrom(this.http.get<any[]>('assets/data/tafsir/tafseer_muyassar_bialeamia.json'));
                    if (localData && Array.isArray(localData)) {
                        // 1. Index the local data for fast lookup: "surahIndex:ayahIndex" -> text
                        const tafsirMap = new Map<string, string>();
                        localData.forEach(item => {
                            if (item.number && item.aya && item.text) {
                                const key = `${item.number}:${item.aya}`;
                                tafsirMap.set(key, item.text);
                            }
                        });

                        const result: any[] = [];
                        // 2. Iterate over page verses
                        const targetPage = requestedPage || pages.find(p => p.page_number === pageNum);

                        // NEW: Pre-calculate pages with Muyassar if not done yet
                        if (this.pagesWithMuyassar.length === 0) {
                            const allPageNumbers = new Set<number>();
                            const tempVerseMap = new Map<string, number>();

                            // Map all verses to their pages
                            pages.forEach(p => {
                                p.lines.forEach(l => {
                                    if (l.segments) {
                                        l.segments.forEach(s => {
                                            if (s.verse_key) tempVerseMap.set(s.verse_key, p.page_number);
                                        });
                                    }
                                });
                            });

                            localData.forEach(item => {
                                if (item.number && item.aya && item.text) {
                                    const key = `${item.number}:${item.aya}`;
                                    const pNum = tempVerseMap.get(key);
                                    if (pNum) allPageNumbers.add(pNum);
                                }
                            });
                            this.pagesWithMuyassar = Array.from(allPageNumbers).sort((a, b) => a - b);
                        }

                        if (targetPage) {
                            const processedKeys = new Set<string>();
                            targetPage.lines.forEach(l => {
                                if (l.type === 'verse' && l.segments) {
                                    l.segments.forEach(s => {
                                        const key = s.verse_key;
                                        if (processedKeys.has(key)) return; // Skip if already added
                                        processedKeys.add(key);

                                        // Lookup Tafsir
                                        const tafsirText = tafsirMap.get(key);
                                        if (tafsirText) {
                                            result.push({
                                                resource_id: 901,
                                                resource_name: 'التفسير الميسر (بالعامية)',
                                                text: tafsirText,
                                                verse_key: key
                                            });
                                        }
                                    });
                                }
                            });
                        }

                        // Fallback to nearest page with data
                        if (result.length === 0 && this.pagesWithMuyassar.length > 0) {
                            const nearest = this.pagesWithMuyassar.find(p => p >= pageNum) || this.pagesWithMuyassar[0];
                            this.loadTafsirContent(901, `page:${nearest}`);
                            return;
                        }

                        this.ngZone.run(() => {
                            this.processTafsirResponse({ tafsirs: result }, verseKey);
                            this.loadingTafsir = false;
                            this.cdr.detectChanges();
                        });
                        return;
                    }
                } catch (e) {
                    console.error('Failed to load local muyassar tafsir', e);
                    this.ngZone.run(() => {
                        this.loadingTafsir = false;
                        this.cdr.detectChanges();
                    });
                    return;
                }
            }

            // 1. Try Loading from Filesystem (Native Offline)
            if (this.isMobile || Capacitor.isNativePlatform()) {
                const fsData = await this.loadTafsirFromFilesystem(tafsirId, pageNum);
                if (fsData) {
                    this.ngZone.run(() => {
                        this.processTafsirResponse(fsData, verseKey);
                        this.loadingTafsir = false;
                        this.cdr.detectChanges();
                    });
                    return;
                }
            }

            const url = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_page/${pageNum}`;

            // 2. Legacy Web Cache Fallback
            if ('caches' in window) {
                try {
                    const cache = await caches.open('quran-tafsir-cache');
                    const cachedRes = await cache.match(url);
                    if (cachedRes) {
                        const data = await cachedRes.json();
                        this.ngZone.run(() => {
                            this.processTafsirResponse(data, verseKey);
                            this.loadingTafsir = false;
                            this.cdr.detectChanges();
                        });
                        return;
                    }
                } catch (e) { }
            }

            this.http.get<any>(url).subscribe({
                next: (res) => {
                    this.ngZone.run(() => {
                        this.processTafsirResponse(res, verseKey);
                        this.loadingTafsir = false;
                        this.cdr.detectChanges();
                    });

                    // Save to Filesystem for future offline use
                    if (this.isMobile || Capacitor.isNativePlatform()) {
                        this.saveTafsirToFilesystem(tafsirId, pageNum, res);
                    }

                    if ('caches' in window) {
                        try {
                            caches.open('quran-tafsir-cache').then((cache: any) => {
                                cache.put(url, new Response(JSON.stringify(res)));
                            });
                        } catch (e) { }
                    }
                },
                error: (err) => {
                    this.ngZone.run(() => {
                        this.loadingTafsir = false;
                        this.cdr.detectChanges();
                    });
                }
            });
        });
    }

    // --- Tafsir Filesystem Helpers ---

    private async ensureTafsirDirectory(tafsirId: number): Promise<void> {
        try {
            await Filesystem.mkdir({
                directory: Directory.Data,
                path: `tafsir/${tafsirId}`,
                recursive: true
            });
        } catch (e) { }
    }

    private async saveTafsirToFilesystem(tafsirId: number, pageNum: number, data: any): Promise<void> {
        try {
            await this.ensureTafsirDirectory(tafsirId);
            await Filesystem.writeFile({
                directory: Directory.Data,
                path: `tafsir/${tafsirId}/${pageNum}.json`,
                data: JSON.stringify(data),
                encoding: Encoding.UTF8
            });
        } catch (e) {
            console.warn('[Tafsir] Failed to save to filesystem', e);
        }
    }

    private async loadTafsirFromFilesystem(tafsirId: number, pageNum: number): Promise<any> {
        try {
            const file = await Filesystem.readFile({
                directory: Directory.Data,
                path: `tafsir/${tafsirId}/${pageNum}.json`,
                encoding: Encoding.UTF8
            });
            return JSON.parse(file.data as string);
        } catch (e) {
            return null;
        }
    }

    // --- Tafsir Swipe Handlers ---

    onTafsirTouchStart(event: TouchEvent): void {
        this.ngZone.run(() => {
            this.tafsirTouchStartX = event.touches[0].clientX;
            this.tafsirTouchStartY = event.touches[0].clientY;
            this.tafsirTouchEndX = event.touches[0].clientX; // Initialize to prevent diff on simple tap
            this.tafsirTouchEndY = event.touches[0].clientY;
        });
    }

    onTafsirTouchMove(event: TouchEvent): void {
        this.ngZone.run(() => {
            this.tafsirTouchEndX = event.touches[0].clientX;
            this.tafsirTouchEndY = event.touches[0].clientY;
        });
    }

    onTafsirTouchEnd(): void {
        this.ngZone.run(() => {
            const deltaX = this.tafsirTouchEndX - this.tafsirTouchStartX;
            const deltaY = this.tafsirTouchEndY - this.tafsirTouchStartY;

            // Only flip if horizontal swipe is significantly larger than vertical
            if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
                if (Math.abs(deltaX) > 50) { // min swipe distance
                    if (deltaX > 0) {
                        this.changeTafsirPage(1); // Prev page (swipe right = go back)
                    } else {
                        this.changeTafsirPage(-1); // Next page (swipe left = go forward)
                    }
                }
            }

            // Reset
            this.tafsirTouchStartX = 0;
            this.tafsirTouchStartY = 0;
            this.tafsirTouchEndX = 0;
            this.tafsirTouchEndY = 0;
        });
    }

    changeTafsirPage(delta: number): void {
        let nextPage = this.tafsirPageNumber + delta;

        // SMART NAVIGATION FOR ASBAB AL-NUZUL
        if (this.selectedTafsirId === 900 && this.pagesWithAsbab.length > 0) {
            if (delta > 0) {
                // Find first page > current
                const found = this.pagesWithAsbab.find(p => p > this.tafsirPageNumber);
                nextPage = found || this.tafsirPageNumber; // Stay if none found
            } else {
                // Find last page < current
                const found = this.pagesWithAsbab.slice().reverse().find(p => p < this.tafsirPageNumber);
                nextPage = found || this.tafsirPageNumber; // Stay if none found
            }
        }

        // SMART NAVIGATION FOR MUYASSAR (AMIA)
        if (this.selectedTafsirId === 901 && this.pagesWithMuyassar.length > 0) {
            if (delta > 0) {
                const found = this.pagesWithMuyassar.find(p => p > this.tafsirPageNumber);
                nextPage = found || this.tafsirPageNumber;
            } else {
                const found = this.pagesWithMuyassar.slice().reverse().find(p => p < this.tafsirPageNumber);
                nextPage = found || this.tafsirPageNumber;
            }
        }

        if (nextPage >= 1 && nextPage <= 604 && nextPage !== this.tafsirPageNumber) {
            // We don't set this.tafsirPageNumber here because loadTafsirContent sets it
            this.loadTafsirContent(this.selectedTafsirId, `page:${nextPage}`);
        }
    }

    async downloadFullTafsir(tafsirId: number): Promise<void> {
        const tafsirName = this.availableTafsirs.find(t => t.id === tafsirId)?.name || 'التفسير';

        // Initialize progress
        this.tafsirDownloadProgress[tafsirId] = { current: 0, total: 604, loading: true };
        this.cdr.detectChanges();

        const useFilesystem = this.isMobile || Capacitor.isNativePlatform();

        try {
            // Create directory upfront if using FS
            if (useFilesystem) await this.ensureTafsirDirectory(tafsirId);

            let cache: any;
            if ('caches' in window) cache = await caches.open('quran-tafsir-cache');

            console.log(`[Tafsir] Starting FULL download for ${tafsirName} (ID: ${tafsirId}) - Method: ${useFilesystem ? 'Filesystem' : 'WebCache'}`);

            const chunkSize = 5;
            for (let chunkIdx = 1; chunkIdx <= 604; chunkIdx += chunkSize) {
                const promises = [];
                const jLimit = Math.min(chunkSize, 604 - chunkIdx + 1);
                for (let j = 0; j < jLimit; j++) {
                    const p = chunkIdx + j;
                    const url = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_page/${p}`;

                    promises.push(
                        firstValueFrom(this.http.get(url)).then(async res => {
                            if (res) {
                                if (useFilesystem) {
                                    await this.saveTafsirToFilesystem(tafsirId, p, res);
                                }
                                if (cache) {
                                    cache.put(url, new Response(JSON.stringify(res)));
                                }

                                this.tafsirDownloadProgress[tafsirId].current++;
                                if (this.tafsirDownloadProgress[tafsirId].current % 10 === 0) {
                                    this.cdr.detectChanges();
                                }
                            }
                        }).catch(err => console.warn(`Failed p ${p}`, err))
                    );
                }
                await Promise.all(promises);
            }

            const tafsir = this.availableTafsirs.find(t => t.id === tafsirId);
            if (tafsir) tafsir.downloaded = true;
            alert(`تهانينا! تم تحميل ${tafsirName} كاملاً (604 صفحة) بنجاح.`);
        } catch (error) {
            console.error('Full Tafsir download failed:', error);
            alert('حدث خطأ أثناء تحميل التفسير. يرجى التأكد من اتصالك بالإنترنت والمحاولة لاحقاً.');
        } finally {
            this.tafsirDownloadProgress[tafsirId].loading = false;
            this.cdr.detectChanges();
        }
    }

    toggleTafsirSources(): void {
        this.showTafsirSources = !this.showTafsirSources;
        if (this.showTafsirSources) {
            this.showAsbabIndex = false; // Close index if opening sources
            this.checkAllTafsirsCacheStatus();
        }
        this.cdr.detectChanges();
    }

    private async ensureAsbabIndexLoaded(): Promise<void> {
        if (this.asbabIndexData.length > 0) return;
        try {
            const localData = await firstValueFrom(this.http.get<any[]>('assets/data/tafsir/asbab_al_nuzul.json'));
            if (localData && Array.isArray(localData)) {
                this.asbabIndexData = localData.map(item => ({
                    surah: item.surah,
                    ayahs: item.ayahs
                }));
            }
        } catch (e) {
            console.error('[Tafsir] Failed to pre-load Asbab Index', e);
        }
    }

    async toggleAsbabIndex(): Promise<void> {
        this.showAsbabIndex = !this.showAsbabIndex;
        if (this.showAsbabIndex) {
            this.showTafsirSources = false; // Close sources if opening index
            await this.ensureAsbabIndexLoaded();
        }
        this.cdr.detectChanges();
    }

    getSurahNameForIndex(id: number, surahs: any[]): string {
        const s = surahs.find(item => item.id === id);
        return s ? s.name : `سورة ${id}`;
    }

    loadAsbabEntry(entry: any): void {
        this.showAsbabIndex = false;
        if (entry.surah && entry.ayahs && entry.ayahs.length > 0) {
            this.loadTafsirContent(900, `${entry.surah}:${entry.ayahs[0]}`);
        }
    }

    filteredAsbabIndex(surahs: any[]): any[] {
        if (!this.asbabSearchQuery) return this.asbabIndexData;
        const query = this.asbabSearchQuery.toLowerCase();
        return this.asbabIndexData.filter(entry => {
            const surahName = this.getSurahNameForIndex(entry.surah, surahs).toLowerCase();
            const ayahs = entry.ayahs.join(', ');
            return surahName.includes(query) || ayahs.includes(query);
        });
    }

    async checkAllTafsirsCacheStatus(): Promise<void> {
        if (!this.isMobile && !Capacitor.isNativePlatform() && !('caches' in window)) return;

        for (const t of this.availableTafsirs) {
            if (t.id === 900 || t.id === 901) {
                t.downloaded = true; // Local assets always downloaded
                continue;
            }
            // Check only first page of tafsir as an indicator
            const url = `https://api.quran.com/api/v4/tafsirs/${t.id}/by_page/1`;

            let exists = false;
            // Native Filesystem Check
            if (this.isMobile || Capacitor.isNativePlatform()) {
                try {
                    const ret = await Filesystem.stat({
                        path: `tafsir/${t.id}/1.json`,
                        directory: Directory.Data
                    });
                    exists = !!ret;
                } catch (e) { exists = false; }
            }

            // Web Cache Storage Check
            if (!exists && 'caches' in window) {
                try {
                    const cache = await caches.open('quran-tafsir-cache');
                    const match = await cache.match(url);
                    exists = !!match;
                } catch (e) { exists = false; }
            }

            t.downloaded = exists;
        }
        this.cdr.detectChanges();
    }

    selectTafsirFromList(id: number): void {
        this.selectedTafsirId = id;
        localStorage.setItem('lastSelectedTafsirId', id.toString());
        this.showTafsirSources = false;
        // Reload current page with new tafsir
        this.loadTafsirContent(id, `page:${this.tafsirPageNumber}`);
    }

    get activeTafsirName(): string {
        return this.availableTafsirs.find(t => t.id === this.selectedTafsirId)?.name || 'التفسير';
    }

    // --- Premium Surah Selector Logic ---
    openSurahSelector(): void {
        this.showSurahModal = true;
        this.isSidebarOpen = false; // Close index/sidebar when opening search
        this.surahSearchQuery = '';
        this.cdr.detectChanges();
    }

    toggleShuffle() {
        const newShuffleState = !this.audioService.snapshot.isShuffle;
        this.audioService.setShuffle(newShuffleState);
        // Force synchronous change detection and also mark for check to be sure
        this.cdr.markForCheck();
        this.cdr.detectChanges();
    }

    // --- Sleep Timer Logic ---
    openSleepTimer(): void {
        this.showSleepTimerModal = true;
        this.cdr.detectChanges();
    }

    setSleepTimer(minutes: number): void {
        this.cancelSleepTimer();
        if (minutes > 0) {
            // NATIVE ROUTING: Trigger native timer for Android background reliability
            this.audioService.setSleepTimer(minutes);

            const targetEndTime = Date.now() + (minutes * 60 * 1000);
            this.sleepTimerRemaining = minutes * 60;

            this.sleepTimerInterval = setInterval(() => {
                const now = Date.now();
                this.sleepTimerRemaining = Math.max(0, Math.round((targetEndTime - now) / 1000));

                if (this.sleepTimerRemaining <= 0) {
                    this.stopAudio();
                    this.cancelSleepTimer();
                }
                this.cdr.detectChanges();
            }, 1000);
        } else {
            // Cancel native timer if setting to 0
            this.audioService.setSleepTimer(0);
        }
        this.showSleepTimerModal = false;
        this.cdr.detectChanges();
    }

    cancelSleepTimer(): void {
        if (this.sleepTimerInterval) {
            clearInterval(this.sleepTimerInterval);
            this.sleepTimerInterval = null;
        }
        this.audioService.setSleepTimer(0); // Also cancel on native side
        this.sleepTimerRemaining = 0;
        this.cdr.detectChanges();
    }

    formatTimer(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    closeSurahSelector(): void {
        this.showSurahModal = false;
        this.cdr.detectChanges();
    }

    get filteredSurahs(): any[] {
        if (!this.surahSearchQuery) return this.allSurahs;
        const q = this.normalizeArabic(this.surahSearchQuery);
        return this.allSurahs.filter(s =>
            this.normalizeArabic(s.name).includes(q) ||
            s.id.toString().includes(q)
        );
    }

    selectSurahFromModal(id: number): void {
        this.onSurahChange(id);
        this.closeSurahSelector();
    }

    changeTafsir(id: any): void {
        this.selectedTafsirId = Number(id);
        localStorage.setItem('lastSelectedTafsirId', this.selectedTafsirId.toString());
        if (this.selectedVerseKey) {
            this.loadTafsirContent(this.selectedTafsirId, this.selectedVerseKey);
        }
    }

    async downloadTafsirSurah(surahId: number): Promise<void> {
        if (!surahId) {
            alert('يرجى اختيار سورة أولاً');
            return;
        }

        const tafsirId = this.selectedTafsirId;
        const tafsirName = this.availableTafsirs.find(t => t.id === tafsirId)?.name || 'التفسير';
        const useFilesystem = this.isMobile || Capacitor.isNativePlatform();

        try {
            if (useFilesystem) await this.ensureTafsirDirectory(tafsirId);

            let cache: any;
            if ('caches' in window) cache = await caches.open('quran-tafsir-cache');

            // Get metadata to know the page range
            this.dataService.getMetadata().pipe(take(1)).subscribe(async meta => {
                const surahMeta = meta.surahs.find(s => s.id === surahId);
                if (!surahMeta) {
                    alert('لم يتم العثور على بيانات السورة');
                    return;
                }

                console.log(`[Tafsir] Starting download for Surah ${surahId} (${surahMeta.name}). Pages: ${surahMeta.start_page} to ${surahMeta.end_page}`);

                let successCount = 0;
                let totalPages = surahMeta.end_page - surahMeta.start_page + 1;

                // Loop through all pages of the surah and cache them
                for (let p = surahMeta.start_page; p <= surahMeta.end_page; p++) {
                    const pageUrl = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_page/${p}`;

                    try {
                        const pageRes = await firstValueFrom(this.http.get(pageUrl));
                        if (pageRes) {
                            if (useFilesystem) {
                                await this.saveTafsirToFilesystem(tafsirId, p, pageRes);
                            }
                            if (cache) {
                                cache.put(pageUrl, new Response(JSON.stringify(pageRes)));
                            }
                            successCount++;
                        }
                    } catch (err) {
                        console.warn(`[Tafsir] Failed to cache page ${p}:`, err);
                    }
                }

                if (successCount > 0) {
                    alert(`تم تحميل ${tafsirName} لسورة ${surahMeta.name} بنجاح (${successCount}/${totalPages} صفحة) للقراءة بدون إنترنت`);
                } else {
                    alert('فشل تحميل صفحات التفسير، يرجى التحقق من اتصال الإنترنت');
                }
            });

        } catch (error) {
            console.error('Tafsir download failed:', error);
            alert('فشل تحميل التفسير، يرجى المحاولة مرة أخرى');
        }
    }

    changeReciter(id: any): void {
        this.currentReciterId = parseInt(id, 10);
        this.audioService.prime(); // Unlock immediately on user gesture
        this.audioService.setReciter(this.currentReciterId);
        localStorage.setItem('lastReciterId', id.toString());
        if (this.isSidebarOpen) {
            this.updateDownloadedStatus();
        }
    }

    downloadCurrentSurah(): void {
        this.openAudioManager();
    }

    openAudioManager(): void {
        this.showAudioManager = true;
        this.updateDownloadedStatus();
    }

    closeAudioManager(): void {
        this.showAudioManager = false;
        this.isDownloadMode = false;
    }


    async downloadSurah(surah: any): Promise<void> {
        if (this.currentReciterId === 175) {
            alert('عذراً، هذا القارئ (عبدالله حمد أبو شريدة) لا يزال قيد التطوير وسيتم توفير التحميل له قريباً.');
            return;
        }

        if (this.downloadingSurahs.has(surah.id) || this.downloadedSurahs.has(surah.id)) return;

        console.log(`[MushafPage] Starting real download for Surah: ${surah.name}`);
        this.downloadingSurahs.add(surah.id);
        this.cdr.detectChanges();

        try {
            await this.audioService.downloadSurah(surah.id, this.currentReciterId);
            this.updateDownloadedStatus(); // Verify and update checkmarks
            console.log(`[MushafPage] Download complete for Surah: ${surah.name}`);
        } catch (error) {
            console.error('[MushafPage] Download failed:', error);
            // Don't alert if it was likely a cancellation (check if still in downloading set)
            if (this.downloadingSurahs.has(surah.id)) {
                alert('فشل تحميل السورة. يرجى التأكد من اتصال الإنترنت والمحاولة مرة أخرى.');
            }
        } finally {
            this.downloadingSurahs.delete(surah.id);
            this.cdr.detectChanges();
        }
    }

    async cancelSurahDownload(surah: any): Promise<void> {
        await this.audioService.cancelDownload(surah.id, this.currentReciterId);
        this.downloadingSurahs.delete(surah.id);
        this.cdr.detectChanges();
        console.log(`[MushafPage] Cancelled download for Surah: ${surah.name}`);
    }

    async deleteSurah(surah: any): Promise<void> {
        try {
            await this.audioService.deleteSurah(surah.id, this.currentReciterId);
            this.updateDownloadedStatus();
            console.log(`[MushafPage] Deleted Surah: ${surah.name}`);
        } catch (error) {
            console.error('[MushafPage] Delete failed:', error);
            alert('فشل حذف السورة.');
        } finally {
            this.cdr.detectChanges();
        }
    }

    async playNextVerseAudio(currentKey: string): Promise<void> {
        const state = await firstValueFrom(this.audioService.state$);

        // GROUP/MEMORIZATION ENFORCEMENT
        // If we are in a group session (Hifz/Recitation), strictly follow the session list.

        // SAFETY: Ensure we don't get stuck in Group Phase if Hifz mode was exited uncleanly
        if (!this.isMemorizationMode && !this.isAutoRepeat) {
            this.isGroupPhase = false;
        }

        if (this.isGroupPhase || this.isMemorizationMode) {
            const currentIndex = this.sessionAyahs.indexOf(currentKey);
            if (currentIndex !== -1 && currentIndex < this.sessionAyahs.length - 1) {
                const nextKey = this.sessionAyahs[currentIndex + 1];
                this.currentAyahIndex = currentIndex + 1; // CRITICAL: Update cursor for next completion
                this.playVerseAudio(nextKey);
                return;
            } else {
                this.handleGroupEnd(state);
                return;
            }
        }

        // FALLBACK: Normal Continuous Play logic (e.g. just listening without a session)
        // 1. Calculate next logical verse (independent of range constraints first)
        let nextGlobal: string | null = null;
        if (this.nextVerseKeyToPlay) {
            const [cS, cA] = currentKey.split(':').map(Number);
            const [nS, nA] = this.nextVerseKeyToPlay.split(':').map(Number);
            const isLogical = (cS === nS && nA === cA + 1) || (nS === cS + 1 && nA === 1);
            if (isLogical) nextGlobal = this.nextVerseKeyToPlay;
        }

        if (!nextGlobal) {
            nextGlobal = await this.getNextVerseGlobal(currentKey, state.playbackRange);
        }

        // Smart Shuffle: If current verse is the last of the surah, and shuffle is on, pick random surah.
        if (state.isShuffle) {
            const [s, v] = currentKey.split(':').map(Number);
            const meta = await firstValueFrom(this.dataService.getMetadata());
            const surah = meta.surahs.find(item => item.id === s);
            if (surah && v >= surah.verses_count) {
                this.playRandomSurah();
                return;
            }
        }

        // 2. Check if next verse is within the user's active range
        if (!nextGlobal || !this.isWithinActiveRange(nextGlobal, state)) {
            this.handleGroupEnd(state);
            return;
        }

        // 3. Play and Navigate
        this.playVerseAudio(nextGlobal);
    }

    private async getPageForVerseKey(verseKey: string): Promise<number> {
        const [s, v] = verseKey.split(':').map(Number);
        return firstValueFrom(this.dataService.getPageNumberForVerse(s, v));
    }

    private getNextVerseOnPage(currentKey: string): string | null {
        if (!this.currentMushafPage) return null;
        const allSegments = this.currentMushafPage.lines
            .filter((l: EnrichedMushafLine) => l.type === 'verse' && l.segments)
            .flatMap((l: EnrichedMushafLine) => l.segments as EnrichedMushafSegment[]);

        const currentIdx = allSegments.findIndex((s: EnrichedMushafSegment) => s.verse_key === currentKey);
        if (currentIdx === -1) return null;

        for (let segSearchIdx = currentIdx + 1; segSearchIdx < allSegments.length; segSearchIdx++) {
            const s = allSegments[segSearchIdx];
            if (s.verse_key !== currentKey) {
                return s.verse_key;
            }
        }
        return null;
    }

    updateAudioSettingsAyahLists() {
        const startS = this.allSurahs.find(s => s.id === Number(this.audioSettingsModal.startSurah));
        if (startS) {
            this.audioSettingsModal.availableAyahsForStart = Array.from({ length: startS.verses_count }, (_, i) => i + 1);
            if (this.audioSettingsModal.startAyah > startS.verses_count) this.audioSettingsModal.startAyah = 1;
        }

        const endS = this.allSurahs.find(s => s.id === Number(this.audioSettingsModal.endSurah));
        if (endS) {
            this.audioSettingsModal.availableAyahsForEnd = Array.from({ length: endS.verses_count }, (_, i) => i + 1);
            if (this.audioSettingsModal.endAyah > endS.verses_count) this.audioSettingsModal.endAyah = endS.verses_count;
        }
    }

    private async getNextVerseGlobal(currentKey: string, range: string): Promise<string | null> {
        const [surahId, verseNum] = currentKey.split(':').map(Number);

        // Avoid internal state fetching if possible, but keep for Range Enforcement logic
        const state = await firstValueFrom(this.audioService.state$);

        // 0. Custom Range Enforcement (If specifically requested)
        if (range === 'custom' && state.specificRange) {
            const [endS, endV] = state.specificRange.end.split(':').map(Number);
            if (surahId > endS || (surahId === endS && verseNum >= endV)) {
                return null;
            }
        }

        const meta = await firstValueFrom(this.dataService.getMetadata());
        const surah = meta.surahs.find(s => s.id === surahId);
        if (!surah) return null;

        // 1. Advance within Surah
        if (verseNum < surah.verses_count) {
            const nextKey = `${surahId}:${verseNum + 1}`;
            if (range === 'page') {
                const currentP = await this.getPageForVerseKey(currentKey);
                const nextP = await this.getPageForVerseKey(nextKey);
                if (currentP !== nextP) return null;
            }
            return nextKey;
        }

        // 2. Surah Ended, check range permissions
        if (range === 'surah' || range === 'single') return null;

        // 3. Move to next Surah (Quran, Juz, or Page)
        if (surahId < 114) {
            const nextSurahId = surahId + 1;
            const nextKey = `${nextSurahId}:1`;

            if (range === 'page') {
                const currentP = await this.getPageForVerseKey(currentKey);
                const nextP = await this.getPageForVerseKey(nextKey);
                if (currentP !== nextP) return null;
            }

            if (range === 'juz') {
                const currentP = await this.getPageForVerseKey(currentKey);
                const currentJuz = await firstValueFrom(this.dataService.getJuzAtPage(currentP));
                if (!currentJuz) return null;

                const nextSurah = meta.surahs.find(s => s.id === nextSurahId);
                const nextSurahPage = nextSurah?.start_page || 0;

                // Find next Juz to get boundary page
                const nextJuz = meta.juzs.find(j => j.id === currentJuz.id + 1);
                const nextJuzStartPage = nextJuz ? nextJuz.start_page : 605;

                if (nextSurahPage >= nextJuzStartPage) return null;
            }

            return nextKey;
        }

        return null;
    }

    private async handleGroupEnd(state: PlaybackState): Promise<void> {
        console.log('[MushafPage] Recitation Range Complete.');
        this.audioService.stop();
        this.playingVerseKey = null; // Sync UI
        this.selectedVerseKey = null; // Reset selection if needed
        this.cdr.detectChanges();
        if (state.repeatGroup > 1 && (state.currentGroupRepeatCount + 1) < state.repeatGroup) {
            const nextCount = state.currentGroupRepeatCount + 1;
            console.log(`[MushafPage] Repeating Group (${nextCount + 1}/${state.repeatGroup})`);
            this.audioService.updatePlaybackState({ currentGroupRepeatCount: nextCount });

            const startVerse = await this.getRangeStartVerse(state);
            if (startVerse) {
                console.log(`[MushafPage] Restarting group from ${startVerse}`);
                this.playVerseAudio(startVerse);
                await this.navigateToVerse(startVerse);
            } else {
                this.audioService.stop();
            }
        } else {
            console.log(`[MushafPage] Range/Group playback completed.`);
            this.audioService.updatePlaybackState({ currentGroupRepeatCount: 0 });
            this.audioService.stop();
            // Show notification or update UI state if needed
        }
    }

    private async getRangeStartVerse(state: PlaybackState): Promise<string | null> {
        if (state.playbackRange === 'page') {
            const pages = await firstValueFrom(this.dataService.getMushaf());
            const currentPage = pages.find(p => p.page_number === this.pageNumber);
            return this.extractVerseKeys(currentPage ? [currentPage] : [])[0];
        } else if (state.playbackRange === 'surah') {
            const [surahId] = (state.currentVerseKey || '1:1').split(':');
            return `${surahId}:1`;
        } else if (state.playbackRange === 'juz') {
            const currentJuz = await firstValueFrom(this.dataService.getJuzAtPage(this.pageNumber));
            if (!currentJuz) return '1:1';
            const pageData = await firstValueFrom(this.dataService.getPage(currentJuz.start_page));
            return this.extractVerseKeys(pageData ? [pageData] : [])[0];
        } else if (state.playbackRange === 'quran') {
            return '1:1';
        }
        return state.currentVerseKey;
    }

    private async navigateToVerse(verseKey: string): Promise<void> {
        const [surahId, verseNum] = verseKey.split(':').map(Number);
        try {
            const page = await firstValueFrom(this.dataService.getPageNumberForVerse(surahId, verseNum));
            if (page !== this.pageNumber) {
                this.goToPage(page);
            }
        } catch (e) {
            console.error('[AudioNavigation] Failed to find page for verse:', verseKey);
        }
    }

    getLineBackground(line: any, page: MushafPage): string {
        // Use pre-calculated style if available
        if ((line as EnrichedMushafLine).backgroundStyle) return (line as EnrichedMushafLine).backgroundStyle;

        if (!line || !page || !this.pageSplits.size) return 'transparent';
        const pageNum = page.page_number;
        const split = this.pageSplits.get(pageNum);
        if (!split) return 'transparent';

        // 1. For Verse types: handle split and full logic
        if (line.type === 'verse' && line.segments && line.segments.length > 0) {
            let firstSecondIdx = -1;
            const segments = line.segments;
            const len = segments.length;

            for (let i = 0; i < len; i++) {
                if (this.isVerseInSecondHalf(segments[i].verse_key, pageNum)) {
                    firstSecondIdx = i;
                    break;
                }
            }

            if (firstSecondIdx === -1) return 'transparent';
            if (firstSecondIdx === 0) return 'var(--half-page-bg)';

            // Split line: use character-weighted gradient for precision
            let totalC = 0;
            let secondHalfC = 0;
            for (let i = 0; i < len; i++) {
                const charCount = segments[i].text?.length || 0;
                totalC += charCount;
                if (i >= firstSecondIdx) secondHalfC += charCount;
            }

            const percent = totalC > 0 ? (secondHalfC / totalC) * 100 : 0;
            return `linear-gradient(to right, var(--half-page-bg) ${percent}%, transparent ${percent}%)`;
        }

        // 2. For Metadata types (Bismillah, Headers): calculate position relative to split line
        // Optimization: Check the lines of the page sequentially
        const lines = page.lines;
        const lineIdx = lines.indexOf(line);
        if (lineIdx === -1) return 'transparent';

        for (let i = 0; i < lineIdx; i++) {
            const prev = lines[i];
            if (prev.type === 'verse' && prev.segments) {
                // If any previous line has a segment in the second half, this metadata line is definitely in the second half
                const segs = prev.segments;
                for (let j = 0; j < segs.length; j++) {
                    if (this.isVerseInSecondHalf(segs[j].verse_key, pageNum)) {
                        return 'var(--half-page-bg)';
                    }
                }
            }
        }

        return 'transparent';
    }

    getReadingProgressPercent(): number {
        if (!this.isReadingActive) return 0;
        const elapsed = Date.now() - this.pageStartTime;
        return Math.min(100, (elapsed / this.getMinStayTime()) * 100);
    }

    getHifzLabel(): string {
        const task = this.dailyTasks?.new_memorization;
        const totalMemorized = this.quranProgress?.versesMemorized || 0;
        if (totalMemorized >= 6236) {
            return 'تم الختم بحمد الله';
        }
        if (!task) return 'حفظ جديد';

        if (this.isHifzBlocked) {
            return 'تم القفل: يجب الربط أولاً';
        }

        const unlinkedCount = this.dailyTasks?.stats?.unlinkedWardsCount || 0;
        if (unlinkedCount > 0) {
            return `حفظ جديد (${unlinkedCount}/7 محفوظة)`;
        }

        return task.label || 'حفظ جديد';
    }

    getRabtLabel(): string {
        const task = this.dailyTasks?.consolidation;
        if (!task) return 'الربط';

        const unlinkedCount = this.dailyTasks?.stats?.unlinkedWardsCount || 0;

        if (unlinkedCount >= 7 && task.status !== 'done') {
            return 'الربط (مطلوب لفتح الحفظ)';
        }

        return task.label || 'الربط';
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

    private createFontFamily(fontName: string): string {
        return `"${fontName}", "Amiri", "Scheherazade New", "Cairo", "Noto Naskh Arabic", serif`;
    }

    public getFontFamily(fontName: string): string {
        return this.createFontFamily(fontName);
    }

    getPageImageUrl(pageNumber: number): string {
        const id = this.selectedMushafId;
        const isDownloaded = this.mushafDownloadStatus[id];

        if (id === 'hifz_muyassar') {
            if (this.isAndroid && isDownloaded && this.assetService.localBaseUri) {
                return Capacitor.convertFileSrc(`${this.assetService.localBaseUri}/hifz_muyassar/images/${pageNumber}.webp`);
            }
            return this.assetService.getRemotePageImageUrl(pageNumber, id);
        }

        if (this.isAndroid && isDownloaded && this.assetService.localBaseUri) {
            const folder = this.assetService.getMushafFolder(id);
            const localFileUri = `${this.assetService.localBaseUri}/${folder}images/${pageNumber}.jpg`;
            return Capacitor.convertFileSrc(localFileUri);
        }

        return this.assetService.getRemotePageImageUrl(pageNumber, id);
    }

    isImageMushaf(): boolean {
        return this.selectedMushafId === 'warsh' || this.selectedMushafId === 'tajweed' || this.selectedMushafId === 'hifz_muyassar';
    }

    getHifzMuyassarVerseStyle(verseKey: string): Record<string, string> {
        if (this.selectedMushafId !== 'hifz_muyassar' || !this.hifzMuyassarPageData) return {};
        const verseNumber = Number(verseKey.split(':')[1]);
        const item = this.hifzMuyassarPageData.coordinates?.find(c => Number(c.verse_number) === verseNumber);
        if (!item?.coords) return {};
        try {
            const points = typeof item.coords === 'string' ? JSON.parse(item.coords) : item.coords;
            if (!Array.isArray(points) || points.length < 4) return {};
            const xs = points.map((p: number[]) => Number(p[0]));
            const ys = points.map((p: number[]) => Number(p[1]));
            const left = Math.min(...xs), top = Math.min(...ys);
            const right = Math.max(...xs), bottom = Math.max(...ys);
            return {
                left: `${(left / this.hifzMuyassarImageWidth) * 100}%`,
                top: `${(top / this.hifzMuyassarImageHeight) * 100}%`,
                width: `${((right - left) / this.hifzMuyassarImageWidth) * 100}%`,
                height: `${((bottom - top) / this.hifzMuyassarImageHeight) * 100}%`
            };
        } catch (_) {
            return {};
        }
    }

    getHifzMuyassarOverlayItems(): Array<{ verseKey: string; points: string; active: boolean }> {
        if (this.selectedMushafId !== 'hifz_muyassar' || !this.hifzMuyassarPageData) return [];
        const pageVerseKeys: string[] = [];
        for (const line of this.currentMushafPage?.lines || []) {
            for (const segment of line.segments || []) {
                if (segment.verse_key && !pageVerseKeys.includes(segment.verse_key)) {
                    pageVerseKeys.push(segment.verse_key);
                }
            }
        }
        return (this.hifzMuyassarPageData.coordinates || []).map((item, index) => {
            let parsed: number[][] = [];
            try {
                parsed = typeof item.coords === 'string' ? JSON.parse(item.coords) : item.coords;
            } catch (_) { return null; }
            if (!Array.isArray(parsed) || parsed.length < 3) return null;
            // The API's `verse_number` restarts at every surah. Pair the
            // coordinate with the API verse record and convert its global
            // verse_id to surah:ayah, which remains correct across pages
            // containing more than one surah.
            const apiVerse = this.hifzMuyassarPageData?.verses?.[index];
            const verseKey = this.getVerseKeyFromGlobalId(apiVerse?.verse_id)
                || pageVerseKeys[index]
                || `1:${item.verse_number}`;
            return {
                verseKey,
                points: parsed.map(point => `${point[0]},${point[1]}`).join(' '),
                active: verseKey === this.selectedVerseKey || verseKey === this.playingVerseKey
            };
        }).filter((item): item is { verseKey: string; points: string; active: boolean } => !!item);
    }

    private getVerseKeyFromGlobalId(globalId: number | string | undefined): string | null {
        const target = Number(globalId);
        if (!Number.isFinite(target) || target < 1 || !Array.isArray(this.allSurahs)) return null;
        let firstId = 1;
        for (const surah of this.allSurahs) {
            const count = Number(surah.verses_count || surah.ayahs_count || 0);
            if (target >= firstId && target < firstId + count) {
                return `${surah.id}:${target - firstId + 1}`;
            }
            firstId += count;
        }
        return null;
    }

    onHifzMuyassarVerseClick(event: Event, verseKey: string): void {
        event.preventDefault();
        event.stopPropagation();
        this.onAyahClick(verseKey);
    }

    private async loadHifzMuyassarPageData(page: number): Promise<void> {
        if (this.selectedMushafId !== 'hifz_muyassar') {
            this.hifzMuyassarPageData = null;
            return;
        }
        try {
            this.hifzMuyassarPageData = await this.assetService.getHifzMuyassarPageData(page);
            this.cdr.detectChanges();
        } catch (error) {
            console.warn('[MushafPage] Failed to load Hifz Muyassar coordinates:', error);
            this.hifzMuyassarPageData = null;
        }
    }

    setImageFitMode(mode: 'contain' | 'fill'): void {
        this.imageFitMode = mode;
        localStorage.setItem('mushafImageFitMode', mode);
        this.cdr.detectChanges();
    }

    private async loadPagesExtra(): Promise<void> {
        try {
            const fontName = this.dataService.getFontName(this.pageNumber);
            this.fontFamily = this.createFontFamily(fontName);

            if (this.isImageMushaf()) {
                this.isFontReady = true;
                this.cdr.detectChanges();
            } else {
                // Preload current, next, and prev fonts
                const fontsToLoad = [fontName];
                if (this.pageNumber > 1) fontsToLoad.push(this.dataService.getFontName(this.pageNumber - 1));
                if (this.pageNumber < 604) fontsToLoad.push(this.dataService.getFontName(this.pageNumber + 1));

                const currentFont = fontsToLoad[0];
                const isCurrentLoaded = this.fontService.isFontLoaded(currentFont);

                if (!isCurrentLoaded) {
                    // Android Optimization: Do not hide content (isFontReady = false) to prevent severe flickering.
                    // Accept micro-FOUC instead of layout thrashing.
                    if (!this.isAndroid) {
                        this.isFontReady = false;
                        this.cdr.detectChanges();
                    }

                    // Wait for CURRENT page font with a 2.5s safety timeout.
                    // This prevents a blank screen if the font request stalls or hangs indefinitely.
                    await Promise.race([
                        this.fontService.loadFontByName(currentFont),
                        new Promise<void>(resolve => setTimeout(resolve, 2500))
                    ]);
                }

                // Load others and Basmalah in background
                const otherFonts = fontsToLoad.slice(1);
                otherFonts.forEach(f => this.fontService.loadFontByName(f).catch(() => { }));
                this.fontService.loadBasmalahFont().catch(() => { });

                // SAFETY: do NOT await document.fonts.ready — it can hang indefinitely if any
                // background font request is pending or fails silently, leaving the page blank.
                // A short delay ensures the current font is rendered before revealing content.
                await new Promise<void>(resolve => setTimeout(resolve, 400));
                this.isFontReady = true;
                this.cdr.detectChanges();
            }
        } catch (err) {
            console.error('Error loading page fonts', err);
            // CRITICAL: Always show content even if font loading fails
            this.isFontReady = true;
            this.cdr.detectChanges();
        }

        this.prevPageData$ = this.pageNumber > 1 ? this.dataService.getPage(this.pageNumber - 1).pipe(map(p => p ? this.enrichPageData(p) : undefined)) : undefined;
        this.nextPageData$ = this.pageNumber < 604 ? this.dataService.getPage(this.pageNumber + 1).pipe(map(p => p ? this.enrichPageData(p) : undefined)) : undefined;

        this.currentSurah$ = this.dataService.getSurahAtPage(this.pageNumber);
        this.currentJuz$ = this.dataService.getJuzAtPage(this.pageNumber);
        this.mushafMetadata$ = this.dataService.getMetadata();

        localStorage.setItem('lastMushafPage', this.pageNumber.toString());
    }

    private async loadPages(): Promise<void> {
        // Also update next/prev with enrichment if they are used directly
        // However, async pipe in template handles subscription, so we need to update the Observable definition
        if (this.pageNumber > 1) {
            this.prevPageData$ = this.dataService.getPage(this.pageNumber - 1).pipe(
                map(p => p ? this.enrichPageData(p) : undefined)
            );
        }
        if (this.pageNumber < 604) {
            this.nextPageData$ = this.dataService.getPage(this.pageNumber + 1).pipe(
                map(p => p ? this.enrichPageData(p) : undefined)
            );
        }
        return this.loadPagesExtra();
    }

    private getPageFromFont(fontName: string): number {
        return parseInt(fontName.replace('QCF_P', ''), 10);
    }

    public loadPage(): void {
        if (!this.keepOptionsSheet) {
            this.showOptionsSheet = false;
        }
        this.pageStartTime = Date.now();
        this.isCurrentPageAwarded = false;
        this.isLoadingPage = true;
        this.pageLoadError = null;

        // FIX: Update bookmark status when loading a new page
        this.updateBookmarkStatus();
        this.broadcastPageSync();

        // Load data for current page PRIMARY
        console.log(`📡 [MushafPage] Loading page ${this.pageNumber}...`);

        // Use mapping to enrich data
        this.currentPageData$ = this.dataService.getPage(this.pageNumber).pipe(
            map(p => p ? this.enrichPageData(p) : undefined)
        );

        this.currentPageData$.pipe(takeUntil(this.destroy$)).subscribe({
            next: (p) => {
                console.log(`✅ [MushafPage] Page ${this.pageNumber} data loaded.`);
                this.isLoadingPage = false;
                this.currentMushafPage = p || null;
                void this.loadHifzMuyassarPageData(this.pageNumber);

                // Trigger font loading and wait
                this.loadPages();

                this.cdr.detectChanges();

                if (p) {
                    this.updateAvailableSurahs(p);
                }
            },
            error: (err) => {
                console.error('❌ [MushafPage] Failed to load individual page data:', err);
                this.isLoadingPage = false;
                
                const activeMushafId = this.assetService.getSelectedMushafId();
                if (activeMushafId !== 'hafs_v1') {
                    console.warn(`[MushafPage] Selected mushaf '${activeMushafId}' failed to load. Falling back to 'hafs_v1'...`);
                    this.assetService.setSelectedMushafId('hafs_v1');
                    this.dataService.clearCache();
                    alert('عذراً، ملفات هذا المصحف غير متوفرة حالياً على الخادم. تم إرجاعك إلى المصحف الافتراضي.');
                    window.location.reload();
                    return;
                }

                this.pageLoadError = 'فشل تحميل بيانات الصفحة. يرجى إعادة المحاولة.';
                this.cdr.detectChanges();
            }
        });

        // Load secondary data and fonts in background
        this.loadPagesExtra();
        this.loadTotalUsers();
    }

    private updateAvailableSurahs(p: EnrichedMushafPage): void {
        const surahIds = new Set<number>();
        p.lines.forEach((line: EnrichedMushafLine) => {
            if (line.type === 'verse' && line.segments) {
                line.segments.forEach((seg: EnrichedMushafSegment) => {
                    const sId = parseInt(seg.verse_key.split(':')[0]);
                    surahIds.add(sId);
                });
            }
        });
        if (surahIds.size > 0) {
            this.dataService.getMetadata().pipe(takeUntil(this.destroy$)).subscribe(meta => {
                this.availableSurahs = meta.surahs.filter(s => surahIds.has(s.id)).map(s => ({
                    id: s.id,
                    nameAr: s.name,
                    nameEn: s.name
                }));
                if (this.availableSurahs.length > 0 && !this.memorizationSettings.targetSurah) {
                    this.memorizationSettings.targetSurah = this.availableSurahs[0].id;
                }
            });
        }
    }

    toggleSidebar(): void {
        this.isSidebarOpen = !this.isSidebarOpen;
        if (this.isSidebarOpen) {
            this.isSettingsOpen = false;
            this.showOptionsSheet = false;
            this.isSearchOpen = false;
            this.showAudioPlayer = false;
            this.showAudioManager = false; // NAVIGATION FIX
            this.closeTafsir();
            this.updateDownloadedStatus();
        } else {
            this.isDownloadMode = false; // Reset download mode when closing
        }
        this.cdr.detectChanges();
    }

    private async updateDownloadedStatus(): Promise<void> {
        const meta = await firstValueFrom(this.dataService.getMetadata());
        if (!meta || !(meta as any).surahs) return;

        const surahs = (meta as any).surahs;
        const checks = surahs.map(async (s: any) => {
            const isCached = await this.audioService.isSurahCached(s.id, this.currentReciterId);
            if (isCached) this.downloadedSurahs.add(s.id);
            else this.downloadedSurahs.delete(s.id);
        });

        await Promise.all(checks);
        this.cdr.detectChanges();
    }

    private enrichPageData(page: MushafPage): EnrichedMushafPage {
        if (!page) return null as any;

        // Flatten all segments to easily determine first/last
        const allSegments: EnrichedMushafSegment[] = [];
        const enrichedLines: EnrichedMushafLine[] = page.lines.map(line => {
            const enrichedSegments: EnrichedMushafSegment[] = line.segments ? line.segments.map(seg => {
                const isSecondHalf = this.isVerseInSecondHalf(seg.verse_key, page.page_number);
                const enrichedSeg: EnrichedMushafSegment = {
                    ...seg,
                    isSecondHalf,
                    staticClasses: `verse-segment ${isSecondHalf ? 'second-half-segment' : ''}`,
                    isFirstSegment: false,
                    isLastSegment: false
                };
                allSegments.push(enrichedSeg);
                return enrichedSeg;
            }) : [];

            return {
                ...line,
                segments: enrichedSegments,
                backgroundStyle: this.getLineBackground(line, page), // Pre-calc background
                shouldHide: false // Will be updated dynamically or in template if needed
            } as unknown as EnrichedMushafLine; // Cast to unknown first to avoid partial overlap error
        });

        // Calculate First/Last Segment flags in one pass
        for (let i = 0; i < allSegments.length; i++) {
            const seg = allSegments[i];
            const prev = i > 0 ? allSegments[i - 1] : null;
            const next = i < allSegments.length - 1 ? allSegments[i + 1] : null;

            // First segment of a verse?
            if (!prev || prev.verse_key !== seg.verse_key) {
                seg.isFirstSegment = true;
            }

            // Last segment of a verse?
            if (!next || next.verse_key !== seg.verse_key) {
                seg.isLastSegment = true;
                // Add ayah-marker class to static classes if it is last
                seg.staticClasses += ' ayah-marker';
            }
        }

        return {
            ...page,
            lines: enrichedLines
        } as EnrichedMushafPage;
    }

    toggleSettings(mode?: 'wird' | 'stats'): void {
        if (mode) {
            if (this.isSettingsOpen && this.settingsMode === mode) {
                this.isSettingsOpen = false;
            } else {
                this.isSettingsOpen = true;
                this.settingsMode = mode;
            }
        } else {
            this.isSettingsOpen = !this.isSettingsOpen;
        }

        if (this.isSettingsOpen) {
            this.isSidebarOpen = false;
            this.showOptionsSheet = false;
            this.isSearchOpen = false;
            this.showAudioPlayer = false;
            this.showAudioManager = false; // NAVIGATION FIX
            this.closeTafsir();
        }
        this.cdr.detectChanges();
    }

    openSupportModal(tab: 'support' | 'book' = 'support'): void {
        this.supportModalTab = tab;
        this.showSupportModal = true;
        this.cdr.detectChanges();
    }

    closeSupportModal(): void {
        this.showSupportModal = false;
        this.cdr.detectChanges();
    }

    openSupportLink(kind: 'whatsapp' | 'book'): void {
        if (kind === 'book' && Capacitor.getPlatform() === 'android') {
            // Android WebView can fail to resolve play.google.com. The market
            // scheme opens the installed Google Play app directly instead.
            const marketUrl = 'market://details?id=com.kenouz.bookstore2';
            const intentUrl = 'intent://details?id=com.kenouz.bookstore2#Intent;scheme=market;package=com.android.vending;end';
            try {
                window.location.href = marketUrl;
                setTimeout(() => {
                    if (document.visibilityState === 'visible') window.location.href = intentUrl;
                }, 700);
            } catch (_) {
                window.location.href = intentUrl;
            }
            return;
        }

        const url = kind === 'whatsapp'
            ? 'https://wa.me/message/5THZRJ4YPZLUA1'
            : 'https://play.google.com/store/apps/details?id=com.kenouz.bookstore2';
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    setTheme(theme: string): void {
        this.currentTheme = theme;
        localStorage.setItem('mushaf_theme', theme);
        this.isSettingsOpen = false; // Close settings after choosing theme
    }

    /** جلب قائمة المصاحف المتاحة من الـ API */
    loadAvailableMushafs(): void {
        this.selectedMushafId = this.assetService.getSelectedMushafId();
        this.assetService.fetchMushafList().subscribe({
            next: (list) => {
                // Keep the built-in online/API edition visible even when the
                // backend list predates this frontend feature.
                this.availableMushafs = this.ensureHifzMuyassarOption(list);
                // بعد الجلب نتحقق من حالة كل مصحف على الجهاز
                this.availableMushafs.forEach(m => this.checkMushafDownloaded(m.id));
                this.cdr.detectChanges();
            },
            error: () => {
                // في حالة فشل الاتصال نضع قائمة افتراضية كاملة لضمان عمل الواجهة
                this.availableMushafs = [
                    {
                        id: 'hafs_v1',
                        name: 'مصحف المدينة (الإصدار الأول)',
                        description: 'رواية حفص عن عاصم بالخط القديم لمصحف المدينة المنورة',
                        folder: 'hafs_v1',
                        totalFiles: 638,
                        active: true,
                        isDefault: true
                    },
                    {
                        id: 'hafs_v2',
                        name: 'مصحف المدينة (الإصدار الثاني)',
                        description: 'رواية حفص عن عاصم بالخط الجديد عالي الجودة لمصحف المدينة المنورة',
                        folder: 'hafs_v2',
                        totalFiles: 638,
                        active: true,
                        isDefault: false
                    },
                    {
                        id: 'tajweed',
                        name: 'مصحف التجويد الملون',
                        description: 'مصحف التجويد الملون لتسهيل معرفة أحكام التجويد أثناء القراءة',
                        folder: 'tajweed',
                        totalFiles: 638,
                        active: true,
                        isDefault: false
                    },
                    {
                        id: 'warsh',
                        name: 'مصحف المدينة - رواية ورش',
                        description: 'مصحف المدينة المنورة برواية ورش عن نافع بالرسم العثماني',
                        folder: 'warsh',
                        totalFiles: 638,
                        active: true,
                        isDefault: false
                    },
                    {
                        id: 'hifz_muyassar',
                        name: 'مصحف الحفظ الميسر',
                        description: 'نسخة مصورة تساعد على الحفظ مع تظليل الآية أثناء التلاوة',
                        folder: 'hifz_muyassar',
                        totalFiles: 1208,
                        active: true,
                        isDefault: false
                    }
                ];
                this.availableMushafs.forEach(m => this.checkMushafDownloaded(m.id));
                this.cdr.detectChanges();
            }
        });
    }

    private ensureHifzMuyassarOption(list: any[] | null | undefined): any[] {
        const mushafs = Array.isArray(list) ? [...list] : [];
        if (!mushafs.some(m => m?.id === 'hifz_muyassar')) {
            mushafs.push({
                id: 'hifz_muyassar',
                name: 'مصحف الحفظ الميسر',
                description: 'نسخة مصورة تساعد على الحفظ مع تظليل الآية أثناء التلاوة',
                folder: 'hifz_muyassar',
                totalFiles: 1208,
                active: true,
                isDefault: false
            });
        }
        return mushafs;
    }

    /** التحقق ما إذا كان مصحف معين محملاً محلياً */
    async checkMushafDownloaded(mushafId: string): Promise<void> {
        const isDownloaded = await this.assetService.checkForAssets(mushafId);
        this.mushafDownloadStatus[mushafId] = isDownloaded;
        this.cdr.detectChanges();
    }

    /** تحديد مصحف للقراءة (يجب أن يكون محملاً أو على الويب) */
    selectMushaf(mushafId: string): void {
        if (this.isMushafDownloading) return;
        this.assetService.setSelectedMushafId(mushafId);
        this.selectedMushafId = mushafId;
        this.dataService.clearCache();
        // إعادة تحميل الصفحة لتطبيق الخطوط الجديدة بشكل صحيح
        window.location.reload();
    }

    /** تحميل مصحف جديد على الجهاز */
    async downloadMushaf(mushafId: string): Promise<void> {
        if (this.isMushafDownloading) return;

        this.isMushafDownloading = true;
        this.downloadingMushafId = mushafId;
        this.failedDownloadMushafId = null; // Clear previous failure
        this.mushafDownloadError = null;
        this.mushafDownloadProgress = 0;

        const progressSub = this.assetService.progress$.subscribe(p => {
            this.mushafDownloadProgress = p;
            this.cdr.detectChanges();
        });
        const msgSub = this.assetService.message$.subscribe(m => {
            this.mushafDownloadMessage = m;
            this.cdr.detectChanges();
        });
        const errorSub = this.assetService.error$.subscribe(e => {
            this.mushafDownloadError = e;
            this.cdr.detectChanges();
        });

        try {
            await this.assetService.downloadAssets(mushafId);
            this.mushafDownloadStatus[mushafId] = true;
        } catch (err) {
            console.error('[Mushaf] Download failed:', err);
            this.failedDownloadMushafId = mushafId; // Remember which mushaf failed for retry
        } finally {
            progressSub.unsubscribe();
            msgSub.unsubscribe();
            errorSub.unsubscribe();
            this.isMushafDownloading = false;
            this.downloadingMushafId = null;
            this.cdr.detectChanges();
        }
    }


    goToPage(page: number): void {
        // OPTIMIZATION: Only hide content if the target font isn't ready
        // This prevents flickering/blank screen when navigating to cached pages
        const targetFont = this.dataService.getFontName(page);

        // Disabled per user request (prefer no hiding)
        // if (!this.fontService.isFontLoaded(targetFont)) {
        //     this.isFontReady = false;
        //     this.cdr.detectChanges();
        // }

        this.pageNumber = page;
        this.isSidebarOpen = false;
        this.isSettingsOpen = false;

        // --- SLIDER ALIGNMENT FIX ---
        // Ensure the slider is perfectly centered and animations are cleared
        this.slideOffset = 0;
        this.isAnimating = false;
        this.swipeDirection = 'none';
        this.updateSliderTransform();

        // Defensive: Reset any internal page scrolling that might have occurred
        const pageElements = document.querySelectorAll('.mushaf-page');
        pageElements.forEach(el => {
            if (el instanceof HTMLElement) {
                el.scrollLeft = 0;
            }
        });

        // --- SELECTION SYNC ---
        // Clear selection if it's on a different page to avoid confusion during start logic
        if (this.selectedVerseKey) {
            this.getPageForVerseKey(this.selectedVerseKey).then(p => {
                if (p !== page) this.selectedVerseKey = null;
            });
        }

        // --- CONTINUOUS MODE SUPPORT ---
        if (this.isContinuousMode) {
            this.prepareVerticalLayout();
        } else {
            this.loadPage();
        }
    }

    openSidebarToTab(tab: 'surahs' | 'juzs' | 'pages'): void {
        this.sidebarTab = tab;
        this.isSidebarOpen = true;
        this.showAudioPlayer = false; // Always close audio player when opening index
        this.isSettingsOpen = false; // Ensure settings are closed when opening index
        this.showOptionsSheet = false; // Ensure Hifz options are closed
        this.sidebarOffset = 0; // Reset offset manually if needed when opening index
    }

    nextPage(): void {
        // Award points for completing the CURRENT page before moving if enough time spent (min 3s)
        const timeSpent = Date.now() - this.pageStartTime;
        if (timeSpent >= 3000 && !this.isCurrentPageAwarded) {
            this.awardPagePoints();
        }

        // RELAXED BOUNDARY: Allow users to move past their ward in Recitation
        // but still trigger the sync/completion logic if they reach the end.
        if (this.currentTaskType === 'recitation') {
            const task = this.dailyTasks?.recitation;
            const target = task?.amount || 20;

            if (this.sessionCounters.pagesRead >= target) {
                console.log('✅ [Mushaf] Recitation Target Reached. Transitioning to "Extra Credit" mode.');
                this.checkAutoSync('tilawo');
                // We DON'T exit anymore; we just let them continue reading if they want.
            }
        }

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
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.swipeDirection = direction;
        this.isWaitingForPageTurn = false;

        // Apply animating class MANUALLY via Renderer for high precision
        if (this.mushafSliderEl) {
            this.renderer.addClass(this.mushafSliderEl.nativeElement, 'animating');
        }

        // OPTIMIZATION: Predict next page and check if font is loaded
        let targetPage = this.pageNumber;
        if (direction === 'next' && this.pageNumber < 604) targetPage++;
        else if (direction === 'prev' && this.pageNumber > 1) targetPage--;

        // ALWAYS hide initially during page turn to prevent any symbol flashes
        this.isFontReady = false;
        this.cdr.detectChanges();

        if (direction === 'next') {
            this.slideOffset = window.innerWidth; // Move toward 0vw (Next is on Left)
        } else {
            this.slideOffset = -window.innerWidth; // Move toward -200vw (Prev is on Right)
        }
        this.updateSliderTransform();

        // Wait for the slide animation (250ms) to complete
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

            // Remove animating class and reset transform
            if (this.mushafSliderEl) {
                this.renderer.removeClass(this.mushafSliderEl.nativeElement, 'animating');
                this.updateSliderTransform();
            }

            this.loadPage();

            // Reset timer and awarding status for the new page
            this.pageStartTime = Date.now();
            this.isCurrentPageAwarded = false;

            // Reset scroll to top when changing pages
            const pageElements = document.querySelectorAll('.mushaf-page');
            pageElements.forEach((el) => {
                if (el instanceof HTMLElement) el.scrollTop = 0;
            });

            // Recalculate shift after transition is complete and new page is centered
            setTimeout(() => {
                this.calculateAutoShift();
                // If in voice mode, update text for the new page
                if (this.isMemorizationMode && this.memorizationSettings.inputMethod === 'voice') {
                    this.updateVerseDataWithStandardText();
                }
                this.cdr.detectChanges(); // Final sync for the new page content
            }, 30);

            this.cdr.detectChanges(); // Immediate sync for navigation state
        }, 300); // Synced with CSS transition (0.3s)
    }

    lastTapTime: number = 0;
    /** Prevents verse long-press from firing when a double-tap was just detected */
    isDoubleTapPending: boolean = false;
    showNavbar: boolean = true; // Use this to toggle fixed header visibility

    onTouchStart(event: TouchEvent): void {
        // if (this.isTafsirOpen) return; // REMOVED to allow double-tap in Tafsir
        // console.log('[Touch] Start', event.touches[0].clientX);

        // Interrupt any ongoing animation immediately
        if (this.isAnimating) {
            this.isAnimating = false;
            if (this.mushafSliderEl) {
                this.renderer.removeClass(this.mushafSliderEl.nativeElement, 'animating');
            }
        }

        this.touchStartX = event.touches[0].clientX;
        this.touchStartY = event.touches[0].clientY;
        this.touchStartTime = Date.now();

        // Double Tap Detection
        if (this.touchStartTime - this.lastTapTime < 300) {
            // Mark pending so verse long-press won't accidentally fire on second tap
            this.isDoubleTapPending = true;
            this.handleDoubleTap(); // Runs inside Angular Zone (template binding) — UI updates correctly
            setTimeout(() => { this.isDoubleTapPending = false; }, 350);
        }
        this.lastTapTime = this.touchStartTime;

        this.slideOffset = 0;
        this.isVerticalScroll = false;
        this.hasMoved = false;

        if (this.isMemorizationMode && !this.isTestPhase) {
            // Logic for sheet dragging or simple swipe in memo mode
            if (this.memorizationSettings.type === 'recitation' || this.memorizationSettings.type === 'muraaja') {
                // Allow default swipe?
            }
        }
        // NOTE: cdr.markForCheck() deliberately omitted here — touchmove runs outside Zone
        // (see ngAfterViewInit) and re-entry into Zone happens only on actual state changes.
    }

    handleDoubleTap(): void {
        // Check if ANY persistent overlay or side-pane is open
        const anyOverlayOpen = this.isSidebarOpen || this.showAudioPlayer ||
            this.isSearchOpen || this.isTafsirOpen ||
            this.isSettingsOpen || this.showOptionsSheet ||
            this.showInfoModal || this.showReciterModal;

        if (anyOverlayOpen) {
            // Priority 1: Close all overlays if any are open
            this.isSidebarOpen = false;
            this.isSettingsOpen = false;
            this.isSearchOpen = false;
            this.showAudioPlayer = false;
            // this.isTafsirOpen = false; // DON'T close Tafsir on double tap
            this.showOptionsSheet = false;
            this.showInfoModal = false;
            this.showReciterModal = false;

            // Explicitly ensure navbar is hidden when user wants to "clear" the screen
            // Explicitly ensure navbar is hidden when user wants to "clear" the screen
            // But if Tafsir is OPEN, we just toggle the navbar, we don't close everything else
            if (this.isTafsirOpen) {
                this.showNavbar = !this.showNavbar;
            } else {
                this.showNavbar = false;
            }

            console.log('[Mushaf] Double-tap: Closed overlays (except Tafsir).');
        } else {
            // Priority 2: If everything is already closed, toggle the Navbar (bars)
            this.showNavbar = !this.showNavbar;
            console.log('[Mushaf] Double-tap: Toggled Navbar to', this.showNavbar);
        }

        this.cdr.detectChanges();
    }

    // Verse Selection Logic (Long Press for First Verse)
    private verseTouchTimer: any;
    private isLongPressTriggered: boolean = false;

    onVerseTouchStart(event: TouchEvent | MouseEvent, verseKey: string): void {
        // DISABLE SELECTION DURING PLAYBACK (User Request)
        if (this.audioService.snapshot.isPlaying) {
            return;
        }

        this.isLongPressTriggered = false;

        // ROBUST CHECK: Is there ANY visually selected verse?
        // We broaden the check to:
        // 1. Any visible page wrapper (current, next, prev)
        // 2. All possible active classes (active-verse, playing-verse, audio-active, selected-range, error-verse)
        const selector = '.mushaf-page-wrapper .active-verse, .mushaf-page-wrapper .playing-verse, .mushaf-page-wrapper .audio-active, .mushaf-page-wrapper .selected-range, .mushaf-page-wrapper .error-verse';
        const activeVerseEl = document.querySelector(selector);
        const isSelectionOnPage = !!activeVerseEl;

        // If NO selection (Idle state), require Long Press to start interactions
        if (!isSelectionOnPage) {
            // CONFLICT FIX: Skip long-press if a double-tap was just detected
            if (this.isDoubleTapPending) {
                return;
            }
            this.verseTouchTimer = setTimeout(() => {
                // Double-check we are still not in a pending double-tap state
                if (this.isDoubleTapPending) return;
                this.isLongPressTriggered = true;
                this.ngZone.run(() => {
                    this.onAyahClick(verseKey);
                    // Haptic feedback if available (navigator.vibrate)
                    if (navigator.vibrate) navigator.vibrate(50);
                });
            }, 600); // 600ms long press requirement
        }
    }

    onVerseTouchEnd(event: TouchEvent | MouseEvent, verseKey: string): void {
        // DISABLE SELECTION DURING PLAYBACK (User Request)
        if (this.audioService.snapshot.isPlaying) {
            return;
        }

        clearTimeout(this.verseTouchTimer);

        // If long press already happened, consume event and stop
        if (this.isLongPressTriggered) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // TOUCH CONFLICT FIX: If user actually moved, don't trigger selection
        if (this.hasMoved) {
            return;
        }

        // Check Visual State again with purely visual logic
        const selector = '.mushaf-page-wrapper .active-verse, .mushaf-page-wrapper .playing-verse, .mushaf-page-wrapper .audio-active, .mushaf-page-wrapper .selected-range, .mushaf-page-wrapper .error-verse';
        const activeVerseEl = document.querySelector(selector);
        const isSelectionOnPage = !!activeVerseEl;

        // If NO selection on page, Ignore Short Tap (Require Long Press)
        if (!isSelectionOnPage) {
            return;
        }

        // If 'Selection Mode' is active (any verse highlighted), Short tap is valid
        event.preventDefault(); // Prevent phantom clicks/mouse events
        this.onAyahClick(verseKey);
        event.stopPropagation(); // Standard consumption
    }



    // Prevent context menu on long press
    onContextMenu(event: Event): void {
        event.preventDefault();
    }

    onTouchMove(event: TouchEvent): void {
        if (this.isTafsirOpen) return;
        clearTimeout(this.verseTouchTimer); // Cancel long press if moving

        if (this.isAnimating) return;
        const currentX = event.touches[0].clientX;
        const currentY = event.touches[0].clientY;
        const deltaX = currentX - this.touchStartX;
        const deltaY = currentY - this.touchStartY;

        // Mark as moved if movement exceeds small threshold
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            this.hasMoved = true;
        }

        // Determine if this is a vertical scroll (once per gesture)
        if (!this.isVerticalScroll && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
            this.isVerticalScroll = true;
        }

        // If scrolling vertically, don't move pages and allow normal scrolling
        if (this.isVerticalScroll) {
            this.slideOffset = 0;
            return;
        }

        // Prevent default scrolling when swiping horizontally (only if horizontal movement is significant)
        if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
            if (event.cancelable) event.preventDefault();
        }

        // Strict boundary checking:
        // No movement allowed beyond first/last page.
        if (this.pageNumber === 1 && deltaX < 0) {
            this.slideOffset = 0;
            this.updateSliderTransform();
            return;
        }
        if (this.pageNumber === 604 && deltaX > 0) {
            this.slideOffset = 0;
            this.updateSliderTransform();
            return;
        }

        this.slideOffset = deltaX;
        // Optimization: Update transform directly via Renderer2 to bypass CD 
        this.updateSliderTransform();
    }

    private updateSliderTransform(): void {
        if (this.mushafSliderEl) {
            const offset = this.slideOffset;
            this.renderer.setStyle(
                this.mushafSliderEl.nativeElement,
                'transform',
                `translate3d(calc(-100vw + ${offset}px), 0, 0)`
            );
        }
    }

    onTouchEnd(event: TouchEvent): void {
        if (this.isTafsirOpen) return;
        if (this.isAnimating) {
            this.resetSwipe();
            return;
        }

        const deltaX = this.slideOffset;
        const deltaTime = Date.now() - this.touchStartTime;

        // If touch hasn't moved significantly, treat as tap
        if (!this.hasMoved && deltaTime < 300) {
            // Handle tap for memorization mode
            this.handleMushafTap(event);
            this.resetSwipe();
            return;
        }

        // Calculate velocity only if there was movement
        const velocity = deltaTime > 0 ? Math.abs(deltaX) / deltaTime : 0;

        // Improved threshold for swipe detection (5% of window width)
        const threshold = window.innerWidth * 0.05;

        // Detect swipe if movement exceeds threshold or has sufficient velocity
        if (Math.abs(deltaX) > threshold || (this.hasMoved && velocity > 0.2)) {
            // Swipe Right (deltaX > 0) -> Next
            // Swipe Left (deltaX < 0) -> Prev
            if (deltaX > 0 && this.pageNumber < 604) {
                // Award points for completing the CURRENT page before moving if enough time spent (min 3s)
                const timeSpent = Date.now() - this.pageStartTime;
                if (timeSpent >= 3000 && !this.isCurrentPageAwarded) {
                    this.awardPagePoints();
                }
                this.ngZone.run(() => this.triggerPageChange('next'));
            } else if (deltaX < 0 && this.pageNumber > 1) {
                this.ngZone.run(() => this.triggerPageChange('prev'));
            } else {
                this.ngZone.run(() => this.resetSwipe());
            }
        } else {
            // Small movement - treat as tap if in memorization mode
            if (deltaTime < 300) {
                this.ngZone.run(() => {
                    this.handleMushafTap(event);
                });
            }
            this.ngZone.run(() => this.resetSwipe());
        }
    }

    private resetSwipe(): void {
        this.slideOffset = 0;
        this.isAnimating = false;
        this.swipeDirection = 'none';
        this.hasMoved = false;
        this.isVerticalScroll = false;
        if (this.mushafSliderEl) {
            this.renderer.removeClass(this.mushafSliderEl.nativeElement, 'animating');
        }
        this.updateSliderTransform();
    }

    private handleMushafTap(event: TouchEvent): void {
        // IGNORE taps if tafsir is open
        if (this.isTafsirOpen) return;

        // IGNORE taps inside the footer or test card
        const target = event.target as HTMLElement;
        if (target.closest && (target.closest('.memorization-footer') || target.closest('.test-card') || target.closest('.audio-manager-modal'))) return;

        const now = Date.now();
        if (now - this.lastIncrementTime < 150) return; // Ignore rapid taps (150ms buffer)
        this.lastIncrementTime = now;

        const isMuraaja = this.memorizationSettings.type === 'muraaja';
        const isHifz = this.memorizationSettings.type === 'hifz';
        const isTouch = this.memorizationSettings.inputMethod === 'touch';

        if (this.isMemorizationMode && (isMuraaja || isHifz) && isTouch && !this.isTestPhase && this.memoMethod === 'manual') {
            // Get touch coordinates
            const touch = event.changedTouches[0];
            const clientX = touch.clientX;
            const clientY = touch.clientY;

            // Add ripple animation
            const id = this.rippleId++;
            this.ripples.push({ x: clientX, y: clientY, id });

            // Remove ripple after animation
            setTimeout(() => {
                this.ripples = this.ripples.filter(r => r.id !== id);
                this.cdr.detectChanges();
            }, 600);

            // Trigger action
            if (this.isGroupPhase) {
                this.incrementGroupRepetition();
            } else {
                this.incrementRepetition();
            }
            this.cdr.detectChanges();
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

    async handleMushafClick(event: MouseEvent | TouchEvent): Promise<void> {
        const target = event.target as HTMLElement;
        // IGNORE clicks inside the footer or test card
        if (target.closest('.memorization-footer') || target.closest('.test-card') || target.closest('.audio-manager-modal')) return;

        const now = Date.now();
        if (now - this.lastIncrementTime < 150) return; // Ignore rapid double-triggers (150ms buffer)
        this.lastIncrementTime = now;

        const isMuraaja = this.memorizationSettings.type === 'muraaja';
        const isHifz = this.memorizationSettings.type === 'hifz';
        const isTouch = this.memorizationSettings.inputMethod === 'touch';

        if (this.isMemorizationMode && (isMuraaja || isHifz) && isTouch && !this.isTestPhase && this.memoMethod === 'manual') {
            // Add ripple animation
            const clientX = (event as MouseEvent).clientX !== undefined ? (event as MouseEvent).clientX : (event as TouchEvent).touches[0].clientX;
            const clientY = (event as MouseEvent).clientY !== undefined ? (event as MouseEvent).clientY : (event as TouchEvent).touches[0].clientY;

            const id = this.rippleId++;
            this.ripples.push({ x: clientX, y: clientY, id });

            // Remove ripple after animation
            setTimeout(() => {
                this.ripples = this.ripples.filter(r => r.id !== id);
                this.cdr.detectChanges();
            }, 600);

            // Trigger action
            if (this.isGroupPhase) {
                this.incrementGroupRepetition();
            } else {
                await this.incrementRepetition();
            }
            this.cdr.detectChanges();
        }
    }



    selectDailyRecitationWard(): void {
        const task = this.dailyTasks?.recitation;
        if (!task) return;

        this.memorizationSettings.type = 'recitation';
        this.memorizationSettings.range = 'daily_ward';

        // Auto-configure range based on daily task
        const surahId = task.surah || task.surahId || task.surah_id || (task.position ? task.position.surah : 0);
        if (surahId) this.memorizationSettings.targetSurah = Number(surahId);

        const unit = (task.unit || task.target || 'page').toLowerCase();
        if (unit.includes('verse')) {
            this.memorizationSettings.surahStartVerse = Number(task.verse || task.verseNumber || 1);
            this.memorizationSettings.surahEndVerse = this.memorizationSettings.surahStartVerse + (task.amount || 1) - 1;
        } else {
            // Page-based: use 999 for end verse to include whole page
            const startV = Number(task.verse || task.verseNumber || 1);
            this.memorizationSettings.surahStartVerse = startV;
            this.memorizationSettings.surahEndVerse = 999;
        }

        console.log('[Mushaf] Daily Recitation Ward selected:', JSON.stringify(this.memorizationSettings));
    }

    closeOptionsSheet(): void {
        console.log('[Mushaf] Closing options sheet');
        this.showOptionsSheet = false;
        this.selectedVerseKey = ''; // Reset selection to prevent playback offset
    }

    async startMemorization(): Promise<void> {
        this.showOptionsSheet = false;
        this.isMemorizationMode = true;
        await this.audioService.setReciter(this.hifzReciterId, false); // Ensure reciter is synced when entering mode
        this.showNavbar = false; // AUTO-HIDE UI: Promptly hide navbar for all hifz/ward modes
        this.showAudioPlayer = false; // NEW: Close audio player when starting new memorization
        this.isTestPhase = false;
        this.isGroupPhase = false;

        // Initialize mode: If auto-repeat was already active OR repetition settings are set (even for recitation), start in 'auto'
        const hasRepetition = this.memorizationSettings.ayahRepeat > 1 || this.memorizationSettings.groupRepeat > 1;
        this.memoMethod = ((this.isAutoRepeat || hasRepetition) && this.memorizationSettings.type !== 'muraaja') ? 'auto' : 'manual';
        if (hasRepetition && this.memorizationSettings.type === 'recitation') {
            this.isAutoRepeat = true; // Force auto-repeat flag for recitation with repetition
        }

        // For Recitation, also trigger the reading session (timer/auto-points)
        if (this.memorizationSettings.type === 'recitation') {
            this.isReadingActive = true;
            this.pageStartTime = Date.now();
        }

        // FIX: If user explicitly selected 'Page' range in bottom sheet, 
        // enforce starting from the BEGINNING of the page (Verse 1), ignoring the specific clicked ayah.
        if (this.memorizationSettings.range === 'page' || this.memorizationSettings.range === 'daily_ward') {
            this.memorizationSettings.surahStartVerse = 1;
            this.memorizationSettings.surahEndVerse = 999;
            this.memorizationSettings.selectedHalf = null;
        }

        // Sync audio playback range
        // NEW: For Hifz/Muraaja auto-repeat, we MUST use 'single' (verse-by-verse) to allow automated repetition flow
        // FIX: Also force 'single' if we are in 'recitation' BUT have specific ranges (Surah/Half-Page) OR repetition active
        // This allows the component (MushafPage) to handle the logic instead of the Service just playing the whole track.
        const playbackRange = (this.memorizationSettings.type === 'recitation' && !hasRepetition && this.memorizationSettings.range === 'page' && !this.memorizationSettings.selectedHalf)
            ? 'page' // Only use simpler 'page' mode if it's a full page recitation with NO repetition
            : 'single'; // Otherwise, component controls verse-by-verse for repetition or specific ranges

        this.audioService.updatePlaybackState({
            playbackRange: playbackRange,
            externalPlaybackControl: true // Component takes full control
        });
        this.currentAyahIndex = 0;
        this.currentWordIndex = (this.memorizationSettings.type === 'muraaja' && this.memorizationSettings.hideType === 'word') ? -1 : 0;
        this.currentRepetition = 1;

        // Reset session counters to ensure accurate progress tracking for this task
        this.sessionCounters = {
            pagesRead: 0,
            versesMemorized: 0,
            pagesReviewed: 0,
            versesReviewed: 0
        };

        // Clear error tracking for new session
        this.errorWords.clear();
        this.skippedAyahs.clear();

        if (this.memorizationSettings.type === 'muraaja') {
            this.memorizationSettings.ayahRepeat = 1;
            this.memorizationSettings.groupRepeat = 1;

            // FIX: Enforce 'ayah' hide type for Muraaja to prevent full-page reveal
            // We force it unconditionally for now if it's potentially 'page' or missing.
            // Also log it to confirm.
            if (!this.memorizationSettings.hideType || (this.memorizationSettings.hideType as any) === 'page') {
                console.log('[Mushaf] Forcing hideType to AYAH for Muraaja task.');
                this.memorizationSettings.hideType = 'ayah';
            }
        }

        console.log('[Mushaf] Starting Memorization. Settings:', JSON.parse(JSON.stringify(this.memorizationSettings)));

        // Capture initial progress states to allow cumulative counters during session
        if (this.dailyTasks) {
            this.initialTaskProgress['hifz'] = this.dailyTasks.new_memorization?.amountDone || 0;
            this.initialTaskProgress['muraja'] = this.dailyTasks.consolidation?.amountDone || 0;
            this.initialTaskProgress['deepMuraja' as any] = this.dailyTasks.revision?.amountDone || 0;
            this.initialTaskProgress['tilawo'] = this.dailyTasks.recitation?.amountDone || 0;
        }

        console.log('[Hifz] startMemorization called with settings:', JSON.stringify(this.memorizationSettings));

        // Logic to determine sessionAyahs based on range
        await this.prepareSessionAyahs();

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

        this.pageVerticalShift = 0;
        this.isWaitingForPageTurn = false;
    }

    private async prepareSessionAyahs(): Promise<void> {
        let range = this.memorizationSettings.range;
        const pageNumber = this.pageNumber;

        console.log(`[Hifz Session] prepareSessionAyahs START: range=${range}, page=${pageNumber}`);

        // Handle daily ward by mapping to page or surah based on the active task
        if (range === 'daily_ward') {
            const activeTask = (this.currentTaskType === 'new_memorization' || this.currentTaskType === 'hifz') ? this.dailyTasks?.new_memorization :
                (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') ? this.dailyTasks?.revision :
                    (this.currentTaskType === 'recitation' || this.currentTaskType === 'tilawo') ? this.dailyTasks?.recitation :
                        this.dailyTasks?.consolidation;

            const unit = (activeTask?.unit || activeTask?.target || 'page').toLowerCase();
            if (activeTask?.isRabt && (activeTask as any)?.verses?.length > 0) {
                range = 'custom';
            } else {
                range = (activeTask?.isRabt || !unit.includes('verse')) ? 'page' : 'surah';
            }
            console.log(`[Hifz Session] daily_ward mapped to: ${range} for task: ${this.currentTaskType}`);
        }

        if (range === 'page') {
            // Priority: Load the page range requested
            const activeTask = (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') ? this.dailyTasks?.revision :
                (this.currentTaskType === 'recitation' || this.currentTaskType === 'tilawo') ? this.dailyTasks?.recitation :
                    (this.currentTaskType === 'consolidation' || this.currentTaskType === 'muraja') ? this.dailyTasks?.consolidation :
                        this.dailyTasks?.new_memorization;

            const isReview = (this.memorizationSettings.type === 'muraaja' || this.currentTaskType === 'muraja' || this.currentTaskType === 'consolidation' || this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja');
            // Determine amount of pages to load
            const amount = (activeTask?.isRabt || (!activeTask && isReview)) ? Math.max(activeTask?.amount || 1, 3) : (activeTask?.amount || 1);
            const pagesToLoad: Observable<MushafPage | undefined>[] = [];

            for (let pgIdx = 0; pgIdx < amount; pgIdx++) {
                const p = pageNumber + pgIdx;
                if (p <= 604) pagesToLoad.push(this.dataService.getPage(p).pipe(take(1)));
            }

            const pagesData = await firstValueFrom(forkJoin(pagesToLoad)) as (MushafPage | undefined)[];
            if (pagesData && pagesData.length > 0) {
                // Get all ayahs on the requested page(s). Do NOT pass a surah filter yet to ensure cross-surah pages work.
                let allAyahs = this.extractVerseKeys(pagesData.filter((p): p is MushafPage => !!p));

                const start = this.memorizationSettings.surahStartVerse || 1;
                const end = this.memorizationSettings.surahEndVerse || 999;
                const targetS = this.memorizationSettings.targetSurah || 0;
                const isStrictReview = isReview && activeTask && !activeTask.isRabt;

                // Handle basic range restrictions
                if (activeTask?.isRabt || (!activeTask && isReview)) {
                    // Linking or Manual Review: Start from where they left off or specific verse
                    const startKey = (activeTask?.verses && activeTask.verses.length > 0) ? activeTask.verses[0] : `${targetS}:${start}`;
                    const startIndex = allAyahs.indexOf(startKey);
                    if (startIndex !== -1) {
                        allAyahs = allAyahs.slice(startIndex);
                    }
                } else if (isStrictReview && activeTask.verses && activeTask.verses.length > 0) {
                    // Mandatory Review from Plan: Respect plan verses strictly
                    const startKey = activeTask.verses[0];
                    const endKey = activeTask.verses[activeTask.verses.length - 1];
                    const startIndex = allAyahs.indexOf(startKey);
                    const endIndex = allAyahs.indexOf(endKey);

                    if (startIndex !== -1 && endIndex !== -1) {
                        allAyahs = allAyahs.slice(startIndex, endIndex + 1);
                    } else if (startIndex !== -1) {
                        allAyahs = allAyahs.slice(startIndex);
                    }
                } else if (this.memorizationSettings.customStartVerse || this.memorizationSettings.customEndVerse) {
                    // User manually specified a custom sub-range
                    const sKey = this.memorizationSettings.customStartVerse || allAyahs[0];
                    const eKey = this.memorizationSettings.customEndVerse || allAyahs[allAyahs.length - 1];

                    const sIdx = allAyahs.indexOf(sKey);
                    const eIdx = allAyahs.indexOf(eKey);

                    if (sIdx !== -1 && eIdx !== -1) {
                        allAyahs = allAyahs.slice(sIdx, eIdx + 1);
                    } else if (sIdx !== -1) {
                        allAyahs = allAyahs.slice(sIdx);
                    } else if (eIdx !== -1) {
                        allAyahs = allAyahs.slice(0, eIdx + 1);
                    }
                }
                // Default: use the full page content (allAyahs is untouched)

                this.sessionAyahs = allAyahs;
                console.log(`[Hifz Session] range=page/dailyWard: sessionAyahs=${this.sessionAyahs.length}`);
            } else {
                console.warn('[Hifz Session] page mode: NO PAGE DATA!');
            }
        }

        else if (range === 'half_page') {
            const page: any = await firstValueFrom(this.currentPageData$?.pipe(take(1)) || of(undefined));
            if (page) {
                // Get ALL ayahs on the page first
                let allAyahs = this.extractVerseKeys([page]);
                const splitHalf = this.memorizationSettings.selectedHalf || 'first';

                const targetSurah = this.memorizationSettings.targetSurah;
                const targetVerseStart = this.memorizationSettings.surahStartVerse || 1;
                const targetVerseEnd = this.memorizationSettings.surahEndVerse || 999;

                const boundaryKey = `${targetSurah}:${splitHalf === 'first' ? targetVerseEnd : targetVerseStart}`;
                const boundaryIdx = allAyahs.indexOf(boundaryKey);

                if (boundaryIdx !== -1) {
                    if (splitHalf === 'first') {
                        allAyahs = allAyahs.slice(0, boundaryIdx + 1);
                    } else {
                        allAyahs = allAyahs.slice(boundaryIdx);
                    }
                } else {
                    // Fallback to surah-specific filtering if split key not found (defensive)
                    allAyahs = allAyahs.filter(vKey => {
                        const [s, n] = vKey.split(':').map(Number);
                        if (s !== targetSurah) return splitHalf === 'first' ? s < targetSurah : s > targetSurah;
                        return n >= targetVerseStart && n <= targetVerseEnd;
                    });
                }

                this.sessionAyahs = allAyahs;
                console.log(`[Hifz Session] range=half_page: type=${splitHalf}, ayahs=${this.sessionAyahs.length}`);
            }
        }

        else if (range === 'surah') {
            const targetId = this.memorizationSettings.targetSurah;
            let surahPromise: Observable<SurahMetadata | undefined>;

            if (targetId) {
                surahPromise = this.dataService.getMetadata().pipe(map((m: MushafMetadata) => m.surahs.find((s: SurahMetadata) => s.id === targetId)));
            } else {
                surahPromise = this.dataService.getSurahAtPage(pageNumber);
            }

            const surah = await firstValueFrom(surahPromise.pipe(take(1)));
            if (surah) {
                const pages = await firstValueFrom(this.dataService.getMushaf().pipe(take(1)));
                const surahPages = pages.filter(p => p.page_number >= surah.start_page && p.page_number <= surah.end_page);
                const allAyahs = this.extractVerseKeys(surahPages, surah.id);

                const start = this.memorizationSettings.surahStartVerse || 1;
                const end = this.memorizationSettings.surahEndVerse || surah.verses_count;
                const targetS = surah.id;

                this.sessionAyahs = allAyahs.filter(vKey => {
                    const [vS, vN] = vKey.split(':').map(Number);
                    if (vS < targetS) return false;
                    if (vS === targetS && vN < start) return false;
                    if (vS === targetS && vN > end) return false;
                    return true;
                });
            }
        }

        else if (range === 'juz') {
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

        else if (range === 'custom') {
            const activeTask = this.dailyTasks?.consolidation;
            let allAyahs = [...((activeTask as any)?.verses || [])];

            // For custom ranges (Rabt), we generally just use what's provided. 
            // If there is a need to merge with new memorization, we do it here.
            if ((activeTask as any)?.includeCurrentWard && this.dailyTasks?.new_memorization) {
                const hifzTask = this.dailyTasks.new_memorization;
                try {
                    const hifzResolve = await this.resolveTaskStartVerse(hifzTask);
                    let currentWardAyahs: string[] = [];

                    if (hifzResolve) {
                        const pNum = hifzResolve.page;
                        const unit = (hifzTask.unit || hifzTask.target || 'page').toLowerCase();

                        if (unit === 'verse' || unit === 'verses') {
                            let currentKey = hifzResolve.verseKey;
                            const count = Number(hifzTask.amount || 1);
                            for (let aIdx = 0; aIdx < count; aIdx++) {
                                currentWardAyahs.push(currentKey);
                                currentKey = this.calculateNextVerseKey(currentKey);
                            }
                        } else {
                            // Page based
                            const pageData = await firstValueFrom(this.dataService.getPage(pNum).pipe(take(1)));
                            if (pageData) {
                                let pageAyahs = this.getJustKeys(pageData);
                                if (unit === 'half_page') {
                                    const isSecond = this.isVerseInSecondHalf(hifzResolve.verseKey, pNum);
                                    pageAyahs = pageAyahs.filter(v => this.isVerseInSecondHalf(v, pNum) === isSecond);
                                }
                                currentWardAyahs = pageAyahs;
                            }
                        }
                    }

                    if (currentWardAyahs.length > 0) {
                        allAyahs = [...allAyahs, ...currentWardAyahs];
                        allAyahs = Array.from(new Set(allAyahs));
                    }
                } catch (err) {
                    console.warn('⚠️ [Hifz Session] Failed to merge active ward into Rabt:', err);
                }
            }

            this.sessionAyahs = allAyahs;
            // Ensure we have data for these verses loaded
            if (this.sessionAyahs.length > 0) {
                const mushaf = await firstValueFrom(this.dataService.getMushaf().pipe(take(1)));
                const sessionKeys = new Set(this.sessionAyahs);
                const relevantPages = mushaf.filter(p =>
                    p.lines.some(l => l.segments?.some(s => sessionKeys.has(s.verse_key)))
                );

                if (relevantPages.length > 0) {
                    this.extractVerseKeys(relevantPages);
                    this.sessionAyahs = allAyahs;
                }
            }
        }

        // --- PRECISION TARGETING FOR HIFZ ---
        // Apply to ALL ranges if it's a Hifz session
        const activeTaskForHifz = (this.currentTaskType === 'new_memorization' || this.currentTaskType === 'hifz') ? this.dailyTasks?.new_memorization : null;

        if (activeTaskForHifz && this.sessionAyahs.length > 0 && !range.includes('ward')) {
            const memorizedKeys = new Set(this.memorizedVerses || []);
            let filtered = this.sessionAyahs.filter(vKey => !memorizedKeys.has(vKey));

            // Focus on task surah if multi-surah session
            if (activeTaskForHifz.surah) {
                const targetS = Number(activeTaskForHifz.surah);
                const surahSpecific = filtered.filter(vKey => parseInt(vKey.split(':')[0]) === targetS);
                if (surahSpecific.length > 0) filtered = surahSpecific;
            }

            if (filtered.length > 0) {
                this.sessionAyahs = filtered;
                // Sync UI
                const first = filtered[0];
                const last = filtered[filtered.length - 1];
                const [fs, fv] = first.split(':').map(Number);
                const [ls, lv] = last.split(':').map(Number);

                this.memorizationSettings.targetSurah = fs;
                this.memorizationSettings.surahStartVerse = fv;
                this.memorizationSettings.surahEndVerse = (fs === ls) ? lv : 999;
                this.memorizationSettings.customStartVerse = first;
                this.memorizationSettings.customEndVerse = (fs === ls) ? last : '';
                console.log(`🎯 [Hifz Session] Universal Precision targeting: ${first} to ${last}`);
            }
        }
    }

    private extractVerseKeys(pages: MushafPage[], filterSurahId?: number): string[] {
        const tempMap = new Map<string, { text: string, font: string }[]>();
        const keysOrder: string[] = [];

        // FIX: Do not clear maps here as they are needed for global touch logic (Short/Long press)
        // this.versePageMap.clear();
        // this.verseDataMap.clear();

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

    private getJustKeys(page: MushafPage): string[] {
        const keys = new Set<string>();
        page.lines.forEach(l => l.segments?.forEach(s => keys.add(s.verse_key)));
        return Array.from(keys);
    }

    async incrementRepetition(): Promise<void> {
        const isWordMode = this.memorizationSettings.hideType === 'word';
        const isMuraaja = this.memorizationSettings.type === 'muraaja';

        // NEW: Handle pending page turn first
        if (this.isWaitingForPageTurn) {
            this.isWaitingForPageTurn = false;
            const targetVerseKey = this.sessionAyahs[this.currentAyahIndex];
            const targetPage = this.versePageMap.get(targetVerseKey);
            if (targetPage && targetPage !== this.pageNumber) {
                if (targetPage > this.pageNumber) this.triggerPageChange('next');
                else this.triggerPageChange('prev');
            }
            return;
        }

        if (this.memorizationSettings.type === 'recitation') {
            // Recitation mode: Single click goes to next Ayah immediately
            await this.nextAyah();
            return;
        }

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
                this.cdr.detectChanges();
                setTimeout(() => this.calculateAutoShift(), 50);
            } else {
                await this.nextAyah();
            }
        } else {
            // Normal repetition mode
            let targetRepeat = this.memorizationSettings.ayahRepeat;

            if (this.currentRepetition < targetRepeat) {
                this.currentRepetition++;
                this.cdr.detectChanges();
                // Reset word index to restart the ayah
                const isWordMode = this.memorizationSettings.hideType === 'word';
                this.currentWordIndex = (isWordMode) ? -1 : 0;
            } else {
                // Ayah complete (Touch Mode) - Award points
                if (this.memorizationSettings.type === 'hifz') {
                    // STRICT CHECK: Only count if this verse is part of the assigned Daily Wird
                    const currentVerseKey = this.sessionAyahs[this.currentAyahIndex];
                    if (currentVerseKey && this.isVerseInDailyWird(currentVerseKey)) {
                        this.quranProgressService.addPointsIfLoggedIn('VERSE_MEMORIZED', 1);
                        this.sessionCounters.versesMemorized++;

                        // Only sync immediately if Group Repeat is NOT required
                        // If Group Repeat is > 0, we sync ONLY after the group phase is done (in incrementGroupRepetition)
                        if (this.memorizationSettings.groupRepeat === 0) {
                            this.checkAutoSync('hifz');
                        }
                    }
                } else if (this.memorizationSettings.type === 'muraaja') {
                    this.quranProgressService.addPointsIfLoggedIn('REVISION_VERSE_COMPLETE' as any, 1);
                    this.sessionCounters.versesReviewed++;
                    this.checkAutoSync('muraja');
                }

                await this.nextAyah();
            }
        }
    }

    private async nextAyah(): Promise<boolean> {
        if (this.sessionAyahs.length > 0 && this.currentAyahIndex < this.sessionAyahs.length - 1) {
            this.currentAyahIndex++;
            this.currentRepetition = 1;
            // When moving to next ayah in word-review, jump directly to showing the first word (index 0)
            const isWordMode = this.memorizationSettings.hideType === 'word';
            this.currentWordIndex = (isWordMode) ? -1 : 0;

            // Page navigation logic
            const nextVerseKey = this.sessionAyahs[this.currentAyahIndex];
            const targetPage = this.versePageMap.get(nextVerseKey);

            if (targetPage && targetPage !== this.pageNumber) {
                // Award points for completing all ayahs on this page before moving
                this.awardPagePoints();

                // DELAYED NAVIGATE: Set flag and wait for user click to turn page
                this.isWaitingForPageTurn = true;
            }

            setTimeout(() => this.calculateAutoShift(), 100);
            this.cdr.detectChanges();
            return true;
        } else if ((this.isAutoRepeat || !this.currentTaskType) && !this.isMemorizationMode) {
            // DYNAMIC EXPANSION: Only allow if NOT in a strict Memorization/Recitation session
            // If in Memorization Mode (Hifz/Recitation/Revision), we MUST stop at the end of sessionAyahs
            // Try to find the next global verse to keep the loop going
            const currentKey = this.sessionAyahs[this.currentAyahIndex] || this.selectedVerseKey || this.audioService.snapshot.currentVerseKey;
            if (currentKey) {
                const nextKey = await this.getNextVerseGlobal(currentKey, 'quran');
                const state = this.audioService.snapshot;

                // For manual expansion (!this.currentTaskType), we allow quran-wide navigation
                if (nextKey && (this.isWithinActiveRange(nextKey, state) || !this.currentTaskType)) {
                    console.log(`[Mushaf] Auto-expanding session to next verse: ${nextKey}`);

                    // Pre-load data if missing (handles manual page progression)
                    if (!this.versePageMap.has(nextKey)) {
                        const [s, v] = nextKey.split(':').map(Number);
                        const nextP = await firstValueFrom(this.dataService.getPageNumberForVerse(s, v));
                        if (nextP) {
                            const pageData = await firstValueFrom(this.dataService.getPage(nextP));
                            if (pageData) this.extractVerseKeys([pageData]);
                        }
                    }

                    // Maintain the session if it exists, or start a new sequence
                    if (this.sessionAyahs.length > 0) {
                        this.sessionAyahs.push(nextKey);
                        this.currentAyahIndex = this.sessionAyahs.length - 1;
                    } else {
                        this.sessionAyahs = [currentKey, nextKey];
                        this.currentAyahIndex = 1;
                    }

                    // Detect Page Turn for Expanded Verse
                    const targetPage = this.versePageMap.get(nextKey);
                    if (targetPage && targetPage !== this.pageNumber) {
                        this.isWaitingForPageTurn = true;
                        this.awardPagePoints();
                    }

                    this.currentRepetition = 1;
                    this.cdr.detectChanges();
                    setTimeout(() => this.calculateAutoShift(), 100);
                    return true;
                }
            }
            return false;
        } else {
            // End of session reached
            console.log(`[Mushaf] End of session reached. Count=${this.sessionAyahs.length}, Index=${this.currentAyahIndex}`);

            // Award points ONLY if we actually finished a valid session
            if (this.memorizationSettings.type === 'muraaja' || this.memorizationSettings.type === 'recitation') {
                const isRabt = this.currentTaskType === 'consolidation';
                if (isRabt || this.sessionAyahs.length >= 1) {
                    this.awardPagePoints();
                }
            }

            // STRICT BOUNDARY: For Consolidation (Al-Rabt) AND Revision tasks, don't allow going beyond session
            const isBoundTask = this.currentTaskType && ((this.currentTaskType as any) === 'consolidation' || (this.currentTaskType as any) === 'muraja' ||
                (this.currentTaskType as any) === 'revision' || (this.currentTaskType as any) === 'deepMuraja');

            if (isBoundTask) {
                console.log('🛑 [Mushaf] Boundary Reached. Navigation blocked.');
                const syncType = (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') ? 'deepMuraja' : 'muraja';
                this.checkAutoSync(syncType as any);

                // AUTO-EXIT: Terminate session immediately upon completion
                this.exitMemorization();
                return false;
            }

            if (this.memorizationSettings.difficulty === 'hard') {
                this.startTestPhase();
            } else {
                // If NO task is active, NEVER auto-exit (let user decide)
                const isManual = !this.currentTaskType;
                const isSyncedWard = (this.memorizationSettings.type === 'hifz' || (this.currentTaskType as any) === 'consolidation' || this.currentTaskType === 'revision');
                if (!isSyncedWard && !isManual) {
                    this.exitMemorization();
                }
            }
            return false;
        }
    }

    private calculateAutoShift(): void {
        const activeElements = document.querySelectorAll('.current-page-wrapper .active-verse');
        if (activeElements.length === 0) {
            if (!this.isMemorizationMode) this.pageVerticalShift = 0;
            return;
        }

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


    private checkAutoSync(type: 'tilawo' | 'hifz' | 'muraja'): void {
        if (!this.dailyTasks) return;

        const taskObj = (type === 'tilawo' ? this.dailyTasks.recitation :
            (type === 'hifz' ? this.dailyTasks.new_memorization :
                ((this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') ? this.dailyTasks.revision : this.dailyTasks.consolidation)));

        if (!taskObj) return;

        const target = this.getTaskTargetInBaseUnits(taskObj);
        let current = 0;

        if (type === 'tilawo') {
            current = this.sessionCounters.pagesRead;
        } else if (type === 'hifz') {
            current = this.sessionCounters.versesMemorized;
        } else if (type === 'muraja') {
            current = (taskObj.unit === 'verses') ? this.sessionCounters.versesReviewed : this.sessionCounters.pagesReviewed;
        }

        if (target > 0 && current > 0) {
            const currentAyahKey = this.sessionAyahs[this.currentAyahIndex];

            // Guard: Avoid syncing the same page/verse multiple times in a row
            if (type === 'tilawo' && this.pageNumber === this.lastSyncedPage) return;
            if (type === 'hifz' && currentAyahKey === this.lastSyncedVerseKey) return;
            if (type === 'muraja') {
                if (taskObj.unit === 'verses' && currentAyahKey === this.lastSyncedVerseKey) return;
                if (taskObj.unit !== 'verses' && this.pageNumber === this.lastSyncedPage) return;
            }

            // Correctly map currentTaskType to backend sync types
            let finalSyncType = type as string;
            if (type === 'muraja') {
                if (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') finalSyncType = 'deepMuraja';
                else if (taskObj.isRabt || this.currentTaskType === 'consolidation') finalSyncType = 'rabt';
                else finalSyncType = 'muraja';
            }

            const oldDone = (this.initialTaskProgress as any)[finalSyncType] || 0;

            // FIX: If we just started the session, 'current' is small.
            // If oldDone already equals target (e.g. from previous partial sync),
            // adding them again might verify it. But 'oldDone' is STATIC from when we entered the session.
            // 'current' accumulates within THIS session.
            // BUT, if 'loadDailyTasks' runs in background (e.g. after a sync), it might update 'initialTaskProgress'
            // resulting in double counting.
            // LOGIC: 'initialTaskProgress' should be the amount done BEFORE this session started.
            // We ensure it is set cleanly in 'navigateToTask'.

            let totalToSync = oldDone + current;

            // FIX: Removed visual cap. We MUST allow totalToSync to exceed 'target' or 'maxAmount'
            // so the backend cursor can advance to the NEXT page/unit in "Sabiq bil Khayrat" mode.
            // EXCEPTION: For Al-Rabt (Linking), we WANT to cap it because it's a fixed range task 
            // and seeing "10/6" is confusing.
            if (finalSyncType === 'rabt') {
                const maxAmount = taskObj.amount || target;
                if (totalToSync > maxAmount) totalToSync = maxAmount;
            }
            // If we cap it at 13/13, clicking "Next" will keep sending 13/13 and the task won't move.
            /*
            const maxAmount = taskObj.amount || target;
            if (totalToSync > maxAmount) {
                totalToSync = maxAmount;
            }
            if (totalToSync >= target) {
                 totalToSync = Math.max(totalToSync, maxAmount);
            }
            */

            // For status check, we use the raw base units (verses for hifz, pages for tilawo)
            const newStatus = (oldDone + current >= target) ? 'done' : 'pending';

            console.log(`[Mushaf] SYNC: Synchronizing ${type} progress: ${totalToSync}/${taskObj.amount || target} (Status: ${newStatus})`);

            // Track last synced position
            if (type === 'tilawo') this.lastSyncedPage = this.pageNumber;
            if (type === 'hifz') this.lastSyncedVerseKey = currentAyahKey;
            if (type === 'muraja') {
                if (taskObj.unit === 'verses') this.lastSyncedVerseKey = currentAyahKey;
                else this.lastSyncedPage = this.pageNumber;
            }

            // NEW: Collect verses memorized in this session for history persistence
            // FIX: If the status is 'done', we must ensure ALL session verses are synced, not just up to the current index.
            // This prevents the "27% progress / Verse 2 pointer" bug where later verses are missed.
            const versesToSync = (type === 'hifz') ?
                (newStatus === 'done' ? this.sessionAyahs : this.sessionAyahs.slice(0, this.currentAyahIndex + 1))
                : [];

            // For Hifz, we want to advance the plan to the NEXT verse after the currently memorized one
            let syncPositionVerseKey = currentAyahKey;
            if (type === 'hifz') {
                if (this.sessionAyahs[this.currentAyahIndex + 1]) {
                    syncPositionVerseKey = this.sessionAyahs[this.currentAyahIndex + 1];
                } else {
                    syncPositionVerseKey = this.calculateNextVerseKey(currentAyahKey);
                }
            }

            this.mutabaaService.updateTaskStatus(finalSyncType as any, newStatus, totalToSync, taskObj.unit, { page: this.pageNumber, verseKey: currentAyahKey }, versesToSync).subscribe({
                next: (res) => {
                    if (res.success) {
                        // Refresh daily tasks to update state (locks, etc.)
                        this.loadDailyTasks();

                        // NEW: Show toast if task just became DONE
                        if (newStatus === 'done' && !this.completedTasks.has(finalSyncType)) {
                            this.showTaskDoneToast = true;

                            // NEW: Auto-close session after completion (if it's a daily task ward)
                            if (finalSyncType === 'deepMuraja' || finalSyncType === 'muraja' || finalSyncType === 'tilawo' || finalSyncType === 'hifz' || finalSyncType === 'rabt') {
                                // For Rabt/Tamkeen, we terminate faster as it's a fixed-range linking task
                                const delay = (finalSyncType === 'rabt') ? 1200 : 3500;

                                setTimeout(() => {
                                    console.log(`[Mushaf] Ward Complete! Auto-closing session for ${finalSyncType}`);
                                    this.exitMemorization();
                                    this.showTaskDoneToast = false;
                                    this.cdr.detectChanges();
                                }, delay);
                            } else {
                                setTimeout(() => {
                                    this.showTaskDoneToast = false;
                                    this.cdr.detectChanges();
                                }, 4000);
                            }
                            if (finalSyncType === 'hifz' && this.isHifzBlocked) {
                                // If Hifz is done but blocked by a newly available Rabt, EXIT immediately
                                console.log('[Mushaf] Hifz Ward Complete & Blocked by Rabt. Exiting session.');
                                this.exitMemorization();
                            }
                        }

                        this.completedTasks.add(finalSyncType);
                        // Refresh dashboard tasks and position immediately to reflect advancement
                        this.loadDailyTasks();

                        // FIX: We do NOT update initialTaskProgress mid-session anymore.
                        // 'sessionCounters' are CUMULATIVE from session start.
                        // 'initialTaskProgress' is the snapshot BEFORE session start.
                        // Sum of both = Current total progress.
                        // Updating 'initialTaskProgress' mid-session leads to double-counting.

                        // RELOAD LOGIC:
                        // Trigger reload immediately if:
                        // 1. Task is DONE.
                        // 2. It's a revision/consolidation task (to update distinct cards).
                        // 3. It's RECITATION (tilawo) and we made progress (to advance the cursor/label).
                        if (newStatus === 'done' || finalSyncType === 'deepMuraja' || finalSyncType === 'muraja' || finalSyncType === 'tilawo' || finalSyncType === 'rabt') {
                            setTimeout(() => {
                                console.log('[Mushaf] Refreshing tasks to update cursor/lock state...');
                                this.loadDailyTasks();
                            }, 1500);
                        }
                    }
                },
                error: (err) => {
                    console.error(`[Mushaf] Failed to sync ${type}:`, err);
                }
            });
        }
    }

    private getVerseSegmentCount(verseKey: string): number {
        let count = 0;
        this.currentPageData$?.pipe(take(1)).subscribe(page => {
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
        this.audioService.updateState({ isGroupPhase: true, currentGroupRepeatCount: 0, currentAyahRepeatCount: 0 });
        this.currentRepetition = 1;
        this.currentGroupRepetition = 1;
        this.currentAyahIndex = 0; // START FROM BEGINNING of the group
        this.groupTotalDuration = 0; // RESET: Start fresh for group block mimicry
        this.fixedGroupWaitDuration = 0; // RESET: Re-calculate for the group block
        console.log('[Mushaf] startGroupPhase: Group mode activated, counters reset.');
    }

    incrementGroupRepetition(): void {
        // Check if we should restart for another loop (use <= to ensure last cycle also gets a restart)
        if (this.currentGroupRepetition < this.memorizationSettings.groupRepeat) {
            this.currentGroupRepetition++;
            this.currentAyahIndex = 0; // FORCE UI RESET IMMEDIATELY
            this.cdr.detectChanges();
            console.log(`[GroupRepeat] Starting loop ${this.currentGroupRepetition}/${this.memorizationSettings.groupRepeat}`);
            // Restart the group audio for the next loop
            if (this.isAutoRepeat && this.isMemorizationMode) {
                this.restartGroupAudio();
            }
        } else {
            // All group loops done!
            console.log(`[GroupRepeat] All ${this.memorizationSettings.groupRepeat} loops completed.`);
            if (this.memorizationSettings.type === 'hifz') {
                this.checkAutoSync('hifz');
            } else if (this.memorizationSettings.type === 'muraaja') {
                this.checkAutoSync('muraja');
            }

            if (this.memorizationSettings.difficulty === 'hard') {
                this.startTestPhase();
            } else {
                this.exitMemorization();
            }
        }
    }

    async toggleAutoRepeat(): Promise<void> {
        this.isAutoRepeat = !this.isAutoRepeat;

        if (this.isAutoRepeat) {
            this.currentRepetition = 1;
            await this.audioService.setReciter(this.hifzReciterId, false); // Ensure reciter is synced

            // 2. Set service to manual mode
            this.audioService.setExternalPlaybackControl(true);
            this.audioService.updateState({ isGroupPhase: this.isGroupPhase });

            if (this.sessionAyahs.length > 0 && this.currentAyahIndex < this.sessionAyahs.length) {
                const verseToPlay = this.sessionAyahs[this.currentAyahIndex];
                if (verseToPlay) {
                    await this.playVerseAudio(verseToPlay);
                } else {
                    console.warn('[Hifz] toggleAutoRepeat: No verse key found at index', this.currentAyahIndex);
                    this.isAutoRepeat = false;
                }
            }
        } else {
            // User pressed PAUSE
            this.audioService.setExternalPlaybackControl(false);
            this.audioService.stop();

            // CLEANUP
            this.isWaitingForRepetition = false;
            this.isSimulationPlaying = false;
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
        }
    }

    setMemoMethod(method: 'manual' | 'auto'): void {
        this.memoMethod = method;
        if (method === 'manual') {
            this.isAutoRepeat = false;
            this.audioService.setExternalPlaybackControl(false);
            this.audioService.stop();
            this.isWaitingForRepetition = false;
            this.isSimulationPlaying = false;
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
        }
        this.cdr.detectChanges();
    }

    // Delay state
    delayBetweenRepetitions: number = -1; // Seconds, -1 = Auto (Mimic) - Default
    cycleDelay(): void {
        const delays = [0, 1, 2, 3, 5];
        const currentIndex = delays.indexOf(this.delayBetweenRepetitions);
        const nextIndex = (currentIndex + 1) % delays.length;
        this.delayBetweenRepetitions = delays[nextIndex];

        // If toggled to 0 while waiting, stop the wait
        if (this.delayBetweenRepetitions === 0 && this.isWaitingForRepetition) {
            this.toggleSimulationMode(); // This will trigger the stop/resume logic
        } else {
            // Persist preference
            localStorage.setItem('mushaf_repetition_delay', this.delayBetweenRepetitions.toString());
        }
        this.cdr.detectChanges();
    }

    // Simulation & Countdown State
    repetitionCountdown: number = 0;
    isWaitingForRepetition: boolean = false;
    isSimulationPlaying: boolean = false;
    private countdownInterval: any;
    private simulationStartTime: number = 0; // When simulation wait started
    private simulationTargetDuration: number = 0; // How long to wait (in seconds)

    toggleSimulationMode(): void {
        const wasWaiting = this.isWaitingForRepetition;

        if (this.delayBetweenRepetitions === -1) {
            this.delayBetweenRepetitions = 0;

            // IMMEDIATE CANCELLATION: Stop active waits if we toggled to "No Wait"
            if (wasWaiting) {
                console.log('[Hifz] Toggled to "No Wait" while waiting. Stopping timers and proceeding...');
                if (this.countdownInterval) {
                    clearInterval(this.countdownInterval);
                    this.countdownInterval = null;
                }
                this.isWaitingForRepetition = false;
                this.isSimulationPlaying = false;
                this.repetitionCountdown = 0;
                this.isProcessingAutoRepeat = false; // Release lock to allow immediate trigger

                // Resume audio or advance logic
                // If it was a group phase, we increment repetition
                // If single ayah, we check if we need to replay or advance
                this.handleAutoRepeatResume();
            }
        } else {
            this.delayBetweenRepetitions = -1;
        }

        // Persist preference
        localStorage.setItem('mushaf_repetition_delay', this.delayBetweenRepetitions.toString());
        this.cdr.detectChanges();
    }

    private handleAutoRepeatResume(): void {
        const completedVerse = (this.audioService as any).activeAudio?.verseKey || this.playingVerseKey;
        if (!completedVerse) return;

        if (this.isGroupPhase) {
            this.incrementGroupRepetition();
        } else {
            // Re-run increment logic for single ayah
            if (this.currentRepetition < this.memorizationSettings.ayahRepeat) {
                this.currentRepetition++;
                this.audioService.playVerse(completedVerse);
            } else {
                this.advanceToNextVerse(completedVerse);
            }
        }
    }

    // Track total group duration for block-based simulation
    private groupTotalDuration: number = 0;
    private fixedGroupWaitDuration: number = 0; // Calculated once on first loop, reused for all

    private async handleAutoRepeat(completedVerseKey: string, verseDuration: number = 0): Promise<void> {
        let activeVerse = this.sessionAyahs[this.currentAyahIndex];

        // Fallback for non-session playback
        if (!activeVerse && this.isAutoRepeat) {
            activeVerse = completedVerseKey;
        }

        // Safety lock
        if (this.isProcessingAutoRepeat) {
            console.warn(`[AutoRepeat] Lock active. Skipping duplicate event for ${completedVerseKey}`);
            return;
        }

        const effectiveDuration = verseDuration || this.audioService.lastKnownDuration || (this.isAndroid ? 5 : 5);
        const activeReciterId = (this.isMemorizationMode || this.isAutoRepeat) ? this.hifzReciterId : this.currentReciterId;
        const isTeacher = this.audioService.isTeacherReciter(activeReciterId);
        const isMimic = this.delayBetweenRepetitions === -1;

        console.log(`[AutoRepeat] Event for ${completedVerseKey} (Duration: ${effectiveDuration}s, Teacher: ${isTeacher}, Mimic: ${isMimic})`);
        this.groupTotalDuration += effectiveDuration;

        this.isProcessingAutoRepeat = true;

        const proceed = () => {
            // Restore volume if we were simulating
            if (this.isSimulationPlaying) {
                this.audioService.setVolume(1);
                this.isSimulationPlaying = false;
                this.isWaitingForRepetition = false;
                if (this.countdownInterval) clearInterval(this.countdownInterval);
            }

            if (this.isGroupPhase) {
                // Group Mode Logic - play as a BLOCK
                const finishedIndex = this.sessionAyahs.indexOf(completedVerseKey);
                if (finishedIndex !== -1) this.currentAyahIndex = finishedIndex;

                const isLastInGroup = this.currentAyahIndex >= this.sessionAyahs.length - 1;

                if (isLastInGroup) {
                    // GROUP BLOCK FINISHED -> Check for simulation delay BEFORE incrementing repetition

                    // Apply group-level delay (simulation or fixed) BEFORE incrementing repetition
                    // TEACHER BYPASS: If reciter already has gaps, don't double the wait at group end
                    if (isMimic && this.groupTotalDuration > 0 && !isTeacher) {
                        // BLOCK SIMULATION: Wait for total group duration
                        // Save duration on first loop, reuse for subsequent loops
                        if (this.fixedGroupWaitDuration === 0) {
                            // FALLBACK: If group duration is 0 (Android metadata issue), use a sensible minimum (at least 5s per verse)
                            if (this.groupTotalDuration <= 0 && this.isAndroid) {
                                this.groupTotalDuration = this.sessionAyahs.length * 5;
                            }
                            this.fixedGroupWaitDuration = Math.ceil(this.groupTotalDuration);
                        }
                        const targetDuration = this.fixedGroupWaitDuration;

                        this.isSimulationPlaying = true;
                        this.isWaitingForRepetition = true;
                        this.repetitionCountdown = targetDuration;
                        this.simulationStartTime = Date.now();
                        this.simulationTargetDuration = targetDuration;
                        this.cdr.detectChanges();

                        // ANDROID FIX: Stop audio completely during simulation wait
                        // Muted audio was triggering verseCompleted$ repeatedly, causing infinite loops
                        // Use softStop() to preserve Hifz state (externalPlaybackControl, currentVerseKey)
                        this.audioService.softStop();

                        if (this.countdownInterval) clearInterval(this.countdownInterval);

                        const startT = Date.now();
                        this.countdownInterval = setInterval(() => {
                            const elapsed = Math.floor((Date.now() - startT) / 1000);
                            const remaining = targetDuration - elapsed;

                            this.repetitionCountdown = Math.max(0, remaining);

                            if (remaining <= 0) {
                                this.repetitionCountdown = 0;
                                clearInterval(this.countdownInterval);
                                // Simulation done, proceed
                                this.audioService.setVolume(1);
                                this.isSimulationPlaying = false;
                                this.isWaitingForRepetition = false;
                                this.isProcessingAutoRepeat = false; // RELEASE LOCK BEFORE TRIGGER
                                this.incrementGroupRepetition();
                            }
                            this.cdr.detectChanges();
                        }, 1000);

                        // Reset accumulator for next cycle (but keep fixedGroupWaitDuration)
                        this.groupTotalDuration = 0;
                        return; // Wait for simulation to complete

                    } else if (this.delayBetweenRepetitions > 0) {
                        // Fixed delay at group end
                        this.isWaitingForRepetition = true;
                        this.repetitionCountdown = this.delayBetweenRepetitions;
                        this.groupTotalDuration = 0;
                        this.cdr.detectChanges();

                        if (this.countdownInterval) clearInterval(this.countdownInterval);

                        const startT = Date.now();
                        this.countdownInterval = setInterval(() => {
                            const elapsed = Math.floor((Date.now() - startT) / 1000);
                            const remaining = this.delayBetweenRepetitions - elapsed;

                            this.repetitionCountdown = Math.max(0, remaining);

                            if (remaining <= 0) {
                                clearInterval(this.countdownInterval);
                                this.isWaitingForRepetition = false;
                                this.repetitionCountdown = 0;
                                this.cdr.detectChanges();
                                this.isProcessingAutoRepeat = false; // RELEASE LOCK BEFORE TRIGGER
                                this.incrementGroupRepetition();
                            } else {
                                this.cdr.detectChanges();
                            }
                        }, 1000);
                        return;
                    }

                    // No delay - immediate group repeat
                    this.groupTotalDuration = 0;
                    this.isProcessingAutoRepeat = false; // RELEASE LOCK BEFORE TRIGGER
                    this.incrementGroupRepetition();
                } else {
                    // NEXT VERSE IN GROUP
                    this.isProcessingAutoRepeat = false; // RELEASE LOCK BEFORE TRIGGER

                    // Group Phase: Play verses back-to-back, no inter-verse wait.
                    // Only the final group-level wait (at isLastInGroup) counts.
                    this.playNextVerseAudio(completedVerseKey);
                }

            } else {
                // Single Ayah Repetition Mode
                // NOTE: isSimulationPlaying is always false here (handled in outer block)

                // Just finished an audible verse - check if we need to wait for user recitation
                // Use <= to ensure wait happens after EVERY cycle, including the last
                if (this.currentRepetition <= this.memorizationSettings.ayahRepeat) {
                    // WAIT NEEDED after this cycle for user to recite
                    console.log(`[AutoRepeat] Single: Audible cycle ${this.currentRepetition}/${this.memorizationSettings.ayahRepeat} done. Starting wait...`);

                    // TEACHER BYPASS: Skip simulation if gap is built-in
                    if (isMimic && !isTeacher) {
                        // Simulation mode - muted replay
                        const targetDuration = Math.ceil(effectiveDuration);

                        this.isSimulationPlaying = true;
                        this.isWaitingForRepetition = true;
                        this.repetitionCountdown = targetDuration;
                        this.cdr.detectChanges();
                        // ANDROID FIX: Stop audio during simulation wait instead of muted play
                        // Use softStop() to preserve Hifz state (externalPlaybackControl, currentVerseKey)
                        this.audioService.softStop();

                        if (this.countdownInterval) clearInterval(this.countdownInterval);
                        this.countdownInterval = setInterval(() => {
                            this.repetitionCountdown--;
                            if (this.repetitionCountdown <= 0) {
                                this.repetitionCountdown = 0;
                                clearInterval(this.countdownInterval);

                                // FIX: Logic Check AFTER Wait
                                this.isSimulationPlaying = false;
                                this.isWaitingForRepetition = false;
                                this.currentRepetition++;
                                this.cdr.detectChanges();

                                this.isProcessingAutoRepeat = false; // RELEASE LOCK BEFORE TRIGGER
                                if (this.currentRepetition > this.memorizationSettings.ayahRepeat) {
                                    this.advanceToNextVerse(completedVerseKey);
                                } else {
                                    if (this.isMemorizationMode || this.isAutoRepeat) {
                                        this.audioService.setExternalPlaybackControl(true);
                                    }
                                    // FORCE PLAY: isNewSession=false, force=true
                                    this.audioService.playVerse(completedVerseKey, undefined, false, false, true);
                                }
                            }
                            this.cdr.detectChanges();
                        }, 1000);
                        return;
                    } else if (this.delayBetweenRepetitions > 0) {
                        // Fixed delay
                        this.isWaitingForRepetition = true;
                        this.repetitionCountdown = this.delayBetweenRepetitions;
                        this.cdr.detectChanges();

                        if (this.countdownInterval) clearInterval(this.countdownInterval);
                        this.countdownInterval = setInterval(() => {
                            this.repetitionCountdown--;
                            if (this.repetitionCountdown <= 0) {
                                clearInterval(this.countdownInterval);
                                this.isWaitingForRepetition = false;
                                this.repetitionCountdown = 0;
                                this.currentRepetition++;
                                this.cdr.detectChanges();

                                this.isProcessingAutoRepeat = false; // RELEASE LOCK BEFORE TRIGGER
                                if (this.currentRepetition > this.memorizationSettings.ayahRepeat) {
                                    this.advanceToNextVerse(completedVerseKey);
                                } else {
                                    if (this.isMemorizationMode || this.isAutoRepeat) {
                                        this.audioService.setExternalPlaybackControl(true);
                                    }
                                    // FORCE PLAY: isNewSession=false, force=true
                                    this.audioService.playVerse(completedVerseKey, undefined, false, false, true);
                                }
                            } else {
                                this.cdr.detectChanges();
                            }
                        }, 1000);
                        return;
                    }

                    // No delay mode - immediate play
                    this.currentRepetition++;
                    console.log(`[AutoRepeat] Zero Delay: Incrementing repetition to ${this.currentRepetition}/${this.memorizationSettings.ayahRepeat}`);
                    this.cdr.detectChanges();

                    this.isProcessingAutoRepeat = false; // RELEASE LOCK BEFORE TRIGGER
                    // Check if repetitions for this verse are done
                    if (this.currentRepetition > this.memorizationSettings.ayahRepeat) {
                        if (Capacitor.getPlatform() === 'android') {
                            // ANDROID FIX: Add small delay to allow native player to transition state
                            setTimeout(() => {
                                this.advanceToNextVerse(completedVerseKey);
                            }, 100);
                        } else {
                            this.advanceToNextVerse(completedVerseKey);
                        }
                    } else {
                        // Play audible repetition (since delay is 0/none)
                        if (Capacitor.getPlatform() === 'android') {
                            // ANDROID FIX: Delay replay slightly to ensure native player is ready
                            setTimeout(() => {
                                this.audioService.setExternalPlaybackControl(true);
                                // FORCE PLAY: isNewSession=false, force=true
                                this.audioService.playVerse(completedVerseKey, undefined, false, false, true);
                            }, 100);
                        } else {
                            // FORCE PLAY: isNewSession=false, force=true
                            this.audioService.playVerse(completedVerseKey, undefined, false, false, true);
                        }
                    }
                }
            }
        };

        // Start execution
        proceed();
    }
    private async advanceToNextVerse(completedVerseKey: string): Promise<void> {
        if (this.memorizationSettings.type === 'hifz') {
            if (this.isVerseInDailyWird(completedVerseKey)) {
                this.quranProgressService.addPointsIfLoggedIn('VERSE_MEMORIZED', 1);
                this.sessionCounters.versesMemorized++;
                if (this.memorizationSettings.groupRepeat === 0) this.checkAutoSync('hifz');
            }
        } else if (this.memorizationSettings.type === 'muraaja') {
            this.quranProgressService.addPointsIfLoggedIn('REVISION_VERSE_COMPLETE' as any, 1);
            this.sessionCounters.versesReviewed++;
            this.checkAutoSync('muraja');
        }

        const moved = await this.nextAyah();
        if (moved) {
            const nextVerseKey = this.sessionAyahs[this.currentAyahIndex];
            this.playVerseAudio(nextVerseKey);
        } else {
            // NEW: Automatically transition to Group Repetition if configured
            // This happens after the LAST verse of the range has finished its individual repetitions.
            // Logic: Recitation needs > 1 to repeat (since 1st pass is already done).
            // Hifz/Muraaja treats '1' as a "Confirmation Pass" of the block, so we trigger even at 1.
            const groupThreshold = (this.memorizationSettings.type === 'recitation') ? 1 : 0;

            if (!this.isGroupPhase && this.memorizationSettings.groupRepeat > groupThreshold) {
                console.log('[Mushaf] Last verse complete. Starting Group Phase loops.');
                this.startGroupPhase();
                this.restartGroupAudio();
            } else {
                // Truly end of final repetition cycle
                // This ensures UI cleans up and state resets exactly like "Exit" button
                console.log('[Mushaf] range complete. Exiting.');
                this.exitMemorization();
            }
        }
    }

    private restartGroupAudio(): void {
        this.currentAyahIndex = 0;
        if (this.sessionAyahs.length > 0) {
            const firstVerse = this.sessionAyahs[0];
            this.playVerseAudio(firstVerse);
        }
    }

    getMaxVerses(surahId: number): number {
        const surah = this.allSurahs.find(s => s.id === Number(surahId));
        return surah ? surah.verses_count : 286;
    }

    openMemorizationOptions(): void {
        if (this.showOptionsSheet) {
            this.showOptionsSheet = false;
            return;
        }
        this.showOptionsSheet = true;
        this.showAudioPlayer = false; // Close audio player
        this.isSettingsOpen = false; // Close settings
        this.isSidebarOpen = false; // Close sidebar
        this.showAudioManager = false; // NAVIGATION FIX
        this.closeTafsir();
        // Default to current page's FIRST surah if not set or invalid
        if (this.currentSurah$) {
            this.currentSurah$.pipe(take(1)).subscribe(s => {
                if (s) {
                    const currentId = this.memorizationSettings.targetSurah;
                    // If targetSurah is 0 or doesn't match a surah on this page, reset it
                    this.dataService.getPage(this.pageNumber).pipe(take(1)).subscribe(pg => {
                        if (pg) {
                            const allAyahs = this.extractVerseKeys([pg]);
                            const surahsOnPage = new Set(allAyahs.map(v => Number(v.split(':')[0])));
                            if (currentId === 0 || !surahsOnPage.has(currentId)) {
                                this.memorizationSettings.targetSurah = s.id;
                                this.memorizationSettings.surahEndVerse = s.verses_count;
                            }

                            // NEW: Auto-select Specific Verses (surah) if multiple surahs on page
                            if (surahsOnPage.size > 1 && this.memorizationSettings.type === 'hifz') {
                                this.memorizationSettings.range = 'surah';
                            }
                        }
                    });
                }
            });
        }
    }

    private async asyncSetTimeout(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async startTestPhase(): Promise<void> {
        this.isTestPhase = true;
        this.showTestResult = false;
        this.currentTestQuestionIndex = 0;
        this.correctAnswersCount = 0;

        this.testQuestions = [];

        const totalSessionAyahs: number = this.sessionAyahs.length;
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

        // Preload all required fonts AND data for the selected questions and options
        const pagesToLoad = new Set<number>();
        const collectRequiredData = (verseKey: string) => {
            // Check if we need to load the page for this verse
            if (!this.verseDataMap.has(verseKey)) {
                const page = this.versePageMap.get(verseKey);
                if (page) pagesToLoad.add(page);
            }

            // Identify fonts even if data exists (ensure rendering)
            const segments = this.verseDataMap.get(verseKey);
            segments?.forEach(s => {
                const match = s.font.match(/P(\d+)/);
                if (match) pagesToLoad.add(parseInt(match[1]));
            });
        };

        this.testQuestions.forEach(q => {
            collectRequiredData(q.baseVerseKey);
            q.options?.forEach((opt: string) => collectRequiredData(opt));
        });

        if (pagesToLoad.size > 0) {
            console.log(`[TestPhase] Preloading ${pagesToLoad.size} pages for test data...`);
            const loadingOps = Array.from(pagesToLoad).map(pageNum => {
                // Return a combined promise for both font and data
                return forkJoin({
                    font: from(this.fontService.loadPageFont(pageNum)),
                    data: this.dataService.getPage(pageNum).pipe(take(1))
                }).toPromise();
            });

            const results = await Promise.all(loadingOps);
            const validPages = results.map(r => r?.data).filter((p): p is MushafPage => !!p);
            if (validPages.length > 0) {
                this.extractVerseKeys(validPages);
            }
        }

        // Final safety delay to ensure change detection and rendering are ready
        await this.asyncSetTimeout(100);
        this.loadQuestion(0);
        this.cdr.detectChanges();
    }

    private isVerseInDailyWird(verseKey: string): boolean {
        if (!verseKey || !this.dailyTasks) return false;

        // Determine which task to check based on the current active session
        let task = this.dailyTasks.new_memorization;
        if (this.currentTaskType === 'consolidation' || this.currentTaskType === 'muraja') {
            task = this.dailyTasks.consolidation;
        } else if (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') {
            task = this.dailyTasks.revision;
        }

        if (!task) return false;

        const [vSurah, vNum] = verseKey.split(':').map(Number);

        // 1. Strict check if backend provided explicit verses (especially for Consolidation)
        if (task.verses && task.verses.length > 0) {
            return task.verses.includes(verseKey);
        }

        // 2. Multi-Prop Range Check
        const startSurah = Number(task.surah || task.surahId || task.position?.surah || 0);
        const startVerse = Number(task.verse || task.position?.verse || 1);
        const amount = Number(task.amount || 1);
        const unit = task.unit || task.target || 'page';

        // FIX: Prioritize resolved page/range for modern task handling
        const pageOfVerse = this.versePageMap.get(verseKey);
        const resolvedPage = (task as any).resolvedPage;

        if (resolvedPage && pageOfVerse === resolvedPage) {
            return true;
        }

        // If it's a page-based task, we check if page matches
        const labelStr = task.label || '';
        const isPageRange = unit === 'page' || unit === 'pages' || unit === 'juz' ||
            labelStr.includes('صفحة') || labelStr.includes('صفحه') || labelStr.includes('صفحات');

        if (isPageRange) {
            if (pageOfVerse !== undefined) {
                const startPage = resolvedPage || task.startPage || task.page || 1;
                const pageAmount = (unit === 'juz') ? amount * 20 : amount;
                const endPage = startPage + pageAmount - 1;
                if (pageOfVerse >= startPage && pageOfVerse <= endPage) return true;
            }
        }

        if (vSurah < startSurah) return false;

        // Exact same surah
        if (vSurah === startSurah) {
            const baseAmount = this.getTaskTargetInBaseUnits(task);
            const endVerse = (baseAmount > 0) ? (startVerse + baseAmount - 1) : startVerse;
            // For page-based tasks that might span end of surah, logic can be complex. 
            // The page check above handles this better.
            if (vNum >= startVerse && vNum <= endVerse) return true;
        }

        // If amount is large enough to span multiple surahs (mostly for NEW_MEMORIZATION)
        if (vSurah > startSurah && (task.type === 'new_memorization' || task.type === 'hifz')) {
            const baseAmount = this.getTaskTargetInBaseUnits(task);
            const versesInStartSurah = this.assetService.getSurahVerses(startSurah);
            const remainingInStart = versesInStartSurah - startVerse + 1;

            if (baseAmount > remainingInStart) {
                // If the surah is directly after startSurah, check leftover
                if (vSurah === startSurah + 1) {
                    const leftover = baseAmount - remainingInStart;
                    if (vNum <= leftover) return true;
                }
                // If it spans even further (e.g. 3+ surahs on one page), 
                // we rely on the Page/Session checks above which are more robust.
                // But as a fallback for large Hifz amounts:
                else if (vSurah > startSurah + 1) {
                    // Rough estimate fallback
                    return true;
                }
            }
        }

        // 3. Session Fallback
        if (this.isMemorizationMode && this.sessionAyahs.includes(verseKey)) {
            return true;
        }

        return false;
    }

    isPageInRecitationRange(pageNum: number): boolean {
        const startPage = this.sessionStartPage || 1;
        const amount = this.sessionTargetAmount || 1;
        const endPage = startPage + amount - 1;
        return pageNum >= startPage && pageNum <= endPage;
    }

    isPageRead(pageNum: number): boolean {
        if (!this.dailyTasks?.recitation) return false;
        const task = this.dailyTasks.recitation;
        const start = task.startPage || 1;
        // Combine backend progress with current session progress
        const amountDone = (task.amountDone || 0) + this.sessionCounters.pagesRead;
        const lastRead = start + amountDone - 1;
        // ONLY highlight if within the daily range and has been read
        return pageNum >= start && pageNum <= lastRead;
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
        this.cdr.detectChanges();
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
        this.cdr.detectChanges();
    }


    shouldHideLine(line: any, pageNum: number): boolean {
        // Hide Bismillah for Al-Fatihah (ID: 1) as requested (similar to Al-Tawbah)
        // EXCEPTION: During active session, Page 1 Verse 1 IS the task, so we must show it to allow hiding/revealing.
        if (line.type === 'bismillah') {
            if (pageNum === 1) return !this.isMemorizationMode;
            return false;
        }

        // Globally hide empty lines or headers with no text to prevent duplicate frames
        if (line.type === 'header' && (!line.text || line.text.trim().length === 0)) return true;

        if (pageNum <= 2) {
            if (line.type === 'verse' && (!line.segments || line.segments.length === 0)) return true;
            if (line.type !== 'verse' && (!line.text || line.text.trim().length === 0)) return true;
        }
        return false;
    }

    async exitMemorization(): Promise<void> {
        if (this.isExiting) return;
        this.isExiting = true;

        // Final Sync before exiting!
        if (this.isMemorizationMode) {
            if (this.memorizationSettings.type === 'hifz') {
                this.checkAutoSync('hifz');
            } else if (this.memorizationSettings.type === 'muraaja') {
                // For revision, ensure we sync the correct type
                if (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') {
                    this.checkAutoSync('muraja');
                } else {
                    this.checkAutoSync('muraja');
                }
            }
        }

        this.isMemorizationMode = false;
        this.showNavbar = true; // Restore navbar on exit
        this.isReadingActive = false; // Stop tracking when exit
        this.isAutoRepeat = false; // NEW: Reset auto-repeat state
        this.audioService.stop(); // NEW: Stop audio playback
        this.audioService.updatePlaybackState({ externalPlaybackControl: false }); // Release control
        this.isTestPhase = false;
        this.isGroupPhase = false;
        this.isWaitingForRepetition = false;
        this.isSimulationPlaying = false;
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        this.isProcessingAutoRepeat = false; // RELEASE LOCK
        this.fixedGroupWaitDuration = 0; // Reset for next session
        this.groupTotalDuration = 0;
        this.pageVerticalShift = 0;
        this.stopVoiceSession();

        // CLEANUP: Reset session-specific arrays to prevent overlap when starting new tasks
        this.sessionAyahs = [];
        this.errorWords.clear();
        this.skippedAyahs.clear();
        this.currentAyahIndex = 0;

        // FIX: Force refresh daily tasks to update progress display after exiting
        // This ensures the progress percentage reflects the saved state
        setTimeout(() => {
            this.loadDailyTasks();
        }, 500);

        this.audioService.setExternalPlaybackControl(false);
        await this.audioService.setReciter(this.currentReciterId, false); // Restore global reciter context
        this.isExiting = false; // Reset for next time
    }

    getSegmentClass(segment: EnrichedMushafSegment | MushafSegment, verseKey: string, page: MushafPage): string {
        // OPTIMIZATION: Use pre-calculated static classes if available
        let classes = (segment as EnrichedMushafSegment).staticClasses || 'verse-segment';
        if (!(segment as EnrichedMushafSegment).staticClasses) {
            // Fallback for non-enriched segments (shouldn't happen with new logic)
            if (this.isLastSegmentOfVerse(segment, verseKey, page)) classes += ' ayah-marker';
            if (this.isVerseInSecondHalf(verseKey, page.page_number)) classes += ' second-half-segment';
        }
        classes += ' '; // ensure separation

        // Search navigation flash effect
        if (this.flashVerseKey === verseKey) {
            classes += 'verse-flash ';
        }

        // Audio Playback Highlighting
        if (this.playingVerseKey === verseKey) {
            classes += 'audio-active ';
        }

        // Custom Range Highlighting
        if (this.computedRange && this.isVerseInComputedRange(verseKey)) {
            classes += 'selected-range ';
        }

        // Match currently playing audio verse
        const playingKey = this.audioService.snapshot.currentVerseKey;
        const isSurah = this.audioService.snapshot.reciterId && this.audioService.isSurahReciter(this.audioService.snapshot.reciterId);

        if (verseKey === playingKey && !isSurah) {
            classes += 'playing-verse ';
        }

        if (!this.isMemorizationMode) return classes.trim();

        // Recitation mode: NEVER hide anything
        if (this.memorizationSettings.type === 'recitation') return classes.trim();

        // Range Focus: Hide everything NOT in the targeted range (sessionAyahs)
        if (this.sessionAyahs.indexOf(verseKey) === -1) {
            return classes + 'hidden-verse';
        }

        if (this.isTestPhase) return classes.trim();

        if (this.isGroupPhase) {
            // GROUP HIDE: In Group phase, hide everything in the block during simulation/wait
            // FIX: User requested to SEE the ayah during waiting/recitation
            // Only hide if explicitly in a "Hidden" mode (which implies Test/Muraaja active)
            if (this.memorizationSettings.type === 'muraaja' && this.memorizationSettings.hideType === 'ayah') {
                if (this.isAutoRepeat && (this.isWaitingForRepetition || this.isSimulationPlaying)) {
                    return classes + 'hidden-verse';
                }
            }
            return classes.trim();
        }

        const currentVerseKey = this.sessionAyahs[this.currentAyahIndex];
        const nextVerseKey = this.currentAyahIndex + 1 < this.sessionAyahs.length ? this.sessionAyahs[this.currentAyahIndex + 1] : null;
        const isMuraaja = this.memorizationSettings.type === 'muraaja';

        // DEBUG: Once per render check for current verse
        // if (verseKey === currentVerseKey && isMuraaja) {
        //    console.log('[SegmentClass] Processing Current Verse:', verseKey, 'HideType:', this.memorizationSettings.hideType);
        // }

        // 1. Handle Past Verses (Persistence)
        const verseIdx = this.sessionAyahs.indexOf(verseKey);
        if (verseIdx !== -1 && verseIdx < this.currentAyahIndex) {
            // Check if this specific word was an error
            const segIdx = this.getSegmentIndexInVerse(segment, verseKey, page);
            const errorKey = `${verseKey}:${segIdx}`;
            if (this.errorWords.has(errorKey)) {
                return classes + 'error-verse';
            }
            return classes + 'active-verse'; // Otherwise active
        }

        // Current verse visibility
        if (verseKey === currentVerseKey) {
            // In Review mode, always show the Ayah number (last segment) to help user identify position
            const isLast = (segment as EnrichedMushafSegment).isLastSegment !== undefined
                ? (segment as EnrichedMushafSegment).isLastSegment
                : this.isLastSegmentOfVerse(segment, verseKey, page);

            if (isMuraaja && isLast) {
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

                    // REVISION REVEAL: If we've clicked once (currentRepetition > 1), show the verse
                    if (this.currentRepetition > 1) {
                        return classes + 'active-verse';
                    }

                    return classes + 'hidden-verse';
                }
            }

            // HIFZ AUTO-HIDE: In Hifz mode (auto repeat), hide current verse during simulation/wait phase
            // HIFZ AUTO-HIDE: DISABLED per user request (User wants to see verse while reciting)
            // if (!isMuraaja && this.isAutoRepeat && (this.isWaitingForRepetition || this.isSimulationPlaying)) {
            //    return classes + 'hidden-verse';
            // }

            return classes + 'active-verse'; // Hifz mode or fully revealed
        }

        // Next verse shows hint only in Hifz mode (as per user request: hide hints in review)
        // Show ONLY the first word as hint
        // Next verse shows hint only in Hifz mode
        if (verseKey === nextVerseKey && !isMuraaja) {
            // OPTIMIZATION: Use pre-calculated flag
            const isFirst = (segment as EnrichedMushafSegment).isFirstSegment !== undefined
                ? (segment as EnrichedMushafSegment).isFirstSegment
                : this.isFirstSegmentOfVerse(segment, verseKey, page);

            if (isFirst) {
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
        } catch (e) {
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

        this.voiceSubscription = this.voiceService.voiceEvents$
            .pipe(takeUntil(this.destroy$))
            .subscribe(event => {
                if (event.type === 'error') {
                    this.voiceState = 'error';
                } else if (event.type === 'start') {
                    this.voiceState = 'listening';
                    this.cdr.detectChanges();
                } else if (event.type === 'end') {
                    if (this.isMemorizationMode && this.memorizationSettings.inputMethod === 'voice') {
                        setTimeout(() => this.voiceService.start(), 300);
                    }
                } else if (event.type === 'result') {
                    this.processVoiceInput(event.transcript || '', event.isFinal || false);
                }
                this.cdr.detectChanges();
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
        this.voiceState = 'processing';

        // Get expected words for the current Ayah
        const vKey = this.sessionAyahs[this.currentAyahIndex];
        const verseSegments = this.verseDataMap.get(vKey);

        if (!verseSegments) {
            this.voiceState = 'listening';
            return;
        }

        // Skip stale buffer results for 500ms after verse change
        if (Date.now() < this.ignoreVoiceUntil) {
            console.log('[Voice] Skipping stale buffer result (cooldown):', transcript);
            return;
        }

        // Extract pure text for matching
        const expectedWords = verseSegments.map(s => s.text);

        const nextIndex = this.currentWordIndex + 1;

        // Find if the spoken text matches the NEXT word(s)
        const matchIndex = this.matchingService.findProgress(transcript, expectedWords, nextIndex);

        if (matchIndex !== -1) {
            // Correct word(s) spoken!

            // TRACK SKIPPED WORDS: If user jumped ahead, mark skipped words as errors
            for (let wordIdx = nextIndex; wordIdx < matchIndex; wordIdx++) {
                this.errorWords.add(`${vKey}:${wordIdx}`);
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

                if (this.memorizationSettings.inputMethod === 'voice') {
                    // We no longer restart the mic here to avoid the "beep" sound.
                    // Instead, we just cool down for 300ms to ignore any leftover audio from the previous Ayah.
                    this.ignoreVoiceUntil = Date.now() + 300;
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
                const nextExpectedIndex = this.currentWordIndex + 1;

                // Mark as error
                this.errorWords.add(`${vKey}:${nextExpectedIndex}`);

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



    loadTotalUsers(): void {
        this.http.get<any>(`${environment.apiBaseUrl}/admin/stats`).subscribe({
            next: (res) => {
                if (res && res.stats && res.stats.totalUsers) {
                    this.totalUsers = res.stats.totalUsers;
                } else {
                    this.totalUsers = 0;
                }
            },
            error: () => {
                this.totalUsers = 0;
            }
        });
    }

    sharePosition(): void {
        const pageLink = `https://play.google.com/store/apps/details?id=com.kenouz.mushafwird&pcampaignid=web_share`;
        const appLink = `https://play.google.com/store/apps/details?id=com.kenouz.mushafwird&pcampaignid=web_share`;
        const text = `شاركوني تلاوة وحفظ ومراجعة القرآن الكريم عبر تطبيق وموقع كنوز. \nالرابط: ${pageLink} \nتحميل التطبيق: ${appLink}`;

        if (this.isAndroid && (window as any).Android && (window as any).Android.share) {
            (window as any).Android.share(text);
        } else if (navigator.share) {
            navigator.share({
                title: 'knoozbook - المصحف الشريف',
                text: text,
                url: pageLink
            }).catch(err => { });
        } else {
            const tempInput = document.createElement('textarea');
            tempInput.value = text;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            alert('تم نسخ رابط المصحف والتطبيق للمشاركة!');
        }
    }

    getStatsUnitLabel(): string {
        const isPageBased = this.userPlan?.hifzTargetType === 'page' ||
            this.dailyTasks?.new_memorization?.label?.includes('صفحة') ||
            this.dailyTasks?.new_memorization?.unit === 'page';
        return isPageBased ? 'صفحة محفوظة' : 'آية محفوظة';
    }

    getStatsRemainingLabel(): string {
        const isPageBased = this.userPlan?.hifzTargetType === 'page' || this.dailyTasks?.new_memorization?.label?.includes('صفحة');
        return isPageBased ? 'صفحة' : 'آية';
    }

    getStatsValue(verses: number, type: 'memorized' | 'remaining' = 'memorized'): number {
        const isPageBased = this.userPlan?.hifzTargetType === 'page' ||
            this.dailyTasks?.new_memorization?.label?.includes('صفحة') ||
            this.dailyTasks?.new_memorization?.unit === 'page';

        if (isPageBased) {
            // Priority 1: Backend-calculated precise fractional page counts
            if (type === 'memorized' && this.dailyTasks?.stats?.totalPagesMemorized !== undefined) {
                return this.dailyTasks.stats.totalPagesMemorized;
            }
            if (type === 'remaining' && this.dailyTasks?.stats?.remainingPages !== undefined) {
                return this.dailyTasks.stats.remainingPages;
            }
            // Priority 2: Backend stats from the top-level plan if direct task stats are missing
            const planStats = (this.userPlan as any)?.stats;
            if (type === 'memorized' && planStats?.totalPagesMemorized !== undefined) {
                return planStats.totalPagesMemorized;
            }

            // Fallback: Estimation (less accurate)
            return parseFloat((verses / 15).toFixed(1));
        }
        return verses;
    }

    private processTafsirResponse(res: any, verseKey: string): void {
        this.ngZone.run(() => {
            if (res && res.tafsirs) {
                // Update font again for the specific response page just in case
                const fontName = this.dataService.getFontName(this.tafsirPageNumber);
                this.tafsirFontFamily = this.createFontFamily(fontName);

                let lastSurahId = -1;
                this.pageTafsirs = res.tafsirs.map((t: any) => {
                    const verseData = this.verseDataMap.get(t.verse_key);
                    const [sId] = t.verse_key.split(':').map(Number);
                    const showHeader = sId !== lastSurahId;
                    lastSurahId = sId;
                    return {
                        ...t,
                        show_header: showHeader,
                        surah_id: sId,
                        verse_text: verseData ? verseData.map((s: any) => s.text).join('') : ''
                    };
                });
                this.dataService.getMetadata().pipe(take(1)).subscribe(meta => {
                    this.ngZone.run(() => {
                        this.pageTafsirs.forEach(t => {
                            if (t.show_header) {
                                const s = meta.surahs.find(surah => surah.id === t.surah_id);
                                if (s) t.surah_name = s.name;
                            }
                        });
                        this.cdr.detectChanges();
                    });
                });
                this.currentTafsir = this.pageTafsirs.find(t => t.verse_key === verseKey) || this.pageTafsirs[0];
                this.loadingTafsir = false;
                this.cdr.detectChanges();

                setTimeout(() => {
                    this.ngZone.run(() => {
                        const el = document.getElementById(`tafsir-v-${verseKey}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                }, 500);
            } else {
                this.loadingTafsir = false;
                this.cdr.detectChanges();
            }
        });
    }

    private scrollToPlayingVerse(): void {
        try {
            // Find the active verse segment
            const activeElement = document.querySelector('.audio-active') || document.querySelector('.playing-verse');

            if (activeElement) {
                // Find the scrollable container (mushaf-page)
                const container = activeElement.closest('.mushaf-page') as HTMLElement;

                // Only scroll if content pushes bounds (Landscape mode or zoomed)
                // In Portrait Fixed mode, scrollHeight approx equals clientHeight, so we skip scrolling to keep page fixed.
                if (container && (container.scrollHeight > container.clientHeight + 50)) {
                    activeElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'center'
                    });
                } else {
                    // Ensure we didn't accidentally shift the parent container
                    const wrapper = document.querySelector('.mushaf-page-container');
                    if (wrapper) wrapper.scrollTop = 0;
                }
            }
        } catch (e) {
            console.warn('[MushafPage] Auto-scroll failed:', e);
        }
    }

    private isWithinActiveRange(verseKey: string, state: PlaybackState): boolean {
        // Priority 0: Explicit playback range mode overrides legacy/stale rangeEndVerseKey
        if (state.playbackRange === 'quran') {
            return true;
        }
        if (state.playbackRange === 'surah') {
            const surahInRange = state.currentVerseKey?.split(':')[0] || verseKey.split(':')[0];
            return verseKey.startsWith(`${surahInRange}:`);
        }
        if (state.playbackRange === 'single') {
            return verseKey === (state.currentVerseKey || verseKey);
        }

        // Priority 1: specificRange (Page, Juz, Custom)
        if (state.specificRange && state.specificRange.start && state.specificRange.end) {
            const parseKey = (key: string) => {
                const parts = key.split(':').map(Number);
                return (parts[0] || 0) * 1000 + (parts[1] || 0);
            };
            const currentVal = parseKey(verseKey);
            const startVal = parseKey(state.specificRange.start);
            const endVal = parseKey(state.specificRange.end);
            return currentVal >= startVal && currentVal <= endVal;
        }

        // Priority 2: rangeEndVerseKey
        if (!state.rangeEndVerseKey) {
            return true;
        }

        const parseKey = (key: string) => {
            const parts = key.split(':').map(Number);
            return (parts[0] || 0) * 1000 + (parts[1] || 0);
        };

        const currentVal = parseKey(verseKey);
        const endVal = parseKey(state.rangeEndVerseKey);
        const result = currentVal <= endVal;

        console.log(`[MushafPage] isWithinActiveRange: ${verseKey}(${currentVal}) <= ${state.rangeEndVerseKey}(${endVal}) -> ${result}`);
        return result;
    }

    private async autoNavigateToVerse(verseKey: string): Promise<void> {
        try {
            const [surahId, verseNum] = verseKey.split(':').map(Number);
            const page = await firstValueFrom(this.dataService.getPageNumberForVerse(surahId, verseNum));

            if (page && page !== this.pageNumber) {
                console.log(`[MushafPage] Auto-navigating to page ${page} for verse ${verseKey}`);

                // --- SMOOTH AUTO-NAVIGATION ---
                // If the jump is just the next or previous page, use animated transition
                if (!this.isAnimating) {
                    if (page === this.pageNumber + 1) {
                        this.triggerPageChange('next');
                    } else if (page === this.pageNumber - 1) {
                        this.triggerPageChange('prev');
                    } else {
                        this.goToPage(page);
                    }
                } else {
                    this.goToPage(page);
                }

                // --- DYNAMIC BOUNDARY UPDATE ---
                // Ensure boundaries move with automated navigation (especially for 'page' or 'juz' modes)
                await this.syncPlaybackBoundary(verseKey);

                this.cdr.detectChanges();
            }
        } catch (e) {
            console.warn('[MushafPage] Auto-navigation failed:', e);
        }
    }

    // Verse Search Methods
    toggleSearch() {
        this.isSearchOpen = !this.isSearchOpen;
        if (this.isSearchOpen) {
            this.isSidebarOpen = false; // Close sidebar when opening search
            this.searchQuery = '';
            this.searchResults = [];
            // Focus input after a short delay for animation
            setTimeout(() => {
                const el = document.getElementById('verse-search-input');
                if (el) el.focus();
            }, 300);
        }
    }

    private normalizeArabic(text: string): string {
        if (!text) return '';
        return text
            .replace(/[\u064B-\u065F]/g, '') // Remove Tashkeel
            .replace(/[أإآ]/g, 'ا')        // Unify Alef
            .replace(/ة/g, 'ه')            // Unify Marboota
            .replace(/ى/g, 'ي')            // Unify Yaa
            .trim();
    }

    onSearchInput(event: any) {
        const query = (event.target as HTMLInputElement).value.trim();
        this.searchQuery = query;

        // Clear previous timeout for debouncing
        if (this.searchTimeout) clearTimeout(this.searchTimeout);

        if (query.length < 2) {
            this.searchResults = [];
            this.isSearching = false;
            return;
        }

        this.isSearching = true;
        this.searchTimeout = setTimeout(() => {
            this.executeSearch(query);
        }, 300);
    }

    async executeSearch(query: string) {
        try {
            // 1. Get Search Database (Local/Offline)
            const searchDb = await firstValueFrom(this.dataService.getSearchData());
            const normalizedQuery = this.normalizeArabic(query);

            // 2. Perform Filtering (Support full sentence matching)
            const matchedVerses = searchDb.filter(v => v.s.includes(normalizedQuery));

            // 3. Limit result size for performance (e.g., 50 matches)
            const limitedResults = matchedVerses.slice(0, 50);

            // 4. Get Metadata for Surah Names (Cached in service)
            const meta = await firstValueFrom(this.dataService.getMetadata());
            const surahMap = new Map(meta.surahs.map(s => [s.id, s.name]));

            // 5. Map to UI format
            this.searchResults = limitedResults.map(res => {
                const [sId, vNum] = res.k.split(':').map(Number);
                return {
                    verse_key: res.k,
                    surah_id: sId,
                    verse_number: vNum,
                    surah_name: surahMap.get(sId) || `سورة ${sId}`,
                    text: res.t // Original text with diacritics
                };
            });

            // 6. Sort results by Quran order
            this.searchResults.sort((a, b) => {
                if (a.surah_id !== b.surah_id) return a.surah_id - b.surah_id;
                return a.verse_number - b.verse_number;
            });

        } catch (err) {
            console.error('Local search failed, falling back to API:', err);
            // Fallback for exceptional cases (e.g. storage error)
            const url = `https://api.quran.com/api/v4/search?q=${encodeURIComponent(query)}&size=50`;
            try {
                const response: any = await firstValueFrom(this.http.get(url));
                const meta = await firstValueFrom(this.dataService.getMetadata());
                const surahMap = new Map(meta.surahs.map(s => [s.id, s.name]));
                const results = response.search.results || [];
                this.searchResults = results.map((res: any) => {
                    const [sId, vNum] = res.verse_key.split(':').map(Number);
                    return {
                        ...res,
                        surah_id: sId,
                        verse_number: vNum,
                        surah_name: surahMap.get(sId) || `سورة ${sId}`,
                        text: res.highlighted || res.text
                    };
                });
            } catch (fallbackErr) {
                console.error('Fallback search also failed:', fallbackErr);
            }
        } finally {
            this.isSearching = false;
            this.cdr.detectChanges();
        }
    }

    async goToSearchResult(result: any) {
        const verseKey = result.verse_key;
        const [surah, verse] = verseKey.split(':').map(Number);

        this.isSearchOpen = false; // Close search

        try {
            const pageNum = await firstValueFrom(this.dataService.getPageNumberForVerse(surah, verse));
            if (pageNum) {
                this.goToPage(pageNum);

                // Highlight the verse briefly after navigation
                setTimeout(() => {
                    this.flashVerseKey = verseKey;
                    const el = document.querySelector(`span[data-key="${verseKey}"]`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Ensure horizontal alignment isn't disturbed by scrollIntoView
                        const parentPage = el.closest('.mushaf-page');
                        if (parentPage instanceof HTMLElement) {
                            setTimeout(() => parentPage.scrollLeft = 0, 100);
                        }
                    }

                    // Remove highlight after 2 seconds
                    setTimeout(() => {
                        this.flashVerseKey = null;
                        this.cdr.detectChanges();
                    }, 2000);
                }, 1000);
            }
        } catch (err) {
            console.error('Navigation to search result failed:', err);
        }
    }

    // --- Continuous Scroll Logic ---

    toggleContinuousMode(): void {
        this.isContinuousMode = !this.isContinuousMode;
        localStorage.setItem('mushaf_continuous_mode', JSON.stringify(this.isContinuousMode));
        this.cdr.detectChanges(); // Force UI update immediately

        if (this.isContinuousMode) {
            this.isSettingsOpen = false; // NEW: Close settings when entering continuous mode
            // Defer heavy lifting to allow UI toggle to animate first
            setTimeout(() => {
                this.prepareVerticalLayout();
            }, 50);
        } else {
            this.stopAutoScroll();
            this.goToPage(this.pageNumber);
        }
    }

    private async prepareVerticalLayout(): Promise<void> {
        console.log('[ContinuousScroll] prepareVerticalLayout called for page:', this.pageNumber);

        // IMMEDIATELY hide content and clear old pages
        this.isVerticalLayoutReady = false;
        this.verticalPages = [];
        this.cdr.detectChanges();

        // Wait a tick for DOM to update and hide old content
        await new Promise(resolve => setTimeout(resolve, 10));

        // Load a range of pages around current page (expanded for merging effect)
        const start = Math.max(1, this.pageNumber - 3); // Load 3 previous pages
        const end = Math.min(604, this.pageNumber + 5);

        // FIRST: Preload all fonts for the page range
        const fontLoadPromises = [];
        for (let fpIdx = start; fpIdx <= end; fpIdx++) {
            fontLoadPromises.push(this.fontService.loadPageFont(fpIdx));
        }
        fontLoadPromises.push(this.fontService.loadBasmalahFont());

        try {
            await Promise.all(fontLoadPromises);
            // Wait for browser to process the newly loaded fonts
            await (document as any).fonts.ready;
            console.log('[ContinuousScroll] Fonts loaded for pages', start, 'to', end);
        } catch (err) {
            console.error('[ContinuousScroll] Font loading error:', err);
        }

        // THEN: Load page data
        const pageRequests = [];
        for (let dpIdx = start; dpIdx <= end; dpIdx++) {
            pageRequests.push(firstValueFrom(this.dataService.getPage(dpIdx)));
        }

        const results = await Promise.all(pageRequests);
        this.verticalPages = results.filter(p => !!p);

        // NOW show content - fonts are ready
        this.isVerticalLayoutReady = true;

        // Force Angular to re-render the view
        this.cdr.detectChanges();
        console.log('[ContinuousScroll] Loaded', this.verticalPages.length, 'pages. Scrolling to page', this.pageNumber);

        // Let UI render then scroll to target
        setTimeout(() => {
            const el = document.querySelector(`.vertical-page-wrapper[data-page="${this.pageNumber}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'auto', block: 'start' });
                console.log('[ContinuousScroll] Scrolled to page element');
            } else {
                console.warn('[ContinuousScroll] Target page element NOT found!');
            }
        }, 150);
    }

    onVerticalScroll(event: Event): void {
        const container = event.target as HTMLElement;
        this.updateActivePageFromScroll(container);

        // Auto-load more pages if scrolling manually near bottom
        if (container.scrollHeight - container.scrollTop < window.innerHeight * 2) {
            this.loadMoreVerticalPages();
        }

        // Auto-load previous pages if scrolling near top
        if (container.scrollTop < 200) {
            this.loadPreviousVerticalPages(container);
        }
    }

    private isLoadingPreviousPages = false;

    private async loadPreviousVerticalPages(container: HTMLElement): Promise<void> {
        if (this.isLoadingPreviousPages) return;

        const firstPage = this.verticalPages[0]?.page_number;
        if (firstPage && firstPage > 1) {
            const prevPageNum = firstPage - 1;

            // Prevent duplicate requests
            if (this.verticalPages.some(p => p.page_number === prevPageNum)) return;

            this.isLoadingPreviousPages = true;

            // Load font first
            await this.fontService.loadPageFont(prevPageNum);

            const prevPage = await firstValueFrom(this.dataService.getPage(prevPageNum));
            if (prevPage) {
                const oldScrollHeight = container.scrollHeight;

                this.verticalPages.unshift(prevPage);
                this.cdr.detectChanges();

                // Restore scroll position
                const newScrollHeight = container.scrollHeight;
                container.scrollTop += (newScrollHeight - oldScrollHeight);
            }
            this.isLoadingPreviousPages = false;
        }
    }

    toggleAutoScroll(): void {
        if (this.isAutoScrolling) {
            this.stopAutoScroll();
        } else {
            this.startAutoScroll();
            this.resetSpeedControlsTimer(); // Show controls when starting
        }
    }

    startAutoScroll(): void {
        if (!this.isContinuousMode) return;
        this.isAutoScrolling = true;
        this.animateScroll();
    }

    stopAutoScroll(): void {
        this.isAutoScrolling = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    private accumulatedScroll: number = 0; // Fractional accumulator for smooth scrolling

    private animateScroll(): void {
        if (!this.isAutoScrolling) return;

        const container = document.querySelector('.mushaf-vertical-viewer');
        if (container) {
            // Speed calculation: 1.0 = approx 0.3 pixels per frame
            // On Retina/High-DPI screens, standard scrollTop simply rounds small values down to 0, stopping the scroll.
            // We must accumulate fractions until they exceed 1 pixel.
            const pixelsPerFrame = (0.3 * this.autoScrollSpeed);

            // Sync accumulator if it's lagging or fresh start
            if (this.accumulatedScroll === 0 || Math.abs(this.accumulatedScroll - container.scrollTop) > 50) {
                this.accumulatedScroll = container.scrollTop;
            }

            this.accumulatedScroll += pixelsPerFrame;
            container.scrollTop = this.accumulatedScroll;

            // Load more if near bottom
            if (container.scrollHeight - container.scrollTop < window.innerHeight * 2) {
                this.loadMoreVerticalPages();
            }

            this.updateActivePageFromScroll(container);
            this.rafId = requestAnimationFrame(() => this.animateScroll());
        }
    }

    private updateActivePageFromScroll(container: Element): void {
        const wrappers = container.querySelectorAll('.vertical-page-wrapper');
        let activePage = this.pageNumber;

        for (let wrapIdx = 0; wrapIdx < wrappers.length; wrapIdx++) {
            const rect = wrappers[wrapIdx].getBoundingClientRect();
            if (rect.top <= 120 && rect.bottom >= 120) {
                activePage = parseInt(wrappers[wrapIdx].getAttribute('data-page') || '0');
                break;
            }
        }

        if (activePage !== this.pageNumber) {
            this.pageNumber = activePage;
            // Reset page timers/award state so the next page can be counted correctly
            this.pageStartTime = Date.now();
            this.isCurrentPageAwarded = false;

            this.currentSurah$ = this.dataService.getSurahAtPage(this.pageNumber);
            this.currentJuz$ = this.dataService.getJuzAtPage(this.pageNumber);
            localStorage.setItem('lastMushafPage', this.pageNumber.toString());
            this.cdr.detectChanges();
        }
    }

    adjustScrollSpeed(delta: number): void {
        this.autoScrollSpeed = Math.max(0.1, Math.min(5.0, this.autoScrollSpeed + delta));
        localStorage.setItem('mushaf_scroll_speed', this.autoScrollSpeed.toString());
        this.resetSpeedControlsTimer(); // Keep controls visible while adjusting
    }

    // Timer for hiding speed controls
    private speedControlsTimer: any;
    // showScrollControls is already declared at the top of the class

    resetSpeedControlsTimer(): void {
        this.showScrollControls = true;
        this.cdr.detectChanges();

        if (this.speedControlsTimer) {
            clearTimeout(this.speedControlsTimer);
        }

        this.speedControlsTimer = setTimeout(() => {
            this.showScrollControls = false;
            this.cdr.detectChanges();
        }, 2000);
    }

    // Prevents duplicate requests while loading pages
    private isLoadingMorePages = false;

    private async loadMoreVerticalPages(): Promise<void> {
        if (this.isLoadingMorePages) return;

        const lastPage = this.verticalPages[this.verticalPages.length - 1]?.page_number;
        if (lastPage && lastPage < 604) {
            // Prevent duplicate
            if (this.verticalPages.some(p => p.page_number === lastPage + 1)) return;

            this.isLoadingMorePages = true;

            // Load font first
            await this.fontService.loadPageFont(lastPage + 1);

            const nextPage = await firstValueFrom(this.dataService.getPage(lastPage + 1));
            if (nextPage) {
                this.verticalPages.push(nextPage);
                this.cdr.detectChanges();
            }
            this.isLoadingMorePages = false;
        }
    }
    getCurrentSurahNameByPage(pageNum: number): string {
        if (!this.allSurahs || !this.allSurahs.length) return '';
        const surah = this.allSurahs.find(s => pageNum >= s.start_page && pageNum <= s.end_page);
        return surah ? surah.name : '';
    }

    getCurrentJuzByPage(pageNum: number): number {
        if (!this.allJuzs || !this.allJuzs.length) return 1;
        let currentJuz = this.allJuzs[0];
        for (const juz of this.allJuzs) {
            if (juz.start_page <= pageNum) {
                currentJuz = juz;
            } else {
                break;
            }
        }
        return currentJuz ? currentJuz.id : 1;
    }

    onLogout(): void {
        console.warn('🛑 [MushafPage] onLogout triggered!', {
            isLoggedIn: this.authService.isLoggedIn(),
            user: this.authService.currentUserValue?.username
        });
        this.authService.logout();
        this.router.navigate(['/login']);
    }

    navigateTo(path: string): void {
        this.router.navigate([path]);
        this.isSettingsOpen = false;
        this.isSidebarOpen = false;
    }

    // --- ASR Voice Review Functions (Integrated) ---

    toggleAsrReviewEnabled(): void {
        this.isAsrReviewEnabled = !this.isAsrReviewEnabled;
        if (!this.isAsrReviewEnabled) {
            this.stopAsrRecording();
            this.asrReviewResult = null;
            this.asrReviewError = null;
            this.errorWords.clear();
        }
    }

    async startAsrRecording(): Promise<void> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const webmBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                console.log('🎤 Converting WebM to WAV...');
                this.recordedAudioBlob = await this.convertWebMToWav(webmBlob);
                console.log('✅ Conversion complete, WAV size:', this.recordedAudioBlob.size);
                this.processAsrRecording();
            };

            this.mediaRecorder.start();
            this.isAsrRecording = true;
            this.asrRecordingDuration = 0;
            this.asrReviewResult = null;
            this.asrReviewError = null;
            this.errorWords.clear();

            this.asrRecordingInterval = setInterval(() => {
                this.asrRecordingDuration++;
            }, 1000);

            this.cdr.detectChanges();
        } catch (error) {
            console.error('Error starting recording:', error);
            this.asrReviewError = 'فشل في الوصول للميكروفون. يرجى التحقق من الأذونات.';
            this.cdr.detectChanges();
        }
    }

    async convertWebMToWav(webmBlob: Blob): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const arrayBuffer = reader.result as ArrayBuffer;
                    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                    const wavBuffer = this.audioBufferToWav(audioBuffer);
                    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
                    resolve(wavBlob);
                } catch (error) {
                    console.error('Error converting audio:', error);
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(webmBlob);
        });
    }

    private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;

        const dataLength = buffer.length * blockAlign;
        const bufferLength = 44 + dataLength;

        const arrayBuffer = new ArrayBuffer(bufferLength);
        const view = new DataView(arrayBuffer);

        // WAV header
        const writeString = (offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);

        // Write audio data
        const channels = [];
        for (let i = 0; i < numChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, channels[channel][i]));
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true);
                offset += 2;
            }
        }

        return arrayBuffer;
    }

    stopAsrRecording(): void {
        if (this.mediaRecorder && this.isAsrRecording) {
            this.mediaRecorder.stop();
            this.isAsrRecording = false;
            if (this.asrRecordingInterval) {
                clearInterval(this.asrRecordingInterval);
                this.asrRecordingInterval = null;
            }
            this.cdr.detectChanges();
        }
    }

    stopRecording(): void {
        if (this.mediaRecorder && this.isAsrRecording) {
            this.mediaRecorder.stop();
            this.isAsrRecording = false;
            if (this.asrRecordingInterval) {
                clearInterval(this.asrRecordingInterval);
                this.asrRecordingInterval = null;
            }
            this.cdr.detectChanges();
        }
    }

    async processAsrRecording(): Promise<void> {
        if (!this.recordedAudioBlob) return;

        console.log('🎤 Starting ASR processing...');
        this.asrReviewLoading = true;
        this.cdr.detectChanges();

        try {
            // Use current memorization settings for range
            const currentSurah = this.memorizationSettings.targetSurah || this.getCurrentSurahForPage(this.pageNumber);
            let ayahRange: { start: number; end: number };

            // If in page mode, limit to smaller range (max 5 ayahs) for better accuracy
            if (this.memorizationSettings.range === 'page') {
                const fullPageRange = await this.getAyahRangeForPage(this.pageNumber);
                const rangeLength = fullPageRange.end - fullPageRange.start + 1;
                // Limit to 5 ayahs max for better ASR accuracy
                if (rangeLength > 5) {
                    ayahRange = {
                        start: fullPageRange.start,
                        end: fullPageRange.start + 4
                    };
                } else {
                    ayahRange = fullPageRange;
                }
            } else if (this.memorizationSettings.range === 'surah') {
                // Use custom surah range, but limit to 5 ayahs max
                const customRange = {
                    start: this.memorizationSettings.surahStartVerse || 1,
                    end: this.memorizationSettings.surahEndVerse || 7
                };
                const rangeLength = customRange.end - customRange.start + 1;
                if (rangeLength > 5) {
                    ayahRange = {
                        start: customRange.start,
                        end: customRange.start + 4
                    };
                } else {
                    ayahRange = customRange;
                }
            } else if (this.memorizationSettings.range === 'half_page') {
                // Get half page range, limit to 5 ayahs max
                const pageData = await firstValueFrom(this.dataService.getPage(this.pageNumber).pipe(take(1)));
                if (pageData) {
                    const verseKeys = this.getJustKeys(pageData);
                    const isSecond = this.memorizationSettings.selectedHalf === 'second';
                    const filteredKeys = verseKeys.filter(v => this.isVerseInSecondHalf(v, this.pageNumber) === isSecond);
                    const ayahs = filteredKeys.map(key => parseInt(key.split(':')[1]));
                    const halfPageRange = {
                        start: Math.min(...ayahs),
                        end: Math.max(...ayahs)
                    };
                    const rangeLength = halfPageRange.end - halfPageRange.start + 1;
                    if (rangeLength > 5) {
                        ayahRange = {
                            start: halfPageRange.start,
                            end: halfPageRange.start + 4
                        };
                    } else {
                        ayahRange = halfPageRange;
                    }
                } else {
                    ayahRange = { start: 1, end: 5 };
                }
            } else {
                // Default to page range with limit
                const fullPageRange = await this.getAyahRangeForPage(this.pageNumber);
                const rangeLength = fullPageRange.end - fullPageRange.start + 1;
                if (rangeLength > 5) {
                    ayahRange = {
                        start: fullPageRange.start,
                        end: fullPageRange.start + 4
                    };
                } else {
                    ayahRange = fullPageRange;
                }
            }

            console.log('📄 Current Surah:', currentSurah, 'Ayah Range:', ayahRange);
            console.log('📁 Audio blob size:', this.recordedAudioBlob.size, 'bytes');
            console.log('📤 Sending ASR request with:', {
                expected_surah: currentSurah,
                expected_ayah_start: ayahRange.start,
                expected_ayah_end: ayahRange.end
            });

            const audioFile = new File([this.recordedAudioBlob], 'recitation.wav', { type: 'audio/wav' });
            console.log('📤 Sending to ASR service...');

            const response = await firstValueFrom(
                this.asrReviewService.reviewRecitation({
                    audio_file: audioFile,
                    expected_surah: currentSurah,
                    expected_ayah_start: ayahRange.start,
                    expected_ayah_end: ayahRange.end
                })
            );

            console.log('✅ ASR Response received:', response);
            this.asrReviewResult = response;
            this.asrReviewError = null;
            this.showAsrModal = true; // Show modal with results

            console.log('🎨 Highlighting errors:', response.errors);
            this.highlightAsrErrors(response.errors);
            this.cdr.detectChanges();
        } catch (error) {
            console.error('❌ Error processing recording:', error);
            this.asrReviewError = 'فشل في معالجة التسجيل. يرجى المحاولة مرة أخرى.';
            this.asrReviewResult = null;
        } finally {
            this.asrReviewLoading = false;
            console.log('🔄 ASR processing completed');
            this.cdr.detectChanges();
        }
    }

    getCurrentSurahForPage(pageNum: number): number {
        if (!this.allSurahs || !this.allSurahs.length) return 1;
        const surah = this.allSurahs.find(s => pageNum >= s.start_page && pageNum <= s.end_page);
        return surah ? surah.id : 1;
    }

    async getAyahRangeForPage(pageNum: number): Promise<{ start: number; end: number }> {
        try {
            const pageData = await firstValueFrom(this.dataService.getPage(pageNum).pipe(take(1)));
            if (!pageData) return { start: 1, end: 7 };

            const verseKeys = this.getJustKeys(pageData);
            if (verseKeys.length === 0) return { start: 1, end: 7 };

            // Parse verse keys to get surah and ayah numbers
            const ayahs = verseKeys.map(key => {
                const [surah, ayah] = key.split(':').map(Number);
                return { surah, ayah };
            });

            // Filter to only ayahs from the same surah (most common case)
            const surahCounts = ayahs.reduce((acc, { surah }) => {
                acc[surah] = (acc[surah] || 0) + 1;
                return acc;
            }, {} as Record<number, number>);

            const mainSurah = Object.entries(surahCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
            if (!mainSurah) return { start: 1, end: 7 };

            const surahAyahs = ayahs.filter(a => a.surah === Number(mainSurah));
            if (surahAyahs.length === 0) return { start: 1, end: 7 };

            const ayahNumbers = surahAyahs.map(a => a.ayah);
            const start = Math.min(...ayahNumbers);
            const end = Math.max(...ayahNumbers);

            return { start, end };
        } catch (error) {
            console.error('Error getting ayah range for page:', error);
            return { start: 1, end: 7 };
        }
    }

    highlightAsrErrors(errors: any[]): void {
        console.log('🎯 Highlighting ASR errors, count:', errors.length);
        errors.forEach((error, index) => {
            const verseKey = `${error.surah}:${error.ayah}`;
            const wordKey = `${verseKey}:${error.word_index}`;

            console.log(`   Error ${index + 1}:`, {
                verseKey,
                wordKey,
                error_type: error.error_type,
                expected: error.expected_word,
                transcribed: error.transcribed_word
            });

            if (error.error_type === 'incorrect' || error.error_type === 'missing') {
                this.errorWords.add(wordKey);
                console.log(`   ✓ Added to errorWords: ${wordKey}`);
            }
        });
        console.log('🎨 Total errorWords after highlighting:', this.errorWords.size);
        this.cdr.detectChanges();
    }

    dismissAsrResult(): void {
        this.asrReviewResult = null;
        this.asrReviewError = null;
        this.recordedAudioBlob = null;
        this.errorWords.clear();
        this.showAsrModal = false;
        this.cdr.detectChanges();
    }

    closeAsrModal(): void {
        this.showAsrModal = false;
        this.cdr.detectChanges();
    }

    getTranscribedWordsWithStatus(): { text: string; status: string }[] {
        if (!this.asrReviewResult || !this.asrReviewResult.transcribed_text) {
            return [];
        }

        const text = this.asrReviewResult.transcribed_text;
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const errors = this.asrReviewResult.errors || [];

        return words.map(word => {
            // Check if this word is in errors
            const error = errors.find(e => e.transcribed_word === word);
            if (error) {
                return { text: word, status: error.error_type };
            }
            return { text: word, status: 'correct' };
        });
    }

    getWordStatusClass(status: string): string {
        switch (status) {
            case 'correct':
                return 'correct';
            case 'incorrect':
                return 'incorrect';
            case 'missing':
                return 'missing';
            case 'extra':
                return 'extra';
            default:
                return '';
        }
    }

    getErrorTypeLabel(errorType: string): string {
        switch (errorType) {
            case 'missing':
                return 'مفقودة';
            case 'extra':
                return 'إضافية';
            case 'incorrect':
                return 'خاطئة';
            default:
                return errorType;
        }
    }

    getAccuracyClass(score: number): string {
        if (score >= 0.9) return 'excellent';
        if (score >= 0.7) return 'good';
        if (score >= 0.5) return 'fair';
        return 'poor';
    }

    getErrorIcon(errorType: string): string {
        switch (errorType) {
            case 'missing': return 'fa-minus-circle';
            case 'extra': return 'fa-plus-circle';
            case 'incorrect': return 'fa-times-circle';
            default: return 'fa-exclamation-circle';
        }
    }
}
