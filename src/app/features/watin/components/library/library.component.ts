import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WatinService, WatinLecture } from '../../services/watin.service';
import { AuthService } from '../../../../auth/auth.service';
import { User } from '../../../../auth/user.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-watin-library',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header class="watin-app-bar">
      <div class="app-brand">
        <h2 class="page-title">مكتبتي</h2>
      </div>
    </header>

    <div class="page-content">
      <!-- Tabs -->
      <div class="tabs-container">
        <button class="tab-btn active">المحفوظات</button>
        <button class="tab-btn">تفريغاتي</button>
        <button class="tab-btn">ملاحظاتي</button>
      </div>

      <div class="loading-state" *ngIf="isLoading">
        <i class="fas fa-spinner fa-spin"></i> جاري التحميل...
      </div>

      <div class="empty-state" *ngIf="!isLoading && (!user || lectures.length === 0)">
        <div class="empty-icon">
          <i class="fas fa-folder-open"></i>
        </div>
        <h3 *ngIf="!user">المكتبة خاصة بالمستخدمين</h3>
        <h3 *ngIf="user">مكتبتك فارغة</h3>
        <p *ngIf="!user">قم بتسجيل الدخول لحفظ المحاضرات والرجوع إليها لاحقاً.</p>
        <p *ngIf="user">لم تقم بحفظ أي محاضرة بعد. تصفح المحاضرات واحفظ ما يعجبك.</p>
        <button class="btn-primary" *ngIf="!user" [routerLink]="['/login']" [queryParams]="{returnUrl: '/home'}">تسجيل الدخول</button>
        <button class="btn-secondary" *ngIf="user" routerLink="/lectures">تصفح المحاضرات</button>
      </div>

      <!-- Dynamic Content -->
      <div class="library-list" *ngIf="!isLoading && user && lectures.length > 0">
        <div class="lecture-card" *ngFor="let lec of lectures" [routerLink]="['/lectures', lec.slug]">
          <div class="lecture-info">
            <h3>{{ lec.title }}</h3>
            <p class="lecturer">{{ lec.speaker?.name }} {{ lec.speaker?.title }}</p>
            <div class="lecture-meta">
              <span class="tag" *ngIf="lec.category">{{ lec.category.name }}</span>
              <span class="duration"><i class="far fa-clock"></i> {{ lec.duration }}</span>
            </div>
          </div>
          <button class="play-btn"><i class="fas fa-play"></i></button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .watin-app-bar {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 15px 20px;
      background-color: var(--watin-surface);
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: 0 2px 10px rgba(0,0,0,0.02);
    }
    .page-title {
      color: var(--watin-forest);
      font-size: 20px;
      font-weight: 700;
      margin: 0;
    }
    .page-content {
      padding: 20px;
      padding-bottom: 80px;
    }
    .tabs-container {
      display: flex;
      gap: 10px;
      margin-bottom: 25px;
      overflow-x: auto;
      padding-bottom: 5px;
    }
    .tab-btn {
      background-color: var(--watin-cream);
      color: var(--watin-sage);
      border: none;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.3s;
    }
    .tab-btn.active {
      background-color: var(--watin-forest);
      color: white;
    }
    .loading-state, .empty-state {
      text-align: center;
      padding: 50px 20px;
      color: var(--watin-sage);
    }
    .empty-state i {
      font-size: 40px;
      opacity: 0.5;
      margin-bottom: 15px;
    }

    .empty-icon {
      font-size: 64px;
      margin-bottom: 20px;
      opacity: 0.5;
    }

    .empty-state h3 {
      font-size: 20px;
      font-weight: 700;
      color: var(--watin-forest);
      margin: 0 0 10px 0;
    }

    .empty-state p {
      font-size: 14px;
      margin: 0 0 30px 0;
      opacity: 0.8;
    }

    .btn-primary {
      background-color: var(--watin-forest);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 15px;
    }

    .btn-secondary {
      background-color: var(--watin-surface);
      color: var(--watin-forest);
      border: 2px solid var(--watin-forest);
      padding: 12px 24px;
      border-radius: 25px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-secondary:hover {
      background-color: var(--watin-forest);
      color: white;
    }
    .library-list {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    .lecture-card {
      background-color: var(--watin-surface);
      border-radius: 16px;
      padding: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .lecture-card:hover {
      background-color: #fdfdfa;
    }
    .lecture-info h3 {
      font-size: 14px;
      font-weight: 700;
      color: var(--watin-text);
      margin: 0 0 5px 0;
    }
    .lecturer {
      font-size: 12px;
      color: var(--watin-text-2);
      margin: 0 0 10px 0;
    }
    .lecture-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
    }
    .tag {
      background-color: var(--watin-cream);
      color: var(--watin-olive);
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 600;
    }
    .duration {
      color: var(--watin-sage);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .play-btn {
      width: 45px;
      height: 45px;
      border-radius: 50%;
      background-color: var(--watin-forest);
      color: white;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      cursor: pointer;
    }
  `]
})
export class LibraryComponent implements OnInit, OnDestroy {
  user: User | null = null;
  lectures: WatinLecture[] = [];
  isLoading = true;
  private authSub?: Subscription;

  constructor(
    private watinService: WatinService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.authSub = this.authService.user$.subscribe(user => {
      this.user = user;
      if (this.user) {
        this.loadLibrary();
      } else {
        this.isLoading = false;
        this.lectures = [];
      }
    });
  }

  loadLibrary() {
    this.isLoading = true;
    // Simulating library by fetching latest lectures for now
    this.watinService.getLectures({ limit: 5 }).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          // Just take a few to simulate a library list
          this.lectures = res.data.slice(0, 2);
        }
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    if (this.authSub) this.authSub.unsubscribe();
  }
}
