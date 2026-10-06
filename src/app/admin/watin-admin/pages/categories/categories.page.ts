import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WatinAdminService } from '../../data-access/watin-admin.service';

@Component({
  selector: 'app-watin-categories',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="page-container p-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>إدارة الأقسام (التصنيفات)</h2>
        <button class="btn btn-primary" (click)="openModal()"><i class="fas fa-plus"></i> إضافة قسم</button>
      </div>

      <div *ngIf="isLoading" class="alert alert-info">جاري التحميل...</div>
      <div *ngIf="error" class="alert alert-danger">{{ error }}</div>

      <!-- Table -->
      <div class="table-responsive bg-white rounded shadow-sm" *ngIf="!isLoading && categories.length > 0">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>الترتيب</th>
              <th>القسم</th>
              <th>الألوان</th>
              <th>المحاضرات</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let cat of categories">
              <td>
                <span class="badge bg-light text-dark border">{{ cat.sortOrder }}</span>
              </td>
              <td>
                <div class="d-flex align-items-center gap-2">
                  <div class="icon-sm" [style.backgroundColor]="cat.bgColor" [style.color]="cat.iconColor">
                    <i [class]="cat.icon || 'fas fa-folder'"></i>
                  </div>
                  <strong>{{ cat.name.ar }}</strong>
                </div>
              </td>
              <td>
                <span class="badge" [style.backgroundColor]="cat.iconColor">{{ cat.colorToken }}</span>
              </td>
              <td><span class="badge bg-secondary">{{ cat.lectureCount }}</span></td>
              <td>
                <span class="badge" 
                  [ngClass]="{
                    'bg-success': cat.status === 'published',
                    'bg-warning text-dark': cat.status === 'draft',
                    'bg-danger': cat.status === 'archived'
                  }">
                  {{ cat.status === 'published' ? 'منشور' : (cat.status === 'draft' ? 'مسودة' : 'مؤرشف') }}
                </span>
              </td>
              <td>
                <button class="btn btn-sm btn-outline-primary me-2" (click)="editCategory(cat)">تعديل</button>
                <button class="btn btn-sm btn-outline-danger" (click)="deleteCategory(cat)">أرشفة</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="alert alert-warning" *ngIf="!isLoading && categories.length === 0 && !error">
        لا يوجد أقسام حالياً.
      </div>

      <!-- Simple Modal Overlay -->
      <div class="modal-overlay" *ngIf="isModalOpen">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="m-0">{{ editingId ? 'تعديل القسم' : 'إضافة قسم جديد' }}</h5>
            <button class="btn-close" (click)="closeModal()"></button>
          </div>
          <div class="modal-body">
            <form [formGroup]="catForm" (ngSubmit)="saveCategory()">
              
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
                  <label class="form-label">الأيقونة (FontAwesome class)</label>
                  <input type="text" class="form-control" formControlName="icon" placeholder="مثال: fas fa-book" dir="ltr">
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

              <div class="row">
                <div class="col-md-4 mb-3">
                  <label class="form-label">لون الرمز (Token)</label>
                  <select class="form-select" formControlName="colorToken">
                    <option value="forest">Forest</option>
                    <option value="olive">Olive</option>
                    <option value="sand">Sand</option>
                    <option value="sage">Sage</option>
                  </select>
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label">لون الأيقونة (Hex)</label>
                  <input type="text" class="form-control" formControlName="iconColor" dir="ltr">
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label">لون الخلفية (Hex/Rgba)</label>
                  <input type="text" class="form-control" formControlName="bgColor" dir="ltr">
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label">الترتيب (Sort Order)</label>
                <input type="number" class="form-control" formControlName="sortOrder">
              </div>

              <div class="mb-3">
                <label class="form-label">الوصف</label>
                <textarea class="form-control" rows="2" formControlName="descAr" dir="rtl"></textarea>
              </div>

              <div class="d-flex justify-content-end gap-2 mt-4">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">إلغاء</button>
                <button type="submit" class="btn btn-primary" [disabled]="catForm.invalid || isSaving">
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
    .icon-sm { width: 32px; height: 32px; border-radius: 8px; display: flex; justify-content: center; align-items: center; font-size: 14px; }
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
export class CategoriesPage implements OnInit {
  categories: any[] = [];
  isLoading = true;
  error = '';
  
  isModalOpen = false;
  isSaving = false;
  editingId: string | null = null;
  catForm: FormGroup;

  constructor(
    private api: WatinAdminService,
    private fb: FormBuilder
  ) {
    this.catForm = this.fb.group({
      nameAr: ['', Validators.required],
      nameEn: [''],
      descAr: [''],
      icon: ['fas fa-folder'],
      colorToken: ['forest'],
      iconColor: ['#1F3A2E'],
      bgColor: ['rgba(31, 58, 46, 0.1)'],
      sortOrder: [0],
      status: ['draft']
    });
  }

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.isLoading = true;
    this.api.getList('categories').subscribe({
      next: (res) => {
        if (res.success) this.categories = res.data;
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'فشل جلب الأقسام';
        this.isLoading = false;
      }
    });
  }

  openModal() {
    this.editingId = null;
    this.catForm.reset({ 
      status: 'draft', icon: 'fas fa-folder', colorToken: 'forest',
      iconColor: '#1F3A2E', bgColor: 'rgba(31, 58, 46, 0.1)', sortOrder: 0
    });
    this.isModalOpen = true;
  }

  editCategory(cat: any) {
    this.editingId = cat._id;
    this.catForm.patchValue({
      nameAr: cat.name.ar,
      nameEn: cat.name.en || '',
      descAr: cat.description?.ar || '',
      icon: cat.icon,
      colorToken: cat.colorToken,
      iconColor: cat.iconColor,
      bgColor: cat.bgColor,
      sortOrder: cat.sortOrder,
      status: cat.status
    });
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  saveCategory() {
    if (this.catForm.invalid) return;
    this.isSaving = true;

    const v = this.catForm.value;
    const payload = {
      name: { ar: v.nameAr, en: v.nameEn },
      description: { ar: v.descAr, en: '' },
      icon: v.icon,
      colorToken: v.colorToken,
      iconColor: v.iconColor,
      bgColor: v.bgColor,
      sortOrder: v.sortOrder,
      status: v.status
    };

    const request = this.editingId 
      ? this.api.updateEntity('categories', this.editingId, payload)
      : this.api.createEntity('categories', payload);

    request.subscribe({
      next: () => {
        this.isSaving = false;
        this.closeModal();
        this.loadCategories();
      },
      error: (err) => {
        alert(err.error?.message || 'خطأ أثناء الحفظ');
        this.isSaving = false;
      }
    });
  }

  deleteCategory(cat: any) {
    if (!confirm(`هل أنت متأكد من أرشفة القسم: ${cat.name.ar}؟`)) return;
    
    this.api.deleteEntity('categories', cat._id).subscribe({
      next: () => this.loadCategories(),
      error: (err) => alert(err.error?.message || 'خطأ أثناء الحذف')
    });
  }
}
