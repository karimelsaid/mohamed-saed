import { Component, ViewChild, ElementRef, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common'; // Import Location
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
import { AuthService } from './auth/auth.service';
import { StatusBar, Style } from '@capacitor/status-bar'; // Import StatusBar
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: false,
  styleUrl: './app.component.css'
})
export class AppComponent {
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

  allBooks: any[] = []; // جميع الكتب في الموقع

  isDarkMode: boolean = false; // Track dark mode state
  modalConfig: ModalConfig | null = null;
  private modalSubscription: Subscription | null = null;

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
    private authService: AuthService
  ) {
    this.initializeApp();
  }

  initializeApp() {
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

    // Scroll to top on navigation
    this.router.events.subscribe((event: any) => {
      if (event.urlAfterRedirects) {
        window.scrollTo(0, 0);
      }
    });

    // Load allBooks data here
    this.dataService.getData().subscribe((data: any) => {
      this.allBooks = data;
    });

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

    // Subscribe to modal service
    this.modalSubscription = this.modalService.modal$.subscribe(config => {
      this.modalConfig = config;
    });

    // Global Push Listener for Optimistic Updates
    this.pushService.pushPayload.subscribe((payload: any) => {
      console.log('⚡ Optimistic Notification Update:', payload);
      if (payload && payload.notification) {
        // Construct temporary notification object
        const newNotification: any = {
          _id: payload.data?.relatedId ? `temp_${payload.data.relatedId}` : `temp_${Date.now()}`,
          message: payload.notification.body || payload.body,
          type: payload.data?.type || 'system',
          read: false,
          createdAt: new Date().toISOString(),
          relatedId: payload.data?.relatedId
        };

        this.notificationService.addNotification(newNotification);
        this.notificationService.addNotification(newNotification);
      }
    });

    // Auto-subscribe logged in users to push system
    this.authService.user$.subscribe(user => {
      if (user && user.id) {
        // This ensures that valid token is sent to backend whenever user is known
        this.pushService.subscribeToNotifications();
      }
    });
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('darkMode', this.isDarkMode.toString());
    this.updateDarkModeClass();
  }

  updateDarkModeClass(): void {
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
    navigator.clipboard.writeText(phoneNumber).then(() => {
      alert('تم نسخ الرقم');
    }).catch(() => {
      alert('فشل نسخ الرقم');
    });
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
