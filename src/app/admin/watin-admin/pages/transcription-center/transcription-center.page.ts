import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WatinAdminService } from '../../data-access/watin-admin.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-watin-transcription-center',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-container p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2>مركز التفريغ الصوتي (Transcription AI)</h2>
          <p class="text-muted mb-0">إدارة تفريغ المحاضرات باستخدام نماذج الذكاء الاصطناعي والمطابقة مع القرآن.</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-primary" (click)="loadLectures()"><i class="fas fa-sync-alt"></i> تحديث</button>
        </div>
      </div>

      <!-- Tabs -->
      <ul class="nav nav-tabs mb-4">
        <li class="nav-item">
          <a class="nav-link" [class.active]="activeTab === 'not_requested'" (click)="setTab('not_requested')" style="cursor: pointer;">
            في انتظار الطلب <span class="badge bg-secondary ms-1">{{ counts.not_requested }}</span>
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" [class.active]="activeTab === 'queue'" (click)="setTab('queue')" style="cursor: pointer;">
            طابور المعالجة <span class="badge bg-primary ms-1">{{ counts.queue }}</span>
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" [class.active]="activeTab === 'needs_review'" (click)="setTab('needs_review')" style="cursor: pointer;">
            بانتظار المراجعة <span class="badge bg-warning text-dark ms-1">{{ counts.needs_review }}</span>
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" [class.active]="activeTab === 'failed'" (click)="setTab('failed')" style="cursor: pointer;">
            الأخطاء <span class="badge bg-danger ms-1">{{ counts.failed }}</span>
          </a>
        </li>
      </ul>

      <div *ngIf="isLoading" class="alert alert-info">جاري التحميل...</div>

      <!-- List -->
      <div class="table-responsive bg-white rounded shadow-sm" *ngIf="!isLoading && displayedLectures.length > 0">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>المحاضرة</th>
              <th>المدة</th>
              <th>حالة الصوت</th>
              <th>تاريخ الإضافة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let lec of displayedLectures">
              <td>
                <strong>{{ lec.title }}</strong><br>
                <small class="text-muted">{{ lec.speakerId?.name?.ar }}</small>
              </td>
              <td>{{ formatDuration(lec.audio?.durationSec) }}</td>
              <td>
                <span *ngIf="lec.audio?.url" class="badge bg-success">متوفر</span>
                <span *ngIf="!lec.audio?.url" class="badge bg-danger">غير متوفر</span>
              </td>
              <td>{{ lec.createdAt | date:'shortDate' }}</td>
              <td>
                <!-- Action for Not Requested -->
                <button *ngIf="activeTab === 'not_requested'" class="btn btn-sm btn-primary" 
                        [disabled]="!lec.audio?.url || requestingId === lec._id"
                        (click)="requestTranscription(lec)">
                  <i class="fas fa-robot"></i> {{ requestingId === lec._id ? 'جاري الطلب...' : 'بدء التفريغ' }}
                </button>

                <!-- Status for Queue -->
                <div *ngIf="activeTab === 'queue'" class="d-flex align-items-center gap-2">
                  <div class="spinner-border spinner-border-sm text-primary" *ngIf="lec.transcription?.status === 'processing'"></div>
                  <span class="badge" [ngClass]="{'bg-primary': lec.transcription?.status === 'processing', 'bg-warning text-dark': lec.transcription?.status === 'pending'}">
                    {{ lec.transcription?.status === 'processing' ? 'جاري المعالجة' : 'في الانتظار' }}
                  </span>
                </div>

                <!-- Action for Needs Review -->
                <button *ngIf="activeTab === 'needs_review'" class="btn btn-sm btn-success" 
                        [routerLink]="['../review', lec._id]">
                  <i class="fas fa-edit"></i> مراجعة وتصحيح
                </button>

                <!-- Action for Failed -->
                <button *ngIf="activeTab === 'failed'" class="btn btn-sm btn-outline-danger" 
                        [disabled]="requestingId === lec._id"
                        (click)="requestTranscription(lec)">
                  <i class="fas fa-redo"></i> إعادة المحاولة
                </button>
                
                <small class="d-block text-danger mt-1" *ngIf="activeTab === 'failed' && lec.transcription?.error?.message">
                  {{ lec.transcription.error.message }}
                </small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="alert alert-warning" *ngIf="!isLoading && displayedLectures.length === 0">
        لا يوجد بيانات في هذه القائمة.
      </div>
    </div>
  `,
  styles: [`
    .nav-tabs .nav-link { color: #555; }
    .nav-tabs .nav-link.active { font-weight: bold; color: var(--primary-color, #1F3A2E); }
  `]
})
export class TranscriptionCenterPage implements OnInit {
  activeTab: 'not_requested' | 'queue' | 'needs_review' | 'failed' = 'not_requested';
  lectures: any[] = [];
  displayedLectures: any[] = [];
  
  isLoading = true;
  requestingId: string | null = null;

  counts = {
    not_requested: 0,
    queue: 0,
    needs_review: 0,
    failed: 0
  };

  constructor(private api: WatinAdminService) {}

  ngOnInit() {
    this.loadLectures();
  }

  setTab(tab: 'not_requested' | 'queue' | 'needs_review' | 'failed') {
    this.activeTab = tab;
    this.filterLectures();
  }

  loadLectures() {
    this.isLoading = true;
    this.api.getList('lectures', { pageSize: 300 }).subscribe({
      next: (res) => {
        if (res.success) {
          // Exclude archived. Note: in real app, query `status != archived`
          this.lectures = res.data.filter((l: any) => l.status !== 'archived');
          this.calculateCounts();
          this.filterLectures();
        }
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        alert('فشل جلب المحاضرات لمركز التفريغ');
      }
    });
  }

  calculateCounts() {
    this.counts.not_requested = this.lectures.filter(l => !l.transcription?.status || l.transcription?.status === 'not_requested').length;
    this.counts.queue = this.lectures.filter(l => ['pending', 'processing'].includes(l.transcription?.status)).length;
    this.counts.needs_review = this.lectures.filter(l => l.transcription?.status === 'completed' && l.transcription?.reviewStatus !== 'reviewed').length;
    this.counts.failed = this.lectures.filter(l => l.transcription?.status === 'failed').length;
  }

  filterLectures() {
    if (this.activeTab === 'not_requested') {
      this.displayedLectures = this.lectures.filter(l => !l.transcription?.status || l.transcription?.status === 'not_requested');
    } else if (this.activeTab === 'queue') {
      this.displayedLectures = this.lectures.filter(l => ['pending', 'processing'].includes(l.transcription?.status));
    } else if (this.activeTab === 'needs_review') {
      this.displayedLectures = this.lectures.filter(l => l.transcription?.status === 'completed' && l.transcription?.reviewStatus !== 'reviewed');
    } else {
      this.displayedLectures = this.lectures.filter(l => l.transcription?.status === 'failed');
    }
  }

  requestTranscription(lec: any) {
    if (!lec.audio?.url) {
      alert('لا يمكن تفريغ محاضرة لا تحتوي على ملف صوتي.');
      return;
    }
    this.requestingId = lec._id;
    this.api.requestTranscription(lec._id).subscribe({
      next: () => {
        // Optimistic update
        lec.transcription = lec.transcription || {};
        lec.transcription.status = 'pending';
        this.calculateCounts();
        this.filterLectures();
        this.requestingId = null;
      },
      error: () => {
        alert('حدث خطأ أثناء إرسال طلب التفريغ.');
        this.requestingId = null;
      }
    });
  }

  formatDuration(seconds: number): string {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + s.toString().padStart(2, '0');
  }
}
