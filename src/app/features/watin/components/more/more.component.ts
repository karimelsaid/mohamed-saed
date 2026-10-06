import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../../auth/auth.service';
import { User } from '../../../../auth/user.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-watin-more',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="more-container">
      <!-- User Profile Header -->
      <div class="profile-header" *ngIf="user" [routerLink]="['/profile']" style="cursor: pointer;">
        <div class="avatar">
          <img *ngIf="user.profileImage" [src]="user.profileImage" alt="User Avatar" class="w-100 h-100" style="border-radius: 50%; object-fit: cover;">
          <i *ngIf="!user.profileImage" class="fas fa-user"></i>
        </div>
        <div class="user-info">
          <h2>{{ user.username || 'مستخدم كنوز' }}</h2>
          <p class="dua">«اللهم اجعلنا من أهل العلم والعمل»</p>
        </div>
      </div>
      
      <div class="profile-header login-header" *ngIf="!user" [routerLink]="['/login']" [queryParams]="{returnUrl: '/home'}" style="cursor: pointer;">
        <div class="avatar">
          <i class="fas fa-sign-in-alt"></i>
        </div>
        <div class="user-info">
          <h2>تسجيل الدخول / إنشاء حساب</h2>
          <p class="dua">انضم إلينا لحفظ تقدمك ومحفوظاتك</p>
        </div>
      </div>

      <!-- Menu List -->
      <div class="menu-list">
        <!-- Kenouz Apps Section -->
        <div class="menu-section-title">تطبيقات كنوز (نظام متكامل)</div>
        <a class="menu-item app-item" href="https://knoozbook.com" target="_blank">
          <div class="app-icon knoozbook-icon">
            <i class="fas fa-book"></i>
          </div>
          <div class="app-info">
            <span class="app-name">KnoozBook</span>
            <span class="app-desc">منصة الكتب الإسلامية والمخطوطات</span>
          </div>
          <div class="app-actions">
            <i class="fab fa-google-play store-icon"></i>
            <i class="fab fa-apple store-icon"></i>
          </div>
        </a>

        <a class="menu-item app-item" href="https://knoozbook.com" target="_blank">
          <div class="app-icon mushaf-icon">
            <i class="fas fa-quran"></i>
          </div>
          <div class="app-info">
            <span class="app-name">مصحف ورد</span>
            <span class="app-desc">رفيقك اليومي للقرآن الكريم</span>
          </div>
          <div class="app-actions">
            <i class="fab fa-google-play store-icon"></i>
            <i class="fab fa-apple store-icon"></i>
          </div>
        </a>

        <div class="divider"></div>
        <div class="menu-section-title">إعدادات التطبيق</div>

        <button class="menu-item" [routerLink]="['/profile']" *ngIf="user">
          <div class="menu-icon"><i class="far fa-user-circle"></i></div>
          <span>الملف الشخصي</span>
          <i class="fas fa-chevron-left arrow"></i>
        </button>

        <button class="menu-item">
          <div class="menu-icon"><i class="far fa-bell"></i></div>
          <span>إعدادات التنبيهات</span>
          <i class="fas fa-chevron-left arrow"></i>
        </button>

        <div class="divider"></div>
        <div class="menu-section-title">أخرى</div>

        <button class="menu-item">
          <div class="menu-icon"><i class="fas fa-info-circle"></i></div>
          <span>حول التطبيق</span>
          <i class="fas fa-chevron-left arrow"></i>
        </button>

        <button class="menu-item">
          <div class="menu-icon"><i class="far fa-envelope"></i></div>
          <span>تواصل معنا</span>
          <i class="fas fa-chevron-left arrow"></i>
        </button>

        <button class="menu-item logout-btn" *ngIf="user" (click)="logout()">
          <div class="menu-icon"><i class="fas fa-sign-out-alt"></i></div>
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .more-container {
      background-color: var(--watin-bg);
      min-height: 100%;
    }
    
    .profile-header {
      background: linear-gradient(135deg, var(--watin-forest) 0%, #152a21 100%);
      padding: 40px 20px 30px;
      display: flex;
      align-items: center;
      gap: 20px;
      color: white;
      border-bottom-left-radius: 24px;
      border-bottom-right-radius: 24px;
      margin-bottom: 20px;
    }

    .avatar {
      width: 70px;
      height: 70px;
      border-radius: 50%;
      background-color: var(--watin-sand);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      color: white;
      border: 3px solid rgba(255,255,255,0.2);
    }

    .user-info h2 {
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 700;
    }

    .dua {
      margin: 0;
      font-size: 13px;
      color: rgba(255,255,255,0.8);
      font-style: italic;
    }

    .menu-list {
      padding: 0 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .menu-item {
      display: flex;
      align-items: center;
      background-color: var(--watin-surface);
      border: none;
      width: 100%;
      padding: 15px;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0,0,0,0.02);
      transition: background-color 0.2s;
    }

    .menu-item:active {
      background-color: var(--watin-cream);
    }

    .menu-icon {
      width: 35px;
      height: 35px;
      border-radius: 8px;
      background-color: var(--watin-cream);
      color: var(--watin-olive);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      margin-left: 15px;
    }

    .menu-item span {
      flex: 1;
      text-align: right;
      font-size: 15px;
      font-weight: 600;
      color: var(--watin-text);
    }

    .arrow {
      color: var(--watin-sage);
      font-size: 14px;
    }

    .divider {
      height: 1px;
      background-color: var(--watin-cream);
      margin: 10px 0;
    }

    .logout-btn span, .logout-btn .menu-icon {
      color: var(--watin-danger, #d32f2f);
    }
    
    .logout-btn .menu-icon {
      background-color: rgba(211, 47, 47, 0.1);
    }
    
    .menu-section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--watin-sage);
      margin: 5px 15px;
      padding-top: 5px;
    }

    .app-item {
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background: white;
    }
    .app-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 20px;
    }
    .knoozbook-icon {
      background: linear-gradient(135deg, #1f3a2e, #152a21);
    }
    .mushaf-icon {
      background: linear-gradient(135deg, #a8782e, #7c5720);
    }
    
    .app-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      text-align: right;
    }
    .app-name {
      font-size: 15px !important;
      font-weight: 700 !important;
      color: var(--watin-text) !important;
    }
    .app-desc {
      font-size: 11px;
      color: var(--watin-sage);
      margin-top: 2px;
    }
    .app-actions {
      display: flex;
      gap: 10px;
      color: var(--watin-olive);
      font-size: 16px;
    }
  `]
})
export class MoreComponent implements OnInit, OnDestroy {
  user: User | null = null;
  private authSub?: Subscription;

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.authSub = this.authService.user$.subscribe(user => {
      this.user = user;
    });
  }

  logout() {
    this.authService.logout();
    window.location.href = '/'; 
  }

  ngOnDestroy() {
    if (this.authSub) this.authSub.unsubscribe();
  }
}
