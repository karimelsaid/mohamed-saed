import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { AuthService } from '../../../../auth/auth.service';
import { User } from '../../../../auth/user.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-watin-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="profile-container">
      <div class="header">
        <button class="back-btn" (click)="goBack()">
          <i class="fas fa-arrow-right"></i>
        </button>
        <h2>الملف الشخصي</h2>
        <div style="width: 40px;"></div> <!-- Spacer -->
      </div>

      <div class="profile-content" *ngIf="user">
        <div class="avatar-section">
          <div class="avatar">
            <img *ngIf="user.profileImage" [src]="user.profileImage" alt="User Avatar">
            <i *ngIf="!user.profileImage" class="fas fa-user"></i>
          </div>
          <h3>{{ user.username || 'مستخدم وتين' }}</h3>
          <p class="email">{{ user.email }}</p>
        </div>

        <div class="info-section">
          <div class="info-row">
            <i class="fas fa-envelope icon"></i>
            <div class="info-text">
              <label>البريد الإلكتروني</label>
              <span>{{ user.email }}</span>
            </div>
          </div>
          <div class="info-row" *ngIf="user.phone">
            <i class="fas fa-phone icon"></i>
            <div class="info-text">
              <label>رقم الهاتف</label>
              <span>{{ user.phone }}</span>
            </div>
          </div>
        </div>

        <button class="logout-btn" (click)="logout()">
          تسجيل الخروج
        </button>
      </div>

      <div class="profile-content" *ngIf="!user">
        <div class="text-center p-4">
          <p>أنت غير مسجل الدخول</p>
          <button class="logout-btn mt-3" (click)="goBack()">عودة</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .profile-container {
      background-color: var(--watin-bg, #f5f8f6);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      background-color: var(--watin-surface, #ffffff);
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--watin-forest, #1F3A2E);
    }

    .back-btn {
      background: none;
      border: none;
      font-size: 20px;
      color: var(--watin-forest, #1F3A2E);
      cursor: pointer;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .profile-content {
      padding: 20px;
      flex: 1;
    }

    .avatar-section {
      text-align: center;
      margin-bottom: 30px;
    }

    .avatar {
      width: 100px;
      height: 100px;
      margin: 0 auto 15px;
      background: linear-gradient(135deg, var(--watin-forest, #1F3A2E) 0%, #152a21 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      color: white;
      border: 4px solid var(--watin-sand, #d4b886);
      overflow: hidden;
    }
    
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-section h3 {
      margin: 0 0 5px 0;
      font-size: 22px;
      color: var(--watin-forest, #1F3A2E);
    }

    .avatar-section .email {
      margin: 0;
      color: var(--watin-sage, #86a89c);
      font-size: 14px;
    }

    .info-section {
      background: var(--watin-surface, #ffffff);
      border-radius: 16px;
      padding: 15px;
      margin-bottom: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
    }

    .info-row {
      display: flex;
      align-items: center;
      padding: 15px 0;
      border-bottom: 1px solid var(--watin-cream, #eef3f0);
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .icon {
      width: 40px;
      height: 40px;
      background: var(--watin-cream, #eef3f0);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--watin-olive, #5c7065);
      font-size: 18px;
      margin-left: 15px;
    }

    .info-text {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .info-text label {
      font-size: 12px;
      color: var(--watin-sage, #86a89c);
      margin-bottom: 4px;
    }

    .info-text span {
      font-size: 15px;
      color: var(--watin-text, #333333);
      font-weight: 600;
    }

    .logout-btn {
      width: 100%;
      padding: 16px;
      background-color: transparent;
      border: 2px solid var(--watin-danger, #d32f2f);
      color: var(--watin-danger, #d32f2f);
      border-radius: 12px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .logout-btn:active {
      background-color: rgba(211, 47, 47, 0.1);
    }
  `]
})
export class WatinProfileComponent implements OnInit, OnDestroy {
  user: User | null = null;
  private authSub?: Subscription;

  constructor(
    private authService: AuthService,
    private location: Location
  ) {}

  ngOnInit() {
    this.authSub = this.authService.user$.subscribe(user => {
      this.user = user;
    });
  }

  goBack() {
    this.location.back();
  }

  logout() {
    this.authService.logout();
    window.location.href = '/';
  }

  ngOnDestroy() {
    if (this.authSub) this.authSub.unsubscribe();
  }
}
