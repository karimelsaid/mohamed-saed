import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WatinService, WatinLecture, WatinCategory } from '../../services/watin.service';

@Component({
  selector: 'app-watin-lectures',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <header class="watin-app-bar">
      <button class="back-btn" (click)="goBack()"><i class="fas fa-arrow-right"></i></button>
      <div class="app-brand">
        <h2 class="page-title">المحاضرات والتفريغ</h2>
      </div>
      <button class="action-header-btn" routerLink="/transcription"><i class="fas fa-plus"></i></button>
    </header>

    <div class="page-content">
      <!-- Search -->
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="ابحث عن محاضرة أو شيخ..." [(ngModel)]="searchQuery" (input)="onSearch()">
      </div>

      <!-- Filter Chips -->
      <div class="chips-container" *ngIf="categories.length">
        <button class="chip" [class.chip-active]="!activeCategoryId" (click)="setFilter('')">الكل</button>
        <button class="chip" *ngFor="let cat of categories" 
                [class.chip-active]="activeCategoryId === cat._id" 
                (click)="setFilter(cat._id)">{{ cat.name }}</button>
      </div>

      <div class="loading-state" *ngIf="isLoading">
        <i class="fas fa-spinner fa-spin"></i> جاري التحميل...
      </div>

      <!-- Lectures List -->
      <div class="lectures-list" *ngIf="!isLoading">
        <div class="empty-state" *ngIf="lectures.length === 0">
          <div class="empty-icon">
            <i class="fas fa-audio-description"></i>
          </div>
          <h3>لا توجد محاضرات حالياً</h3>
          <p *ngIf="searchQuery">لم يتم العثور على محاضرات مطابقة لـ "{{ searchQuery }}"</p>
          <p *ngIf="!searchQuery && activeCategoryId">لا توجد محاضرات في هذا القسم بعد</p>
          <p *ngIf="!searchQuery && !activeCategoryId">لم يتم نشر أي محاضرة بعد</p>
          <button class="btn-secondary" routerLink="/transcription">بدء تفريغ محاضرة</button>
        </div>
        <div class="lecture-card" *ngFor="let lec of lectures" [routerLink]="['/lectures', lec.slug]">
          <div class="lecture-body">
            <h3 class="lecture-title">{{ lec.title }}</h3>
            <p class="lecture-speaker">{{ lec.speaker?.name }} {{ lec.speaker?.title }}</p>
            <div class="lecture-meta">
              <span class="tag" *ngIf="lec.category">{{ lec.category.name }}</span>
              <span class="duration"><i class="far fa-clock"></i> {{ lec.duration }}</span>
              <span class="status-chip" [ngClass]="getTranscriptionStatusClass(lec.transcriptionStatus)">
                <i class="fas" [ngClass]="getTranscriptionStatusIcon(lec.transcriptionStatus)"></i>
                {{ getStatusLabel(lec.transcriptionStatus) }}
              </span>
            </div>
          </div>
          <button class="play-btn"><i class="fas fa-play"></i></button>
        </div>
      </div>

      <!-- FAB -->
      <button class="fab" routerLink="/transcription">
        <i class="fas fa-microphone-alt"></i>
      </button>
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
    .back-btn, .action-header-btn {
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
      text-align: center;
    }
    .page-content {
      padding: 20px;
      padding-bottom: 100px;
    }
    .loading-state, .empty-state {
      text-align: center;
      padding: 50px 20px;
      color: var(--watin-sage);
      font-size: 16px;
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
    .search-box {
      display: flex;
      align-items: center;
      background-color: var(--watin-surface);
      border-radius: 12px;
      padding: 5px 15px;
      border: 1px solid var(--watin-cream);
      margin-bottom: 15px;
    }
    .search-box i {
      color: var(--watin-sage);
      font-size: 14px;
    }
    .search-box input {
      flex: 1;
      border: none;
      background: transparent;
      padding: 10px;
      font-family: inherit;
      font-size: 14px;
      color: var(--watin-text);
      outline: none;
    }
    .search-box input::placeholder {
      color: var(--watin-sage);
    }
    .chips-container {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      overflow-x: auto;
      padding-bottom: 5px;
      scrollbar-width: none; /* Firefox */
    }
    .chips-container::-webkit-scrollbar {
      display: none; /* Chrome, Safari */
    }
    .chip {
      background-color: var(--watin-cream);
      color: var(--watin-olive);
      border: none;
      padding: 8px 14px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.3s;
      font-family: inherit;
    }
    .chip-active {
      background-color: var(--watin-forest);
      color: white;
    }
    .lectures-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
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
    }
    .lecture-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--watin-text);
      margin: 0 0 5px;
    }
    .lecture-speaker {
      font-size: 12px;
      color: var(--watin-text-2);
      margin: 0 0 10px;
    }
    .lecture-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      flex-wrap: wrap;
    }
    .tag {
      background-color: var(--watin-cream);
      color: var(--watin-olive);
      padding: 3px 10px;
      border-radius: 20px;
      font-weight: 600;
    }
    .duration {
      color: var(--watin-sage);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .status-chip {
      padding: 3px 8px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 10px;
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .status-chip.completed {
      background-color: rgba(79, 122, 90, 0.12);
      color: var(--watin-ok, #4F7A5A);
    }
    .status-chip.processing, .status-chip.pending {
      background-color: rgba(168, 120, 46, 0.12);
      color: var(--watin-warn, #A8782E);
    }
    .status-chip.not_requested {
      background-color: rgba(110, 124, 112, 0.1);
      color: var(--watin-sage);
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
      flex-shrink: 0;
      padding-right: 3px;
    }
    .fab {
      position: fixed;
      bottom: 85px;
      left: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--watin-forest);
      color: white;
      border: none;
      font-size: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(31, 58, 46, 0.35);
      z-index: 100;
    }
  `]
})
export class LecturesComponent implements OnInit {
  searchQuery = '';
  activeCategoryId = '';
  
  categories: WatinCategory[] = [];
  lectures: WatinLecture[] = [];
  isLoading = true;
  searchTimeout: any;

  constructor(
    private watinService: WatinService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['category']) {
        this.activeCategoryId = params['category'];
      }
      this.loadCategories();
      this.loadLectures();
    });
  }

  loadCategories() {
    this.watinService.getCategories().subscribe(res => {
      if (res.success) {
        this.categories = res.data;
      }
    });
  }

  loadLectures() {
    this.isLoading = true;
    const filters = {
      category: this.activeCategoryId || undefined,
      q: this.searchQuery || undefined
    };
    
    this.watinService.getLectures(filters).subscribe({
      next: (res) => {
        if (res.success) {
          this.lectures = res.data;
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load lectures', err);
        this.isLoading = false;
      }
    });
  }

  setFilter(categoryId: string) {
    this.activeCategoryId = categoryId;
    this.loadLectures();
  }

  onSearch() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.loadLectures();
    }, 500); // debounce 500ms
  }

  getTranscriptionStatusClass(status: string): string {
    if (['completed'].includes(status)) return 'completed';
    if (['processing', 'pending'].includes(status)) return 'processing';
    return 'not_requested';
  }

  getTranscriptionStatusIcon(status: string): string {
    if (['completed'].includes(status)) return 'fa-check-circle';
    if (['processing', 'pending'].includes(status)) return 'fa-spinner fa-spin';
    return 'fa-times-circle';
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'مُفرَّغ';
      case 'processing': return 'قيد التفريغ';
      case 'pending': return 'في الانتظار';
      default: return 'غير مفرَّغ';
    }
  }

  goBack() {
    window.history.back();
  }
}
