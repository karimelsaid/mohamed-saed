import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-admin-categories',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-categories.component.html',
  styleUrls: ['./admin-categories.component.css']
})
export class AdminCategoriesComponent implements OnInit {
  categories: any[] = [];
  loading = false;
  error = '';
  success = '';

  newCategory = { name: '', type: 'book', isActive: true };
  editingCategory: any = null;

  constructor(
    private dataService: DataService
  ) {}

  ngOnInit(): void {
    this.loadCategories();
  }

  private getToken(): string {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        return user.token || '';
      } catch (e) {
        return '';
      }
    }
    return '';
  }

  loadCategories() {
    this.loading = true;
    this.dataService.getAdminCategories().subscribe({
      next: (res) => {
        if (res.success) {
          this.categories = res.categories;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading categories', err);
        this.error = 'فشل في تحميل التصنيفات';
        this.loading = false;
      }
    });
  }

  addCategory() {
    if (!this.newCategory.name) return;

    this.loading = true;
    const token = this.getToken();
    this.dataService.createAdminCategory(this.newCategory, token).subscribe({
      next: (res) => {
        if (res.success) {
          this.success = 'تم إضافة التصنيف بنجاح';
          this.newCategory.name = '';
          this.loadCategories();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error adding category', err);
        this.error = err.error?.message || 'فشل في إضافة التصنيف';
        this.loading = false;
      }
    });
  }

  editCategory(category: any) {
    this.editingCategory = { ...category };
  }

  cancelEdit() {
    this.editingCategory = null;
  }

  updateCategory() {
    if (!this.editingCategory || !this.editingCategory.name) return;

    this.loading = true;
    const token = this.getToken();
    this.dataService.updateAdminCategory(this.editingCategory._id, this.editingCategory, token).subscribe({
      next: (res) => {
        if (res.success) {
          this.success = 'تم تحديث التصنيف بنجاح';
          this.editingCategory = null;
          this.loadCategories();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error updating category', err);
        this.error = err.error?.message || 'فشل في تحديث التصنيف';
        this.loading = false;
      }
    });
  }

  deleteCategory(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا التصنيف؟')) return;

    this.loading = true;
    const token = this.getToken();
    this.dataService.deleteAdminCategory(id, token).subscribe({
      next: (res) => {
        if (res.success) {
          this.success = 'تم حذف التصنيف بنجاح';
          this.loadCategories();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error deleting category', err);
        this.error = 'فشل في حذف التصنيف';
        this.loading = false;
      }
    });
  }
}
