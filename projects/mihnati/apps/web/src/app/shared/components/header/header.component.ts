import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);

  selectedCountry = signal<string>('مصر');
  selectedCity = signal<string>('القاهرة');
  unreadNotificationsCount = signal<number>(0);
  cartCount = signal<number>(2);
  favoritesCount = signal<number>(0);
  isServerConnected = signal<boolean>(false);

  ngOnInit(): void {
    this.checkConnection();
    if (this.authService.isAuthenticated()) {
      this.loadNotifications();
    }
  }

  checkConnection(): void {
    this.apiService.getHealth().subscribe({
      next: () => this.isServerConnected.set(true),
      error: () => this.isServerConnected.set(false)
    });
  }

  loadNotifications(): void {
    this.apiService.getNotifications().subscribe({
      next: (res) => {
        const unread = res.data.filter((n) => !n.isRead).length;
        this.unreadNotificationsCount.set(unread);
      },
      error: () => {}
    });
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}
