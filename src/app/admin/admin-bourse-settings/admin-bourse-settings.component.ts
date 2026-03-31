import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-admin-bourse-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './admin-bourse-settings.component.html',
  styleUrls: []
})
export class AdminBourseSettingsComponent implements OnInit {
  bourseConfig: any = {
    isActive: false,
    netProfitMargin: 10,
    freeGiftThreshold: 1000,
    allowedCategories: [],
    booksPerSlot: 8,
    includeMerchantProducts: false
  };
  isLoading = true;
  isSaving = false;
  saveMessage = '';
  errorMessage = '';

  // Actual product categories from the database
  categories: string[] = [
    'روايات وقصص',
    'كتب دينية',
    'تطوير الذات وعلم النفس',
    'تربية وأطفال',
    'تاريخ وسير ذاتية',
    'أعمال وتسويق ومالية',
    'قواميس ومراجع',
    'صحة وطب وعلوم',
    'فنون وحرف',
    'إلكترونيات',
    'أدوات مكتبية',
    'أثاث وديكور المنزل',
    'التجميل والعناية الشخصية',
    'ملابس',
    'حقائب',
    'هدية وألعاب',
    'منتجات عامة',
    'غير مصنف'
  ];

  constructor(private http: HttpClient, private authService: AuthService) { }

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings() {
    this.isLoading = true;
    this.http.get(`${environment.apiBaseUrl}/bourse/settings`).subscribe({
      next: (data: any) => {
        this.bourseConfig = { ...this.bourseConfig, ...data };
        if (!this.bourseConfig.allowedCategories) {
          this.bourseConfig.allowedCategories = [];
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading bourse settings', err);
        this.errorMessage = 'فشل في تحميل الإعدادات.';
        this.isLoading = false;
      }
    });
  }

  isCategorySelected(cat: string): boolean {
    return this.bourseConfig.allowedCategories.includes(cat);
  }

  toggleCategory(cat: string) {
    const idx = this.bourseConfig.allowedCategories.indexOf(cat);
    if (idx > -1) {
      this.bourseConfig.allowedCategories.splice(idx, 1);
    } else {
      this.bourseConfig.allowedCategories.push(cat);
    }
  }

  selectAllCategories() {
    this.bourseConfig.allowedCategories = [...this.categories];
  }

  clearAllCategories() {
    this.bourseConfig.allowedCategories = [];
  }

  saveSettings() {
    this.isSaving = true;
    this.saveMessage = '';
    this.errorMessage = '';

    this.http.post(`${environment.apiBaseUrl}/bourse/settings`, this.bourseConfig).subscribe({
      next: (res: any) => {
        this.saveMessage = 'تم حفظ الإعدادات بنجاح. سيتم تطبيقها في العروض القادمة.';
        this.isSaving = false;
        setTimeout(() => this.saveMessage = '', 3000);
      },
      error: (err) => {
        console.error('Error saving settings', err);
        this.errorMessage = 'حدث خطأ أثناء حفظ الإعدادات.';
        this.isSaving = false;
      }
    });
  }
}
