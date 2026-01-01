import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { MutabaaTrackerComponent } from './mutabaa-tracker/mutabaa-tracker.component';
import { MushafDataService } from '../../../core/services/mushaf-data.service';
import { MushafFontService } from '../../../core/services/mushaf-font.service';
import { MushafAssetService } from '../../../core/services/mushaf-asset.service'; // Added Import
import { VoiceRecognitionService } from '../../../core/services/voice-recognition.service';
import { QuranMatchingService } from '../../../core/services/quran-matching.service';
import { MushafPage, SurahMetadata, JuzMetadata, MushafMetadata, MushafSegment } from '../../../core/models/mushaf.model';
import { Observable, firstValueFrom, of, Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { QuranProgressService } from '../../../services/quran-progress.service';
import { MutabaaService } from '../../../services/mutabaa.service';
import { HifzPlanService } from '../../../services/hifz-plan.service';
import { PushNotificationService } from '../../../services/push-notification.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export type VoiceState = 'inactive' | 'listening' | 'processing' | 'error' | 'idle';

export interface ReminderSettings {
    recitation: { enabled: boolean; time: string };
    memorization: { enabled: boolean; time: string };
    revision: { enabled: boolean; time: string };
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
    sidebarTab: 'surahs' | 'juzs' | 'pages' = 'surahs';
    currentTheme: string = 'cream'; // NEW: Default Mushaf theme
    themes = ['cream', 'white', 'green', 'sky', 'blue', 'dark']; // Added 'sky' for Madina Blue style
    isLoggedIn: boolean = false; // User login status
    isMobileApp: boolean = false; // Check if running as native/pwa app
    isAndroid: boolean = false; // Check if running specifically on Android
    activeWirdTab: 'recitation' | 'memorization' | 'revision' | 'mutabaa' = 'mutabaa'; // Dashboard active tab
    totalUsers: number = 0; // NEW: Total readers count


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
        customEndVerse: '',
        surahStartVerse: 1,
        surahEndVerse: 7
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
    sheetOffset: number = 0;
    sidebarOffset: number = 0; // NEW: Horizontal offset for sidebar swipe
    settingsOffset: number = 0; // NEW: Horizontal offset for settings swipe
    private sidebarTouchStartX: number = 0; // NEW: Start X position for sidebar swipe
    private settingsTouchStartX: number = 0; // NEW: Start X position for settings swipe
    pageVerticalShift: number = 0; // NEW: Vertical shift to keep active verse visible
    isAnimating: boolean = false;
    swipeDirection: 'none' | 'next' | 'prev' = 'none';
    private versePageMap: Map<string, number> = new Map(); // Tracks which page each verse belongs to
    isWaitingForPageTurn: boolean = false; // NEW: Prevent premature page turn during hifz

    private voiceSubscription?: Subscription;

    // Error Tracking (for red highlights during session)
    // Keys are "verseKey:wordIndex" for individual words, or just "verseKey" for skipped ayahs
    errorWords: Set<string> = new Set();
    skippedAyahs: Set<string> = new Set();
    failedAttempts: number = 0; // Consecutive failed recognition attempts
    private ignoreVoiceUntil: number = 0; // Timestamp: ignore voice results until this time

    // Anti-Cheat & Dynamic Progress State
    private pageStartTime: number = Date.now();
    private isCurrentPageAwarded: boolean = false;
    private quranPointsPerEGP: number = 500; // Default fallback // Tracks if points were already awarded for the current page
    private sessionCounters = {
        pagesRead: 0,
        versesMemorized: 0,
        pagesReviewed: 0
    };
    private readonly MIN_PAGE_STAY_MS = 30000; // 30 seconds (as requested, except first 2 pages)
    private userPlan: any = null;
    private integrityRefreshInterval: any;
    isReadingActive: boolean = false; // Manual session toggle
    showHifzWizard: boolean = false; // Setup wizard visibility
    hifzPlanSetupComplete: boolean = false; // Whether user has completed hifz plan setup
    dailyTasks: any = null; // Daily tasks from hifz plan API
    hifzPlanStats: any = null; // Stats from hifz plan
    reminderSettings: ReminderSettings = {
        recitation: { enabled: false, time: '08:00' },
        memorization: { enabled: false, time: '09:00' },
        revision: { enabled: false, time: '10:00' }
    };
    pushEnabled: boolean = false; // Track browser permission
    pushSubscribed: boolean = false; // Track actual push registration
    isMobile: boolean = false;

    // Track auto-synced tasks to prevent repeat calls
    private completedTasks: Set<string> = new Set();
    private currentTaskType: 'new_memorization' | 'consolidation' | 'revision' | 'recitation' | null = null;





    private lastSyncedPage: number = -1;
    private lastSyncedVerseKey: string = '';

    // Wallet Modal State
    walletModal: {
        show: boolean;
        type: 'convert' | 'payout' | 'success' | 'error';
        title: string;
        message: string;
        pointsToConvert: number;
        maxPoints: number;
        equivalentEGP: number;
        loading: boolean;
        isDonation?: boolean;
    } = {
            show: false,
            type: 'convert',
            title: '',
            message: '',
            pointsToConvert: 0,
            maxPoints: 0,
            equivalentEGP: 0,
            loading: false,
            isDonation: false
        };

    donationStats: {
        totalAmount: number;
        donorsCount: number;
        showGratitude: boolean;
    } = {
            totalAmount: 0,
            donorsCount: 0,
            showGratitude: false
        };

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
        private router: Router,
        private http: HttpClient
    ) { }

    async ngOnInit(): Promise<void> {

        // Ensure assets are downloaded before proceeding
        try {
            await this.assetService.ensureAssets();
        } catch (error) {
            console.error('Failed to download assets:', error);
            // Optionally show error to user or fallback
        }

        // Check if user is logged in
        const user = localStorage.getItem('user');
        this.isLoggedIn = !!user;

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
        if (this.isLoggedIn) {
            this.quranProgressService.getProgress().subscribe();

            // Subscribe to progress changes to trigger view updates in the sidebar tabs
            this.quranProgressService.progress$.subscribe(() => {
                this.cdr.detectChanges();
            });

            this.quranProgressService.economy$.subscribe(settings => {
                if (settings && settings.quranPointsPerEGP) {
                    this.quranPointsPerEGP = settings.quranPointsPerEGP;
                }
            });

            // Timer for reading integrity bar updates AND immediate point awarding
            this.integrityRefreshInterval = setInterval(() => {
                if (this.isLoggedIn && !this.isTestPhase) {
                    if (this.isReadingActive || this.isMemorizationMode) {
                        this.checkImmediatePointAwarding();
                    }
                    this.cdr.detectChanges();
                }
            }, 1000); // Check every second for better precision

            // Check if hifz plan setup is needed
            this.hifzPlanService.getPlan().subscribe({
                next: (res) => {
                    if (res.success) {
                        this.hifzPlanSetupComplete = res.isSetupComplete;
                        this.hifzPlanStats = res.plan?.stats || null;
                        if (res.plan?.reminders) {
                            this.reminderSettings = res.plan.reminders;
                        }
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

        // Stats are now public
        this.loadTotalUsers();
        this.loadDonationStats();
    }

    loadDonationStats(): void {
        this.quranProgressService.getDonationStats().subscribe({
            next: (res) => {
                if (res.success) {
                    this.donationStats.totalAmount = res.totalAmount;
                    this.donationStats.donorsCount = res.donorsCount;
                }
            }
        });
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

        // CRITICAL: Reset all session state to prevent stale data from triggering instant completion
        this.sessionCounters = {
            pagesRead: 0,
            versesMemorized: 0,
            pagesReviewed: 0
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
                        this.reminderSettings = res.plan.reminders;
                    }
                }
            }
        });
    }

    closeWizard(): void {
        this.showHifzWizard = false;
    }

    loadDailyTasks(): void {
        this.hifzPlanService.getDailyTasks().subscribe({
            next: (res) => {
                if (res.success) {
                    this.dailyTasks = {
                        new_memorization: res.tasks?.find((t: any) => t.type === 'new_memorization'),
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
        return this.dailyTasks?.new_memorization?.label || 'الحفظ الجديد';
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

    getConsolidationDetails(): string {
        // If done, show next proposed action
        if (this.dailyTasks?.consolidation?.status === 'done' || this.getConsolidationProgressPercent() >= 100) {
            return 'القادم: مراجعة مجموعة جديدة';
        }

        const verses = this.dailyTasks?.consolidation?.verses;
        if (!verses || verses.length === 0) return 'لا توجد مراجعة اليوم';
        return `مراجعة ${verses.length} آية (آخر 14 يوم)`;
    }

    getRevisionLabel(): string {
        const label = this.dailyTasks?.revision?.label;
        return label ? `${label} (محفوظ سابقاً)` : 'محفوظ سابقاً';
    }

    getRevisionDetails(): string {
        // If done, show next proposed action
        if (this.getRevisionProgressPercent() >= 100) {
            const amount = this.dailyTasks?.revision?.amount || 1;
            const unit = this.dailyTasks?.revision?.unit === 'juz' ? 'أجزاء' : 'صفحات';
            return `القادم: ${amount} ${unit} إضافية للمراجعة`;
        }

        if (this.dailyTasks?.revision?.label) {
            return `مطلوب مراجعة: ${this.dailyTasks.revision.label}`;
        }
        return 'التالي في خطتك (تلقائي)';
    }

    getNewMemorizationDetails(): string {
        // If done, show next proposed action
        if (this.dailyTasks?.new_memorization?.status === 'done' || this.getHifzProgressPercent() >= 100) {
            const amount = this.dailyTasks?.new_memorization?.amount || 1;
            const unit = (this.dailyTasks?.new_memorization?.unit === 'verse' || this.dailyTasks?.new_memorization?.target === 'verses') ? 'آيات' : 'صفحات';
            return `القادم: ${amount} ${unit} جديدة للحفظ`;
        }

        // Backend provides a specific label now e.g. "Surah 2 - Verse 142"
        if (this.dailyTasks?.new_memorization?.label) {
            return `مطلوب حفظ: ${this.dailyTasks.new_memorization.label}`;
        }
        return 'اضغط للبدء';
    }

    getHifzProgressPercent(): number {
        if (!this.dailyTasks?.new_memorization) return 100;
        if (this.dailyTasks.new_memorization.status === 'done' && this.sessionCounters.versesMemorized === 0) return 100;

        const target = this.dailyTasks.new_memorization.amount || 1;
        const done = (this.dailyTasks.new_memorization.amountDone || 0) + this.sessionCounters.versesMemorized;
        return Math.min(Math.round((done / target) * 100), 100);
    }

    getConsolidationProgressPercent(): number {
        // If no verses (no task) or status is done, logic says 100% (nothing to do is also done)
        if (!this.dailyTasks?.consolidation || !this.dailyTasks.consolidation.verses || this.dailyTasks.consolidation.verses.length === 0 || this.dailyTasks.consolidation.status === 'done') return 100;
        return 0;
    }

    get hasConsolidationContent(): boolean {
        return !!(this.dailyTasks?.consolidation?.verses && this.dailyTasks.consolidation.verses.length > 0);
    }

    getRevisionProgressPercent(): number {
        if (!this.dailyTasks?.revision) return 100;
        if (this.dailyTasks.revision.status === 'done' && this.sessionCounters.pagesReviewed === 0) return 100;

        const target = this.dailyTasks.revision.amount || 1;
        const done = (this.dailyTasks.revision.amountDone || 0) + this.sessionCounters.pagesReviewed;
        return Math.min(Math.round((done / target) * 100), 100);
    }

    getTilawoProgressPercent(): number {
        if (!this.dailyTasks?.recitation) return 100;
        if (this.dailyTasks.recitation.status === 'done' && this.sessionCounters.pagesRead === 0) return 100;

        const target = this.dailyTasks.recitation.amount || 1;
        const done = (this.dailyTasks.recitation.amountDone || 0) + this.sessionCounters.pagesRead;
        return Math.min(Math.round((done / target) * 100), 100);
    }

    navigateToTask(task: any): void {
        if (!task) return;

        this.isSettingsOpen = false;
        this.currentTaskType = task.type || null;

        // Reset session counters when switching tasks to ensure accurate progress tracking
        this.sessionCounters.pagesRead = 0;
        this.sessionCounters.versesMemorized = 0;
        this.sessionCounters.pagesReviewed = 0;

        // Reset sync guards to allow immediate sync for the new task location
        this.lastSyncedPage = -1;
        this.lastSyncedVerseKey = '';
        this.completedTasks.delete(task.type); // Allow re-syncing for this task if needed

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
            // Special Logic for Done Tasks: If already 100%, we might want to navigate to the "Next" range
            const isDone = task.status === 'done' || (task.amountDone >= task.amount && task.amount > 0);

            if (isDone && task.type === 'recitation') {
                const currentPos = this.quranProgressService.getCurrentProgress()?.lastPage || 1;
                // Jump to currentPos + 1 if it's within limits
                const nextPage = Math.min(604, currentPos + 1);
                console.log(`[Mushaf] Task is DONE. Navigating to NEXT page: ${nextPage}`);
                this.goToPage(nextPage);
                return;
            }

            this.dataService.getPageNumberForVerse(Number(surahId), Number(verseNumber)).subscribe({
                next: (page) => {
                    if (page) this.goToPage(page);
                    else this.navigateToSurahStart(surahId);
                },
                error: () => this.navigateToSurahStart(surahId)
            });
            return;
        }

        // Priority 2: Label Parsing (for Juz or Surah without Verse)
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

        // Priority 3: Page Number
        const targetPage = task.startPage || task.page || task.targetPage || task.target;
        if (targetPage && !isNaN(Number(targetPage))) {
            this.goToPage(Number(targetPage));
            return;
        }

        // Fallback: Default to last read page
        const lastPage = this.quranProgressService.getCurrentProgress()?.lastPage || 1;
        this.goToPage(lastPage);
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
        this.stopVoiceSession();
        if (this.integrityRefreshInterval) {
            clearInterval(this.integrityRefreshInterval);
        }
    }

    saveReminders(): void {
        if (!this.isLoggedIn) return;
        this.hifzPlanService.saveReminders(this.reminderSettings).subscribe({
            next: (res) => console.log('✅ Reminders saved:', res),
            error: (err) => console.error('❌ Failed to save reminders:', err)
        });
    }

    async togglePushNotifications(): Promise<void> {
        if (!this.isLoggedIn) return;

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

    private getMinStayTime(): number {
        // Exception for first two pages (1 and 2): 5 seconds threshold instead of 30
        return this.pageNumber <= 2 ? 5000 : this.MIN_PAGE_STAY_MS;
    }

    private checkImmediatePointAwarding(): void {
        if (this.isCurrentPageAwarded) return;

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

        // RECITATION LOGIC: Only count if this specific page is part of the assigned Daily Recitation range
        if (this.currentTaskType === 'recitation' && this.isPageInRecitationRange(this.pageNumber)) {
            this.sessionCounters.pagesRead++;
            this.checkAutoSync('tilawo');
        } else if (this.currentTaskType !== 'recitation') {
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

    getReadingProgressPercent(): number {
        if (!this.isReadingActive) return 0;
        const elapsed = Date.now() - this.pageStartTime;
        return Math.min(100, (elapsed / this.getMinStayTime()) * 100);
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

        // Persist page number
        localStorage.setItem('lastMushafPage', this.pageNumber.toString());
    }

    private getPageFromFont(fontName: string): number {
        return parseInt(fontName.replace('QCF_P', ''), 10);
    }

    private loadPage(): void {
        this.showOptionsSheet = false;
        this.pageStartTime = Date.now();
        this.isCurrentPageAwarded = false;
        this.loadPages();
        this.loadTotalUsers();
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

    handleMushafClick(event: MouseEvent | TouchEvent): void {
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

        // Initialize verse range defaults based on the clicked ayah and current surah
        const [surahId, verseNum] = verseKey.split(':').map(Number);
        this.memorizationSettings.surahStartVerse = verseNum;

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

        // Reset session counters to ensure accurate progress tracking for this task
        this.sessionCounters = {
            pagesRead: 0,
            versesMemorized: 0,
            pagesReviewed: 0
        };

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
        this.isWaitingForPageTurn = false;
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
                const allAyahs = this.extractVerseKeys(surahPages, surah.id);

                // Filter by verse range if provided
                const start = this.memorizationSettings.surahStartVerse || 1;
                const end = this.memorizationSettings.surahEndVerse || surah.verses_count;

                this.sessionAyahs = allAyahs.filter(vKey => {
                    const vNum = parseInt(vKey.split(':')[1]);
                    return vNum >= start && vNum <= end;
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
                    // STRICT CHECK: Only count if this verse is part of the assigned Daily Wird
                    const currentVerseKey = this.sessionAyahs[this.currentAyahIndex];
                    if (this.isVerseInDailyWird(currentVerseKey)) {
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
                // NEW: Instead of navigating immediately, mark as waiting
                // This lets the user see/verify the last revealed content on the current page
                this.isWaitingForPageTurn = true;
                this.cdr.detectChanges();
                return;
            }

            setTimeout(() => this.calculateAutoShift(), 100);
        } else {
            if (this.memorizationSettings.groupRepeat > 0) {
                this.startGroupPhase();
            } else if (this.memorizationSettings.difficulty === 'hard') {
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


    private checkAutoSync(type: 'tilawo' | 'hifz' | 'muraja'): void {
        if (!this.dailyTasks || !this.isLoggedIn) return;

        let target = 0;
        let current = 0;

        if (type === 'tilawo') {
            target = this.dailyTasks.recitation?.amount || 1;
            current = this.sessionCounters.pagesRead;
        } else if (type === 'hifz') {
            target = this.dailyTasks.new_memorization?.amount || 1;
            current = this.sessionCounters.versesMemorized;
        } else if (type === 'muraja') {
            // Consolidation or Revision? Base target on amount from the specific task object
            const task = (this.currentTaskType === 'revision') ? this.dailyTasks.revision : this.dailyTasks.consolidation;
            target = task?.amount || 1;
            current = this.sessionCounters.pagesReviewed;
        }

        if (target > 0 && current > 0) {
            const currentAyahKey = this.sessionAyahs[this.currentAyahIndex];

            // Guard: Avoid syncing the same page/verse multiple times in a row
            if (type === 'tilawo' && this.pageNumber === this.lastSyncedPage) return;
            if (type === 'hifz' && currentAyahKey === this.lastSyncedVerseKey) return;
            // For muraja, we don't have a simple activePage check besides pageNumber
            if (type === 'muraja' && this.pageNumber === this.lastSyncedPage) return;

            // Correctly map currentTaskType to backend sync types
            let finalSyncType = type as string;
            if (type === 'muraja') {
                if (this.currentTaskType === 'revision') finalSyncType = 'deepMuraja';
            }

            const taskObj = (type === 'tilawo' ? this.dailyTasks.recitation :
                (type === 'hifz' ? this.dailyTasks.new_memorization :
                    (this.currentTaskType === 'revision' ? this.dailyTasks.revision : this.dailyTasks.consolidation)));

            if (!taskObj) return;

            const oldDone = taskObj.amountDone || 0;
            const totalToSync = oldDone + current;

            // FIX: Use totalToSync for status to avoid flipping 'done' back to 'pending' during Sabiq Bil Khayrat
            const newStatus = (totalToSync >= target) ? 'done' : 'pending';

            console.log(`[Mushaf] SYNC: Synchronizing ${type} progress: ${totalToSync}/${target} (Status: ${newStatus})`);

            // Track last synced position
            if (type === 'tilawo' || type === 'muraja') this.lastSyncedPage = this.pageNumber;
            if (type === 'hifz') this.lastSyncedVerseKey = currentAyahKey;

            this.mutabaaService.updateTaskStatus(finalSyncType as any, newStatus, totalToSync).subscribe({
                next: (res) => {
                    if (res.success) {
                        // Reset local session counters after successful sync
                        if (type === 'hifz') this.sessionCounters.versesMemorized = 0;
                        else if (type === 'muraja') this.sessionCounters.pagesReviewed = 0;
                        else if (type === 'tilawo') this.sessionCounters.pagesRead = 0;

                        // Reload daily tasks to update the plan
                        this.loadDailyTasks();
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

    private isVerseInDailyWird(verseKey: string): boolean {
        if (!this.dailyTasks || !this.dailyTasks.new_memorization) return false;

        const task = this.dailyTasks.new_memorization;
        // If task is already done, we don't count it for the daily progress bar anymore
        if (task.status === 'done' || this.getHifzProgressPercent() >= 100) return false;

        const [vSurah, vNum] = verseKey.split(':').map(Number);
        const startSurah = task.surah;
        const startVerse = task.verse;

        // Use the assigned amount for today
        const amount = task.amount || (this.hifzPlanStats?.dailyCapacity?.memorizationAmount) || 1;
        const endVerse = startVerse + amount - 1;

        // Check if verse is within the assigned range for the START surah
        // Note: For simplicity across surah boundaries, we mostly focus on the current surah task.
        if (vSurah === startSurah && vNum >= startVerse && vNum <= endVerse) {
            return true;
        }
        return false;
    }

    isPageInRecitationRange(pageNum: number): boolean {
        if (!this.dailyTasks?.recitation) return false;
        const task = this.dailyTasks.recitation;
        const start = task.startPage || 1;
        const amount = task.amount || 2;
        const end = start + amount - 1;
        return pageNum >= start && pageNum <= end;
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
        this.isMemorizationMode = false;
        this.isTestPhase = false;
        this.isGroupPhase = false;
        this.isWaitingForPageTurn = false;
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

        // Find if the spoken text matches the NEXT word(s)
        const matchIndex = this.matchingService.findProgress(transcript, expectedWords, nextIndex);

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

    convertPointsToEGP() {
        const progress = this.quranProgressService.getCurrentProgress();
        if (!progress || progress.totalPoints < 5) { // 5 points = 1 Piastre (usually, but let's stick to minPoints if we had it)
            this.showWalletModal('error', 'عذراً', 'يجب أن يكون لديك 5 نقاط على الأقل (1 قرش) للتحويل');
            return;
        }

        this.walletModal = {
            show: true,
            type: 'convert',
            title: 'تحويل النقاط',
            message: 'حدد عدد النقاط التي تود تحويلها إلى جنيهات',
            pointsToConvert: progress.totalPoints,
            maxPoints: progress.totalPoints,
            equivalentEGP: progress.totalPoints / this.quranPointsPerEGP,
            loading: false,
            isDonation: false
        };
    }

    onPointsChange(points: number) {
        this.walletModal.pointsToConvert = points;
        this.walletModal.equivalentEGP = points / this.quranPointsPerEGP;
    }

    confirmConversion() {
        if (this.walletModal.pointsToConvert < 5) {
            this.showWalletModal('error', 'خطأ', 'الحد الأدنى للتحويل هو 5 نقاط');
            return;
        }

        this.walletModal.loading = true;
        this.quranProgressService.convertPoints(this.walletModal.pointsToConvert).subscribe({
            next: (res) => {
                this.showWalletModal('success', 'تم التحويل بنجاح!', `تمت إضافة ${res.addedBalance.toFixed(2)} ج.م إلى محفظتك`);
            },
            error: (err) => {
                this.showWalletModal('error', 'فشل التحويل', err.error?.message || 'حدث خطأ أثناء التحويل');
            }
        });
    }

    requestPayout() {
        const progress = this.quranProgressService.getCurrentProgress();
        const balance = progress?.walletBalance || 0;

        if (balance < 20) {
            this.showWalletModal('error', 'الحد الأدنى للسحب', 'عذراً، يجب أن يكون رصيدك 20 جنيه على الأقل لتقديم طلب سحب.');
            return;
        }

        this.walletModal = {
            show: true,
            type: 'payout',
            title: 'طلب سحب رصيد',
            message: `هل تود تقديم طلب لسحب رصيدك الحالي (${balance.toFixed(2)} ج.م)؟ \n (ملاحظة: يمكنك تقديم طلب واحد فقط يومياً)`,
            pointsToConvert: 0,
            maxPoints: 0,
            equivalentEGP: balance,
            loading: false,
            isDonation: false
        };
    }

    confirmPayout() {
        this.walletModal.loading = true;
        this.quranProgressService.requestPayout().subscribe({
            next: (res) => {
                this.showWalletModal('success', 'تم تقديم الطلب!', res.message);
            },
            error: (err) => {
                this.showWalletModal('error', 'فشل الطلب', err.error?.message || 'حدث خطأ أثناء تقديم الطلب');
            }
        });
    }

    showWalletModal(type: 'success' | 'error' | 'convert' | 'payout', title: string, message: string) {
        this.walletModal = {
            ...this.walletModal,
            show: true,
            type,
            title,
            message,
            loading: false
        };
    }

    closeWalletModal() {
        this.walletModal.show = false;
        this.walletModal.isDonation = false;
    }

    openDonationModal() {
        const progress = this.quranProgressService.getCurrentProgress();
        const balance = progress?.walletBalance || 0;

        this.walletModal = {
            show: true,
            type: 'convert',
            title: 'دعم التطبيق',
            message: balance <= 0
                ? 'عذراً، يجب أن يكون لديك رصيد في المحفظة للتبرع. يمكنك تحويل بعض النقاط إلى رصيد أولاً.'
                : 'اختر المبلغ الذي تود التبرع به كصدقة جارية من رصيد محفظتك',
            pointsToConvert: balance,
            maxPoints: balance,
            equivalentEGP: balance > 0 ? Math.min(balance, 10) : 0,
            loading: false,
            isDonation: true
        };
    }

    confirmDonation() {
        if (this.walletModal.equivalentEGP < 0.01) {
            this.showWalletModal('error', 'خطأ', 'الحد الأدنى للتبرع هو قرش واحد (0.01 ج.م)');
            return;
        }

        this.walletModal.loading = true;
        const amount = this.walletModal.equivalentEGP;
        this.quranProgressService.createDonation(amount).subscribe({
            next: (res) => {
                this.walletModal.show = false;
                this.donationStats.showGratitude = true;
                this.loadDonationStats(); // Refresh stats
            },
            error: (err) => {
                this.showWalletModal('error', 'فشل التبرع', err.error?.message || 'حدث خطأ أثناء معالجة الطلب');
            }
        });
    }

    closeGratitudeModal() {
        this.donationStats.showGratitude = false;
    }

    // --- Total Users ---
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

    // --- Share Position ---
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
            alert('تم نسخ رابط الصفحة للمشاركة');
        }
    }
}
