import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WatinService, HomeData } from '../../services/watin.service';
import { AuthService } from '../../../../auth/auth.service';
import { User } from '../../../../auth/user.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-watin-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- App Bar -->
    <header class="watin-app-bar">
      <div class="app-bar-icons">
        <button class="icon-btn" routerLink="/profile" *ngIf="user">
          <img [src]="user.profileImage || 'assets/default-avatar.png'" class="user-avatar" alt="User">
        </button>
        <button class="icon-btn" [routerLink]="['/login']" [queryParams]="{returnUrl: '/home'}" *ngIf="!user"><i class="fas fa-user-circle"></i></button>
      </div>
      <div class="app-brand">
        <img src="watin-logo.jpeg" alt="وتين" class="brand-logo">
      </div>
      <div class="app-bar-icons">
        <button class="icon-btn"><i class="far fa-bell"></i></button>
      </div>
    </header>

    <div class="home-content" *ngIf="homeData">
      <!-- Daily Verse Card -->
      <section class="daily-verse-card" *ngIf="homeData.dailyVerse">
        <div class="verse-content">
          <p class="verse-text">{{ homeData.dailyVerse.text }}</p>
          <p class="verse-ref">سورة {{ homeData.dailyVerse.surahName }}</p>
          <button class="btn-primary">استمر في رحلتك</button>
        </div>
      </section>

      <!-- App Categories Grid -->
      <section class="categories-section" *ngIf="homeData.categories?.length">
        <div class="section-header">
          <h2 class="section-title">أقسام التطبيق</h2>
          <a routerLink="/categories" class="see-all">عرض الكل <i class="fas fa-chevron-left"></i></a>
        </div>
        <div class="categories-grid">
          <div class="category-tile" *ngFor="let cat of homeData.categories" [routerLink]="['/lectures']" [queryParams]="{category: cat._id}">
            <div class="cat-icon" [style.backgroundColor]="cat.bgColor" [style.color]="cat.iconColor">
              <i [class]="cat.icon"></i>
            </div>
            <span>{{ cat.name }}</span>
          </div>
        </div>
      </section>

      <!-- Islamic Lessons Banner -->
      <section class="islamic-lessons-banner" routerLink="/islamic-lessons">
        <div class="banner-icon"><i class="fas fa-book-reader"></i></div>
        <div class="banner-text">
          <h3>الدروس العلمية</h3>
          <p>تصفح آلاف الدروس الشرعية من IslamHouse واستمع أو حمّل بدون إنترنت</p>
        </div>
        <i class="fas fa-chevron-left banner-arrow"></i>
      </section>

      <!-- Recently Added -->
      <section class="recent-section" *ngIf="homeData.latestLectures?.length">
        <h2 class="section-title">آخر ما أضيف</h2>
        <div class="lecture-card" *ngFor="let lec of homeData.latestLectures" [routerLink]="['/lectures', lec.slug]">
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
      </section>
    </div>

    <!-- Loading State -->
    <div class="loading-state" *ngIf="isLoading">
      <i class="fas fa-spinner fa-spin"></i> جاري التحميل...
    </div>

    <!-- Empty State -->
    <div class="empty-state" *ngIf="!isLoading && (!homeData || !homeData.categories?.length)">
      <div class="empty-icon">
        <i class="fas fa-folder-open"></i>
      </div>
      <h3>لا توجد بيانات حالياً</h3>
      <p>يبدو أن قاعدة بيانات Watin فارغة. يمكنك:</p>
      <ul class="empty-actions">
        <li>إضافة أقسام الدروس</li>
        <li>إضافة المتحدثين</li>
        <li>نشر الدروس المتاحة</li>
      </ul>
      <button class="btn-secondary" routerLink="/categories">إدارة الأقسام</button>
    </div>
  `,
  styles: [`
    .watin-app-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background-color: var(--watin-surface);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .app-brand {
      flex: 1;
      text-align: center;
    }
    .brand-logo {
      height: 40px;
      border-radius: 8px;
      object-fit: cover;
    }

    .icon-btn {
      background: none;
      border: none;
      color: var(--watin-forest);
      font-size: 20px;
      padding: 8px;
      cursor: pointer;
    }

    .home-content {
      padding: 20px;
    }

    .loading-state {
      text-align: center;
      padding: 50px 20px;
      color: var(--watin-sage);
      font-size: 16px;
    }

    .daily-verse-card {
      background: linear-gradient(135deg, var(--watin-forest) 0%, #152a21 100%);
      border-radius: 16px;
      padding: 30px 20px;
      text-align: center;
      color: white;
      margin-bottom: 30px;
      position: relative;
      overflow: hidden;
    }

    .daily-verse-card::before {
      content: '';
      position: absolute;
      top: 0; right: 0; bottom: 0; left: 0;
      background: url('data:image/svg+xml;utf8,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><path d="M50 0L100 50L50 100L0 50Z" fill="rgba(255,255,255,0.03)"/></svg>') repeat;
      opacity: 0.5;
    }

    .verse-content {
      position: relative;
      z-index: 1;
    }

    .verse-text {
      font-size: 22px;
      line-height: 1.6;
      margin-bottom: 10px;
      font-family: 'Amiri Quran', serif;
      color: var(--watin-sand);
    }
    
    .verse-ref {
      font-size: 14px;
      opacity: 0.8;
      margin-bottom: 20px;
    }

    .btn-primary {
      background-color: var(--watin-sand);
      color: var(--watin-forest);
      border: none;
      padding: 12px 24px;
      border-radius: 25px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--watin-forest);
      margin: 0;
    }
    
    .see-all {
      font-size: 13px;
      color: var(--watin-sand);
      text-decoration: none;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .categories-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }

    .category-tile {
      background-color: var(--watin-surface);
      border-radius: 16px;
      padding: 20px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 10px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
      transition: transform 0.2s;
    }

    .category-tile:active {
      transform: scale(0.96);
    }

    .cat-icon {
      width: 45px;
      height: 45px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .category-tile span {
      font-size: 12px;
      font-weight: 600;
      color: var(--watin-text);
      line-height: 1.4;
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
      margin-bottom: 12px;
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
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background-color: var(--watin-forest);
      color: white;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: pointer;
      padding-right: 4px;
    }
    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--watin-forest);
    }

    .islamic-lessons-banner {
      background: linear-gradient(135deg, var(--watin-forest), var(--watin-olive));
      border-radius: 16px;
      padding: 18px 16px;
      display: flex;
      align-items: center;
      gap: 14px;
      cursor: pointer;
      margin-bottom: 25px;
      box-shadow: 0 4px 15px rgba(45,80,22,0.2);
      transition: transform 0.2s;
    }
    .islamic-lessons-banner:active { transform: scale(0.98); }
    .banner-icon {
      width: 50px;
      height: 50px;
      background: rgba(255,255,255,0.15);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      color: white;
    }
    .banner-text {
      flex: 1;
    }
    .banner-text h3 {
      margin: 0 0 4px 0;
      font-size: 16px;
      font-weight: 700;
      color: white;
    }
    .banner-text p {
      margin: 0;
      font-size: 12px;
      color: rgba(255,255,255,0.8);
      line-height: 1.5;
    }
    .banner-arrow {
      color: rgba(255,255,255,0.6);
      font-size: 14px;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--watin-sage);
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
      margin: 0 0 20px 0;
      opacity: 0.8;
    }

    .empty-actions {
      text-align: right;
      margin: 0 0 30px 0;
      padding-right: 20px;
      font-size: 14px;
      line-height: 1.8;
    }

    .empty-actions li {
      margin-bottom: 8px;
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
  `]
})
export class HomeComponent implements OnInit, OnDestroy {
  homeData: HomeData | null = null;
  isLoading = true;
  user: User | null = null;
  private authSub?: Subscription;

  constructor(
    private watinService: WatinService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.authSub = this.authService.user$.subscribe(user => {
      this.user = user;
    });

    this.watinService.getHomeData().subscribe({
      next: (res) => {
        if (res.success) {
          this.homeData = res.data;
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load home data', err);
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    if (this.authSub) this.authSub.unsubscribe();
  }
}
