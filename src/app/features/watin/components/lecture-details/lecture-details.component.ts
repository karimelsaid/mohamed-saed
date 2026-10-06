import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { WatinService, WatinLecture } from '../../services/watin.service';
import { Subscription } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

@Component({
  selector: 'app-watin-lecture-details',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- App Bar -->
    <header class="watin-app-bar">
      <button class="back-btn" (click)="goBack()"><i class="fas fa-arrow-right"></i></button>
      <div class="app-brand">
        <h2 class="page-title">تفاصيل المحاضرة</h2>
      </div>
      <div class="app-bar-icons">
        <button class="icon-btn"><i class="far fa-heart"></i></button>
      </div>
    </header>

    <div class="loading-state" *ngIf="isLoading">
      <i class="fas fa-spinner fa-spin"></i> جاري التحميل...
    </div>

    <div class="error-state" *ngIf="errorMessage">
      <i class="fas fa-exclamation-triangle"></i> {{ errorMessage }}
      <button class="btn-primary" (click)="goBack()">العودة</button>
    </div>

    <div class="page-content" *ngIf="lecture && !isLoading">
      <!-- Header Info -->
      <div class="lecture-header">
        <h1 class="lecture-title">{{ lecture.title }}</h1>
        <p class="lecture-speaker">
          <i class="fas fa-user-circle"></i> 
          {{ lecture.speaker?.name }} {{ lecture.speaker?.title }}
        </p>
        
        <div class="tags-container">
          <span class="tag" *ngFor="let cat of lecture.categories">{{ cat.name }}</span>
        </div>
        
        <div class="stats-container">
          <span class="stat"><i class="far fa-clock"></i> {{ lecture.duration }}</span>
          <span class="stat"><i class="far fa-calendar-alt"></i> {{ lecture.publishedAt | date:'yyyy/MM/dd' }}</span>
        </div>
      </div>

      <!-- Audio Player -->
      <div class="audio-player-container">
        <div class="audio-controls-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h4 style="margin:0; color: var(--watin-forest);">استمع للمحاضرة</h4>
          <button class="btn-primary" style="margin-top:0; padding: 6px 15px; font-size: 13px; border-radius: 20px; background-color: var(--watin-olive);" 
                  (click)="downloadAudio()" 
                  [disabled]="isDownloading || isDownloaded || !lecture.audioUrl">
            <i class="fas fa-spinner fa-spin" *ngIf="isDownloading"></i>
            <i class="fas fa-check-circle" *ngIf="isDownloaded"></i>
            <i class="fas fa-download" *ngIf="!isDownloading && !isDownloaded"></i>
            {{ isDownloaded ? 'محمّل محلياً' : (isDownloading ? 'جاري التحميل...' : 'تحميل بدون إنترنت') }}
          </button>
        </div>
        <audio #audioPlayer controls class="w-100" (timeupdate)="onTimeUpdate()" [src]="localAudioUrl || lecture.audioUrl || 'assets/audio/placeholder.mp3'">
          متصفحك لا يدعم مشغل الصوت.
        </audio>
      </div>

      <!-- Transcript Section -->
      <div class="transcript-section">
        <div class="section-header">
          <h3><i class="fas fa-file-alt"></i> التفريغ النصي</h3>
          <span class="status-badge" *ngIf="!lecture.transcript">
            <i class="fas fa-spinner fa-spin" *ngIf="lecture.transcriptionStatus === 'processing'"></i>
            <i class="fas fa-clock" *ngIf="lecture.transcriptionStatus === 'pending'"></i>
            {{ getStatusLabel(lecture.transcriptionStatus) }}
          </span>
        </div>

        <div class="transcript-content" *ngIf="lecture.transcript">
          <div class="transcript-stats">
            <span class="stat-badge"><i class="fas fa-list"></i> {{ lecture.transcript.totalSegments }} مقطع</span>
            <span class="stat-badge quran-badge"><i class="fas fa-quran"></i> {{ lecture.transcript.quranSegments }} آية</span>
          </div>

          <div class="segments-container">
            <div *ngFor="let seg of lecture.transcript.results; let i = index" 
                 class="segment-item" 
                 [class.active]="isSegmentActive(seg.start, seg.end)"
                 [class.quran-segment]="seg.type === 'quran'"
                 (click)="seekTo(seg.start)">
              
              <div class="segment-time">{{ formatTime(seg.start) }}</div>
              
              <div class="segment-body">
                <p class="segment-text" [class.quran-text]="seg.type === 'quran'">{{ seg.text }}</p>
                
                <div class="match-info" *ngIf="seg.match">
                  <span class="surah-tag"><i class="fas fa-bookmark"></i> سورة {{ seg.match.surah_name }} - آية {{ seg.match.ayah_number }}</span>
                  <span class="confidence-tag" [class.high]="seg.match.confidence >= 90"><i class="fas fa-check-circle"></i> {{ seg.match.confidence }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="empty-transcript" *ngIf="!lecture.transcript && lecture.transcriptionStatus === 'not_requested'">
          <i class="fas fa-microphone-slash"></i>
          <p>هذه المحاضرة لم يتم تفريغها بعد.</p>
        </div>
      </div>
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
    .back-btn, .icon-btn {
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
      padding-bottom: 80px;
      max-width: 800px;
      margin: 0 auto;
    }
    .loading-state, .error-state {
      text-align: center;
      padding: 50px 20px;
      color: var(--watin-sage);
      font-size: 16px;
    }
    .error-state {
      color: var(--watin-warn, #d32f2f);
    }
    .btn-primary {
      background-color: var(--watin-forest);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-family: inherit;
      font-weight: 600;
      margin-top: 15px;
      cursor: pointer;
    }
    
    .lecture-header {
      background: white;
      padding: 25px 20px;
      border-radius: 16px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.03);
      margin-bottom: 20px;
      text-align: center;
    }
    .lecture-title {
      font-size: 22px;
      color: var(--watin-forest);
      margin: 0 0 10px 0;
      font-weight: 800;
    }
    .lecture-speaker {
      font-size: 16px;
      color: var(--watin-text);
      margin: 0 0 15px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .lecture-speaker i {
      color: var(--watin-olive);
    }
    
    .tags-container, .stats-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-bottom: 12px;
    }
    .tag {
      background-color: var(--watin-cream);
      color: var(--watin-olive);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .stat {
      color: var(--watin-sage);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .audio-player-container {
      background: white;
      padding: 15px;
      border-radius: 16px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.03);
      margin-bottom: 25px;
    }
    .w-100 {
      width: 100%;
      height: 40px;
    }
    
    .transcript-section {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.03);
      padding: 20px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--watin-cream);
      padding-bottom: 15px;
      margin-bottom: 15px;
    }
    .section-header h3 {
      margin: 0;
      color: var(--watin-forest);
      font-size: 18px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-badge {
      background: rgba(168, 120, 46, 0.1);
      color: var(--watin-warn, #A8782E);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .transcript-stats {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .stat-badge {
      background: var(--watin-surface);
      border: 1px solid var(--watin-cream);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      color: var(--watin-text);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .quran-badge {
      background: rgba(79, 122, 90, 0.05);
      border-color: rgba(79, 122, 90, 0.2);
      color: var(--watin-forest);
    }
    
    .segments-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .segment-item {
      display: flex;
      gap: 15px;
      padding: 12px;
      border-radius: 12px;
      background: var(--watin-surface);
      border-right: 3px solid transparent;
      cursor: pointer;
      transition: all 0.3s;
    }
    .segment-item:hover {
      background: var(--watin-cream);
    }
    .segment-item.active {
      background: var(--watin-cream);
      border-right-color: var(--watin-forest);
    }
    .segment-item.quran-segment {
      background: #fdfdfa;
      border: 1px solid rgba(168, 120, 46, 0.2);
    }
    .segment-item.quran-segment.active {
      border-right: 3px solid var(--watin-olive);
      background: #faf7f2;
    }
    
    .segment-time {
      font-family: monospace;
      font-size: 12px;
      color: var(--watin-sage);
      padding-top: 4px;
      min-width: 45px;
    }
    .segment-body {
      flex: 1;
    }
    .segment-text {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
      color: var(--watin-text);
    }
    .quran-text {
      color: var(--watin-forest);
      font-family: 'Amiri', 'Traditional Arabic', serif;
      font-size: 18px;
      font-weight: bold;
    }
    
    .match-info {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .surah-tag, .confidence-tag {
      font-size: 11px;
      background: rgba(168, 120, 46, 0.1);
      color: var(--watin-olive);
      padding: 3px 8px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .confidence-tag.high {
      background: rgba(79, 122, 90, 0.1);
      color: var(--watin-forest);
    }
    
    .empty-transcript {
      text-align: center;
      padding: 40px 20px;
      color: var(--watin-sage);
    }
    .empty-transcript i {
      font-size: 32px;
      margin-bottom: 10px;
      opacity: 0.5;
    }
  `]
})
export class LectureDetailsComponent implements OnInit, OnDestroy {
  lecture: any = null;
  isLoading = true;
  errorMessage = '';
  private sub?: Subscription;
  
  currentTime = 0;
  isDownloaded = false;
  isDownloading = false;
  localAudioUrl = '';
  
  @ViewChild('audioPlayer') audioPlayer!: ElementRef<HTMLAudioElement>;

  constructor(
    private watinService: WatinService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.sub = this.route.paramMap.subscribe(params => {
      const slug = params.get('slug');
      if (slug) {
        this.loadLecture(slug);
      }
    });
  }

  loadLecture(slug: string) {
    this.isLoading = true;
    this.errorMessage = '';
    
    this.watinService.getLectureBySlug(slug).subscribe({
      next: (res) => {
        if (res.success) {
          this.lecture = res.data;
          this.checkIfDownloaded(this.lecture.slug);
        } else {
          this.errorMessage = res.message || 'فشل في تحميل المحاضرة';
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading lecture', err);
        this.errorMessage = 'حدث خطأ أثناء الاتصال بالخادم';
        this.isLoading = false;
      }
    });
  }

  onTimeUpdate() {
    if (this.audioPlayer) {
      this.currentTime = this.audioPlayer.nativeElement.currentTime;
    }
  }

  seekTo(seconds: number) {
    if (this.audioPlayer) {
      this.audioPlayer.nativeElement.currentTime = seconds;
      this.audioPlayer.nativeElement.play();
    }
  }

  isSegmentActive(start: number, end: number): boolean {
    return this.currentTime >= start && this.currentTime <= end;
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'مُفرَّغ';
      case 'processing': return 'قيد التفريغ...';
      case 'pending': return 'في الانتظار';
      default: return 'غير مفرَّغ';
    }
  }

  async checkIfDownloaded(slug: string) {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const path = `watin_lectures/${slug}.mp3`;
      await Filesystem.stat({ path, directory: Directory.Data });
      this.isDownloaded = true;
      const uriRes = await Filesystem.getUri({ path, directory: Directory.Data });
      this.localAudioUrl = Capacitor.convertFileSrc(uriRes.uri);
    } catch (e) {
      this.isDownloaded = false;
      this.localAudioUrl = '';
    }
  }

  async downloadAudio() {
    if (!this.lecture?.audioUrl || this.isDownloading) return;
    
    if (!Capacitor.isNativePlatform()) {
      window.open(this.lecture.audioUrl, '_blank');
      return;
    }
    
    this.isDownloading = true;
    try {
      // Ensure directory exists
      try {
        await Filesystem.mkdir({ path: 'watin_lectures', directory: Directory.Data, recursive: true });
      } catch (e) { /* Ignore if exists */ }

      const path = `watin_lectures/${this.lecture.slug}.mp3`;
      
      const res = await Filesystem.downloadFile({
        url: this.lecture.audioUrl,
        path: path,
        directory: Directory.Data
      });
      
      if (res.path) {
        this.isDownloaded = true;
        const uriRes = await Filesystem.getUri({ path, directory: Directory.Data });
        this.localAudioUrl = Capacitor.convertFileSrc(uriRes.uri);
        
        // Auto-reload audio src
        if (this.audioPlayer) {
          this.audioPlayer.nativeElement.load();
        }
      }
    } catch (e) {
      console.error('Download error:', e);
      alert('حدث خطأ أثناء تحميل الملف. تأكد من اتصالك بالإنترنت وتوفر مساحة.');
    } finally {
      this.isDownloading = false;
    }
  }

  goBack() {
    window.history.back();
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }
}
