import { Component, HostListener, OnInit, ViewChild, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSearch, faUser, faShoppingCart, faBars, faClose, faHome, faBook, faBookReader, faChevronDown, faChevronUp, faMosque, faBrain, faScroll, faChartLine, faHeartbeat, faBookOpen, faChild, faHistory, faPalette, faBolt, faTshirt, faMagic, faShoePrints, faChair, faGamepad, faCut, faEllipsisH, faMoon, faExpand, faTrophy, faFilePdf, faHeart, faCartPlus, faClipboardList, faTachometerAlt, faBell, faTrash, faSun, faCoins, faUsers, faTools, faPenNib, faHandshake } from '@fortawesome/free-solid-svg-icons';
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
  faUsers = faUsers;
  faTools = faPenNib;
  faHandshake = faHandshake;

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
  isMarketer: boolean = false;

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

  dynamicCategories: string[] = [];
  bookCategories: string[] = [];
  officeCategories: string[] = [];
  otherCategories: string[] = [];

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

  onSearchExecuted(event: { query: string; filter: string; selectedBook?: any }) {
    const query = event.query;
    const filter = event.filter;
    const selectedBook = event.selectedBook;
    this.searchQuery = query;
    this.selectedFilter = filter;
    const queryParams: any = { q: query, filter: filter };
    if (selectedBook) {
      // Use _id as primary identifier, fallback to barcode or products_id
      queryParams.selectedBookId = selectedBook._id || selectedBook.barcode || selectedBook.products_id || '';
    }
    this.router.navigate(['/research'], { queryParams });
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('darkMode', this.isDarkMode.toString());
      if (this.isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }

  toggleFullScreen(): void {
    if (!isPlatformBrowser(this.platformId)) return;
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
    if (isPlatformBrowser(this.platformId)) {
      this.isFullScreen = !!document.fullscreenElement;
    }
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
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    this.isAndroidApp = Capacitor.getPlatform() === 'android';

    if (isPlatformBrowser(this.platformId)) {
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
    }

    // Load dynamic categories in browser only — HTTP call not needed during SSR
    if (isPlatformBrowser(this.platformId)) {
      this.loadDynamicCategories();
    }

    // Load allBooks data only in browser (not during SSR)
    if (isPlatformBrowser(this.platformId)) {
      this.dataService.getData().subscribe((data: any) => {
        this.allBooks = data;
      });
    }

    // الاشتراك في تحديثات المستخدمين العاديين
    this.authService.user$.subscribe((user) => {
      const oldId = this.user?.id || (this.user as any)?._id;
      const newId = user?.id || (user as any)?._id;

      this.user = user;
      this.updateLoginStatus();

      // Only load extra data if the user ID actually changed (login/logout/switch)
      if (newId && newId !== oldId) {
        console.log('👤 [Navbar] User ID changed, loading initial data');
        this.authService.loadUserData(newId);
        this.dataService.loadOrders(newId).subscribe();
        this.notificationService.refreshNotifications(newId);
      }

      this.cdr.markForCheck();
    });

    // Subscriptions for favorites, cart, orders, and notifications (Moved from updateLoginStatus to prevent leaks)
    this.authService.favoriteBookIds.subscribe((favorites) => {
      this.favoritesCount = favorites.length;
      this.cdr.markForCheck();
    });

    this.authService.cartBookIds.subscribe((cart) => {
      this.cartCount = cart.length;
      this.cdr.markForCheck();
    });

    this.dataService.orders$.subscribe((orders) => {
      this.orderCount = orders.length;
      this.cdr.markForCheck();
    });

    this.notificationService.notifications$.subscribe((notifications) => {
      this.notifications = notifications.map(n => ({ ...n, swipeOffset: -15 }));
      this.unreadCount = notifications.filter(n => !n.read).length;
      this.cdr.markForCheck();
    });

    // Subscribe to router events for active states
    this.router.events.subscribe((event: any) => {
      if (event instanceof NavigationEnd) {
        this.isOrdersActive = this.router.isActive('/requests', true);
        this.isAccountActive = this.showAccountModal;
        this.cdr.markForCheck();
      }
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
    this.isAdmin = this.user?.email === 'admin@example.com' || this.user?.role === 'admin' || this.user?.role === 'staff';
    this.isMarketer = isUserLoggedIn; // Allow all logged-in users to see and apply

    // Force immediate view update
    this.cdr.markForCheck();

    // Additional check to ensure admin button appears immediately (browser only)
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        this.cdr.markForCheck();
      }, 100);
    }

    if (this.user) {
      if (isPlatformBrowser(this.platformId)) {
        this.onResize({ target: window }); // تحديد حالة القائمة الجانبية بناءً على حجم الشاشة عند تحميل الصفحة
      }
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
        // Refresh notifications from server to sync with other components
        this.notificationService.refreshNotifications(user.id);
      });
    }).unsubscribe();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    if (isPlatformBrowser(this.platformId)) {
      this.y = window.innerWidth;
      if (this.y >= 768) {  // md breakpoint and above
        this.openBars = true;
      } else {
        this.openBars = false;
      }
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

  isPersonalProfilePage(): boolean {
    return this.router.url.startsWith('/profile');
  }

  isReaderCommunityPage(): boolean {
    return this.router.url.startsWith('/reader-community');
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

  loadDynamicCategories(): void {
    const defaultCats = [
      'تطوير الذات وعلم النفس',
      'روايات وقصص',
      'أعمال وتسويق ومالية',
      'صحة وطب وعلوم',
      'قواميس ومراجع',
      'تربية وأطفال',
      'تاريخ وسير ذاتية',
      'فنون وحرف',
      'كتب دينية'
    ];

    this.dataService.getAdminCategories().subscribe({
      next: (res) => {
        if (res && res.success) {
          const activeCategories = res.categories.filter((c: any) => c.isActive !== false);
          
          this.bookCategories = [];
          this.officeCategories = [];
          this.otherCategories = [];
          this.dynamicCategories = [];

          activeCategories.forEach((c: any) => {
            this.dynamicCategories.push(c.name);
            if (c.type === 'book') {
              this.bookCategories.push(c.name);
            } else if (c.type === 'stationery') {
              this.officeCategories.push(c.name);
            } else {
              this.otherCategories.push(c.name);
            }
          });
          this.cdr.markForCheck();
        }
      },
      error: (err) => {
        console.error('Error loading dynamic categories:', err);
        // Fallback to default categories on error
        this.dynamicCategories = defaultCats;
        this.groupCategories();
      }
    });
  }

  groupCategories(): void {
    const bookKeywords = ['كتب', 'روايات', 'تطوير', 'تاريخ', 'تربية', 'صحة', 'أعمال', 'فنون', 'قواميس', 'دينية', 'ديني', 'رواية', 'تنمية'];
    const officeKeywords = ['مكتبية', 'أدوات', 'قرطاسية'];

    this.bookCategories = [];
    this.officeCategories = [];
    this.otherCategories = [];

    this.dynamicCategories.forEach(cat => {
      const lowerCat = cat.toLowerCase();
      if (bookKeywords.some(k => lowerCat.includes(k))) {
        this.bookCategories.push(cat);
      } else if (officeKeywords.some(k => lowerCat.includes(k))) {
        this.officeCategories.push(cat);
      } else {
        this.otherCategories.push(cat);
      }
    });
  }

  getCategoryIcon(cat: string): any {
    const iconMap: { [key: string]: any } = {
      'كتب دينية': faMosque,
      'دينية': faMosque,
      'ديني': faMosque,
      'تطوير الذات وعلم النفس': faBrain,
      'تنمية': faBrain,
      'روايات وقصص': faScroll,
      'رواية': faScroll,
      'أعمال وتسويق ومالية': faChartLine,
      'اعمال': faChartLine,
      'صحة وطب وعلوم': faHeartbeat,
      'صحة': faHeartbeat,
      'قواميس ومراجع': faBookOpen,
      'قاموس': faBookOpen,
      'تربية وأطفال': faChild,
      'تربية': faChild,
      'تاريخ وسير ذاتية': faHistory,
      'تاريخ': faHistory,
      'فنون وحرف': faPalette,
      'فن': faPalette,
      'أدوات مكتبية': faTools
    };
    return iconMap[cat] || faBook;
  }
}
