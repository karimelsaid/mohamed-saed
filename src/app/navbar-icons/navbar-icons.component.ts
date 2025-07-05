import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { faHeart, faFilePdf, faCartPlus, faClipboardList, faTachometerAlt, faBell, faTrash, faUser } from '@fortawesome/free-solid-svg-icons';
import { DataService } from '../services/data.service';
import { AuthService } from '../auth/auth.service';
import { NotificationService, Notification } from '../services/notification.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { SharedModule } from '../shared/shared.module';

@Component({
  selector: 'app-navbar-icons',
  standalone: true,
  imports: [CommonModule, RouterModule, FontAwesomeModule, SharedModule],
  templateUrl: './navbar-icons.component.html',
  styleUrls: ['./navbar-icons.component.css']
})
export class NavbarIconsComponent implements OnInit {
  @ViewChild('accountModal') accountModal!: any;


  faHeart = faHeart;
  faFilePdf = faFilePdf;
  faCartPlus = faCartPlus;
  faClipboardList = faClipboardList;
  faTachometerAlt = faTachometerAlt;
  faBell = faBell;
  faTrash = faTrash;
  faUser = faUser;

  isLoggedIn: boolean = false;
  favoritesCount: number = 0;
  cartCount: number = 0;
  orderCount: number = 0;
  isAdmin: boolean = false;

  notifications: (Notification & { removing?: boolean })[] = [];
  showNotificationsDropdown: boolean = false;
  unreadCount: number = 0;

  isOrdersActive: boolean = false;
  isAccountActive: boolean = false;
  showAccountModal: boolean = false;

  constructor(
    private router: Router,
    private dataService: DataService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.authService.user$.subscribe((user) => {
      this.isLoggedIn = !!user;
      this.isAdmin = user?.email === 'admin@example.com';

      if (user) {
        this.authService.loadUserData(user.id);

        this.dataService.loadOrders(user.id).subscribe();

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

        this.notificationService.refreshNotifications(user.id);

        this.router.events.subscribe((event) => {
          if (event instanceof NavigationEnd) {
            this.isOrdersActive = this.router.isActive('/requests', true);
            this.isAccountActive = this.showAccountModal;
            this.cdr.markForCheck();
          }
        });
      }
    });
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
        this.notifications = this.notifications.filter(n => n._id !== notification._id);
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        this.cdr.markForCheck();
      });
    }).unsubscribe();
  }

  openAccountModal(): void {
    this.accountModal.openModal();
    this.showAccountModal = true;
    this.isAccountActive = true;
    this.cdr.markForCheck();
  }
}
