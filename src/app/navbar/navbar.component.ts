import { Component, HostListener, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSearch, faUser, faShoppingCart, faBars, faClose, faHome, faBook, faBookReader, faChevronDown, faChevronUp, faMosque, faBrain, faScroll, faChartLine, faHeartbeat, faBookOpen, faChild, faHistory, faPalette, faBolt, faTshirt, faMagic, faShoePrints, faChair, faGamepad, faCut, faEllipsisH, faMoon, faExpand, faTrophy, faFilePdf, faHeart, faCartPlus, faClipboardList, faTachometerAlt, faBell, faTrash, faSun, faCoins } from '@fortawesome/free-solid-svg-icons';
import { DataService } from '../services/data.service';
import { AccountModalComponent } from '../auth/account-modal/account-modal.component';
import { AuthService } from '../auth/auth.service';
import { MerchantAuthService } from '../services/merchant-auth.service';
import { NotificationService, Notification } from '../services/notification.service';
import { PushNotificationService } from '../services/push-notification.service';
import { NavbarIconsComponent } from '../navbar-icons/navbar-icons.component';
import { SearchBarComponent } from '../search-bar/search-bar.component';

import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FormsModule, FontAwesomeModule, NavbarIconsComponent, SearchBarComponent, AccountModalComponent],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit {
  @ViewChild(AccountModalComponent) accountModal!: AccountModalComponent;

  isAndroidApp: boolean = false;

  faBars = faBars;
  faClose = faClose;
  faHome = faHome;
  faBook = faBook;
  faBookReader = faBookReader;
  faShoppingCart = faShoppingCart;
  faFilePdf = faFilePdf;
  faUser = faUser;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;
  faSearch = faSearch;
  faHeart = faHeart;
  faCartPlus = faCartPlus;
  faClipboardList = faClipboardList;
  faTachometerAlt = faTachometerAlt;
  faBell = faBell;
  faTrash = faTrash;
  faMosque = faMosque;
  faBrain = faBrain;
  faScroll = faScroll;
  faChartLine = faChartLine;
  faHeartbeat = faHeartbeat;
  faBookOpen = faBookOpen;
  faChild = faChild;
  faHistory = faHistory;
  faPalette = faPalette;
  faMoon = faMoon;
  faSun = faSun;
  faExpand = faExpand;
  faTrophy = faTrophy;
  faBolt = faBolt;
  faTshirt = faTshirt;
  faMagic = faMagic;
  faShoePrints = faShoePrints;
  faChair = faChair;
  faGamepad = faGamepad;
  faCut = faCut;
  faEllipsisH = faEllipsisH;
  faCoins = faCoins;


  openBars = false;
  scrollBook = true;
  scrollProducts = true;
  y: number = 0;
  allBooks: any[] = []; // جميع الكتب في الموقع
  isLoggedIn: boolean = false;
  show = false;
  favoritesCount: number = 0;
  cartCount: number = 0;
  orderCount: number = 0;
  isAdmin: boolean = false;
  isMerchant: boolean = false;

  showAccountModal: boolean = false;

  // Notification related
  notifications: (Notification & { removing?: boolean; swipeOffset?: number; startX?: number; currentX?: number; swiping?: boolean })[] = [];
  showNotificationsDropdown: boolean = false;
  unreadCount: number = 0;

  // Add these properties to track active states
  isOrdersActive: boolean = false;
  isAccountActive: boolean = false;

  isDarkMode: boolean = false; // Track dark mode state
  isFullScreen: boolean = false; // Track full screen state
  user: any = null; // Current user data

  // Search related
  searchQuery: string = '';
  selectedFilter: string = 'all';

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const clickedInsideMenu = target.closest('.mobile-menu-panel');
    const clickedOnBarsIcon = target.closest('.fa-bars');
    if (!clickedInsideMenu && !clickedOnBarsIcon) {
      this.openBars = false;
    }
  }

  onSearchExecuted(event: { query: string; filter: string }) {
    const query = event.query;
    const filter = event.filter;
    this.searchQuery = query;
    this.selectedFilter = filter;
    this.router.navigate(['/research'], { queryParams: { q: query, filter: filter } });
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('darkMode', this.isDarkMode.toString());
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  toggleFullScreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      this.isFullScreen = true;
    } else {
      document.exitFullscreen();
      this.isFullScreen = false;
    }
  }

  @HostListener('document:fullscreenchange')
  onFullScreenChange() {
    this.isFullScreen = !!document.fullscreenElement;
  }

  toggleAccountModal(): void {
    this.showAccountModal = !this.showAccountModal;
    this.isAccountActive = this.showAccountModal;
  }

  openAccountModal(): void {
    if (this.isLoggedIn) {
      this.router.navigate(['/profile']);
    } else {
      this.accountModal.openModal();
      this.showAccountModal = true;
      this.isAccountActive = true;
      this.cdr.markForCheck();
    }
  }

  closeAccountModal(): void {
    this.showAccountModal = false;
    this.isAccountActive = false;
    this.cdr.markForCheck();
  }

  exitBarsrow(): void {
    setTimeout(() => (this.scrollBook = !this.scrollBook), 50);
  }

  exitProductsrow(): void {
    setTimeout(() => (this.scrollProducts = !this.scrollProducts), 50);
  }

  exitBars(): void {
    setTimeout(() => (this.openBars = false), 50);
  }

  constructor(
    private router: Router,
    private dataService: DataService,
    private authService: AuthService,
    private merchantAuthService: MerchantAuthService,
    private notificationService: NotificationService,
    public pushService: PushNotificationService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.isAndroidApp = Capacitor.getPlatform() === 'android';

    // Initialize dark mode from localStorage, default to false (light mode)
    const darkModeStored = localStorage.getItem('darkMode');
    if (darkModeStored !== null) {
      this.isDarkMode = darkModeStored === 'true';
    } else {
      this.isDarkMode = false; // default to light mode
    }
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    this.dataService.getData().subscribe((data: any) => {
      this.allBooks = data;
    });

    // الاشتراك في تحديثات المستخدمين العاديين
    this.authService.user$.subscribe((user) => {
      this.user = user;
      this.updateLoginStatus();
      this.cdr.markForCheck(); // Ensure view updates immediately
    });

    // الاشتراك في تحديثات التجار
    this.merchantAuthService.merchant$.subscribe((merchant) => {
      if (merchant) {
        this.user = { ...merchant, role: 'merchant' };
        this.isMerchant = true;
      } else {
        this.isMerchant = false;
      }
      this.updateLoginStatus();
      this.cdr.markForCheck();
    });

    this.merchantAuthService.isLoggedIn$.subscribe((isMerchantLoggedIn) => {
      if (isMerchantLoggedIn) {
        const merchant = this.merchantAuthService.getCurrentMerchant();
        if (merchant) {
          this.user = { ...merchant, role: 'merchant' };
          this.isMerchant = true;
        }
      } else {
        this.isMerchant = false;
      }
      this.updateLoginStatus();
      this.cdr.markForCheck();
    });
  }

  updateLoginStatus() {
    const isUserLoggedIn = !!this.user && this.user.role !== 'merchant';
    const isMerchantLoggedIn = this.merchantAuthService.isAuthenticated();

    this.isLoggedIn = isUserLoggedIn || isMerchantLoggedIn;
    this.isAdmin = this.user?.email === 'admin@example.com' || this.user?.role === 'admin';

    // Defensive: If user is admin, they shouldn't be treated as merchant in the navbar
    if (this.isAdmin) {
      this.isMerchant = false;
    }

    // Force immediate view update
    this.cdr.markForCheck();

    // Additional check to ensure admin button appears immediately
    setTimeout(() => {
      this.cdr.markForCheck();
    }, 100);

    if (this.user) {
      if (this.user.role !== 'merchant') {
        // Load user data for regular users
        if (this.user.id) {
          this.authService.loadUserData(this.user.id);

          // Load orders explicitly on user login to update orderCount
          this.dataService.loadOrders(this.user.id).subscribe();
        }

        // الاشتراك في تحديثات المفضلة والسلة والطلبات
        this.authService.favoriteBookIds.subscribe((favorites) => {
          this.favoritesCount = favorites.length;
        });

        this.authService.cartBookIds.subscribe((cart) => {
          this.cartCount = cart.length;
        });

        this.dataService.orders$.subscribe((orders) => {
          this.orderCount = orders.length;
          this.cdr.markForCheck();
        });

        // Subscribe to notifications observable for real-time updates
        this.notificationService.notifications$.subscribe((notifications) => {
          this.notifications = notifications.map(n => ({ ...n, swipeOffset: -15 }));
          this.unreadCount = notifications.filter(n => !n.read).length;
          this.cdr.markForCheck();
        });

        // Load notifications initially
        if (this.user.id) {
          this.notificationService.refreshNotifications(this.user.id);
        }
      }

      // Subscribe to router events to update active states for orders and account
      this.router.events.subscribe((event) => {
        // Only update on NavigationEnd event
        if (event.constructor.name === 'NavigationEnd') {
          const currentUrl = this.router.url;
          this.isOrdersActive = this.router.isActive('/requests', true);
          // For account, if modal is open, set active, else false
          this.isAccountActive = this.showAccountModal;
          this.cdr.markForCheck();
        }
      });

      this.onResize(window); // تحديد حالة القائمة الجانبية بناءً على حجم الشاشة عند تحميل الصفحة
    }
  }

  loadNotifications(userId: string): void {
    // This method is no longer needed but kept for backward compatibility
  }

  toggleNotificationsDropdown(): void {
    this.showNotificationsDropdown = !this.showNotificationsDropdown;
  }

  markNotificationAsRead(notification: Notification): void {
    if (notification.read) return;
    this.authService.user$.subscribe(user => {
      if (!user || !user.id) return;
      this.notificationService.markAsRead(user.id, notification._id).subscribe(() => {
        notification.read = true;
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        this.cdr.markForCheck();
      });
    }).unsubscribe();
  }

  deleteNotification(notification: Notification): void {
    this.authService.user$.subscribe(user => {
      if (!user || !user.id) return;
      this.notificationService.deleteNotification(user.id, notification._id).subscribe(() => {
        // Remove the notification from the local array
        this.notifications = this.notifications.filter(n => n._id !== notification._id);
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        this.cdr.markForCheck();
      });
    }).unsubscribe();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    this.y = window.innerWidth;
    if (this.y >= 768) {  // md breakpoint and above
      this.openBars = true;
    } else {
      this.openBars = false;
    }
  }

  closeModal(): void {
    this.show = false;
  }

  goToOrders(): void {
    this.closeModal();
    this.router.navigate(['/requests']);
    this.isOrdersActive = true;
  }

  isLibraryPage(): boolean {
    return this.router.url.startsWith('/library');
  }

  // Touch Handling for Swipe to Delete
  onTouchStart(event: TouchEvent, notification: any) {
    notification.startX = event.touches[0].clientX;
    notification.currentX = notification.startX;
    notification.swiping = true;
  }

  onTouchMove(event: TouchEvent, notification: any) {
    if (!notification.swiping) return;
    notification.currentX = event.touches[0].clientX;
    const diff = notification.currentX - notification.startX;

    // Only allow swiping left (negative diff) to reveal delete button
    if (diff < 0) {
      // Limit swipe to -80px (width of delete button)
      notification.swipeOffset = Math.max(diff, -80);
      // Prevent scrolling while swiping horizontally
      if (Math.abs(diff) > 10) event.preventDefault();
    }
  }

  // Track active notification being swiped
  activeNotification: any = null;

  // Mouse Handling for Desktop Swipe
  onMouseDown(event: MouseEvent, notification: any) {
    event.preventDefault(); // Stop default generic dragging
    this.activeNotification = notification;
    notification.startX = event.clientX;
    notification.currentX = notification.startX;
    notification.swiping = true;

    // Add global listeners to handle dragging outside the element
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
  }

  // Bound function to preserve 'this' context
  onWindowMouseMove = (event: MouseEvent) => {
    if (!this.activeNotification || !this.activeNotification.swiping) return;

    event.preventDefault(); // Prevent text selection during drag

    const diff = event.clientX - this.activeNotification.startX;

    // Allow swiping left (negative) to reveal delete, and slightly right to close hint
    // We limit the max open to -80px (delete width) and max closed to 0px
    // Since we want a hint of -10px default, we allow pulling back to 0.

    // We add the initial offset if it exists (for the hint)
    // Actually, simpler logic:
    // New offset = Current diff

    if (diff < 0) {
      // Swiping left (opening)
      this.activeNotification.swipeOffset = Math.max(diff, -80);
    } else {
      // Swiping right (closing) - allow going back to 0 from the hint
      this.activeNotification.swipeOffset = Math.min(diff, 0);
    }
  };

  onWindowMouseUp = (event: MouseEvent) => {
    if (this.activeNotification) {
      this.activeNotification.swiping = false;

      // Threshold to fully open
      if (this.activeNotification.swipeOffset < -40) {
        this.activeNotification.swipeOffset = -80;
      } else {
        // Snap back to hint state (-10px) or closed (0px)? 
        // User wants hint visible. Let's snap to -15px as the "closed/idle" state 
        // so they always see it exists.
        this.activeNotification.swipeOffset = -15;
      }
      this.activeNotification = null;
    }

    // Clean up
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);
  };

  onTouchEnd(event: TouchEvent, notification: any) {
    notification.swiping = false;
    if (notification.swipeOffset < -40) {
      notification.swipeOffset = -80;
    } else {
      notification.swipeOffset = -15; // Reset to hint state
    }
  }

  getNotificationIcon(type: string): any {
    switch (type) {
      case 'order': return this.faShoppingCart;
      case 'print_order': case 'printOrder': return this.faFilePdf;
      case 'offer': return this.faCoins;
      case 'system': default: return this.faBell;
    }
  }

  protected readonly Math = Math;
}
