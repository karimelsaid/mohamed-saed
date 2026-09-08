import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { YoutubeService, YouTubeVideo, YouTubeStats } from '../../services/youtube.service';

@Component({
  selector: 'app-youtube-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './youtube-manager.component.html',
  styleUrls: ['./youtube-manager.component.css']
})
export class YoutubeManagerComponent implements OnInit {
  videos: YouTubeVideo[] = [];
  stats: YouTubeStats = { total: 0, published: 0, scheduled: 0, processing: 0, failed: 0, draft: 0 };

  // Pagination
  currentPage = 1;
  totalPages = 1;
  pageSize = 10;

  // Filters
  statusFilter = 'all';

  // Loading states
  loading = false;
  creating = false;
  actionLoading: { [key: string]: boolean } = {};

  // Create/Edit form
  showCreateForm = false;
  editingVideo: YouTubeVideo | null = null;
  formData = {
    title: '',
    description: '',
    contentType: 'text_summary' as 'text_summary' | 'video_summary',
    sourceContent: '',
    tags: '',
    category: 'Education',
    privacy: 'public' as 'public' | 'unlisted' | 'private',
    scheduledAt: '',
    scheduleEnabled: false
  };

  // Schedule modal
  showScheduleModal = false;
  scheduleVideoId = '';
  scheduleDate = '';
  scheduleTime = '';

  // Toast notifications
  toasts: { message: string; type: 'success' | 'error' | 'info'; id: number }[] = [];
  private toastId = 0;

  // Delete confirmation
  showDeleteConfirm = false;
  deleteVideoId = '';
  deleteVideoTitle = '';

  // Categories
  categories = [
    'Education', 'Science & Technology', 'Entertainment',
    'People & Blogs', 'News & Politics', 'Howto & Style',
    'Film & Animation', 'Music', 'Gaming', 'Comedy'
  ];

  constructor(
    private youtubeService: YoutubeService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadVideos();
  }

  loadStats(): void {
    this.youtubeService.getStats().subscribe({
      next: (res) => {
        if (res.success) {
          this.stats = res.stats;
        }
      },
      error: (err) => console.error('Error loading stats:', err)
    });
  }

  loadVideos(): void {
    this.loading = true;
    this.youtubeService.getVideos(this.currentPage, this.pageSize, this.statusFilter).subscribe({
      next: (res) => {
        if (res.success) {
          this.videos = res.videos;
          this.totalPages = res.pagination.pages;
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading videos:', err);
        this.loading = false;
        this.showToast('خطأ في تحميل الفيديوهات', 'error');
      }
    });
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadVideos();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadVideos();
    }
  }

  openCreateForm(): void {
    this.editingVideo = null;
    this.resetForm();
    this.showCreateForm = true;
  }

  openEditForm(video: YouTubeVideo): void {
    this.editingVideo = video;
    this.formData = {
      title: video.title,
      description: video.description,
      contentType: video.contentType,
      sourceContent: video.sourceContent,
      tags: video.tags.join(', '),
      category: video.category,
      privacy: video.privacy,
      scheduledAt: video.scheduledAt ? new Date(video.scheduledAt).toISOString().slice(0, 16) : '',
      scheduleEnabled: !!video.scheduledAt
    };
    this.showCreateForm = true;
  }

  closeCreateForm(): void {
    this.showCreateForm = false;
    this.editingVideo = null;
    this.resetForm();
  }

  resetForm(): void {
    this.formData = {
      title: '',
      description: '',
      contentType: 'text_summary',
      sourceContent: '',
      tags: '',
      category: 'Education',
      privacy: 'public',
      scheduledAt: '',
      scheduleEnabled: false
    };
  }

  submitForm(): void {
    if (!this.formData.title.trim() || !this.formData.sourceContent.trim()) {
      this.showToast('العنوان والمحتوى المصدري مطلوبين', 'error');
      return;
    }

    this.creating = true;
    const payload: any = {
      title: this.formData.title,
      description: this.formData.description,
      contentType: this.formData.contentType,
      sourceContent: this.formData.sourceContent,
      tags: this.formData.tags.split(',').map(t => t.trim()).filter(t => t),
      category: this.formData.category,
      privacy: this.formData.privacy
    };

    if (this.formData.scheduleEnabled && this.formData.scheduledAt) {
      payload.scheduledAt = new Date(this.formData.scheduledAt).toISOString();
    }

    if (this.editingVideo) {
      this.youtubeService.updateVideo(this.editingVideo._id, payload).subscribe({
        next: (res) => {
          if (res.success) {
            this.showToast('تم تحديث الفيديو بنجاح', 'success');
            this.closeCreateForm();
            this.loadVideos();
            this.loadStats();
          }
          this.creating = false;
        },
        error: (err) => {
          this.showToast('خطأ في تحديث الفيديو', 'error');
          this.creating = false;
        }
      });
    } else {
      this.youtubeService.createVideo(payload).subscribe({
        next: (res) => {
          if (res.success) {
            this.showToast('تم إنشاء الفيديو بنجاح', 'success');
            this.closeCreateForm();
            this.loadVideos();
            this.loadStats();
          }
          this.creating = false;
        },
        error: (err) => {
          this.showToast('خطأ في إنشاء الفيديو', 'error');
          this.creating = false;
        }
      });
    }
  }

  publishNow(video: YouTubeVideo): void {
    this.actionLoading[video._id] = true;
    this.youtubeService.publishNow(video._id).subscribe({
      next: (res) => {
        if (res.success) {
          this.showToast('تم تفعيل عملية النشر', 'success');
          this.loadVideos();
          this.loadStats();
        } else {
          this.showToast(res.message || 'خطأ في النشر', 'error');
        }
        this.actionLoading[video._id] = false;
      },
      error: (err) => {
        this.showToast(err.error?.message || 'خطأ في النشر', 'error');
        this.actionLoading[video._id] = false;
      }
    });
  }

  openScheduleModal(video: YouTubeVideo): void {
    this.scheduleVideoId = video._id;
    this.scheduleDate = '';
    this.scheduleTime = '';
    if (video.scheduledAt) {
      const d = new Date(video.scheduledAt);
      this.scheduleDate = d.toISOString().slice(0, 10);
      this.scheduleTime = d.toISOString().slice(11, 16);
    }
    this.showScheduleModal = true;
  }

  confirmSchedule(): void {
    if (!this.scheduleDate || !this.scheduleTime) {
      this.showToast('يرجى تحديد التاريخ والوقت', 'error');
      return;
    }

    const scheduledAt = new Date(`${this.scheduleDate}T${this.scheduleTime}`).toISOString();
    this.actionLoading[this.scheduleVideoId] = true;
    this.showScheduleModal = false;

    this.youtubeService.scheduleVideo(this.scheduleVideoId, scheduledAt).subscribe({
      next: (res) => {
        if (res.success) {
          this.showToast(res.message || 'تم جدولة الفيديو', 'success');
          this.loadVideos();
          this.loadStats();
        }
        this.actionLoading[this.scheduleVideoId] = false;
      },
      error: (err) => {
        this.showToast(err.error?.message || 'خطأ في الجدولة', 'error');
        this.actionLoading[this.scheduleVideoId] = false;
      }
    });
  }

  retryVideo(video: YouTubeVideo): void {
    this.actionLoading[video._id] = true;
    this.youtubeService.retryVideo(video._id).subscribe({
      next: (res) => {
        if (res.success) {
          this.showToast('تم إعادة المحاولة', 'success');
          this.loadVideos();
          this.loadStats();
        }
        this.actionLoading[video._id] = false;
      },
      error: (err) => {
        this.showToast('خطأ في إعادة المحاولة', 'error');
        this.actionLoading[video._id] = false;
      }
    });
  }

  confirmDelete(video: YouTubeVideo): void {
    this.deleteVideoId = video._id;
    this.deleteVideoTitle = video.title;
    this.showDeleteConfirm = true;
  }

  deleteVideo(): void {
    this.actionLoading[this.deleteVideoId] = true;
    this.showDeleteConfirm = false;

    this.youtubeService.deleteVideo(this.deleteVideoId).subscribe({
      next: (res) => {
        if (res.success) {
          this.showToast('تم حذف الفيديو', 'success');
          this.loadVideos();
          this.loadStats();
        }
        this.actionLoading[this.deleteVideoId] = false;
      },
      error: (err) => {
        this.showToast('خطأ في حذف الفيديو', 'error');
        this.actionLoading[this.deleteVideoId] = false;
      }
    });
  }

  triggerWorkflow(video: YouTubeVideo): void {
    this.actionLoading[video._id] = true;
    this.youtubeService.triggerWorkflow(video._id, 'process').subscribe({
      next: (res) => {
        if (res.success) {
          this.showToast('تم تفعيل الـ Workflow', 'success');
          this.loadVideos();
        }
        this.actionLoading[video._id] = false;
      },
      error: (err) => {
        this.showToast('خطأ في تفعيل الـ Workflow', 'error');
        this.actionLoading[video._id] = false;
      }
    });
  }

  // Helper methods
  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'draft': 'مسودة',
      'processing': 'قيد المعالجة',
      'scheduled': 'مجدول',
      'uploading': 'جاري الرفع',
      'published': 'منشور',
      'failed': 'فشل'
    };
    return labels[status] || status;
  }

  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'draft': 'file-alt',
      'processing': 'spinner',
      'scheduled': 'clock',
      'uploading': 'cloud-upload-alt',
      'published': 'check-circle',
      'failed': 'exclamation-triangle'
    };
    return icons[status] || 'question';
  }

  getContentTypeLabel(type: string): string {
    return type === 'text_summary' ? 'ملخص نصي' : 'شرح فيديو';
  }

  getPrivacyLabel(privacy: string): string {
    const labels: { [key: string]: string } = {
      'public': 'عام',
      'unlisted': 'غير مدرج',
      'private': 'خاص'
    };
    return labels[privacy] || privacy;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  getTimeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  }

  showToast(message: string, type: 'success' | 'error' | 'info'): void {
    const id = ++this.toastId;
    this.toasts.push({ message, type, id });
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== id);
      this.cdr.detectChanges();
    }, 4000);
  }

  removeToast(id: number): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  get pagesArray(): number[] {
    const pages = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }
}
