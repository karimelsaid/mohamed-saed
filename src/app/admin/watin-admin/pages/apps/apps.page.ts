import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WatinAdminService } from '../../data-access/watin-admin.service';

@Component({
  selector: 'app-watin-apps',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="page-container p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>إدارة التطبيقات المرتبطة</h2>
        <button class="btn btn-primary" (click)="openModal()"><i class="fas fa-plus"></i> إضافة تطبيق</button>
      </div>

      <div *ngIf="isLoading" class="alert alert-info">جاري التحميل...</div>
      <div *ngIf="error" class="alert alert-danger">{{ error }}</div>

      <!-- Table -->
      <div class="table-responsive bg-white rounded shadow-sm" *ngIf="!isLoading && apps.length > 0">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>ترتيب</th>
              <th>التطبيق</th>
              <th>المفتاح (Key)</th>
              <th>الروابط</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let app of apps">
              <td><span class="badge bg-light text-dark border">{{ app.sortOrder }}</span></td>
              <td>
                <div class="d-flex align-items-center gap-2">
                  <div class="icon-sm bg-light border">
                    <i *ngIf="app.icon?.key" [class]="app.icon.key" class="text-primary"></i>
                    <img *ngIf="app.icon?.url" [src]="app.icon.url" alt="icon" style="width:100%;height:100%;border-radius:8px">
                  </div>
                  <strong>{{ app.name.ar }}</strong>
                </div>
              </td>
              <td><code>{{ app.key }}</code></td>
              <td>
                <div class="d-flex gap-2">
                  <i *ngIf="app.links?.web" class="fas fa-globe text-primary" title="Web"></i>
                  <i *ngIf="app.links?.android" class="fab fa-android text-success" title="Android"></i>
                  <i *ngIf="app.links?.ios" class="fab fa-apple text-dark" title="iOS"></i>
                </div>
              </td>
              <td>
                <!-- Quick Toggle Switch -->
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" 
                    [checked]="app.status === 'published'" 
                    (change)="toggleStatus(app, $event)">
                  <label class="form-check-label">{{ app.status === 'published' ? 'مفعل' : 'معطل' }}</label>
                </div>
              </td>
              <td>
                <button class="btn btn-sm btn-outline-primary me-2" (click)="editApp(app)">تعديل</button>
                <button class="btn btn-sm btn-outline-danger" (click)="deleteApp(app)">حذف</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="alert alert-warning" *ngIf="!isLoading && apps.length === 0 && !error">
        لا يوجد تطبيقات مضافة حالياً.
      </div>

      <!-- Simple Modal Overlay -->
      <div class="modal-overlay" *ngIf="isModalOpen">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="m-0">{{ editingId ? 'تعديل التطبيق' : 'إضافة تطبيق جديد' }}</h5>
            <button class="btn-close" (click)="closeModal()"></button>
          </div>
          <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
            <form [formGroup]="appForm" (ngSubmit)="saveApp()">
              
              <div class="mb-3">
                <label class="form-label">المفتاح (Key) <span class="text-danger">*</span></label>
                <input type="text" class="form-control" formControlName="key" placeholder="مثال: knoozbook" dir="ltr" [readonly]="!!editingId">
                <small class="text-muted" *ngIf="!!editingId">لا يمكن تعديل المفتاح بعد الإنشاء.</small>
              </div>

              <div class="mb-3">
                <label class="form-label">الاسم بالعربية <span class="text-danger">*</span></label>
                <input type="text" class="form-control" formControlName="nameAr" dir="rtl">
              </div>

              <div class="mb-3">
                <label class="form-label">الوصف القصير (Tagline)</label>
                <input type="text" class="form-control" formControlName="taglineAr" placeholder="مثال: القراءة أصبحت أسهل" dir="rtl">
              </div>

              <h6 class="mt-4 mb-3 border-bottom pb-2">الأيقونة</h6>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">أيقونة FontAwesome</label>
                  <input type="text" class="form-control" formControlName="iconKey" placeholder="fas fa-book" dir="ltr">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">أو رابط صورة (URL)</label>
                  <input type="text" class="form-control" formControlName="iconUrl" dir="ltr">
                </div>
              </div>

              <h6 class="mt-4 mb-3 border-bottom pb-2">الروابط (Links)</h6>
              <div class="mb-3">
                <label class="form-label">رابط الموقع (Web)</label>
                <input type="url" class="form-control" formControlName="linkWeb" dir="ltr" placeholder="https://...">
              </div>
              <div class="mb-3">
                <label class="form-label">رابط متجر جوجل (Android)</label>
                <input type="url" class="form-control" formControlName="linkAndroid" dir="ltr" placeholder="https://play.google.com/...">
              </div>
              <div class="mb-3">
                <label class="form-label">رابط متجر آبل (iOS)</label>
                <input type="url" class="form-control" formControlName="linkIos" dir="ltr" placeholder="https://apps.apple.com/...">
              </div>

              <h6 class="mt-4 mb-3 border-bottom pb-2">الإعدادات</h6>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">طريقة الفتح</label>
                  <select class="form-select" formControlName="openMode">
                    <option value="external_browser">متصفح خارجي</option>
                    <option value="in_app_browser">متصفح داخل التطبيق</option>
                  </select>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">الترتيب</label>
                  <input type="number" class="form-control" formControlName="sortOrder">
                </div>
              </div>

              <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary" [disabled]="appForm.invalid || isSaving">
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
    .icon-sm { width: 36px; height: 36px; border-radius: 8px; display: flex; justify-content: center; align-items: center; font-size: 16px; }
    .modal-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.5); z-index: 1050;
      display: flex; justify-content: center; align-items: center;
    }
    .modal-content {
      background: white; border-radius: 8px; width: 100%; max-width: 700px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #eee; }
    .modal-body { padding: 20px; }
    .btn-close { background: none; border: none; font-size: 20px; cursor: pointer; }
  `]
})
export class AppsPage implements OnInit {
  apps: any[] = [];
  isLoading = true;
  error = '';
  
  isModalOpen = false;
  isSaving = false;
  editingId: string | null = null;
  appForm: FormGroup;

  constructor(
    private api: WatinAdminService,
    private fb: FormBuilder
  ) {
    this.appForm = this.fb.group({
      key: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
      nameAr: ['', Validators.required],
      taglineAr: [''],
      iconKey: [''],
      iconUrl: [''],
      linkWeb: [''],
      linkAndroid: [''],
      linkIos: [''],
      openMode: ['external_browser'],
      sortOrder: [0]
    });
  }

  ngOnInit() {
    this.loadApps();
  }

  loadApps() {
    this.isLoading = true;
    this.api.getList('apps').subscribe({
      next: (res) => {
        if (res.success) this.apps = res.data;
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'فشل جلب التطبيقات';
        this.isLoading = false;
      }
    });
  }

  openModal() {
    this.editingId = null;
    this.appForm.reset({ openMode: 'external_browser', sortOrder: 0 });
    this.appForm.get('key')?.enable();
    this.isModalOpen = true;
  }

  editApp(app: any) {
    this.editingId = app._id;
    this.appForm.patchValue({
      key: app.key,
      nameAr: app.name.ar,
      taglineAr: app.tagline?.ar || '',
      iconKey: app.icon?.key || '',
      iconUrl: app.icon?.url || '',
      linkWeb: app.links?.web || '',
      linkAndroid: app.links?.android || '',
      linkIos: app.links?.ios || '',
      openMode: app.openMode || 'external_browser',
      sortOrder: app.sortOrder || 0
    });
    this.appForm.get('key')?.disable();
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  saveApp() {
    if (this.appForm.invalid) return;
    this.isSaving = true;

    const v = this.appForm.getRawValue(); // gets disabled fields too (key)
    const payload = {
      key: v.key,
      name: { ar: v.nameAr, en: '' },
      tagline: { ar: v.taglineAr, en: '' },
      icon: { key: v.iconKey, url: v.iconUrl },
      links: { web: v.linkWeb, android: v.linkAndroid, ios: v.linkIos },
      openMode: v.openMode,
      sortOrder: v.sortOrder,
      status: this.editingId ? undefined : 'published' // Default new to published for convenience
    };

    const request = this.editingId 
      ? this.api.updateEntity('apps', this.editingId, payload)
      : this.api.createEntity('apps', payload);

    request.subscribe({
      next: () => {
        this.isSaving = false;
        this.closeModal();
        this.loadApps();
      },
      error: (err) => {
        alert(err.error?.message || 'خطأ أثناء الحفظ');
        this.isSaving = false;
      }
    });
  }

  toggleStatus(app: any, event: any) {
    const newStatus = event.target.checked ? 'published' : 'draft';
    const originalStatus = app.status;
    app.status = newStatus; // optimistic

    this.api.patchEntity('apps', app._id, { status: newStatus }).subscribe({
      error: () => {
        app.status = originalStatus; // rollback
        alert('فشل تغيير الحالة');
      }
    });
  }

  deleteApp(app: any) {
    if (!confirm(`هل أنت متأكد من حذف/أرشفة التطبيق: ${app.name.ar}؟`)) return;
    
    this.api.deleteEntity('apps', app._id).subscribe({
      next: () => this.loadApps(),
      error: (err) => alert(err.error?.message || 'خطأ أثناء الحذف')
    });
  }
}
