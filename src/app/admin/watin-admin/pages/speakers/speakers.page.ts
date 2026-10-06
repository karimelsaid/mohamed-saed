import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WatinAdminService } from '../../data-access/watin-admin.service';

@Component({
  selector: 'app-watin-speakers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="page-container p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>إدارة المشايخ والعلماء</h2>
        <button class="btn btn-primary" (click)="openModal()"><i class="fas fa-plus"></i> إضافة شيخ</button>
      </div>

      <!-- Loading / Error -->
      <div *ngIf="isLoading" class="alert alert-info">جاري التحميل...</div>
      <div *ngIf="error" class="alert alert-danger">{{ error }}</div>

      <!-- Table -->
      <div class="table-responsive bg-white rounded shadow-sm" *ngIf="!isLoading && speakers.length > 0">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>الاسم</th>
              <th>اللقب</th>
              <th>المحاضرات</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let speaker of speakers">
              <td>
                <div class="d-flex align-items-center gap-2">
                  <div class="avatar-sm">
                    <img *ngIf="speaker.avatarUrl" [src]="speaker.avatarUrl" alt="Avatar">
                    <i *ngIf="!speaker.avatarUrl" class="fas fa-user-circle fs-3 text-secondary"></i>
                  </div>
                  <strong>{{ speaker.name.ar }}</strong>
                </div>
              </td>
              <td>{{ speaker.title || '-' }}</td>
              <td><span class="badge bg-secondary">{{ speaker.lectureCount }}</span></td>
              <td>
                <span class="badge" 
                  [ngClass]="{
                    'bg-success': speaker.status === 'published',
                    'bg-warning text-dark': speaker.status === 'draft',
                    'bg-danger': speaker.status === 'archived'
                  }">
                  {{ speaker.status === 'published' ? 'منشور' : (speaker.status === 'draft' ? 'مسودة' : 'مؤرشف') }}
                </span>
              </td>
              <td>
                <button class="btn btn-sm btn-outline-primary me-2" (click)="editSpeaker(speaker)">تعديل</button>
                <button class="btn btn-sm btn-outline-danger" (click)="deleteSpeaker(speaker)">أرشفة</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="alert alert-warning" *ngIf="!isLoading && speakers.length === 0 && !error">
        لا يوجد مشايخ حالياً.
      </div>

      <!-- Simple Modal Overlay -->
      <div class="modal-overlay" *ngIf="isModalOpen">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="m-0">{{ editingId ? 'تعديل الشيخ' : 'إضافة شيخ جديد' }}</h5>
            <button class="btn-close" (click)="closeModal()"></button>
          </div>
          <div class="modal-body">
            <form [formGroup]="speakerForm" (ngSubmit)="saveSpeaker()">
              
              <div class="mb-3">
                <label class="form-label">الاسم بالعربية <span class="text-danger">*</span></label>
                <input type="text" class="form-control" formControlName="nameAr" dir="rtl">
              </div>

              <div class="mb-3">
                <label class="form-label">الاسم بالإنجليزية (اختياري)</label>
                <input type="text" class="form-control" formControlName="nameEn" dir="ltr">
              </div>

              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">اللقب (مثل: د. أو الشيخ)</label>
                  <input type="text" class="form-control" formControlName="title" dir="rtl">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">الحالة</label>
                  <select class="form-select" formControlName="status">
                    <option value="draft">مسودة</option>
                    <option value="published">منشور</option>
                    <option value="archived">مؤرشف</option>
                  </select>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label">رابط الصورة (Avatar URL)</label>
                <input type="text" class="form-control" formControlName="avatarUrl" dir="ltr">
              </div>

              <div class="mb-3">
                <label class="form-label">نبذة (Bio)</label>
                <textarea class="form-control" rows="3" formControlName="bio" dir="rtl"></textarea>
              </div>

              <div class="d-flex justify-content-end gap-2 mt-4">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary" [disabled]="speakerForm.invalid || isSaving">
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
    .avatar-sm img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
    /* Simple Modal Styles to avoid 3rd party deps for now */
    .modal-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.5); z-index: 1050;
      display: flex; justify-content: center; align-items: center;
    }
    .modal-content {
      background: white; border-radius: 8px; width: 100%; max-width: 600px;
      padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .btn-close { background: none; border: none; font-size: 20px; cursor: pointer; }
  `]
})
export class SpeakersPage implements OnInit {
  speakers: any[] = [];
  isLoading = true;
  error = '';
  
  isModalOpen = false;
  isSaving = false;
  editingId: string | null = null;
  speakerForm: FormGroup;

  constructor(
    private api: WatinAdminService,
    private fb: FormBuilder
  ) {
    this.speakerForm = this.fb.group({
      nameAr: ['', Validators.required],
      nameEn: [''],
      title: [''],
      bio: [''],
      avatarUrl: [''],
      status: ['draft']
    });
  }

  ngOnInit() {
    this.loadSpeakers();
  }

  loadSpeakers() {
    this.isLoading = true;
    this.api.getList('speakers').subscribe({
      next: (res) => {
        if (res.success) this.speakers = res.data;
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'فشل جلب قائمة المشايخ';
        this.isLoading = false;
      }
    });
  }

  openModal() {
    this.editingId = null;
    this.speakerForm.reset({ status: 'draft' });
    this.isModalOpen = true;
  }

  editSpeaker(speaker: any) {
    this.editingId = speaker._id;
    this.speakerForm.patchValue({
      nameAr: speaker.name.ar,
      nameEn: speaker.name.en || '',
      title: speaker.title || '',
      bio: speaker.bio || '',
      avatarUrl: speaker.avatarUrl || '',
      status: speaker.status
    });
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  saveSpeaker() {
    if (this.speakerForm.invalid) return;
    this.isSaving = true;

    const v = this.speakerForm.value;
    const payload = {
      name: { ar: v.nameAr, en: v.nameEn },
      title: v.title,
      bio: v.bio,
      avatarUrl: v.avatarUrl,
      status: v.status
    };

    const request = this.editingId 
      ? this.api.updateEntity('speakers', this.editingId, payload)
      : this.api.createEntity('speakers', payload);

    request.subscribe({
      next: () => {
        this.isSaving = false;
        this.closeModal();
        this.loadSpeakers();
      },
      error: (err) => {
        alert(err.error?.message || 'خطأ أثناء الحفظ');
        this.isSaving = false;
      }
    });
  }

  deleteSpeaker(speaker: any) {
    if (!confirm(`هل أنت متأكد من أرشفة الشيخ: ${speaker.name.ar}؟`)) return;
    
    this.api.deleteEntity('speakers', speaker._id).subscribe({
      next: () => this.loadSpeakers(),
      error: (err) => alert(err.error?.message || 'خطأ أثناء الحذف')
    });
  }
}
