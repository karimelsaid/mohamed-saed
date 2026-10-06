import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WatinService } from '../../services/watin.service';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

@Component({
  selector: 'app-islamic-lessons',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <!-- App Bar -->
    <header class="watin-app-bar">
      <button class="back-btn" (click)="goBack()"><i class="fas fa-arrow-right"></i></button>
      <div class="app-brand">
        <h2 class="page-title">الدروس العلمية</h2>
      </div>
      <div class="app-bar-icons">
        <button class="icon-btn" (click)="toggleSearch()">
          <i class="fas" [class.fa-search]="!showSearch" [class.fa-times]="showSearch"></i>
        </button>
      </div>
    </header>

    <!-- Search Bar -->
    <div class="search-bar" *ngIf="showSearch">
      <div class="search-input-wrap">
        <i class="fas fa-search"></i>
        <input type="text" [(ngModel)]="searchQuery" (keyup.enter)="search()" placeholder="ابحث في الدروس العلمية..." autofocus>
        <button class="search-go" (click)="search()" [disabled]="!searchQuery.trim()">بحث</button>
      </div>
    </div>

    <!-- Source Badge -->
    <div class="source-badge">
      <img src="https://islamhouse.com/favicon.ico" alt="IslamHouse" class="source-icon" onerror="this.style.display='none'">
      <span>المصدر: <strong>IslamHouse.com</strong></span>
      <span class="total-badge" *ngIf="meta.total">{{ meta.total | number }} درس</span>
    </div>

    <!-- Quick Filters -->
    <div class="quick-filters">
      <div class="filter-group">
        <span class="filter-label">التصنيف:</span>
        <div class="filter-chips">
          <button class="chip" [class.active]="activeCategory === 'الكل'" (click)="setCategory('الكل')">الكل</button>
          <button class="chip" [class.active]="activeCategory === 'عقيدة'" (click)="setCategory('عقيدة')">عقيدة</button>
          <button class="chip" [class.active]="activeCategory === 'فقه'" (click)="setCategory('فقه')">فقه</button>
          <button class="chip" [class.active]="activeCategory === 'تفسير'" (click)="setCategory('تفسير')">تفسير</button>
          <button class="chip" [class.active]="activeCategory === 'حديث'" (click)="setCategory('حديث')">حديث</button>
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">المشايخ:</span>
        <div class="filter-chips">
          <button class="chip" [class.active]="activeSpeaker === 'الكل'" (click)="setSpeaker('الكل')">الكل</button>
          <button class="chip" [class.active]="activeSpeaker === 'ابن باز'" (click)="setSpeaker('ابن باز')">ابن باز</button>
          <button class="chip" [class.active]="activeSpeaker === 'ابن عثيمين'" (click)="setSpeaker('ابن عثيمين')">ابن عثيمين</button>
          <button class="chip" [class.active]="activeSpeaker === 'الألباني'" (click)="setSpeaker('الألباني')">الألباني</button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div class="loading-state" *ngIf="isLoading && lessons.length === 0">
      <i class="fas fa-spinner fa-spin"></i> {{ isSearchMode ? 'جاري البحث...' : 'جاري تحميل الدروس...' }}
    </div>

    <!-- Inline loading for filter changes -->
    <div class="inline-loading" *ngIf="isLoading && lessons.length > 0">
      <i class="fas fa-spinner fa-spin"></i> جاري تحديث النتائج...
    </div>

    <!-- Error -->
    <div class="error-state" *ngIf="errorMsg">
      <i class="fas fa-exclamation-triangle"></i> {{ errorMsg }}
      <button class="btn-retry" (click)="loadMore()">إعادة المحاولة</button>
    </div>

    <!-- Lessons List -->
    <div class="lessons-list" *ngIf="lessons.length > 0">
      <div class="lesson-card" *ngFor="let lesson of lessons; let i = index">
        <div class="lesson-number">{{ i + 1 }}</div>
        <div class="lesson-body">
          <h3 class="lesson-title">{{ lesson.title }}</h3>
          <p class="lesson-speaker" *ngIf="lesson.speaker">
            <i class="fas fa-user-tie"></i> {{ lesson.speaker }}
          </p>
          <p class="lesson-desc" *ngIf="lesson.description">{{ lesson.description | slice:0:120 }}{{ lesson.description?.length > 120 ? '...' : '' }}</p>
          <div class="lesson-meta">
            <span class="meta-tag" *ngIf="lesson.audioSize"><i class="fas fa-file-audio"></i> {{ lesson.audioSize }}</span>
            <span class="meta-tag" *ngIf="lesson.audioFormat"><i class="fas fa-music"></i> {{ lesson.audioFormat }}</span>
            <span class="meta-tag source-tag"><i class="fas fa-globe"></i> IslamHouse</span>
          </div>
        </div>
        <div class="lesson-actions">
          <!-- Play / Stream -->
          <button class="action-btn play-btn" (click)="playLesson(lesson)" [class.playing]="currentPlaying === lesson.externalId" *ngIf="lesson.audioUrl" title="تشغيل / إيقاف">
            <i class="fas" [class.fa-play]="currentPlaying !== lesson.externalId" [class.fa-pause]="currentPlaying === lesson.externalId"></i>
          </button>
          <!-- Download -->
          <button class="action-btn download-btn" (click)="downloadLesson(lesson)" [disabled]="lesson.downloading" *ngIf="lesson.audioUrl" title="تحميل الدرس">
            <i class="fas fa-spinner fa-spin" *ngIf="lesson.downloading"></i>
            <i class="fas fa-check" *ngIf="lesson.downloaded && !lesson.downloading"></i>
            <i class="fas fa-download" *ngIf="!lesson.downloaded && !lesson.downloading"></i>
          </button>
          <!-- Transcribe -->
          <button class="action-btn transcribe-btn" (click)="transcribeLesson(lesson)" *ngIf="lesson.audioUrl" title="تفريغ الدرس">
            <i class="fas fa-magic"></i>
          </button>
        </div>
      </div>

      <!-- Load More -->
      <div class="load-more" *ngIf="meta.hasMore">
        <button class="btn-load-more" (click)="loadMore()" [disabled]="isLoading">
          <i class="fas fa-spinner fa-spin" *ngIf="isLoading"></i>
          {{ isLoading ? 'جاري التحميل...' : 'تحميل المزيد' }}
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div class="empty-state" *ngIf="!isLoading && lessons.length === 0 && !errorMsg">
      <i class="fas fa-book-reader"></i>
      <p>{{ isSearchMode ? 'لم يتم العثور على دروس مطابقة للبحث' : 'لا توجد دروس حالياً' }}</p>
      <button class="btn-retry" style="margin-top: 15px;" (click)="loadMore()" *ngIf="isSearchMode && meta.hasMore">
        جلب المزيد من النتائج من الخادم
      </button>
    </div>

    <!-- Mini Audio Player -->
    <div class="mini-player" *ngIf="currentPlayingLesson">
      <div class="player-main">
        <div class="mini-player-info">
          <span class="mini-title">{{ currentPlayingLesson.title | slice:0:40 }}</span>
          <span class="mini-speaker">{{ currentPlayingLesson.speaker }}</span>
        </div>
        <div class="mini-controls">
          <button (click)="togglePlay()">
            <i class="fas" [class.fa-play]="audioPaused" [class.fa-pause]="!audioPaused"></i>
          </button>
          <button (click)="stopPlaying()"><i class="fas fa-stop"></i></button>
        </div>
      </div>
      
      <!-- Progress Bar -->
      <div class="player-progress-container" (click)="seekAudio($event)">
        <div class="player-progress-bg">
          <div class="player-progress-bar" [style.width.%]="audioProgress"></div>
        </div>
        <div class="player-time">
          <span>{{ formatTime(audioCurrentTime) }}</span>
          <span>{{ formatTime(audioDuration) }}</span>
        </div>
      </div>
      <audio #miniAudio [src]="currentPlayingLesson.localAudioUrl || currentPlayingLesson.audioUrl" (ended)="onAudioEnded()" (pause)="audioPaused=true" (play)="audioPaused=false" (timeupdate)="onTimeUpdate($event)" (loadedmetadata)="onLoadedMetadata($event)"></audio>
    </div>
  `,
  styles: [`
    .watin-app-bar {
      display: flex;
      align-items: center;
      padding: 15px 20px;
      background: linear-gradient(135deg, var(--watin-forest, #2D5016), var(--watin-olive, #6B8F3C));
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
      gap: 10px;
    }
    .back-btn, .icon-btn {
      background: rgba(255,255,255,0.15);
      border: none;
      color: white;
      font-size: 16px;
      cursor: pointer;
      padding: 10px;
      border-radius: 12px;
      transition: background 0.2s;
    }
    .back-btn:hover, .icon-btn:hover { background: rgba(255,255,255,0.25); }
    .page-title {
      color: white;
      font-size: 18px;
      font-weight: 700;
      margin: 0;
      flex: 1;
      text-align: center;
    }

    .search-bar {
      padding: 12px 16px;
      background: var(--watin-surface, #fff);
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .search-input-wrap {
      display: flex;
      align-items: center;
      background: var(--watin-bg, #F5F2ED);
      border-radius: 12px;
      padding: 0 12px;
      gap: 8px;
    }
    .search-input-wrap i { color: var(--watin-sage, #8B9A6B); font-size: 14px; }
    .search-input-wrap input {
      flex: 1;
      border: none;
      background: transparent;
      padding: 12px 0;
      font-family: inherit;
      font-size: 14px;
      color: var(--watin-text, #333);
      outline: none;
    }
    .search-go {
      background: var(--watin-forest, #2D5016);
      color: white;
      border: none;
      padding: 6px 14px;
      border-radius: 8px;
      font-family: inherit;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .search-go:disabled { opacity: 0.5; }

    .source-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: linear-gradient(135deg, rgba(107,143,60,0.08), rgba(45,80,22,0.05));
      border-bottom: 1px solid rgba(0,0,0,0.04);
      font-size: 13px;
      color: var(--watin-sage, #8B9A6B);
    }
    .source-icon { width: 16px; height: 16px; border-radius: 3px; }
    .total-badge {
      margin-right: auto;
      background: var(--watin-forest, #2D5016);
      color: white;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .quick-filters {
      padding: 10px 16px;
      background: var(--watin-surface, #fff);
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .filter-group:last-child { margin-bottom: 0; }
    .filter-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--watin-forest, #2D5016);
      white-space: nowrap;
    }
    .filter-chips {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
    }
    .filter-chips::-webkit-scrollbar { display: none; }
    .chip {
      background: var(--watin-bg, #F5F2ED);
      border: 1px solid transparent;
      color: var(--watin-text, #333);
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.2s;
    }
    .chip.active {
      background: rgba(107,143,60,0.1);
      border-color: var(--watin-olive, #6B8F3C);
      color: var(--watin-forest, #2D5016);
      font-weight: 600;
    }

    .loading-state, .error-state, .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--watin-sage, #8B9A6B);
      font-size: 16px;
    }
    .inline-loading {
      text-align: center;
      padding: 12px;
      color: var(--watin-olive, #6B8F3C);
      font-size: 14px;
      background: rgba(107,143,60,0.06);
      border-bottom: 1px solid rgba(0,0,0,0.04);
    }
    .error-state { color: #c62828; }
    .btn-retry {
      display: block;
      margin: 15px auto 0;
      background: var(--watin-forest, #2D5016);
      color: white;
      border: none;
      padding: 8px 20px;
      border-radius: 8px;
      font-family: inherit;
      cursor: pointer;
    }
    .empty-state i { font-size: 48px; opacity: 0.3; margin-bottom: 15px; display: block; }

    .lessons-list {
      padding: 12px 16px;
      padding-bottom: 140px;
    }

    .lesson-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: white;
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.04);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .lesson-card:active {
      transform: scale(0.98);
      box-shadow: 0 1px 6px rgba(0,0,0,0.08);
    }

    .lesson-number {
      min-width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--watin-forest, #2D5016), var(--watin-olive, #6B8F3C));
      color: white;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
    }

    .lesson-body { flex: 1; min-width: 0; }
    .lesson-title {
      margin: 0 0 6px 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--watin-forest, #2D5016);
      line-height: 1.5;
    }
    .lesson-speaker {
      margin: 0 0 6px 0;
      font-size: 13px;
      color: var(--watin-olive, #6B8F3C);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .lesson-desc {
      margin: 0 0 8px 0;
      font-size: 12px;
      color: var(--watin-sage, #8B9A6B);
      line-height: 1.6;
    }

    .lesson-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .meta-tag {
      background: var(--watin-bg, #F5F2ED);
      color: var(--watin-sage, #8B9A6B);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .source-tag {
      background: rgba(107,143,60,0.1);
      color: var(--watin-olive, #6B8F3C);
    }

    .lesson-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
    }
    .action-btn {
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .play-btn {
      background: linear-gradient(135deg, var(--watin-forest, #2D5016), var(--watin-olive, #6B8F3C));
      color: white;
    }
    .play-btn.playing { background: linear-gradient(135deg, #c62828, #e53935); }
    .download-btn {
      background: var(--watin-bg, #F5F2ED);
      color: var(--watin-olive, #6B8F3C);
    }
    .download-btn:disabled { opacity: 0.5; }
    .transcribe-btn {
      background: rgba(139, 154, 107, 0.15);
      color: var(--watin-forest, #2D5016);
    }


    .load-more {
      text-align: center;
      padding: 20px;
    }
    .btn-load-more {
      background: var(--watin-forest, #2D5016);
      color: white;
      border: none;
      padding: 12px 30px;
      border-radius: 12px;
      font-family: inherit;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn-load-more:disabled { opacity: 0.6; }

    /* Mini Player */
    .mini-player {
      position: fixed;
      bottom: 70px;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, var(--watin-forest, #2D5016), #1a3a0a);
      color: white;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 999;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.2);
    }
    .player-main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }
    .mini-player-info {
      flex: 1;
      min-width: 0;
      padding-right: 10px;
    }
    .mini-title {
      display: block;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mini-speaker {
      font-size: 11px;
      opacity: 0.7;
    }
    .mini-controls {
      display: flex;
      gap: 12px;
    }
    .mini-controls button {
      background: rgba(255,255,255,0.15);
      border: none;
      color: white;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 16px;
      transition: background 0.2s;
    }
    .mini-controls button:active { background: rgba(255,255,255,0.3); transform: scale(0.95); }
    
    .player-progress-container {
      width: 100%;
      cursor: pointer;
    }
    .player-progress-bg {
      width: 100%;
      height: 6px;
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
      overflow: hidden;
    }
    .player-progress-bar {
      height: 100%;
      background: var(--watin-sand, #E8DCC4);
      transition: width 0.1s linear;
    }
    .player-time {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      margin-top: 4px;
      opacity: 0.8;
      direction: ltr;
    }
  `]
})
export class IslamicLessonsComponent implements OnInit {
  allLessons: any[] = [];
  lessons: any[] = [];
  isLoading = false;
  errorMsg = '';
  searchQuery = '';
  showSearch = false;
  currentPage = 1;
  isSearchMode = false;
  meta: any = { total: 0, hasMore: false };
  activeCategory: string = 'الكل';
  activeSpeaker: string = 'الكل';

  currentPlaying: string | null = null;
  currentPlayingLesson: any = null;
  audioPaused = true;
  audioProgress = 0;
  audioCurrentTime = 0;
  audioDuration = 0;
  @ViewChild('miniAudio') miniAudioRef!: ElementRef<HTMLAudioElement>;
  private audioElement: HTMLAudioElement | null = null;

  constructor(private watinService: WatinService, private router: Router) {}

  ngOnInit() {
    this.loadLessons();
  }

  loadLessons() {
    this.isLoading = true;
    this.errorMsg = '';

    this.watinService.browseIslamHouse(this.currentPage).subscribe({
      next: (res) => {
        if (res.success) {
          this.allLessons = [...this.allLessons, ...res.data];
          this.meta = res.meta;
          this.applyFilters();
        } else {
          this.errorMsg = 'فشل في جلب الدروس';
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading lessons:', err);
        this.errorMsg = 'حدث خطأ في الاتصال بالخادم';
        this.isLoading = false;
      }
    });
  }

  loadMore() {
    this.currentPage++;
    this.loadLessons();
  }

  applyFilters() {
    let filtered = [...this.allLessons];
    
    // Text search
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      filtered = filtered.filter(l => 
        (l.title && l.title.toLowerCase().includes(q)) || 
        (l.description && l.description.toLowerCase().includes(q)) || 
        (l.speaker && l.speaker.toLowerCase().includes(q))
      );
    }
    
    // Category filter
    if (this.activeCategory !== 'الكل') {
      filtered = filtered.filter(l => 
        (l.title && l.title.includes(this.activeCategory)) || 
        (l.description && l.description.includes(this.activeCategory))
      );
    }
    
    // Speaker filter
    if (this.activeSpeaker !== 'الكل') {
      filtered = filtered.filter(l => 
        (l.speaker && l.speaker.includes(this.activeSpeaker)) ||
        (l.title && l.title.includes(this.activeSpeaker))
      );
    }
    
    this.lessons = filtered;
    this.isSearchMode = (this.searchQuery.trim() !== '' || this.activeCategory !== 'الكل' || this.activeSpeaker !== 'الكل');
  }

  toggleSearch() {
    this.showSearch = !this.showSearch;
    if (!this.showSearch && this.isSearchMode) {
      this.searchQuery = '';
      this.applyFilters();
    }
  }

  search() {
    this.applyFilters();
  }

  buildSearchQuery(): string {
    return '';
  }

  searchMore() {
    this.loadMore();
  }

  setCategory(cat: string) {
    this.activeCategory = cat;
    this.applyFilters();
  }

  setSpeaker(speaker: string) {
    this.activeSpeaker = speaker;
    this.applyFilters();
  }

  playLesson(lesson: any) {
    if (this.currentPlaying === lesson.externalId) {
      this.togglePlay();
      return;
    }

    this.stopPlaying();
    this.currentPlaying = lesson.externalId;
    this.currentPlayingLesson = lesson;

    setTimeout(() => {
      const audioEl = document.querySelector('.mini-player audio') as HTMLAudioElement;
      if (audioEl) {
        this.audioElement = audioEl;
        audioEl.play().catch(e => console.error('Play error:', e));
      }
    }, 100);
  }

  togglePlay() {
    if (this.audioElement) {
      if (this.audioElement.paused) {
        this.audioElement.play();
      } else {
        this.audioElement.pause();
      }
    }
  }

  stopPlaying() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    this.currentPlaying = null;
    this.currentPlayingLesson = null;
    this.audioElement = null;
    this.audioPaused = true;
  }

  onAudioEnded() {
    this.stopPlaying();
  }

  async downloadLesson(lesson: any) {
    if (!lesson.audioUrl || lesson.downloading) return;

    if (!Capacitor.isNativePlatform()) {
      window.open(lesson.audioUrl, '_blank');
      return;
    }

    lesson.downloading = true;
    try {
      try {
        await Filesystem.mkdir({ path: 'watin_islamhouse', directory: Directory.Data, recursive: true });
      } catch (e) { /* ignore */ }

      const filename = `ih_${lesson.externalId}.mp3`;
      await Filesystem.downloadFile({
        url: lesson.audioUrl,
        path: `watin_islamhouse/${filename}`,
        directory: Directory.Data
      });

      lesson.downloaded = true;
      const uri = await Filesystem.getUri({ path: `watin_islamhouse/${filename}`, directory: Directory.Data });
      lesson.localAudioUrl = Capacitor.convertFileSrc(uri.uri);
      alert('تم تحميل الدرس بنجاح، يمكنك الاستماع إليه بدون إنترنت الآن.');
    } catch (e) {
      console.error('Download error:', e);
      alert('فشل تحميل الملف. تأكد من اتصالك بالإنترنت وتوفر مساحة كافية.');
    } finally {
      lesson.downloading = false;
    }
  }

  onTimeUpdate(event: Event) {
    const audio = event.target as HTMLAudioElement;
    this.audioCurrentTime = audio.currentTime;
    if (audio.duration) {
      this.audioProgress = (audio.currentTime / audio.duration) * 100;
    }
  }

  onLoadedMetadata(event: Event) {
    const audio = event.target as HTMLAudioElement;
    this.audioDuration = audio.duration || 0;
  }

  seekAudio(event: MouseEvent) {
    if (!this.audioElement || !this.audioElement.duration) return;
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const ratio = clickX / rect.width;
    this.audioElement.currentTime = ratio * this.audioElement.duration;
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  transcribeLesson(lesson: any) {
    // Navigate to transcription page and pass the audio URL as a query param
    this.router.navigate(['/transcription'], { 
      queryParams: { 
        url: lesson.localAudioUrl || lesson.audioUrl,
        title: lesson.title
      }
    });
  }

  goBack() {
    window.history.back();
  }
}
