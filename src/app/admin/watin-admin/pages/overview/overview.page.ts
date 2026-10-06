import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WatinAdminService } from '../../data-access/watin-admin.service';

@Component({
  selector: 'app-watin-overview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="overview-container p-4">
      <h2 class="mb-4">نظرة عامة - إحصائيات وتين</h2>
      
      <div class="loading-state" *ngIf="isLoading">جاري تحميل الإحصائيات...</div>
      <div class="error-state" *ngIf="error">{{ error }}</div>

      <div class="stats-grid" *ngIf="!isLoading && stats">
        <div class="stat-card">
          <i class="fas fa-file-audio"></i>
          <div class="stat-info">
            <span class="label">المحاضرات ({{ stats.lectures.total || 0 }})</span>
            <div class="sub-stats">
              <small class="text-success">منشور: {{ stats.lectures.published || 0 }}</small>
              <small class="text-warning">مسودة: {{ stats.lectures.draft || 0 }}</small>
            </div>
          </div>
        </div>

        <div class="stat-card">
          <i class="fas fa-users"></i>
          <div class="stat-info">
            <span class="label">المشايخ</span>
            <span class="value">{{ stats.speakers || 0 }}</span>
          </div>
        </div>

        <div class="stat-card">
          <i class="fas fa-folder"></i>
          <div class="stat-info">
            <span class="label">الأقسام</span>
            <span class="value">{{ stats.categories || 0 }}</span>
          </div>
        </div>

        <div class="stat-card">
          <i class="fas fa-align-right"></i>
          <div class="stat-info">
            <span class="label">المقاطع المفرغة</span>
            <span class="value">{{ stats.segments || 0 }}</span>
          </div>
        </div>

        <div class="stat-card">
          <i class="fas fa-robot"></i>
          <div class="stat-info">
            <span class="label">حالة التفريغ</span>
            <div class="sub-stats">
              <small class="text-success">مكتمل: {{ stats.transcription.completed || 0 }}</small>
              <small class="text-primary">جاري: {{ (stats.transcription.pending || 0) + (stats.transcription.processing || 0) }}</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
    }
    .stat-card {
      background: white;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 15px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .stat-card i {
      font-size: 30px;
      color: var(--primary-color, #1F3A2E);
    }
    .stat-info {
      display: flex;
      flex-direction: column;
    }
    .stat-info .label {
      font-size: 14px;
      color: #666;
    }
    .stat-info .value {
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }
    .sub-stats {
      display: flex;
      flex-direction: column;
      font-size: 12px;
      margin-top: 4px;
    }
    .text-success { color: #28a745; }
    .text-warning { color: #ffc107; }
    .text-primary { color: #007bff; }
  `]
})
export class OverviewPage implements OnInit {
  stats: any = null;
  isLoading = true;
  error = '';

  constructor(private watinAdminService: WatinAdminService) {}

  ngOnInit() {
    this.watinAdminService.getStats().subscribe({
      next: (res) => {
        if (res.success) {
          this.stats = res.data;
        } else {
          this.error = 'فشل في جلب البيانات';
        }
        this.isLoading = false;
      },
      error: () => {
        this.error = 'حدث خطأ في الاتصال بالسيرفر';
        this.isLoading = false;
      }
    });
  }
}
