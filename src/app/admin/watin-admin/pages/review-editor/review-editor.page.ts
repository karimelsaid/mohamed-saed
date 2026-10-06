import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WatinAdminService } from '../../data-access/watin-admin.service';

@Component({
  selector: 'app-watin-review-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="page-container p-4 pb-5">
      <div *ngIf="isLoading" class="alert alert-info">جاري تحميل المحاضرة...</div>
      <div *ngIf="error" class="alert alert-danger">{{ error }}</div>

      <ng-container *ngIf="!isLoading && lecture">
        
        <!-- Header -->
        <div class="d-flex justify-content-between align-items-start border-bottom pb-3 mb-4 sticky-top bg-white pt-2 z-index-10">
          <div>
            <h2 class="mb-1">{{ lecture.title }}</h2>
            <p class="text-muted mb-0">
              <i class="fas fa-user-circle me-1"></i> {{ lecture.speakerId?.name?.ar }} |
              <i class="fas fa-clock me-1"></i> المدة: {{ formatDuration(lecture.audio?.durationSec) }}
            </p>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-outline-secondary" routerLink="../../transcription-center">
              <i class="fas fa-times"></i> إغلاق
            </button>
            <button class="btn btn-success" (click)="saveChanges(true)" [disabled]="isSaving">
              <i class="fas fa-check-double"></i> {{ isSaving ? 'جاري الحفظ...' : 'اعتماد ونشر التفريغ' }}
            </button>
            <button class="btn btn-primary" (click)="saveChanges(false)" [disabled]="isSaving">
              <i class="fas fa-save"></i> حفظ مسودة
            </button>
          </div>
        </div>

        <!-- Audio Player (Hidden) -->
        <audio #mainAudioPlayer [src]="lecture.audio?.url" (timeupdate)="onTimeUpdate()"></audio>

        <div class="row">
          <!-- Main Editor Column -->
          <div class="col-lg-8">
            
            <div class="alert alert-warning" *ngIf="!segments || segments.length === 0">
              لا توجد نتائج تفريغ لعرضها.
            </div>

            <div class="segment-card" *ngFor="let seg of segments; let i = index" 
                 [class.active-playing]="playingSegmentIndex === i"
                 [id]="'segment-' + i">
              
              <!-- Segment Header / Controls -->
              <div class="d-flex justify-content-between align-items-center mb-2 bg-light p-2 rounded">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-secondary">{{ formatDuration(seg.start) }} - {{ formatDuration(seg.end) }}</span>
                  <span class="badge bg-success" *ngIf="seg.isQuranMatch">
                    <i class="fas fa-book-open"></i> مطابقة قرآنية
                  </span>
                </div>
                
                <!-- Audio Controls for this segment -->
                <div class="audio-controls d-flex gap-2 align-items-center">
                  <select class="form-select form-select-sm w-auto" [(ngModel)]="playbackSpeed" (change)="updateSpeed()">
                    <option [ngValue]="0.5">0.5x</option>
                    <option [ngValue]="0.75">0.75x</option>
                    <option [ngValue]="1.0">1x</option>
                    <option [ngValue]="1.25">1.25x</option>
                    <option [ngValue]="1.5">1.5x</option>
                  </select>

                  <button class="btn btn-sm" [ngClass]="playingSegmentIndex === i ? 'btn-primary' : 'btn-outline-primary'" 
                          (click)="togglePlaySegment(i)">
                    <i class="fas" [ngClass]="playingSegmentIndex === i ? 'fa-pause' : 'fa-play'"></i> 
                    {{ playingSegmentIndex === i ? 'إيقاف' : 'استماع' }}
                  </button>
                </div>
              </div>

              <!-- Segment Text Area -->
              <textarea class="form-control segment-textarea" rows="3" [(ngModel)]="seg.text" dir="rtl"
                        [class.border-success]="seg.isQuranMatch"
                        [class.bg-light-success]="seg.isQuranMatch"></textarea>
              
              <div class="mt-1 text-muted small" *ngIf="seg.isQuranMatch">
                السورة: {{ seg.quranDetails?.surahName }} - الآية: {{ seg.quranDetails?.ayahNumber }}
              </div>
            </div>

          </div>

          <!-- Sidebar Information -->
          <div class="col-lg-4">
            <div class="card shadow-sm border-0 sticky-sidebar">
              <div class="card-body">
                <h5 class="card-title mb-3">تفاصيل المراجعة</h5>
                
                <div class="mb-3">
                  <label class="form-label text-muted small">حالة المراجعة</label>
                  <select class="form-select" [(ngModel)]="reviewStatus">
                    <option value="unreviewed">لم تراجع</option>
                    <option value="in_review">قيد المراجعة</option>
                    <option value="reviewed">تمت المراجعة (معتمدة)</option>
                  </select>
                </div>

                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" [(ngModel)]="transcriptPublic">
                  <label class="form-check-label">إتاحة التفريغ للجمهور</label>
                </div>

                <hr>

                <h6 class="mb-2">إحصائيات التفريغ</h6>
                <ul class="list-unstyled mb-0">
                  <li class="mb-1"><i class="fas fa-align-left text-muted me-2"></i> إجمالي المقاطع: {{ segments.length }}</li>
                  <li class="mb-1"><i class="fas fa-book-open text-success me-2"></i> الآيات المطابقة: {{ quranCount }}</li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .z-index-10 { z-index: 10; }
    .segment-card {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
      transition: all 0.2s ease;
    }
    .segment-card.active-playing {
      border-color: var(--primary-color, #1F3A2E);
      box-shadow: 0 0 0 2px rgba(31, 58, 46, 0.2);
    }
    .segment-textarea {
      font-size: 16px;
      line-height: 1.6;
      resize: vertical;
    }
    .bg-light-success {
      background-color: #f8fff9 !important;
    }
    .sticky-sidebar {
      position: sticky;
      top: 100px;
    }
  `]
})
export class ReviewEditorPage implements OnInit, OnDestroy {
  @ViewChild('mainAudioPlayer') audioPlayerRef!: ElementRef<HTMLAudioElement>;
  
  lectureId!: string;
  lecture: any = null;
  segments: any[] = [];
  
  isLoading = true;
  error = '';
  isSaving = false;

  reviewStatus = 'unreviewed';
  transcriptPublic = false;
  quranCount = 0;

  // Audio state
  playingSegmentIndex: number | null = null;
  playbackSpeed: number = 1.0;
  audioCheckInterval: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: WatinAdminService
  ) {}

  ngOnInit() {
    this.lectureId = this.route.snapshot.paramMap.get('id') || '';
    if (this.lectureId) {
      this.loadLecture();
    } else {
      this.error = 'معرف المحاضرة غير صالح';
      this.isLoading = false;
    }
  }

  ngOnDestroy() {
    this.stopAudio();
  }

  loadLecture() {
    this.api.getById('lectures', this.lectureId).subscribe({
      next: (res) => {
        if (res.success) {
          this.lecture = res.data;
          // In a real scenario we'd fetch the heavy transcription.results separately or it's included
          // We assume it's included for now or we could add a dedicated endpoint to get the transcript body.
          // Since our earlier GET /admin/lectures/:id populates mostly references, it should return transcription.
          // If the backend didn't send `transcription.results` because we excluded it in lists, `getById` should include it.
          // Let's assume `lecture.transcription.results` exists.
          
          this.segments = this.lecture.transcription?.results || [];
          this.reviewStatus = this.lecture.transcription?.reviewStatus || 'unreviewed';
          this.transcriptPublic = this.lecture.transcriptPublic || false;
          
          this.quranCount = this.segments.filter(s => s.isQuranMatch).length;
        } else {
          this.error = 'فشل جلب تفاصيل المحاضرة';
        }
        this.isLoading = false;
      },
      error: () => {
        this.error = 'حدث خطأ في الاتصال';
        this.isLoading = false;
      }
    });
  }

  formatDuration(seconds: number): string {
    if (!seconds && seconds !== 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return h + ':' + m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
    }
    return m + ':' + s.toString().padStart(2, '0');
  }

  // Audio Playback Logic
  togglePlaySegment(index: number) {
    const audio = this.audioPlayerRef?.nativeElement;
    if (!audio) return;

    // If currently playing the SAME segment, stop it
    if (this.playingSegmentIndex === index) {
      this.stopAudio();
      return;
    }

    // Play NEW segment
    this.playingSegmentIndex = index;
    const seg = this.segments[index];
    
    audio.currentTime = seg.start;
    audio.playbackRate = this.playbackSpeed;
    audio.play().catch(e => console.error("Audio play error", e));

    // Monitor time to auto-stop when segment ends
    if (this.audioCheckInterval) clearInterval(this.audioCheckInterval);
    
    this.audioCheckInterval = setInterval(() => {
      if (audio.currentTime >= seg.end) {
        this.stopAudio();
      }
    }, 100);
  }

  onTimeUpdate() {
    // We could use this to highlight words, but for now we just use the interval for stopping
  }

  updateSpeed() {
    const audio = this.audioPlayerRef?.nativeElement;
    if (audio) {
      audio.playbackRate = this.playbackSpeed;
    }
  }

  stopAudio() {
    const audio = this.audioPlayerRef?.nativeElement;
    if (audio) {
      audio.pause();
    }
    this.playingSegmentIndex = null;
    if (this.audioCheckInterval) clearInterval(this.audioCheckInterval);
  }

  // Save Logic
  saveChanges(approve: boolean) {
    this.isSaving = true;
    
    if (approve) {
      this.reviewStatus = 'reviewed';
      this.transcriptPublic = true;
    }

    // We send a patch to update the specific fields. 
    // This requires backend support for deep updates or sending the whole transcript.
    const payload = {
      'transcription.results': this.segments,
      'transcription.reviewStatus': this.reviewStatus,
      'transcriptPublic': this.transcriptPublic
    };

    this.api.patchEntity('lectures', this.lectureId, payload).subscribe({
      next: () => {
        this.isSaving = false;
        alert('تم حفظ التفريغ بنجاح');
        if (approve) {
          this.router.navigate(['../../transcription-center'], { relativeTo: this.route });
        }
      },
      error: () => {
        this.isSaving = false;
        alert('حدث خطأ أثناء حفظ التفريغ');
      }
    });
  }
}
