import { Component, HostListener, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { faBars, faClose, faHome, faBook, faFilePdf, faUser, faChevronUp, faChevronDown, faSearch,faHeart,faCartPlus,faClipboardList, faTachometerAlt, faBell, faTrash } from '@fortawesome/free-solid-svg-icons';
import { DataService } from '../services/data.service';
import { AccountModalComponent } from '../auth/account-modal/account-modal.component';
import { AuthService } from '../auth/auth.service';
import { NotificationService, Notification } from '../services/notification.service';

@Component({
  selector: 'app-navbar',
  standalone: false,
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit {
  @ViewChild(AccountModalComponent) accountModal!: AccountModalComponent;
  @ViewChild('inputElement') inputElement: any;

  faBars = faBars;
  faClose = faClose;
  faHome = faHome;
  faBook = faBook;
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

  showAccountModal: boolean = false;

  // Notification related
  notifications: (Notification & { removing?: boolean })[] = [];
  showNotificationsDropdown: boolean = false;
  unreadCount: number = 0;

  // Add these properties to track active states
  isOrdersActive: boolean = false;
  isAccountActive: boolean = false;

  isDarkMode: boolean = false; // Track dark mode state

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

  openAccountModal(): void {
    this.accountModal.openModal();
    this.showAccountModal = true;
    this.isAccountActive = true;
    this.cdr.markForCheck();
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

  constructor(
    private router: Router,
    private dataService: DataService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnInit(): void {
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

    this.authService.user$.subscribe((user) => {
      this.isLoggedIn = !!user;
      this.isAdmin = user?.email === 'admin@example.com';

      if (user) {
        this.authService.loadUserData(user.id);

        // Load orders explicitly on user login to update orderCount
        this.dataService.loadOrders(user.id).subscribe();

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
          this.notifications = notifications;
          this.unreadCount = notifications.filter(n => !n.read).length;
          this.cdr.markForCheck();
        });

        // Load notifications initially
        this.notificationService.refreshNotifications(user.id);

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
    });
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
      if (!user) return;
      this.notificationService.markAsRead(user.id, notification._id).subscribe(() => {
        notification.read = true;
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        this.cdr.markForCheck();
      });
    }).unsubscribe();
  }

  deleteNotification(notification: Notification): void {
    this.authService.user$.subscribe(user => {
      if (!user) return;
      this.notificationService.deleteNotification(user.id, notification._id).subscribe(() => {
        // Remove the notification from the local array
        this.notifications = this.notifications.filter(n => n._id !== notification._id);
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        this.cdr.markForCheck();
      });
    }).unsubscribe();
  }

  onSearch(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/research'], { queryParams: { q: this.searchQuery.trim() } });
      this.searchResults = []; // إخفاء الاقتراحات بعد تنفيذ البحث
    }
  }

  selectSuggestion(productName: string): void {
    this.searchQuery = productName;
    this.searchResults = [];
    this.onSearch(); // تنفيذ البحث تلقائيًا
  }

  onSearchKeyup(): void {
    if (this.searchQuery.trim()) {
      // تصفية الكتب بناءً على النص المدخل
      this.searchResults = this.allBooks.filter((book) =>
        book.product_name.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    } else {
      this.searchResults = []; // إذا كان النص فارغًا، إخفاء النتائج
    }
  }

  // دالة التعامل مع الضغط على Enter
  onEnterPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch(); // استدعاء دالة البحث عند الضغط على Enter
      this.searchResults = []; // إخفاء الاقتراحات بعد الضغط على Enter
      this.inputElement.nativeElement.blur(); // إزالة التركيز من حقل البحث بعد الضغط على Enter
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

  // Add a method to handle account modal close event
  onAccountModalClose(): void {
    this.closeAccountModal();
    this.cdr.markForCheck();
  }

  onAccountModalClosed(): void {
    this.isOrdersActive = false;
    this.closeAccountModal();
    this.cdr.markForCheck();
  }
}
