import { Component, OnInit, ViewChild, ChangeDetectorRef, Output, EventEmitter, ElementRef, HostListener, CUSTOM_ELEMENTS_SCHEMA, ViewEncapsulation, Input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { faBars, faClose, faHome, faBook, faFilePdf, faUser, faChevronUp, faChevronDown, faSearch, faHeart, faCartPlus, faClipboardList, faTachometerAlt, faBell, faTrash, faStore, faFilter, faExpand, faBookReader } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AuthService } from '../auth/auth.service';
import { MerchantAuthService } from '../services/merchant-auth.service';
import { NotificationService, Notification } from '../services/notification.service';
import { DataService } from '../services/data.service';

@Component({
  selector: 'app-navbar-icons',
  templateUrl: './navbar-icons.component.html',
  styleUrls: ['./navbar-icons.component.css'],
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FontAwesomeModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  encapsulation: ViewEncapsulation.None
})
export class NavbarIconsComponent implements OnInit {
  @Output() accountClick = new EventEmitter<void>();
  @Input() isBottomNav: boolean = false;
  @Input() showOnlyNotification: boolean = false; // New input

  faFilter = faFilter;
  faBars = faBars;
  faClose = faClose;
  faHome = faHome;
  faBook = faBook;
  faBookReader = faBookReader;
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
  faStore = faStore;
  faExpand = faExpand;

  openBars = false;
  scrollBook = true;
  y: number = 0;
  searchQuery: string = ''; // القيمة المدخلة في خانة البحث
  searchResults: any[] = []; // نتائج البحث المعروضة
  allBooks: any[] = []; // جميع الكتب في الموقع
  isLoggedIn: boolean = false;
  show = false;
  favoritesCount: number = 0;
  cartCount: number = 0;
  orderCount: number = 0;
  isAdmin: boolean = false;
  isMerchant: boolean = false; // New property for merchant check

  showAccountModal: boolean = false;

  // Notification related
  notifications: (Notification & { removing?: boolean })[] = [];
  showNotificationsDropdown: boolean = false;
  unreadCount: number = 0;

  // Add these properties to track active states
  isOrdersActive: boolean = false;
  isAccountActive: boolean = false;

  isDarkMode: boolean = false; // Track dark mode state
  isFullScreen: boolean = false; // Track full screen state
  showFilterDropdown: boolean = false;
  selectedFilter: string = 'all';

  constructor(
    private router: Router,
    private dataService: DataService,
    private authService: AuthService,
    private merchantAuthService: MerchantAuthService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.isFullScreen = !!document.fullscreenElement;
    // Check both AuthService and MerchantAuthService for user state
    this.authService.user$.subscribe((user) => {
      this.isLoggedIn = !!user;
      this.isAdmin = user?.email === 'admin@example.com';
      this.isMerchant = user?.role === 'merchant'; // Set merchant flag from regular user

      if (user && user.id) {
        this.authService.loadUserData(user.id);

        if (user.id) {
          this.dataService.loadOrders(user.id).subscribe();
        }

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

        this.notificationService.notifications$.subscribe((notifications) => {
          this.notifications = notifications;
          this.unreadCount = notifications.filter(n => !n.read).length;
          this.cdr.markForCheck();
        });

        if (user && user.id) {
          this.notificationService.refreshNotifications(user.id);
        }

        this.router.events.subscribe((event) => {
          if (event instanceof NavigationEnd) {
            this.isOrdersActive = this.router.isActive('/requests', true);
            this.isAccountActive = this.showAccountModal;
            this.cdr.markForCheck();
          }
        });
      }

      this.cdr.markForCheck(); // Ensure view updates immediately

      // Additional check to ensure admin button appears immediately
      setTimeout(() => {
        this.cdr.markForCheck();
      }, 100);
    });

    // Also check MerchantAuthService for merchant state
    this.merchantAuthService.merchant$.subscribe((merchant) => {
      if (merchant) {
        this.isLoggedIn = true;
        this.isMerchant = true; // Set merchant flag from merchant service
        this.cdr.markForCheck();

        // Additional check to ensure merchant button appears immediately
        setTimeout(() => {
          this.cdr.markForCheck();
        }, 50);
      } else {
        this.isMerchant = false;
        this.cdr.markForCheck();
      }
    });

    // Check if user is authenticated as merchant
    this.merchantAuthService.isLoggedIn$.subscribe((isLoggedIn) => {
      if (isLoggedIn) {
        this.isLoggedIn = true;
        this.isMerchant = true;
        this.cdr.markForCheck();

        // Additional check to ensure merchant button appears immediately
        setTimeout(() => {
          this.cdr.markForCheck();
        }, 50);
      } else {
        this.isMerchant = false;
        this.cdr.markForCheck();
      }
    });
  }

  toggleFilterDropdown() {
    this.showFilterDropdown = !this.showFilterDropdown;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const clickedInsideMenu = target.closest('.rtl.md\\:hidden.z-50.relative.text-blue-950.dark\\:text-blue-100');
    const clickedOnBarsIcon = target.closest('.fa-bars');
    if (!clickedInsideMenu && !clickedOnBarsIcon) {
      this.openBars = false;
    }
  }

  selectFilter(filter: string) {
    this.selectedFilter = filter;
    this.showFilterDropdown = false;
    this.onSearchExecuted({ query: this.searchQuery.trim(), filter: this.selectedFilter });
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

  toggleAccountModal(): void {
    this.showAccountModal = !this.showAccountModal;
    this.isAccountActive = this.showAccountModal;
  }

  closeAccountModal(): void {
    this.showAccountModal = false;
    this.isAccountActive = false;
    this.cdr.markForCheck();
  }

  exitBarsrow(): void {
    setTimeout(() => (this.scrollBook = !this.scrollBook), 50);
  }

  exitBars(): void {
    setTimeout(() => (this.openBars = !this.openBars), 50);
  }

  onSearch(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/research'], { queryParams: { q: this.searchQuery.trim(), filter: this.selectedFilter } });
      this.searchResults = []; // إخفاء الاقتراحات بعد تنفيذ البحث
    }
  }

  selectSuggestion(productName: string): void {
    this.searchQuery = productName;
    this.searchResults = [];
    this.onSearch(); // تنفيذ البحث تلقائيًا
  }

  private normalizeArabic(text: string): string {
    return text
      .replace(/[أإآ]/g, 'ا')
      .replace(/[هة]/g, 'ه')
      // Remove special characters except numbers and letters
      .replace(/[^0-9a-zA-Z\u0600-\u06FF\s]/g, '')
      // Remove extra spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  onEnterPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch();
      this.searchResults = [];
    }
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

  // Notification methods
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
        this.notifications = this.notifications.filter(n => n._id !== notification._id);
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        this.cdr.markForCheck();
      });
    }).unsubscribe();
  }

  handleNotificationClick(notification: Notification): void {
    // Mark as read
    this.markNotificationAsRead(notification);

    // Navigate based on type
    if (notification.type === 'order') {
      this.router.navigate(['/requests']);
      this.showNotificationsDropdown = false; // Close dropdown
    }
    // Add more types if needed
  }

  onAccountClick(): void {
    this.accountClick.emit();
    this.isAccountActive = true;
    this.cdr.markForCheck();
  }

  toggleFullScreen(): void {
    if (!this.isFullScreen) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  @HostListener('document:fullscreenchange', ['$event'])
  onFullScreenChange(): void {
    this.isFullScreen = !!document.fullscreenElement;
    this.cdr.markForCheck();
  }
}
