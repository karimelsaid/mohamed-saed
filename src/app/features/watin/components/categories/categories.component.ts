import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WatinService, WatinCategory } from '../../services/watin.service';

@Component({
  selector: 'app-watin-categories',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header class="watin-app-bar">
      <button class="back-btn" (click)="goBack()"><i class="fas fa-arrow-right"></i></button>
      <h2 class="page-title">أقسام التطبيق</h2>
    </header>

    <div class="page-content">
      <div class="loading-state" *ngIf="isLoading">
        <i class="fas fa-spinner fa-spin"></i> جاري التحميل...
      </div>

      <ng-container *ngIf="!isLoading">
        <div class="category-row" *ngFor="let cat of categories" [routerLink]="['/lectures']" [queryParams]="{category: cat._id}">
          <div class="cat-icon-box" [style.backgroundColor]="cat.bgColor">
            <i [class]="cat.icon" [style.color]="cat.iconColor"></i>
          </div>
          <div class="cat-info">
            <h3>{{ cat.name }}</h3>
            <p>{{ cat.description }}</p>
          </div>
          <div class="cat-meta">
            <span class="count">{{ cat.lectureCount }} محاضرة</span>
            <i class="fas fa-chevron-left arrow"></i>
          </div>
        </div>

        <!-- Empty State -->
        <div class="empty-state" *ngIf="!categories || categories.length === 0">
          <div class="empty-icon">
            <i class="fas fa-folder-open"></i>
          </div>
          <h3>لا توجد أقسام حالياً</h3>
          <p>لم يتم إضافة أي أقسام بعد. يرجى إضافة أقسام الدروس للبدء.</p>
          <button class="btn-secondary" (click)="goBack()">العودة للرئيسية</button>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .watin-app-bar {
      display: flex;
      align-items: center;
      padding: 15px 20px;
      background-color: var(--watin-surface);
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: 0 2px 10px rgba(0,0,0,0.02);
      gap: 10px;
    }
    .back-btn {
      background: none;
      border: none;
      color: var(--watin-forest);
      font-size: 18px;
      cursor: pointer;
      padding: 8px;
    }
    .page-title {
      color: var(--watin-forest);
      font-size: 18px;
      font-weight: 700;
      margin: 0;
      flex: 1;
    }
    .page-content {
      padding: 20px;
    }
    .loading-state {
      text-align: center;
      padding: 50px 20px;
      color: var(--watin-sage);
      font-size: 16px;
    }
    .category-row {
      display: flex;
      align-items: center;
      background-color: var(--watin-surface);
      border-radius: 16px;
      padding: 18px 15px;
      margin-bottom: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.2s;
    }
    .category-row:active {
      transform: scale(0.98);
    }
    .cat-icon-box {
      width: 50px;
      height: 50px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      margin-left: 15px;
    }
    .cat-info {
      flex: 1;
    }
    .cat-info h3 {
      margin: 0 0 4px;
      font-size: 15px;
      font-weight: 700;
      color: var(--watin-text);
    }
    .cat-info p {
      margin: 0;
      font-size: 12px;
      color: var(--watin-text-2);
    }
    .cat-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
    }
    .count {
      font-size: 11px;
      background: var(--watin-cream);
      color: var(--watin-olive);
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
    }
    .arrow {
      color: var(--watin-sage);
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
      margin: 0 0 30px 0;
      opacity: 0.8;
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
export class CategoriesComponent implements OnInit {
  categories: WatinCategory[] = [];
  isLoading = true;

  constructor(private watinService: WatinService) {}

  ngOnInit() {
    this.watinService.getCategories().subscribe({
      next: (res) => {
        if (res.success) {
          this.categories = res.data;
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load categories', err);
        this.isLoading = false;
      }
    });
  }

  goBack() {
    window.history.back();
  }
}
