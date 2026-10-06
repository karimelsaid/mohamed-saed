import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WatinAdminService } from '../../data-access/watin-admin.service';

@Component({
  selector: 'app-watin-lectures',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="page-container p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>إدارة المحاضرات والصوتيات</h2>
        <button class="btn btn-primary" (click)="openModal()"><i class="fas fa-plus"></i> إضافة محاضرة</button>
      </div>

      <!-- Filters -->
      <div class="card mb-4 shadow-sm border-0">
        <div class="card-body d-flex gap-3 align-items-end flex-wrap">
          <div class="form-group flex-grow-1" style="min-width: 200px">
            <label class="form-label text-muted small">بحث بالاسم</label>
            <input type="text" class="form-control" placeholder="ابحث باسم المحاضرة..." [formControl]="searchControl">
          </div>
          <div class="form-group">
            <label class="form-label text-muted small">الشيخ</label>
            <select class="form-select" [formControl]="speakerFilterControl">
              <option value="">الكل</option>
              <option *ngFor="let s of speakersList" [value]="s._id">{{ s.name.ar }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label text-muted small">القسم</label>
            <select class="form-select" [formControl]="categoryFilterControl">
              <option value="">الكل</option>
              <option *ngFor="let c of categoriesList" [value]="c._id">{{ c.name.ar }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label text-muted small">حالة التفريغ</label>
            <select class="form-select" [formControl]="transcriptionFilterControl">
              <option value="">الكل</option>
              <option value="not_requested">غير مطلوب</option>
              <option value="pending">في الانتظار</option>
              <option value="processing">جاري التفريغ</option>
              <option value="completed">مكتمل</option>
              <option value="failed">فشل</option>
            </select>
          </div>
          <button class="btn btn-outline-secondary" (click)="loadLectures()">تصفية</button>
        </div>
      </div>

      <div *ngIf="isLoading" class="alert alert-info">جاري التحميل...</div>
      <div *ngIf="error" class="alert alert-danger">{{ error }}</div>

      <!-- Table -->
      <div class="table-responsive bg-white rounded shadow-sm" *ngIf="!isLoading && lectures.length > 0">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>عنوان المحاضرة</th>
              <th>الشيخ</th>
              <th>الأقسام</th>
              <th>ملف الصوت</th>
              <th>التفريغ</th>
              <th>النشر</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let lec of lectures">
              <td>
                <div class="d-flex flex-column">
                  <strong>{{ lec.title }}</strong>
                  <small class="text-muted text-truncate" style="max-width: 200px" *ngIf="lec.series">سلسلة: {{ lec.series }}</small>
                </div>
              </td>
              <td>{{ lec.speakerId?.name?.ar || 'غير محدد' }}</td>
              <td>
                <div class="d-flex flex-wrap gap-1">
                  <span class="badge bg-light text-dark border" *ngFor="let cat of lec.categoryIds">{{ cat.name?.ar }}</span>
                </div>
              </td>
              <td>
                <span *ngIf="lec.audio?.url" class="badge bg-success"><i class="fas fa-check"></i> متوفر ({{ formatDuration(lec.audio.durationSec) }})</span>
                <span *ngIf="!lec.audio?.url" class="badge bg-secondary">غير متوفر</span>
              </td>
              <td>
                <span class="badge" 
                  [ngClass]="{
                    'bg-success': lec.transcription?.status === 'completed',
                    'bg-primary': lec.transcription?.status === 'processing',
                    'bg-warning text-dark': lec.transcription?.status === 'pending',
                    'bg-danger': lec.transcription?.status === 'failed',
                    'bg-secondary': !lec.transcription?.status || lec.transcription?.status === 'not_requested'
                  }">
                  {{ getTranscriptionLabel(lec.transcription?.status) }}
                </span>
                <div *ngIf="lec.transcription?.status === 'completed'" class="mt-1">
                  <small class="text-muted" [ngClass]="{'text-success fw-bold': lec.transcription?.reviewStatus === 'reviewed'}">
                    <i class="fas fa-check-circle" *ngIf="lec.transcription?.reviewStatus === 'reviewed'"></i> 
                    {{ lec.transcription?.reviewStatus === 'reviewed' ? 'تمت المراجعة' : (lec.transcription?.reviewStatus === 'in_review' ? 'قيد المراجعة' : 'بانتظار المراجعة') }}
                  </small>
                </div>
              </td>
              <td>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" 
                    [checked]="lec.status === 'published'" 
                    (change)="togglePublish(lec, $event)">
                </div>
              </td>
              <td>
                <button class="btn btn-sm btn-outline-primary me-2" (click)="editLecture(lec)">تعديل</button>
                <button class="btn btn-sm btn-outline-danger" (click)="deleteLecture(lec)">أرشفة</button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <!-- Basic Pagination Info -->
        <div class="p-3 border-top text-muted small d-flex justify-content-between">
          <span>إجمالي: {{ totalLectures }}</span>
          <span>صفحة {{ page }}</span>
        </div>
      </div>

      <div class="alert alert-warning" *ngIf="!isLoading && lectures.length === 0 && !error">
        لا توجد محاضرات تطابق بحثك.
      </div>

      <!-- Simple Modal Overlay -->
      <div class="modal-overlay" *ngIf="isModalOpen">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="m-0">{{ editingId ? 'تعديل المحاضرة' : 'إضافة محاضرة جديدة' }}</h5>
            <button class="btn-close" (click)="closeModal()"></button>
          </div>
          <div class="modal-body" style="max-height: 75vh; overflow-y: auto;">
            <form [formGroup]="lectureForm" (ngSubmit)="saveLecture()">
              
              <div class="mb-3">
                <label class="form-label">عنوان المحاضرة <span class="text-danger">*</span></label>
                <input type="text" class="form-control" formControlName="title" dir="rtl">
              </div>

              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">الشيخ <span class="text-danger">*</span></label>
                  <select class="form-select" formControlName="speakerId">
                    <option value="">-- اختر الشيخ --</option>
                    <option *ngFor="let s of speakersList" [value]="s._id">{{ s.name.ar }}</option>
                  </select>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">السلسلة (اختياري)</label>
                  <input type="text" class="form-control" formControlName="series" dir="rtl">
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label">الأقسام المرتبطة</label>
                <select class="form-select" formControlName="categoryIds" multiple style="height: 100px;">
                  <option *ngFor="let c of categoriesList" [value]="c._id">{{ c.name.ar }}</option>
                </select>
                <small class="text-muted">اضغط CTRL / CMD لاختيار أكثر من قسم</small>
              </div>

              <div class="mb-3">
                <label class="form-label">القسم الرئيسي</label>
                <select class="form-select" formControlName="primaryCategoryId">
                  <option value="">-- اختر القسم الأساسي --</option>
                  <option *ngFor="let c of categoriesList" [value]="c._id">{{ c.name.ar }}</option>
                </select>
              </div>

              <div class="mb-3">
                <label class="form-label">الوصف القصير</label>
                <textarea class="form-control" rows="2" formControlName="description" dir="rtl"></textarea>
              </div>

              <div class="mb-3">
                <label class="form-label">الكلمات الدلالية (Tags)</label>
                <input type="text" class="form-control" formControlName="tags" placeholder="محاضرة, مؤثرة, دعوة (مفصولة بفاصلة)" dir="rtl">
              </div>

              <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary" [disabled]="lectureForm.invalid || isSaving">
                  {{ isSaving ? 'جاري الحفظ...' : 'حفظ' }}
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.5); z-index: 1050;
      display: flex; justify-content: center; align-items: center;
    }
    .modal-content {
      background: white; border-radius: 8px; width: 100%; max-width: 800px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #eee; }
    .modal-body { padding: 20px; }
    .btn-close { background: none; border: none; font-size: 20px; cursor: pointer; }
  `]
})
export class LecturesPage implements OnInit {
  lectures: any[] = [];
  speakersList: any[] = [];
  categoriesList: any[] = [];
  
  isLoading = true;
  error = '';
  page = 1;
  totalLectures = 0;

  isModalOpen = false;
  isSaving = false;
  editingId: string | null = null;
  lectureForm: FormGroup;

  // Filters using form controls from FormBuilder
  searchControl = this.fb.control('');
  speakerFilterControl = this.fb.control('');
  categoryFilterControl = this.fb.control('');
  transcriptionFilterControl = this.fb.control('');

  constructor(
    private api: WatinAdminService,
    private fb: FormBuilder
  ) {
    this.lectureForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      speakerId: ['', Validators.required],
      series: [''],
      categoryIds: [[]],
      primaryCategoryId: [''],
      tags: ['']
    });
  }

  ngOnInit() {
    this.loadDependencies();
    this.loadLectures();
  }

  loadDependencies() {
    this.api.getList('speakers', { pageSize: 500 }).subscribe(res => {
      if (res.success) this.speakersList = res.data;
    });
    this.api.getList('categories', { pageSize: 100 }).subscribe(res => {
      if (res.success) this.categoriesList = res.data;
    });
  }

  loadLectures() {
    this.isLoading = true;
    const query = {
      page: this.page,
      q: this.searchControl.value,
      speakerId: this.speakerFilterControl.value,
      categoryId: this.categoryFilterControl.value,
      transcriptionStatus: this.transcriptionFilterControl.value,
      status: { $ne: 'archived' } // exclude archived conceptually if backend doesn't
    };

    this.api.getList('lectures', query).subscribe({
      next: (res) => {
        if (res.success) {
          this.lectures = res.data;
          this.totalLectures = res.meta?.total || 0;
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'فشل جلب المحاضرات';
        this.isLoading = false;
      }
    });
  }

  openModal() {
    this.editingId = null;
    this.lectureForm.reset({ categoryIds: [] });
    this.isModalOpen = true;
  }

  editLecture(lec: any) {
    this.editingId = lec._id;
    this.lectureForm.patchValue({
      title: lec.title,
      description: lec.description || '',
      speakerId: lec.speakerId?._id || '',
      series: lec.series || '',
      categoryIds: lec.categoryIds?.map((c: any) => c._id) || [],
      primaryCategoryId: lec.primaryCategoryId?._id || '',
      tags: (lec.tags || []).join(', ')
    });
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  saveLecture() {
    if (this.lectureForm.invalid) return;
    this.isSaving = true;

    const v = this.lectureForm.value;
    const payload = {
      title: v.title,
      description: v.description,
      speakerId: v.speakerId,
      series: v.series,
      categoryIds: v.categoryIds,
      primaryCategoryId: v.primaryCategoryId || (v.categoryIds?.length ? v.categoryIds[0] : null),
      tags: v.tags ? v.tags.split(',').map((t: string) => t.trim()).filter((t:string) => t) : []
    };

    const request = this.editingId 
      ? this.api.updateEntity('lectures', this.editingId, payload)
      : this.api.createEntity('lectures', payload);

    request.subscribe({
      next: () => {
        this.isSaving = false;
        this.closeModal();
        this.loadLectures();
      },
      error: (err) => {
        alert(err.error?.message || 'خطأ أثناء الحفظ');
        this.isSaving = false;
      }
    });
  }

  togglePublish(lec: any, event: any) {
    const isChecked = event.target.checked;
    const action = isChecked ? 'publish' : 'unpublish';
    const url = `lectures/${lec._id}/${action}`;
    
    this.api.createEntity(url, {}).subscribe({
      next: () => {
        lec.status = isChecked ? 'published' : 'draft';
      },
      error: () => {
        event.target.checked = !isChecked;
        alert('فشل تغيير حالة النشر');
      }
    });
  }

  deleteLecture(lec: any) {
    if (!confirm('هل أنت متأكد من أرشفة هذه المحاضرة؟')) return;
    this.api.deleteEntity('lectures', lec._id).subscribe({
      next: () => this.loadLectures(),
      error: (err) => alert(err.error?.message || 'خطأ أثناء الحذف')
    });
  }

  formatDuration(seconds: number): string {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + s.toString().padStart(2, '0');
  }

  getTranscriptionLabel(status: string): string {
    const map: any = {
      not_requested: 'غير مطلوب',
      pending: 'في الانتظار',
      processing: 'جاري التفريغ',
      completed: 'مكتمل',
      failed: 'فشل'
    };
    return map[status] || 'غير مطلوب';
  }
}
