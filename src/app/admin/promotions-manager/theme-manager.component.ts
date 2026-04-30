import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromotionService } from '../../services/promotion.service';

@Component({
  selector: 'app-theme-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-semibold">إدارة المواسم والثيمات</h2>
        <button (click)="openModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
          إضافة ثيم جديد
        </button>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div *ngFor="let theme of themes" class="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700 shadow-sm relative">
          <div class="absolute top-2 left-2">
            <span [class]="theme.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'" class="px-2 py-1 rounded-full text-xs font-medium">
              {{ theme.isActive ? 'نشط' : 'غير نشط' }}
            </span>
          </div>
          <h3 class="font-bold text-lg mb-2 dark:text-white">{{ theme.name }}</h3>
          <div class="flex gap-2 mb-4">
            <div class="w-8 h-8 rounded-full border dark:border-gray-600" [style.backgroundColor]="theme.themeConfig?.primaryColor" title="Primary"></div>
            <div class="w-8 h-8 rounded-full border dark:border-gray-600" [style.backgroundColor]="theme.themeConfig?.secondaryColor" title="Secondary"></div>
            <div class="w-8 h-8 rounded-full border dark:border-gray-600" [style.backgroundColor]="theme.themeConfig?.accentColor" title="Accent"></div>
          </div>
          <div class="flex justify-between items-center mt-4">
            <button (click)="toggleTheme(theme)" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              {{ theme.isActive ? 'إلغاء التنشيط' : 'تنشيط' }}
            </button>
            <button (click)="editTheme(theme)" class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-200">تعديل</button>
          </div>
        </div>
      </div>

      <!-- Modal -->
      <div *ngIf="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md border dark:border-gray-700">
          <h3 class="text-lg font-bold mb-4 dark:text-white">{{ isEditing ? 'تعديل الثيم' : 'إضافة ثيم جديد' }}</h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">اسم الثيم</label>
              <input [(ngModel)]="currentTheme.name" type="text" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2 border">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">اللون الأساسي</label>
              <div class="flex gap-2">
                <input [(ngModel)]="currentTheme.themeConfig.primaryColor" type="color" class="h-10 w-10 cursor-pointer">
                <input [(ngModel)]="currentTheme.themeConfig.primaryColor" type="text" class="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2">
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">اللون الثانوي</label>
              <div class="flex gap-2">
                <input [(ngModel)]="currentTheme.themeConfig.secondaryColor" type="color" class="h-10 w-10 cursor-pointer">
                <input [(ngModel)]="currentTheme.themeConfig.secondaryColor" type="text" class="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2">
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">لون التمييز (Accent)</label>
              <div class="flex gap-2">
                <input [(ngModel)]="currentTheme.themeConfig.accentColor" type="color" class="h-10 w-10 cursor-pointer">
                <input [(ngModel)]="currentTheme.themeConfig.accentColor" type="text" class="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2">
              </div>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-3">
            <button (click)="closeModal()" class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">إلغاء</button>
            <button (click)="saveTheme()" class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">حفظ</button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ThemeManagerComponent implements OnInit {
  themes: any[] = [];
  showModal = false;
  isEditing = false;
  currentTheme: any = this.getEmptyTheme();

  constructor(private promotionService: PromotionService) { }

  ngOnInit() {
    this.loadThemes();
  }

  loadThemes() {
    this.promotionService.getAllThemes().subscribe({
      next: (res: any) => this.themes = Array.isArray(res) ? res : (res.themes || []),
      error: (err: any) => console.error(err)
    });
  }

  getEmptyTheme() {
    return {
      name: '',
      isActive: false,
      themeConfig: {
        primaryColor: '#8b5cf6',
        secondaryColor: '#ede9fe',
        accentColor: '#f59e0b',
        backgroundImage: '',
        icons: {}
      },
      luckyWheel: {
        isEnabled: true,
        prizes: [] // Configured in WheelManager
      }
    };
  }

  openModal() {
    this.isEditing = false;
    this.currentTheme = this.getEmptyTheme();
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  editTheme(theme: any) {
    this.isEditing = true;
    this.currentTheme = JSON.parse(JSON.stringify(theme)); // Deep copy
    this.showModal = true;
  }

  saveTheme() {
    if (this.isEditing) {
      this.promotionService.updateTheme(this.currentTheme._id, this.currentTheme).subscribe(() => {
        this.loadThemes();
        this.closeModal();
      });
    } else {
      this.promotionService.createTheme(this.currentTheme).subscribe(() => {
        this.loadThemes();
        this.closeModal();
      });
    }
  }

  toggleTheme(theme: any) {
    this.promotionService.toggleTheme(theme._id).subscribe(() => this.loadThemes());
  }
}
