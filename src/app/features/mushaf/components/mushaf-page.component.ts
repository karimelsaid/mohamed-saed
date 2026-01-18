import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { MutabaaTrackerComponent } from './mutabaa-tracker/mutabaa-tracker.component';
import { MushafDataService } from '../../../core/services/mushaf-data.service';
import { MushafFontService } from '../../../core/services/mushaf-font.service';
import { MushafAssetService } from '../../../core/services/mushaf-asset.service'; // Added Import
import { VoiceRecognitionService } from '../../../core/services/voice-recognition.service';
import { QuranMatchingService } from '../../../core/services/quran-matching.service';
import { MushafPage, SurahMetadata, JuzMetadata, MushafMetadata, MushafSegment } from '../../../core/models/mushaf.model';
import { Observable, firstValueFrom, of, Subscription, forkJoin } from 'rxjs';
import { take, filter, map } from 'rxjs/operators';
import { QuranProgressService } from '../../../services/quran-progress.service';
import { MutabaaService } from '../../../services/mutabaa.service';
import { HifzPlanService } from '../../../services/hifz-plan.service';
import { PushNotificationService } from '../../../services/push-notification.service';
import { LocalReminderService } from '../../../services/local-reminder.service';
import { QuranAudioService, PlaybackState } from '../../../core/services/quran-audio.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export type VoiceState = 'inactive' | 'listening' | 'processing' | 'error' | 'idle';

export interface ReminderSettings {
    recitation: { enabled: boolean; time: string };
    memorization: { enabled: boolean; time: string };
    revision: { enabled: boolean; time: string };
    kahfFriday: { enabled: boolean; time: string };
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
    settingsMode: 'wird' | 'stats' = 'stats';
    sidebarTab: 'surahs' | 'juzs' | 'pages' = 'surahs';
    currentTheme: string = 'cream'; // NEW: Default Mushaf theme
    themes = ['cream', 'white', 'green', 'sky', 'blue', 'dark']; // Added 'sky' for Madina Blue style
    isLoggedIn: boolean = false; // User login status
    isMobileApp: boolean = false; // Check if running as native/pwa app
    isAndroid: boolean = false; // Check if running specifically on Android
    activeWirdTab: 'recitation' | 'memorization' | 'revision' | 'mutabaa' = 'mutabaa'; // Dashboard active tab
    totalUsers: number = 0; // NEW: Total readers count
    guestModeAccepted: boolean = localStorage.getItem('guestModeAccepted') === 'true'; // Guest mode flag


    isMemorizationMode: boolean = false;
    showOptionsSheet: boolean = false;
    selectedVerseKey: string | null = null;

    @ViewChild(MutabaaTrackerComponent) mutabaaTracker!: MutabaaTrackerComponent;

    // Memorization Settings
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
    availableSurahs: { id: number, nameAr: string, nameEn: string }[] = []; // NEW: Surahs on current page
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
    ripples: { x: number, y: number, id: number }[] = [];
    private rippleId = 0;

    // Voice State
    voiceState: VoiceState = 'inactive';

    // Touch and Swipe properties
    private touchStartX: number = 0;
    private touchStartY: number = 0;
    private touchStartTime: number = 0;
    private sheetStartY: number = 0;
    slideOffset: number = 0;
    private isVerticalScroll: boolean = false;
    private hasMoved: boolean = false; // Track if touch has moved significantly
    private touchEndX: number = 0;
    private touchEndY: number = 0;
    sheetOffset: number = 0;
    sidebarOffset: number = 0; // NEW: Horizontal offset for sidebar swipe
    isDownloadMode: boolean = false; // NEW: Enable download UI in sidebar index
    downloadingSurahs: Set<number> = new Set(); // NEW: Track surahs currently downloading
    downloadedSurahs: Set<number> = new Set(); // NEW: Track completed downloads
    settingsOffset: number = 0; // NEW: Horizontal offset for settings swipe
    private sidebarTouchStartX: number = 0; // NEW: Start X position for sidebar swipe
    private settingsTouchStartX: number = 0; // NEW: Start X position for settings swipe
    pageVerticalShift: number = 0; // NEW: Vertical shift to keep active verse visible
    isAnimating: boolean = false;
    swipeDirection: 'none' | 'next' | 'prev' = 'none';
    private versePageMap: Map<string, number> = new Map(); // Tracks which page each verse belongs to
    isWaitingForPageTurn: boolean = false; // NEW: Prevent premature page turn during hifz
    showTaskDoneToast: boolean = false; // NEW: Show "Task Done" notification

    private voiceSubscription?: Subscription;

    // Error Tracking (for red highlights during session)
    // Keys are "verseKey:wordIndex" for individual words, or just "verseKey" for skipped ayahs
    errorWords: Set<string> = new Set();
    skippedAyahs: Set<string> = new Set();
    memorizedVerses: string[] = [];
    failedAttempts: number = 0; // Consecutive failed recognition attempts
    private ignoreVoiceUntil: number = 0; // Timestamp: ignore voice results until this time
    pageSplits: Map<number, { surah: number, ayah: number }> = new Map(); // NEW: Split data for half-page coloring

    // Anti-Cheat & Dynamic Progress State
    private pageStartTime: number = Date.now();

    // Audio State
    audioState$?: Observable<PlaybackState>;
    currentReciterId: number = 12; // Al-Husary Muallim
    availableReciters: any[] = [];
    showAudioPlayer: boolean = localStorage.getItem('showAudioPlayer') !== 'false'; // Restore state
    playingVerseKey: string | null = null;
    private isCurrentPageAwarded: boolean = false; // Tracks if points were already awarded for the current page
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
        kahfFriday: { enabled: false, time: '08:00' }
    };
    pushEnabled: boolean = false; // Track browser permission
    pushSubscribed: boolean = false; // Track actual push registration
    isMobile: boolean = false;

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
        { id: 91, name: 'تفسير السعدي', downloaded: false },
        { id: 14, name: 'تفسير ابن كثير', downloaded: false },
        { id: 15, name: 'تفسير الطبري', downloaded: false },
        { id: 90, name: 'تفسير القرطبي', downloaded: false },
        { id: 94, name: 'تفسير البغوي', downloaded: false }
    ];
    selectedTafsirId: number = 16;
    tafsirFontFamily: string = '';
    loadingTafsir: boolean = false;
    tafsirPageNumber: number = 0;
    showTafsirSources: boolean = false;
    tafsirDownloadProgress: { [id: number]: { current: number, total: number, loading: boolean } } = {};


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

    // Audio Settings Modal
    audioSettingsModal = {
        show: false,
        tempRepeatAyah: 0,
        tempRepeatGroup: 0,
        tempRange: 'page' as any,
        tempSpeed: 1.0
    };

    showAudioManager: boolean = false;
    showReciterModal: boolean = false;
    private isExiting: boolean = false;
    allSurahs: any[] = [];


    Math = Math;

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
        private audioService: QuranAudioService,
        private router: Router,
        private http: HttpClient
    ) { }

    async ngOnInit(): Promise<void> {

        // Setup Audio State
        this.audioState$ = this.audioService.state$;
        this.audioState$.subscribe(state => {
            const newKey = state.isPlaying ? state.currentVerseKey : null;
            if (this.playingVerseKey !== newKey) {
                this.playingVerseKey = newKey;
                this.cdr.detectChanges();

                // Auto-scroll to current verse
                if (this.playingVerseKey) {
                    setTimeout(() => {
                        this.scrollToPlayingVerse();
                    }, 250);
                }
            }
        });

        // Load all surahs for labels
        this.dataService.getMetadata().subscribe(meta => {
            if (meta) this.allSurahs = meta.surahs;
        });

        this.audioService.verseCompleted$.subscribe(verseKey => {
            if (verseKey) {
                console.log(`[MushafPage] Verse completed notification received: ${verseKey}`);
                this.playNextVerseAudio(verseKey);
            }
        });

        // Fetch memorized content for indicators
        this.hifzPlanService.getPlan().subscribe(res => {
            if (res.success && res.plan?.memorizedContent) {
                this.memorizedVerses = res.plan.memorizedContent.map(v => v.verseKey);
            }
        });

        // Initialize downloaded status
        this.updateDownloadedStatus();

        // Restore saved reciter
        const savedReciter = localStorage.getItem('lastReciterId');
        if (savedReciter) {
            this.currentReciterId = parseInt(savedReciter, 10);
            this.audioService.setReciter(this.currentReciterId);
        }

        this.loadReciters();

        // Load all surahs for Audio Manager
        this.dataService.getMetadata().pipe(take(1)).subscribe(meta => {
            this.allSurahs = meta.surahs;
        });


        // Ensure assets are downloaded before proceeding
        try {
            await this.assetService.ensureAssets();
        } catch (error) {
            console.error('Failed to download assets:', error);
            // Optionally show error to user or fallback
        }

        // Load page splits for half-page coloring
        this.dataService.getPageSplits().pipe(take(1)).subscribe(splits => {
            if (splits) {
                splits.forEach((s: any) => this.pageSplits.set(s.page, s.split));
                this.cdr.detectChanges();
            }
        });

        // Check if user is logged in
        const user = localStorage.getItem('user');
        this.isLoggedIn = !!user;
        console.log('👤 [MushafPage] isLoggedIn:', this.isLoggedIn, user ? 'User found' : 'User NOT found');

        // Check if running as Mobile App (PWA Standalone or Webview)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const isCapacitor = (window as any).Capacitor !== undefined;
        this.isMobileApp = isStandalone || isCapacitor;

        // Platform detection for Android specifically
        const ua = navigator.userAgent.toLowerCase();
        const isAndroidUA = ua.includes('android');
        const isAndroidCapacitor = isCapacitor && (window as any).Capacitor.getPlatform() === 'android';
        this.isAndroid = isAndroidUA || isAndroidCapacitor;

        this.pageStartTime = Date.now();
        this.loadUserPlan();

        // Restore saved theme from localStorage
        const savedTheme = localStorage.getItem('mushaf_theme');
        if (savedTheme && this.themes.includes(savedTheme)) {
            this.currentTheme = savedTheme;
        }

        // Restore last read page if not provided by input
        const savedPage = localStorage.getItem('lastMushafPage');
        if (savedPage && (!this.pageNumber || this.pageNumber === 1)) {
            this.pageNumber = parseInt(savedPage, 10);
        }


        this.fontService.loadBasmalahFont();
        this.loadPage();

        // Check Push Permission Status
        this.pushService.getPermissionStatus().then(statusRes => {
            this.pushEnabled = (statusRes.permission === 'granted');
            this.pushSubscribed = statusRes.hasSubscription;
            this.cdr.detectChanges();
        });

        // Refresh progress data
        // Refresh progress data
        console.log('📡 [MushafPage] Requesting Quran progress update...');
        this.quranProgressService.getProgress().subscribe({
            next: (res) => console.log('✅ [MushafPage] Quran progress update success'),
            error: (err) => console.error('❌ [MushafPage] Quran progress update error:', err)
        });

        // Subscribe to progress changes to trigger view updates in the sidebar tabs
        this.quranProgressService.progress$.subscribe(() => {
            this.cdr.detectChanges();
        });


        // Listen for task updates from anywhere (dashboard, other components)
        this.mutabaaService.taskUpdated$.subscribe(() => {
            console.log('🔄 [Mushaf] Task Update Notification Received. Reloading Tasks & Plan...');
            this.loadDailyTasks();

            // Also refresh local plan data to ensure 'memorizedVerses' (used in index) is up to date
            this.hifzPlanService.getPlan().subscribe(res => {
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
                            kahfFriday: reminders.kahfFriday || { enabled: false, time: '08:00' }
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
                        this.showHifzWizard = true;
                    }

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

    closeFeedbackModal(): void {
        this.feedbackModal.show = false;
    }

    rateApp(): void {
        // Open Google Play link
        window.open('https://play.google.com/store/apps/details?id=com.kenouz.bookstore2&pcampaignid=web_share', '_blank');
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
                            kahfFriday: reminders.kahfFriday || { enabled: false, time: '08:00' }
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
    }

    loadDailyTasks(): void {
        console.log('📡 [MushafPage] loadDailyTasks starting...');

        // 1. Load Daily Tasks (today's progress)
        this.hifzPlanService.getDailyTasks().subscribe({
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
                            this.navigateToTask('hifz', true); // Pass seamless=true
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
        this.hifzPlanService.getPlan().subscribe(res => {
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

        this.mutabaaService.updateTaskStatus(syncType, 'done', targetAmount, unit, null, versesToSync).subscribe({
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

        // FIX: If task is done, always show 100% completion
        if (task.status === 'done') {
            return `100% (${total} ${unit} من أصل ${total})`;
        }

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
        if (unitType === 'juz') displayDone = done / 20;
        else if (unitType === 'hizb') displayDone = done / 10;
        else if (unitType === 'half_hizb') displayDone = done / 5;
        else if (unitType === 'rub_hizb') displayDone = done / 2.5;

        const visualDone = displayDone;
        const formattedDone = Number.isInteger(visualDone) ? visualDone : visualDone.toFixed(1);

        // Use base target for accurate percentage
        const baseTarget = this.getTaskTargetInBaseUnits(task);
        const finalPercent = Math.min(Math.round((done / baseTarget) * 100), 100);

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
            if (unit === 'page' || unit === 'half_page') {
                // Priority 1: If we have an active session, use session length (actual verse count for the ward)
                if (this.isMemorizationMode && this.sessionAyahs.length > 0) {
                    return this.sessionAyahs.length;
                }

                // Priority 2: If task has explicit verses list
                if (task.verses && task.verses.length > 0) return task.verses.length;

                // Priority 3: Rough estimate based on typical Mushaf page/half-page
                // We only return task.amount (usually 1 or 2) if it's actually meant to be verse count.
                // But if unit is 'page', returning task.amount (e.g. 1) is wrong for verse progress.
                return unit === 'page' ? (amount * 15) : (amount * 8);
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

                if (half === 'first') {
                    this.memorizationSettings.surahStartVerse = 1;
                    this.memorizationSettings.surahEndVerse = splitAyah;
                } else {
                    this.memorizationSettings.surahStartVerse = splitAyah + 1;
                    const meta = await firstValueFrom(this.dataService.getMetadata());
                    const surahMeta = meta.surahs.find(s => s.id === splitSurah);
                    this.memorizationSettings.surahEndVerse = surahMeta ? surahMeta.verses_count : 999;
                }

                console.log(`Searching split for page ${page}: Found Split at Surah ${splitSurah}, Verse ${splitAyah}`);
            } else {
                console.warn('No split data found for this page, defaulting to arbitrary half.');
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


    async navigateToTask(task: any, seamless: boolean = false): Promise<void> {
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

        if (!seamless) this.isSettingsOpen = false;
        this.currentTaskType = task.type || null;
        const unit = task.unit || task.target || 'page';

        // --- 1. Intelligent Config & Target Resolution ---
        console.log('🤖 [Mushaf] Intelligent Navigation for Task:', task);

        // A. Resolve Target Page First (for accurate split data resolution)
        let target = await this.resolveTaskStartVerse(task);

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

        // C. Set Range and Values
        // Backend might use 'unit' or 'target' for the range type (e.g. 'half_page', 'verses', 'page')
        console.log(`🎯 [Mushaf] Detected Task Unit/Target: ${unit}`);
        const sId = task.surah || task.surahId || task.surah_id || (task.position ? task.position.surah : 0);
        if (sId) this.memorizationSettings.targetSurah = Number(sId);

        if (unit === 'page' || unit === 'pages') {
            this.memorizationSettings.range = 'page';
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
    private async resolveTaskStartVerse(task: any): Promise<{ page: number, verseKey: string } | null> {
        let page = Number(task.page || task.startPage || task.start_page || task.position?.page);
        const surah = task.surah || task.surahId || task.surah_id || task.position?.surah;
        const verse = task.verse || task.verseNumber || task.verse_number || task.position?.verse;

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
        if (this.integrityRefreshInterval) {
            clearInterval(this.integrityRefreshInterval);
        }
        this.audioService.stop();
        this.voiceSubscription?.unsubscribe();
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

        const [s, v] = verseKey.split(':').map(Number);

        // If current verse is strictly AFTER the split, it's Definitely Second Half.
        // The split target is usually the LAST ayah of the first half (from split.json).
        return s > split.surah || (s === split.surah && v > split.ayah);
    }

    // Audio Controls
    loadReciters(): void {
        this.audioService.getReciters().subscribe({
            next: reciters => {
                console.log('[MushafPage] Reciters loaded:', reciters.length);
                this.availableReciters = reciters;
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
            'عبدالرحمن السديس': 'abdul-rahman-al-sudais-profile.jpeg',
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
            'Muhammad Tablawi': 'Muhammad Al-Tablawi.jpg'
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
        this.currentReciterId = reciterId;
        localStorage.setItem('lastReciterId', reciterId.toString());
        this.audioService.setReciter(reciterId);
        this.showReciterModal = false;
        this.cdr.detectChanges();
    }

    playVerseAudio(verseKey: string): void {
        // Hide floating player when playback starts (user can toggle via header button)
        this.showAudioPlayer = false;
        localStorage.setItem('showAudioPlayer', 'false');
        this.audioService.playVerse(verseKey, this.currentReciterId);
        this.selectedVerseKey = verseKey;
    }

    toggleAudioPlayer(): void {
        this.showAudioPlayer = !this.showAudioPlayer;
        localStorage.setItem('showAudioPlayer', this.showAudioPlayer.toString());
        // Do not trigger play or pause here, just toggle visibility.
        // The user wants "flexible handling" (visibility only).
    }

    toggleAudioPlayback(state: PlaybackState): void {
        if (state.isPlaying) {
            this.audioService.pause();
        } else {
            if (state.currentVerseKey) {
                this.audioService.resume();
            } else {
                this.openAudioSettings();
            }
        }
    }

    exit(): void {
        // Clear the persistence flag so StartupGuard doesn't redirect back here
        localStorage.setItem('last_mushaf_state', 'home');
        this.router.navigate(['/Home']);
    }

    openAudioSettings(): void {
        this.audioService.state$.pipe(take(1)).subscribe(state => {
            this.audioSettingsModal = {
                show: true,
                tempRepeatAyah: state.repeatAyah,
                tempRepeatGroup: state.repeatGroup,
                tempRange: state.playbackRange,
                tempSpeed: state.playbackRate
            };
            this.cdr.detectChanges();
        });
    }

    getSurahMemorizationProgress(surah: SurahMetadata): number {
        if (!this.memorizedVerses || this.memorizedVerses.length === 0) return 0;

        const surahVerses = this.memorizedVerses.filter(v => v.startsWith(surah.id + ':'));
        if (surahVerses.length === 0) return 0;

        const percent = (surahVerses.length / surah.verses_count) * 100;
        return Math.min(100, Math.round(percent));
    }

    applyAudioSettings(): void {
        const s = this.audioSettingsModal;

        // SYNC LOCK: Prime audio element synchronously in the click handler
        // This confirms the user gesture for the Audio element before any async calls.
        this.audioService.prime();

        this.audioService.setPlaybackRate(s.tempSpeed);
        this.audioService.setRepeatSettings(s.tempRepeatAyah, s.tempRepeatGroup);
        this.audioService.setPlaybackRange(s.tempRange);

        this.audioSettingsModal.show = false;

        // Hide floating player when playback starts (user can toggle via header button)
        this.showAudioPlayer = false;
        localStorage.setItem('showAudioPlayer', 'false');

        // Trigger actual playback after metadata is set
        this.audioService.state$.pipe(take(1)).subscribe(state => {
            if (!state.isPlaying) {
                if (state.currentVerseKey) {
                    this.audioService.resume();
                } else if (this.selectedVerseKey) {
                    this.playVerseAudio(this.selectedVerseKey);
                } else {
                    // Play first verse of page
                    this.dataService.getMushaf().pipe(take(1)).subscribe(pages => {
                        const currentPage = pages.find(p => p.page_number === this.pageNumber);
                        const firstVerse = this.extractVerseKeys(currentPage ? [currentPage] : [])[0];
                        if (firstVerse) this.playVerseAudio(firstVerse);
                    });
                }
            }
        });
        this.cdr.detectChanges();
    }

    stopAudio(): void {
        this.audioService.stop();
        this.playingVerseKey = null;
        // User requested flexibility: DO NOT auto-hide the player on stop.
        // Let them toggle it manually if they want.
        // this.showAudioPlayer = false; 
        // localStorage.setItem('showAudioPlayer', 'false');
        this.cdr.detectChanges();
    }

    // --- Tafsir Methods ---
    openTafsir(verseKey?: string): void {
        let key = verseKey || this.selectedVerseKey || (this.audioService.snapshot.currentVerseKey);

        // If no key is found (initial state), fallback to the first verse of the current page
        if (!key && this.currentMushafPage) {
            const firstVerseLine = this.currentMushafPage.lines.find(l => l.type === 'verse');
            if (firstVerseLine && firstVerseLine.segments && firstVerseLine.segments.length > 0) {
                key = firstVerseLine.segments[0].verse_key;
            }
        }

        if (!key) return;

        this.selectedVerseKey = key;
        this.isTafsirOpen = true;
        this.loadTafsirContent(this.selectedTafsirId, key);
        this.cdr.detectChanges();
    }

    closeTafsir(): void {
        this.isTafsirOpen = false;
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
                this.tafsirFontFamily = `"${fontName}"`;
                this.cdr.detectChanges();
            });

            const url = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_page/${pageNum}`;

            if ('caches' in window) {
                try {
                    const cache = await caches.open('quran-tafsir-cache');
                    const cachedRes = await cache.match(url);
                    if (cachedRes) {
                        const data = await cachedRes.json();
                        this.processTafsirResponse(data, verseKey);
                        this.loadingTafsir = false;
                        this.cdr.detectChanges();
                        return;
                    }
                } catch (e) { }
            }

            this.http.get<any>(url).subscribe({
                next: (res) => {
                    this.processTafsirResponse(res, verseKey);
                    this.loadingTafsir = false;
                    this.cdr.detectChanges();
                    if ('caches' in window) {
                        try {
                            caches.open('quran-tafsir-cache').then((cache: any) => {
                                cache.put(url, new Response(JSON.stringify(res)));
                            });
                        } catch (e) { }
                    }
                },
                error: (err) => {
                    this.loadingTafsir = false;
                    this.cdr.detectChanges();
                }
            });
        });
    }

    changeTafsirPage(delta: number): void {
        const newPage = this.tafsirPageNumber + delta;
        if (newPage >= 1 && newPage <= 604) {
            // We don't set this.tafsirPageNumber here because loadTafsirContent sets it
            this.loadTafsirContent(this.selectedTafsirId, `page:${newPage}`);
        }
    }

    async downloadFullTafsir(tafsirId: number): Promise<void> {
        if (!('caches' in window)) {
            alert('متصفحك لا يدعم خاصية التحميل للأوفلاين');
            return;
        }

        const tafsirName = this.availableTafsirs.find(t => t.id === tafsirId)?.name || 'التفسير';

        // Initialize progress
        this.tafsirDownloadProgress[tafsirId] = { current: 0, total: 604, loading: true };
        this.cdr.detectChanges();

        try {
            const cache = await caches.open('quran-tafsir-cache');
            console.log(`[Tafsir] Starting FULL download for ${tafsirName} (ID: ${tafsirId})`);

            const chunkSize = 5; // Download 5 pages at a time to be gentle
            for (let i = 1; i <= 604; i += chunkSize) {
                const promises = [];
                for (let j = 0; j < chunkSize && (i + j) <= 604; j++) {
                    const p = i + j;
                    const url = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_page/${p}`;

                    promises.push(
                        fetch(url).then(async res => {
                            if (res.ok) {
                                await cache.put(url, res.clone());
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
            this.checkAllTafsirsCacheStatus();
        }
        this.cdr.detectChanges();
    }

    async checkAllTafsirsCacheStatus(): Promise<void> {
        if (!('caches' in window)) return;
        try {
            const cache = await caches.open('quran-tafsir-cache');
            for (const t of this.availableTafsirs) {
                // Check a few representative pages (e.g., 1, 302, 604) to estimate if full download exists
                // For a 100% guarantee we would check all 604, but let's check a sample for performance or just first/last
                const checkPages = [1, 302, 604];
                let allExist = true;
                for (const p of checkPages) {
                    const match = await cache.match(`https://api.quran.com/api/v4/tafsirs/${t.id}/by_page/${p}`);
                    if (!match) {
                        allExist = false;
                        break;
                    }
                }
                t.downloaded = allExist;
            }
            this.cdr.detectChanges();
        } catch (e) { }
    }

    selectTafsirFromList(id: number): void {
        this.selectedTafsirId = id;
        this.showTafsirSources = false;
        // Reload current page with new tafsir
        this.loadTafsirContent(id, `page:${this.tafsirPageNumber}`);
    }



    changeTafsir(id: any): void {
        this.selectedTafsirId = Number(id);
        if (this.selectedVerseKey) {
            this.loadTafsirContent(this.selectedTafsirId, this.selectedVerseKey);
        }
    }

    async downloadTafsirSurah(surahId: number): Promise<void> {
        if (!surahId) {
            alert('يرجى اختيار سورة أولاً');
            return;
        }

        if (!('caches' in window)) {
            alert('متصفحك لا يدعم خاصية التحميل للأوفلاين');
            return;
        }

        const tafsirId = this.selectedTafsirId;
        const tafsirName = this.availableTafsirs.find(t => t.id === tafsirId)?.name || 'التفسير';

        try {
            const cache = await caches.open('quran-tafsir-cache');

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
                        const pageRes = await fetch(pageUrl);
                        if (pageRes.ok) {
                            await cache.put(pageUrl, pageRes);
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
        if (this.downloadingSurahs.has(surah.id) || this.downloadedSurahs.has(surah.id)) return;

        console.log(`[MushafPage] Starting real download for Surah: ${surah.name}`);
        this.downloadingSurahs.add(surah.id);

        try {
            await this.audioService.downloadSurah(surah.id, this.currentReciterId);
            this.updateDownloadedStatus(); // Verify and update checkmarks
            console.log(`[MushafPage] Download complete for Surah: ${surah.name}`);
        } catch (error) {
            console.error('[MushafPage] Download failed:', error);
            alert('فشل تحميل السورة. يرجى التأكد من اتصال الإنترنت والمحاولة مرة أخرى.');
        } finally {
            this.downloadingSurahs.delete(surah.id);
            this.cdr.detectChanges();
        }
    }

    async playNextVerseAudio(currentKey: string): Promise<void> {
        const state = await firstValueFrom(this.audioService.state$);

        // Calculate next logical verse globally
        // Pass 'quran' to getNextVerseGlobal to get the raw next verse, we'll apply 'page' constraint manually
        const nextGlobal = await this.getNextVerseGlobal(currentKey, 'quran');

        if (!nextGlobal) {
            this.handleGroupEnd(state);
            return;
        }

        // Apply Range Constraints
        if (state.playbackRange === 'surah') {
            const [currentSurah] = currentKey.split(':');
            const [nextSurah] = nextGlobal.split(':');
            if (currentSurah !== nextSurah) {
                this.handleGroupEnd(state);
                return;
            }
        } else if (state.playbackRange === 'page') {
            // Check for page boundary
            const currentP = await this.getPageForVerseKey(currentKey);
            const nextP = await this.getPageForVerseKey(nextGlobal);

            if (currentP !== nextP) {
                this.handleGroupEnd(state);
                return;
            }
        } else if (state.playbackRange === 'juz') {
            // JUZ logic is already partially handled in getNextVerseGlobal but let's double check if we want
            // However, getNextVerseGlobal with 'quran' passed above returns standard next.
            // We should let getNextVerseGlobal handle Juz if we passed 'juz'.
            // Let's refine:
        }

        // Re-call getNextVerseGlobal with actual range for Juz/Quran limits if needed, 
        // or just accept nextGlobal if we trust our manual checks.
        // Better: Let's use the actual range for getNextVerseGlobal, but for 'page' we treat it as 'quran' to find the verse, then check page.

        // Let's stick to the previous plan: use getNextVerseGlobal with 'quran' allows finding the *next* verse.
        // Then we validte constraints.

        // Juz Check
        if (state.playbackRange === 'juz') {
            // We need to check if we crossed a Juz boundary (Juz start pages are in metadata)
            const currentP = await this.getPageForVerseKey(currentKey);
            const nextP = await this.getPageForVerseKey(nextGlobal);
            // Approximate: Check if Juz changed.
            const currentJuz = await firstValueFrom(this.dataService.getJuzAtPage(currentP));
            const nextJuz = await firstValueFrom(this.dataService.getJuzAtPage(nextP));

            if (currentJuz && nextJuz && currentJuz.id !== nextJuz.id) {
                this.handleGroupEnd(state);
                return;
            }
        }

        this.playVerseAudio(nextGlobal);

        // Auto-navigate to keep in sync (optional, but good for "follow along")
        // Check if we are already seeing the page
        const nextP = await this.getPageForVerseKey(nextGlobal);
        if (nextP !== this.pageNumber) {
            // Only auto-flip if we are close? Or always?
            // User complaint implies they want to browse freely.
            // If we auto-flip, we disrupt their browsing.
            // BUT, if we don't auto-flip, the "Auto Scroll" feature we just added won't work.
            // Let's AUTO-FLIP if the user hasn't explicitly disabled "Follow Reciter" (which we don't have a setting for yet)
            // Default behavior: Follow reciter.
            await this.navigateToVerse(nextGlobal);
        }
    }

    private async getPageForVerseKey(verseKey: string): Promise<number> {
        const [s, v] = verseKey.split(':').map(Number);
        return firstValueFrom(this.dataService.getPageNumberForVerse(s, v));
    }

    private getNextVerseOnPage(currentKey: string): string | null {
        if (!this.currentMushafPage) return null;
        const allSegments = this.currentMushafPage.lines
            .filter(l => l.type === 'verse' && l.segments)
            .flatMap(l => l.segments as MushafSegment[]);

        const currentIdx = allSegments.findIndex(s => s.verse_key === currentKey);
        if (currentIdx === -1) return null;

        for (let i = currentIdx + 1; i < allSegments.length; i++) {
            if (allSegments[i].verse_key !== currentKey) {
                return allSegments[i].verse_key;
            }
        }
        return null;
    }

    private async getNextVerseGlobal(currentKey: string, range: string): Promise<string | null> {
        const [surahId, verseNum] = currentKey.split(':').map(Number);
        const meta = await firstValueFrom(this.dataService.getMetadata());
        const surah = meta.surahs.find(s => s.id === surahId);
        if (!surah) return null;

        // 1. Advance within Surah
        if (verseNum < surah.verses_count) {
            return `${surahId}:${verseNum + 1}`;
        }

        // 2. Surah Ended, check range permissions
        if (range === 'surah') {
            return null; // Stop at end of surah
        }

        if (range === 'quran' || range === 'juz') {
            if (surahId < 114) {
                const nextSurahId = surahId + 1;
                const nextKey = `${nextSurahId}:1`;

                if (range === 'juz') {
                    // Check if next surah starts in the same juz
                    const currentJuz = await firstValueFrom(this.dataService.getJuzAtPage(this.pageNumber));
                    if (!currentJuz) return null;

                    const nextSurah = meta.surahs.find(s => s.id === nextSurahId);
                    const nextSurahPage = nextSurah?.start_page || 0;

                    // Locate the start page of the next juz
                    const nextJuz = meta.juzs.find(j => j.id === currentJuz.id + 1);
                    const nextJuzStartPage = nextJuz ? nextJuz.start_page : 605; // 605 is the end of Quran

                    if (nextSurahPage >= nextJuzStartPage) {
                        console.log(`[MushafPage] Exited Juz ${currentJuz.id}. Stopping.`);
                        return null; // Next surah is outside current Juz
                    }
                }

                return nextKey;
            }
        }

        return null; // End of Quran or restricted range
    }

    private async handleGroupEnd(state: PlaybackState): Promise<void> {
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
        if (!line || !page) return 'transparent';
        const pageNum = page.page_number;
        const split = this.pageSplits.get(pageNum);
        if (!split) return 'transparent';

        // 1. For Verse types: handle split and full logic
        if (line.type === 'verse' && line.segments) {
            let firstSecondIdx = -1;
            line.segments.forEach((seg: MushafSegment, idx: number) => {
                if (firstSecondIdx === -1 && this.isVerseInSecondHalf(seg.verse_key, pageNum)) {
                    firstSecondIdx = idx;
                }
            });

            if (firstSecondIdx === -1) return 'transparent';
            if (firstSecondIdx === 0) return 'var(--half-page-bg)';

            // Split line: use character-weighted gradient for precision
            const totalC = line.segments.reduce((acc: number, s: MushafSegment) => acc + (s.text?.length || 0), 0);
            let secondHalfC = 0;
            line.segments.forEach((seg: MushafSegment, idx: number) => {
                if (idx >= firstSecondIdx) secondHalfC += (seg.text?.length || 0);
            });
            const percent = totalC > 0 ? (secondHalfC / totalC) * 100 : 0;

            // In RTL, segments with higher indices are on the LEFT.
            // So we color the LEFT part of the line.
            return `linear-gradient(to right, var(--half-page-bg) ${percent}%, transparent ${percent}%)`;
        }

        // 2. For Metadata types (Bismillah, Headers): calculate position relative to split line
        const lineIdx = page.lines.indexOf(line);
        if (lineIdx === -1) return 'transparent';

        let isAfterSplit = false;
        for (let i = 0; i < lineIdx; i++) {
            const prev = page.lines[i];
            if (prev.type === 'verse' && prev.segments) {
                if (prev.segments.some(s => this.isVerseInSecondHalf(s.verse_key, pageNum))) {
                    isAfterSplit = true;
                    break;
                }
            }
        }

        return isAfterSplit ? 'var(--half-page-bg)' : 'transparent';
    }

    getReadingProgressPercent(): number {
        if (!this.isReadingActive) return 0;
        const elapsed = Date.now() - this.pageStartTime;
        return Math.min(100, (elapsed / this.getMinStayTime()) * 100);
    }

    getHifzLabel(): string {
        const task = this.dailyTasks?.new_memorization;
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
        this.currentPageData$.subscribe(p => {
            this.currentMushafPage = p || null;
            if (p) {
                const surahIds = new Set<number>();
                p.lines.forEach(line => {
                    if (line.type === 'verse' && line.segments) {
                        line.segments.forEach(seg => {
                            const sId = parseInt(seg.verse_key.split(':')[0]);
                            surahIds.add(sId);
                        });
                    }
                });
                if (surahIds.size > 0) {
                    this.dataService.getMetadata().pipe(take(1)).subscribe(meta => {
                        this.availableSurahs = meta.surahs.filter(s => surahIds.has(s.id)).map(s => ({
                            id: s.id,
                            nameAr: s.name,
                            nameEn: s.name
                        }));
                        // Auto-select first if in specific mode
                        if (this.availableSurahs.length > 0 && !this.memorizationSettings.targetSurah) {
                            this.memorizationSettings.targetSurah = this.availableSurahs[0].id;
                        }
                    });
                }
            }
        });

        this.prevPageData$ = this.pageNumber > 1 ? this.dataService.getPage(this.pageNumber - 1) : undefined;
        this.nextPageData$ = this.pageNumber < 604 ? this.dataService.getPage(this.pageNumber + 1) : undefined;

        this.currentSurah$ = this.dataService.getSurahAtPage(this.pageNumber);
        this.currentJuz$ = this.dataService.getJuzAtPage(this.pageNumber);
        this.mushafMetadata$ = this.dataService.getMetadata();

        // Persist page number
        localStorage.setItem('lastMushafPage', this.pageNumber.toString());
    }

    private getPageFromFont(fontName: string): number {
        return parseInt(fontName.replace('QCF_P', ''), 10);
    }

    private loadPage(): void {
        if (!this.keepOptionsSheet) {
            this.showOptionsSheet = false;
        }
        this.pageStartTime = Date.now();
        this.isCurrentPageAwarded = false;
        this.loadPages();
        this.loadTotalUsers();
    }

    toggleSidebar(): void {
        this.isSidebarOpen = !this.isSidebarOpen;
        if (this.isSidebarOpen) {
            this.isSettingsOpen = false;
            this.updateDownloadedStatus();
        } else {
            this.isDownloadMode = false; // Reset download mode when closing
        }
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
            this.isSidebarOpen = false; // Close index when opening settings
        }
    }

    setTheme(theme: string): void {
        this.currentTheme = theme;
        localStorage.setItem('mushaf_theme', theme);
        this.isSettingsOpen = false; // Close settings after choosing theme
    }

    goToPage(page: number): void {
        this.pageNumber = page;
        this.isSidebarOpen = false;
        this.isSettingsOpen = false;
        this.loadPage();
    }

    openSidebarToTab(tab: 'surahs' | 'juzs' | 'pages'): void {
        this.sidebarTab = tab;
        this.isSidebarOpen = true;
        this.isSettingsOpen = false; // Ensure settings are closed when opening index
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
        if (this.isAnimating) return; // FIX: Prevent overlapping animations and jump-backs
        this.isAnimating = true;
        this.swipeDirection = direction;
        this.isWaitingForPageTurn = false; // Reset waiting state
        // Shift is reset inside the timeout below at the swap moment

        if (direction === 'next') {
            this.slideOffset = window.innerWidth;
        } else {
            this.slideOffset = -window.innerWidth;
        }

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

            this.loadPages();

            // Reset timer and awarding status for the new page
            this.pageStartTime = Date.now();
            this.isCurrentPageAwarded = false;

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
            }, 30);
        }, 250);
    }

    onTouchStart(event: TouchEvent): void {
        if (this.isAnimating) return;
        this.touchStartX = event.touches[0].clientX;
        this.touchStartY = event.touches[0].clientY;
        this.touchStartTime = Date.now();
        this.slideOffset = 0;
        this.isVerticalScroll = false;
        this.hasMoved = false;
    }



    onTouchMove(event: TouchEvent): void {
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
            event.preventDefault();
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

        // Improved threshold for swipe detection (reduced from 8% to 5%)
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
                this.triggerPageChange('next');
            } else if (deltaX < 0 && this.pageNumber > 1) {
                // For going back, we usually don't award points, but we reset the awarded flag of the previous page?
                // loadPage handles resetting isCurrentPageAwarded.
                this.triggerPageChange('prev');
            } else {
                this.resetSwipe();
            }
        } else {
            // Small movement - treat as tap if in memorization mode
            if (deltaTime < 300) {
                this.handleMushafTap(event);
            }
            this.resetSwipe();
        }
    }

    private handleMushafTap(event: TouchEvent): void {
        const now = Date.now();
        if (now - this.lastIncrementTime < 150) return; // Ignore rapid taps (150ms buffer)
        this.lastIncrementTime = now;

        const isMuraaja = this.memorizationSettings.type === 'muraaja';
        const isHifz = this.memorizationSettings.type === 'hifz';
        const isTouch = this.memorizationSettings.inputMethod === 'touch';

        if (this.isMemorizationMode && (isMuraaja || isHifz) && isTouch && !this.isTestPhase) {
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

    handleMushafClick(event: MouseEvent | TouchEvent): void {
        const now = Date.now();
        if (now - this.lastIncrementTime < 150) return; // Ignore rapid double-triggers (150ms buffer)
        this.lastIncrementTime = now;

        const isMuraaja = this.memorizationSettings.type === 'muraaja';
        const isHifz = this.memorizationSettings.type === 'hifz';
        const isTouch = this.memorizationSettings.inputMethod === 'touch';

        if (this.isMemorizationMode && (isMuraaja || isHifz) && isTouch && !this.isTestPhase) {
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
                this.incrementRepetition();
            }
            this.cdr.detectChanges();
        }
    }

    onAyahClick(verseKey: string): void {
        console.log('[Mushaf] Ayah clicked:', verseKey, 'isMemorizationMode:', this.isMemorizationMode);
        if (this.isMemorizationMode) return;
        this.selectedVerseKey = verseKey;

        // User requested: Disable setting range from clicked verse.
        // Keep the "Operation Range" intact.
        /*
        // Initialize verse range defaults based on the clicked ayah and current surah
        const [surahId, verseNum] = verseKey.split(':').map(Number);
        this.memorizationSettings.surahStartVerse = verseNum;
        this.memorizationSettings.targetSurah = surahId;

        // Fetch surah metadata to get the total verses count for the end range
        this.dataService.getMetadata().subscribe(meta => {
            const surah = meta.surahs.find(s => s.id === surahId);
            if (surah) {
                // If the clicked verse is the last one or near it, maybe set end to last.
                // Otherwise, let's default to the end of the surah or a reasonable chunk.
                this.memorizationSettings.surahEndVerse = surah.verses_count;
            }
            this.showOptionsSheet = true;
            this.cdr.detectChanges();
        });
        */

        this.showOptionsSheet = true;
        this.cdr.detectChanges();
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
        this.isTestPhase = false;
        this.isGroupPhase = false;

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
        this.audioService.updatePlaybackState({
            playbackRange: this.memorizationSettings.range === 'surah' ? 'surah' : 'page'
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
            let activeTask = (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') ? this.dailyTasks?.revision :
                (this.currentTaskType === 'recitation' || this.currentTaskType === 'tilawo') ? this.dailyTasks?.recitation :
                    (this.currentTaskType === 'consolidation' || this.currentTaskType === 'muraja') ? this.dailyTasks?.consolidation :
                        this.dailyTasks?.new_memorization;

            const isReview = (this.memorizationSettings.type === 'muraaja' || this.currentTaskType === 'muraja' || this.currentTaskType === 'consolidation' || this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja');
            const amount = (activeTask?.isRabt || (!activeTask && isReview)) ? Math.max(activeTask?.amount || 1, 3) : (activeTask?.amount || 1);
            const pagesToLoad: Observable<MushafPage | undefined>[] = [];

            for (let i = 0; i < amount; i++) {
                const p = pageNumber + i;
                if (p <= 604) pagesToLoad.push(this.dataService.getPage(p).pipe(take(1)));
            }

            const pagesData = await firstValueFrom(forkJoin(pagesToLoad)) as (MushafPage | undefined)[];
            if (pagesData && pagesData.length > 0) {
                let allAyahs = this.extractVerseKeys(pagesData.filter((p): p is MushafPage => !!p));

                const shouldResume = activeTask && (activeTask.type === 'new_memorization' || activeTask.type === 'hifz');
                if (shouldResume && (activeTask.unit === 'verse' || activeTask.target === 'verse' || activeTask.unit === 'verses')) {
                    const doneCount = activeTask.amountDone || 0;
                    if (doneCount > 0) {
                        const taskVerses = activeTask.verses || [];
                        if (taskVerses.length > 0) {
                            const doneVerses = new Set(taskVerses.slice(0, doneCount));
                            allAyahs = allAyahs.filter(v => !doneVerses.has(v));
                        } else {
                            const startVerse = Number(activeTask.verse || activeTask.verseNumber || activeTask.position?.verse || 1);
                            const nextVerseToMemorize = startVerse + doneCount;
                            const taskSurah = Number(activeTask.surah || activeTask.surahId || activeTask.position?.surah || 1);
                            allAyahs = allAyahs.filter(v => {
                                const [s, n] = v.split(':').map(Number);
                                return s > taskSurah || (s === taskSurah && n >= nextVerseToMemorize);
                            });
                        }
                    }
                }

                const start = this.memorizationSettings.surahStartVerse || 1;
                const end = this.memorizationSettings.surahEndVerse || 999;
                const targetS = this.memorizationSettings.targetSurah || 0;
                const isStrictReview = isReview && activeTask && !activeTask.isRabt;

                if (activeTask?.isRabt || (!activeTask && isReview)) {
                    const startKey = (activeTask?.verses && activeTask.verses.length > 0) ? activeTask.verses[0] : `${targetS}:${start}`;
                    const startIndex = allAyahs.indexOf(startKey);
                    if (startIndex !== -1) {
                        allAyahs = allAyahs.slice(startIndex);
                    }
                } else if (isStrictReview && activeTask.verses && activeTask.verses.length > 0) {
                    const startKey = activeTask.verses[0];
                    const endKey = activeTask.verses[activeTask.verses.length - 1];
                    const startIndex = allAyahs.indexOf(startKey);
                    const endIndex = allAyahs.indexOf(endKey);

                    if (startIndex !== -1 && endIndex !== -1) {
                        allAyahs = allAyahs.slice(startIndex, endIndex + 1);
                    } else if (startIndex !== -1) {
                        allAyahs = allAyahs.slice(startIndex);
                    }
                } else {
                    const sKey = this.memorizationSettings.customStartVerse || `${targetS}:${start}`;
                    const eKey = this.memorizationSettings.customEndVerse || `${targetS}:${end}`;
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
                this.sessionAyahs = allAyahs;
                console.log(`[Hifz Session] multi-page mode: sessionAyahs=${this.sessionAyahs.length}`);
            } else {
                console.warn('[Hifz Session] page mode: NO PAGE DATA!');
            }
        } else if (range === 'half_page') {
            const page: any = await firstValueFrom(this.currentPageData$?.pipe(take(1)) || of(undefined));
            if (page) {
                const targetSurah = this.memorizationSettings.targetSurah;
                let allAyahs = this.extractVerseKeys([page], targetSurah > 0 ? targetSurah : undefined);
                const start = this.memorizationSettings.surahStartVerse || 1;
                const end = this.memorizationSettings.surahEndVerse || 999;

                allAyahs = allAyahs.filter(vKey => {
                    const vNum = parseInt(vKey.split(':')[1]);
                    return vNum >= start && vNum <= end;
                });

                let activeTask = this.dailyTasks?.new_memorization;
                const shouldResume = activeTask && (activeTask.type === 'new_memorization' || activeTask.type === 'hifz');

                if (shouldResume && (activeTask.unit === 'verse' || activeTask.target === 'verse' || activeTask.unit === 'verses')) {
                    const doneCount = activeTask.amountDone || 0;
                    if (doneCount > 0) {
                        const taskVerses = activeTask.verses || [];
                        if (taskVerses.length > 0) {
                            const doneVerses = new Set(taskVerses.slice(0, doneCount));
                            allAyahs = allAyahs.filter(v => !doneVerses.has(v));
                        } else {
                            const startVerse = Number(activeTask.verse || activeTask.verseNumber || activeTask.position?.verse || 1);
                            const nextVerseToMemorize = startVerse + doneCount;
                            const taskSurah = Number(activeTask.surah || activeTask.surahId || activeTask.position?.surah || 1);
                            allAyahs = allAyahs.filter(v => {
                                const [s, n] = v.split(':').map(Number);
                                return s > taskSurah || (s === taskSurah && n >= nextVerseToMemorize);
                            });
                        }
                    }
                }
                this.sessionAyahs = allAyahs;
            }
        } else if (range === 'surah') {
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
        } else if (range === 'custom') {
            const activeTask = this.dailyTasks?.consolidation;
            let allAyahs = [...((activeTask as any)?.verses || [])];

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
                            for (let i = 0; i < count; i++) {
                                currentWardAyahs.push(currentKey);
                                currentKey = this.calculateNextVerseKey(currentKey);
                            }
                        } else {
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

    private getJustKeys(page: MushafPage): string[] {
        const keys = new Set<string>();
        page.lines.forEach(l => l.segments?.forEach(s => keys.add(s.verse_key)));
        return Array.from(keys);
    }

    incrementRepetition(): void {
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
            this.nextAyah();
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
                setTimeout(() => this.calculateAutoShift(), 50);
            } else {
                this.nextAyah();
            }
        } else {
            // Normal repetition mode
            let targetRepeat = this.memorizationSettings.ayahRepeat;

            if (this.currentRepetition < targetRepeat) {
                this.currentRepetition++;
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

                this.nextAyah();
            }
        }
    }

    private nextAyah(): void {
        if (this.isAnimating) return; // FIX: Block verse progression until page turn finishes

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
                // Award points for completing all ayahs on this page before moving
                // We call it unconditionally; awardPagePoints has its own filters for task types.
                this.awardPagePoints();

                // DELAYED NAVIGATE: Set flag and wait for user click to turn page
                this.isWaitingForPageTurn = true;
                return;
            }

            setTimeout(() => this.calculateAutoShift(), 100);
        } else {
            // End of session reached
            console.log(`[Mushaf] End of session reached. Count=${this.sessionAyahs.length}, Index=${this.currentAyahIndex}`);

            // Award points ONLY if we actually finished a valid session
            if (this.memorizationSettings.type === 'muraaja' || this.memorizationSettings.type === 'recitation') {
                const isRabt = this.currentTaskType === 'consolidation';
                // PERMISSIVE: Any session that reached the end naturally should award points
                if (isRabt || this.sessionAyahs.length >= 1) {
                    this.awardPagePoints();
                } else {
                    console.warn(`[Mushaf] Session ended unexpectedly (empty). Skipping award.`);
                }
            }

            // STRICT BOUNDARY: For Consolidation (Al-Rabt) AND Revision tasks, don't allow going beyond session
            // This ensures users don't accidentally drift into the next ward if they are tracking progress.
            // Only apply if it's an ACTUAL TASK (has type in currentTaskType).
            const isBoundTask = this.currentTaskType && ((this.currentTaskType as any) === 'consolidation' || (this.currentTaskType as any) === 'muraja' ||
                (this.currentTaskType as any) === 'revision' || (this.currentTaskType as any) === 'deepMuraja');

            if (isBoundTask) {
                console.log('🛑 [Mushaf] Boundary Reached. Navigation blocked.');

                // Ensure the final sync is sent for the last verse or page
                const syncType = (this.currentTaskType === 'revision' || this.currentTaskType === 'deepMuraja') ? 'deepMuraja' : 'muraja';
                this.checkAutoSync(syncType as any);

                // AUTO-EXIT: Terminate session immediately upon completion
                this.exitMemorization();
                return;
            }

            if (this.memorizationSettings.groupRepeat > 0) {
                this.startGroupPhase();
            } else if (this.memorizationSettings.difficulty === 'hard') {
                this.startTestPhase();
            } else {
                // If this is a synced ward (like Hifz or Rabt), checkAutoSync will handle the termination 
                // after the toast logic. If not, we exit immediately.
                const isSyncedWard = (this.memorizationSettings.type === 'hifz' || (this.currentTaskType as any) === 'consolidation' || this.currentTaskType === 'revision');
                if (!isSyncedWard) {
                    this.exitMemorization();
                }
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
            const versesToSync = (type === 'hifz') ? this.sessionAyahs.slice(0, this.currentAyahIndex + 1) : [];

            // For Hifz, we want to advance the plan to the NEXT verse after the currently memorized one
            let syncPositionVerseKey = currentAyahKey;
            if (type === 'hifz') {
                if (this.sessionAyahs[this.currentAyahIndex + 1]) {
                    syncPositionVerseKey = this.sessionAyahs[this.currentAyahIndex + 1];
                } else {
                    syncPositionVerseKey = this.calculateNextVerseKey(currentAyahKey);
                }
            }

            this.mutabaaService.updateTaskStatus(finalSyncType as any, newStatus, totalToSync, taskObj.unit, { page: this.pageNumber, verseKey: syncPositionVerseKey }, versesToSync).subscribe({
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
        this.currentRepetition = 1;
    }

    incrementGroupRepetition(): void {
        if (this.currentRepetition < this.memorizationSettings.groupRepeat) {
            this.currentRepetition++;
        } else {
            // Group Phase Complete!
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

        for (const pageNum of Array.from(pagesToLoad)) {
            await this.fontService.loadPageFont(pageNum);
        }

        this.loadQuestion(0);
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

        // FIX: If task uses 'resolvedPage' (which we populated in loadDailyTasks), trust it!
        // This solves the issue for Revision/Recitation where explicit units might be confusing.
        if ((task as any).resolvedPage) {
            const pageOfVerse = this.versePageMap.get(verseKey);
            if (pageOfVerse === (task as any).resolvedPage) {
                return true;
            }
        }

        // If it's a page-based revision/recitation, we check if page matches
        if (unit === 'page' || unit === 'juz') {
            const pageOfVerse = this.versePageMap.get(verseKey);
            if ((task.type === 'recitation' || task.type === 'revision') && pageOfVerse !== undefined) {
                const startPage = task.startPage || 1;
                const endPage = startPage + (unit === 'juz' ? 20 : amount) - 1;
                return pageOfVerse >= startPage && pageOfVerse <= endPage;
            }
        }

        if (vSurah < startSurah) return false;

        // Exact same surah
        if (vSurah === startSurah) {
            const endVerse = (amount > 0) ? (startVerse + amount - 1) : startVerse;
            // For page-based tasks that might span end of surah, logic can be complex. 
            // The resolvedPage check above handles this better.
            if (vNum >= startVerse && vNum <= endVerse) return true;
        }

        // If amount is large enough to span multiple surahs (mostly for NEW_MEMORIZATION)
        if (vSurah > startSurah && (task.type === 'new_memorization' || task.type === 'hifz')) {
            const versesInStartSurah = this.assetService.getSurahVerses(startSurah);
            const remainingInStart = versesInStartSurah - startVerse + 1;
            if (amount > remainingInStart) {
                const leftover = amount - remainingInStart;
                if (vSurah === startSurah + 1 && vNum <= leftover) return true;
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
        // EXCEPTION: During active session, Page 1 Verse 1 IS the task, so we must show it to allow hiding/revealing.
        if (line.type === 'bismillah') {
            if (pageNum === 1) return !this.isMemorizationMode;
            return false;
        }


        // Hide empty lines or lines with only whitespace for first 2 pages
        if (pageNum <= 2) {
            if (line.type === 'verse' && (!line.segments || line.segments.length === 0)) return true;
            if (line.type !== 'verse' && (!line.text || line.text.trim().length === 0)) return true;
        }
        return false;
    }

    exitMemorization(): void {
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
        this.isReadingActive = false; // Stop tracking when exit
        this.isTestPhase = false;
        this.isGroupPhase = false;
        this.isWaitingForPageTurn = false;
        this.pageVerticalShift = 0;
        this.stopVoiceSession();

        // FIX: Force refresh daily tasks to update progress display after exiting
        // This ensures the progress percentage reflects the saved state
        setTimeout(() => {
            this.loadDailyTasks();
        }, 500);

        this.isExiting = false;
    }

    getSegmentClass(segment: MushafSegment, verseKey: string, page: MushafPage): string {
        let classes = '';

        // Audio Playback Highlighting
        if (this.playingVerseKey === verseKey) {
            classes += 'audio-active ';
        }

        // Check for ayah marker (last segment of the verse)
        if (this.isLastSegmentOfVerse(segment, verseKey, page)) {
            classes += 'ayah-marker ';
        }

        if (this.isVerseInSecondHalf(verseKey, page.page_number)) {
            classes += 'second-half-segment ';
        }

        // Match currently playing audio verse
        const playingKey = this.audioService.snapshot.currentVerseKey;
        if (verseKey === playingKey) {
            classes += 'playing-verse ';
        }

        if (!this.isMemorizationMode) return classes.trim();

        // Recitation mode: NEVER hide anything
        if (this.memorizationSettings.type === 'recitation') return classes.trim();

        // Range Focus: Hide everything NOT in the targeted range (sessionAyahs)
        if (this.sessionAyahs.indexOf(verseKey) === -1) {
            return classes + 'hidden-verse';
        }

        if (this.isTestPhase || this.isGroupPhase) return classes.trim();

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

                    // REVISION REVEAL: If we've clicked once (currentRepetition > 1), show the verse
                    if (this.currentRepetition > 1) {
                        return classes + 'active-verse';
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
        this.slideOffset = 0;
        this.hasMoved = false;
        this.isVerticalScroll = false;
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

        this.voiceSubscription = this.voiceService.voiceEvents$.subscribe(event => {
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
            for (let i = nextIndex; i < matchIndex; i++) {
                this.errorWords.add(`${vKey}:${i}`);
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
        const pageLink = `https://knoozbook.com/mushaf`;
        const appLink = `https://play.google.com/store/apps/details?id=com.kenouz.bookstore2`;
        const text = `شاركوني تلاوة وحفظ ومراجعة القرآن الكريم عبر تطبيق وموقع كنوز. \nالرابط: ${pageLink} \nتحميل التطبيق: ${appLink}`;

        if (this.isAndroid && (window as any).Android && (window as any).Android.share) {
            (window as any).Android.share(text);
        } else if (navigator.share) {
            navigator.share({
                title: 'مكتبة كنوز - المصحف الشريف',
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
        if (res && res.tafsirs) {
            // Update font again for the specific response page just in case
            const fontName = this.dataService.getFontName(this.tafsirPageNumber);
            this.tafsirFontFamily = `"${fontName}"`;

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
                this.pageTafsirs.forEach(t => {
                    if (t.show_header) {
                        const s = meta.surahs.find(surah => surah.id === t.surah_id);
                        if (s) t.surah_name = s.name;
                    }
                });
                this.cdr.detectChanges();
            });
            this.currentTafsir = this.pageTafsirs.find(t => t.verse_key === verseKey) || this.pageTafsirs[0];
            setTimeout(() => {
                const el = document.getElementById(`tafsir-v-${verseKey}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);
        }
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

}

