import { Component, ViewChild, ElementRef, NgZone, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Location, isPlatformBrowser } from '@angular/common'; // Import Location
import { App } from '@capacitor/app'; // Import App
import { Capacitor } from '@capacitor/core'; // Import Capacitor
import { faChevronLeft, faChevronRight, faSearch } from '@fortawesome/free-solid-svg-icons';
import { faGooglePlay, faYoutube } from '@fortawesome/free-brands-svg-icons';
import { DataService } from './services/data.service';
import { ModalService, ModalConfig } from './services/modal.service';
import { TutorialService } from './services/tutorial.service';
import { AppUpdateService } from './services/app-update.service'; // Import AppUpdateService
import { PushNotificationService } from './services/push-notification.service';
import { NotificationService } from './services/notification.service';
import { LocalReminderService } from './services/local-reminder.service';
import { AuthService } from './auth/auth.service';
import { StatusBar, Style } from '@capacitor/status-bar'; // Import StatusBar
import { Subscription, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { MushafAssetService } from './core/services/mushaf-asset.service';
import { VoiceCallService } from './core/services/voice-call.service';
import { PromotionService } from './services/promotion.service';
import { LiveUpdateService } from './services/live-update.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: false,
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  @ViewChild('accountModal') accountModal: any;

  title = 'kenouz';  // Added title property to fix the error
  currentYear = new Date().getFullYear(); // السنة الحالية

  faChevronLeft = faChevronLeft;
  faChevronRight = faChevronRight;
  faSearch = faSearch;
  faGooglePlay = faGooglePlay;
  faYoutube = faYoutube;
  outOn = false;
  isSearchPage: boolean = false; // متغير لتحديد إذا كانت الصفحة هي صفحة البحث
  isMushafPage: boolean = false;
  isAdminPage: boolean = false;

  allBooks: any[] = []; // جميع الكتب في الموقع

  isDarkMode: boolean = false; // Track dark mode state
  modalConfig: ModalConfig | null = null;
  private modalSubscription: Subscription | null = null;

  // Mushaf Download State
  isDownloadingAssets$!: Observable<boolean>;
  downloadProgress$!: Observable<number>;
  downloadMessage$!: Observable<string>;

  constructor(
    private router: Router,
    private dataService: DataService,
    private modalService: ModalService,
    private tutorialService: TutorialService,
    private location: Location, // Inject Location
    private ngZone: NgZone, // Inject NgZone
    private appUpdateService: AppUpdateService, // Inject AppUpdateService
    private pushService: PushNotificationService, // Inject PushNotificationService
    private notificationService: NotificationService, // Inject NotificationService
    private localReminderService: LocalReminderService, // Inject LocalReminderService
    private authService: AuthService,
    private mushafAssetService: MushafAssetService,
    private voiceCallService: VoiceCallService,
    private promotionService: PromotionService,
    public liveUpdateService: LiveUpdateService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeApp();
      // Initialize local reminders (works without server)
      this.localReminderService.initializeReminders();
      // Initialize Live Updates
      this.liveUpdateService.initialize().catch(err => console.error('Live Update Init Error:', err));
    }
    this.isDownloadingAssets$ = this.mushafAssetService.loading$;
    this.downloadProgress$ = this.mushafAssetService.progress$;
    this.downloadMessage$ = this.mushafAssetService.message$;
  }

  initializeApp() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.appUpdateService.checkForUpdate(); // Check for updates on startup

    // Auto specific actions
    this.pushService.initialPermissionRequest();

    if (Capacitor.isNativePlatform()) {
      // Hide Status Bar (Full Screen Mode)
      StatusBar.hide().catch(() => { });
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => { });

      App.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
        this.ngZone.run(() => {
          if (this.router.url === '/' || this.router.url === '/home') {
            App.exitApp();
          } else {
            if (canGoBack) {
              this.location.back();
            } else {
              // Fallback if canGoBack is false but we are not on home
              // (This happens sometimes in hybrid apps history)
              if (window.history.length > 1) {
                this.location.back();
              } else {
                App.exitApp();
              }
            }
          }
        });
      });
    }
  }

  ngOnInit(): void {
    // تحقق من وجود صفحة البحث في المسار
    this.router.events.subscribe((event: any) => {
      if (event.url) {
        // تحقق إذا كان الـ URL يحتوي على استعلام البحث
        this.isSearchPage = event.url.includes('/search'); // على حسب المسار الذي تستخدمه للبحث
      }
    });

    this.router.events.subscribe((event: any) => {
      if (event instanceof NavigationEnd) {
        if (isPlatformBrowser(this.platformId)) {
          window.scrollTo(0, 0);
        }

        this.isAdminPage = event.urlAfterRedirects.includes('/admin') || event.urlAfterRedirects.includes('/ControlPanel');

        // CRITICAL: Do NOT overwrite state if we are just landing!
        // Only update state if we are navigating to a "real" page (Home or Mushaf)
        if (event.urlAfterRedirects !== '/' && !event.urlAfterRedirects.includes('landing')) {
          this.isMushafPage = event.urlAfterRedirects.includes('/mushaf');
          // Persist state
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem('last_mushaf_state', this.isMushafPage ? 'mushaf' : 'home');
          }
        }
      }
    });

    // Load allBooks data here
    this.dataService.getData().subscribe((data: any) => {
      this.allBooks = data;
    });

    if (isPlatformBrowser(this.platformId)) {
      // Initialize dark mode from localStorage or system preference
      const darkModeStored = localStorage.getItem('darkMode');
      if (darkModeStored !== null) {
        this.isDarkMode = darkModeStored === 'true';
      } else {
        // Use system preference
        this.isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      this.updateDarkModeClass();

      // Reset and start tutorial unconditionally to show the tutorial window always, unless permanently disabled
      if (!this.tutorialService.isTutorialDisabledPermanently()) {
        this.tutorialService.resetTutorial();
        setTimeout(() => {
          this.tutorialService.startTutorial();
        }, 5000); // Show tutorial after 5 seconds delay
      }
    }

    // Subscribe to modal service
    this.modalSubscription = this.modalService.modal$.subscribe(config => {
      this.modalConfig = config;
    });

    // Auto-resume Mushaf logic moved to StartupGuard
    // const lastState = localStorage.getItem('last_mushaf_state');
    // const currentPath = window.location.pathname;
    // if (lastState === 'mushaf' && (currentPath === '/' || currentPath === '/home' || currentPath === '/index.html')) {
    //   this.router.navigate(['/mushaf']);
    // }

    // Global Push Listener for Optimistic Updates
    this.pushService.pushPayload.subscribe((payload: any) => {
      console.log('⚡ Optimistic Notification Update:', payload);
      if (payload && payload.notification) {
        // Construct temporary notification object
        const newNotification: any = {
          message: payload.notification.body || payload.body,
          type: payload.data?.type || 'system',
          read: false,
          createdAt: new Date().toISOString(),
          relatedId: payload.data?.relatedId
        };
        // Add random ID if not present
        if (!newNotification._id) {
          newNotification._id = `temp_${Date.now()}`;
        }

        this.notificationService.addNotification(newNotification);
      }
    });

    // Auto-subscribe logged in users to push system and voice calling
    this.authService.user$.subscribe(user => {
      if (user && user.id && isPlatformBrowser(this.platformId)) {
        // This ensures that valid token is sent to backend whenever user is known
        this.pushService.subscribeToNotifications();

        // Initialize Voice Call Peer
        this.voiceCallService.init(user.id);
      }
    });

    // Promotion Theme Propagation
    this.promotionService.initializeTheme();
    this.promotionService.activeTheme$.subscribe(theme => {
      if (theme) {
        this.applyPromotionTheme(theme);
      }
    });
  }

  applyPromotionTheme(theme: any) {
    if (!isPlatformBrowser(this.platformId)) return;
    const root = document.documentElement;
    if (theme.themeConfig?.primaryColor) {
      root.style.setProperty('--promo-primary', theme.themeConfig.primaryColor);
    }
    if (theme.themeConfig?.secondaryColor) {
      root.style.setProperty('--promo-secondary', theme.themeConfig.secondaryColor);
    }
    // Also set specific colors for different elements if needed
    root.style.setProperty('--promo-bg-image', theme.themeConfig?.bgImage ? `url(${theme.themeConfig.bgImage})` : 'none');
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('darkMode', this.isDarkMode.toString());
    }
    this.updateDarkModeClass();
  }

  updateDarkModeClass(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  onSearchExecuted(event: { query: string; filter: string }) {
    const query = event.query || '';
    const filter = event.filter || 'all';
    if (query.trim()) {
      this.router.navigate(['/research'], { queryParams: { q: query.trim(), filter } });
    } else {
      this.router.navigate(['/research'], { queryParams: { filter } });
    }
  }

  copyPhoneNumber(): void {
    const phoneNumber = '01094612729';
    if (isPlatformBrowser(this.platformId)) {
      navigator.clipboard.writeText(phoneNumber).then(() => {
        alert('تم نسخ الرقم');
      }).catch(() => {
        alert('فشل نسخ الرقم');
      });
    }
  }

  ngOnDestroy(): void {
    if (this.modalSubscription) {
      this.modalSubscription.unsubscribe();
    }
  }

  closeModal(): void {
    this.modalConfig = null;
  }

  openAccountModal(): void {
    if (this.accountModal) {
      this.accountModal.openModal();
    }
  }
}

// Recompiled: 2026-03-13 22:15:00
