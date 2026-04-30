import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeManagerComponent } from './theme-manager.component';
import { WheelManagerComponent } from './wheel-manager.component';
import { CouponManagerComponent } from './coupon-manager.component';
import { PackageManagerComponent } from './package-manager.component';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { OnInit } from '@angular/core';
import { HeroManagerComponent } from './hero-manager.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-promotions-manager',
  standalone: true,
  imports: [
    CommonModule,
    ThemeManagerComponent,
    WheelManagerComponent,
    CouponManagerComponent,
    PackageManagerComponent,
    HeroManagerComponent,
    FormsModule
  ],
  template: `
    <div class="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <h1 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white">إدارة العروض والترويج</h1>
      
      <div class="flex mb-6 bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-2 gap-1">
        <button (click)="activeTab = 'themes'"
          [class.bg-blue-600]="activeTab === 'themes'"
          [class.text-white]="activeTab === 'themes'"
          [class.text-gray-600]="activeTab !== 'themes'"
          [class.dark:text-gray-300]="activeTab !== 'themes'"
          class="flex-1 py-2 px-4 rounded-md transition-colors">إدارة الثيمات</button>
        <button (click)="activeTab = 'wheel'"
          [class.bg-blue-600]="activeTab === 'wheel'"
          [class.text-white]="activeTab === 'wheel'"
          [class.text-gray-600]="activeTab !== 'wheel'"
          [class.dark:text-gray-300]="activeTab !== 'wheel'"
          class="flex-1 py-2 px-4 rounded-md transition-colors">عجلة الحظ</button>
        <button (click)="activeTab = 'coupons'"
          [class.bg-blue-600]="activeTab === 'coupons'"
          [class.text-white]="activeTab === 'coupons'"
          [class.text-gray-600]="activeTab !== 'coupons'"
          [class.dark:text-gray-300]="activeTab !== 'coupons'"
          class="flex-1 py-2 px-4 rounded-md transition-colors">كوبونات الخصم</button>
        <button (click)="activeTab = 'packages'"
          [class.bg-blue-600]="activeTab === 'packages'"
          [class.text-white]="activeTab === 'packages'"
          [class.text-gray-600]="activeTab !== 'packages'"
          [class.dark:text-gray-300]="activeTab !== 'packages'"
          class="flex-1 py-2 px-4 rounded-md transition-colors">الباقات والعروض</button>
        <button (click)="activeTab = 'hero'"
          [class.bg-blue-600]="activeTab === 'hero'"
          [class.text-white]="activeTab === 'hero'"
          [class.text-gray-600]="activeTab !== 'hero'"
          [class.dark:text-gray-300]="activeTab !== 'hero'"
          class="flex-1 py-2 px-4 rounded-md transition-colors">سلايدر العرض</button>
        <button (click)="activeTab = 'settings'"
          [class.bg-blue-600]="activeTab === 'settings'"
          [class.text-white]="activeTab === 'settings'"
          [class.text-gray-600]="activeTab !== 'settings'"
          [class.dark:text-gray-300]="activeTab !== 'settings'"
          class="flex-1 py-2 px-4 rounded-md transition-colors">إعدادات عامة</button>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-6 dark:border dark:border-gray-700">
        <div *ngIf="activeTab === 'themes'">
          <app-theme-manager></app-theme-manager>
        </div>
        <div *ngIf="activeTab === 'wheel'">
          <app-wheel-manager></app-wheel-manager>
        </div>
        <div *ngIf="activeTab === 'coupons'">
          <app-coupon-manager></app-coupon-manager>
        </div>
        <div *ngIf="activeTab === 'packages'">
          <app-package-manager></app-package-manager>
        </div>
        <div *ngIf="activeTab === 'hero'">
          <app-hero-manager></app-hero-manager>
        </div>
        <div *ngIf="activeTab === 'settings'">
          <div class="max-w-2xl mx-auto py-8">
            <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
              ⚙️ إعدادات العروض الذكية
            </h2>
            <div class="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-xl border dark:border-gray-600">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                هامش الربح المستهدف للعروض الذكية (%)
              </label>
              <div class="flex gap-4 items-center">
                <input type="number" [(ngModel)]="economySettings.dynamicOfferProfitMargin" 
                  class="flex-1 rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-2.5">
                <button (click)="saveEconomySettings()" [disabled]="isSaving"
                  class="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold transition-all">
                  {{ isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات' }}
                </button>
              </div>
              <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
                هذه النسبة ستستخدم كحد أدنى للربح عند توليد عرض ذكي للمستخدمين. (مثال: 50 تعني أن السعر سيكون ضعف التكلفة).
              </p>

              <hr class="my-6 border-gray-200 dark:border-gray-600">

              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-lg font-bold text-gray-800 dark:text-white">ضم منتجات التجار في العروض</h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">عند التفعيل، ستشمل العروض الذكية والباقات منتجات التجار بالإضافة لمنتجات المنصة.</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" class="sr-only peer" [(ngModel)]="includeMerchantProducts" (change)="saveMerchantProductsSetting()">
                  <div class="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-500 peer-checked:bg-orange-500"></div>
                </label>
              </div>
              <p *ngIf="merchantSettingMsg" class="mt-3 text-xs font-bold" [class.text-green-600]="merchantSettingMsg === 'saved'" [class.text-red-500]="merchantSettingMsg === 'error'">{{ merchantSettingMsg === 'saved' ? '✅ تم الحفظ' : '❌ حدث خطأ' }}</p>
            </div>
            
            <div *ngIf="message" [class]="message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
              class="mt-4 p-4 rounded-lg text-sm font-medium animate-fade-in">
              {{ message.text }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class PromotionsManagerComponent implements OnInit {
  activeTab: 'themes' | 'wheel' | 'coupons' | 'packages' | 'hero' | 'settings' = 'themes';
  economySettings = { dynamicOfferProfitMargin: 50 };
  isSaving = false;
  message: { type: 'success' | 'error', text: string } | null = null;
  includeMerchantProducts = false;
  merchantSettingMsg = '';

  constructor(private adminService: AdminService, private http: HttpClient) { }

  ngOnInit() {
    this.loadEconomySettings();
    this.loadMerchantProductsSetting();
  }

  loadMerchantProductsSetting() {
    this.http.get<any>(`${environment.apiBaseUrl}/bourse/settings`).subscribe({
      next: (data) => {
        this.includeMerchantProducts = data?.includeMerchantProducts || false;
      }
    });
  }

  saveMerchantProductsSetting() {
    this.merchantSettingMsg = '';
    this.http.post(`${environment.apiBaseUrl}/bourse/settings`, { includeMerchantProducts: this.includeMerchantProducts }).subscribe({
      next: () => {
        this.merchantSettingMsg = 'saved';
        setTimeout(() => this.merchantSettingMsg = '', 2500);
      },
      error: () => {
        this.merchantSettingMsg = 'error';
      }
    });
  }

  loadEconomySettings() {
    this.adminService.getEconomySettings().subscribe({
      next: (res) => {
        if (res.success) {
          this.economySettings = res.settings;
        }
      }
    });
  }

  saveEconomySettings() {
    this.isSaving = true;
    this.message = null;
    this.adminService.updateEconomySettings(this.economySettings).subscribe({
      next: (res) => {
        this.isSaving = false;
        if (res.success) {
          this.message = { type: 'success', text: 'تم حفظ الإعدادات بنجاح!' };
          setTimeout(() => this.message = null, 3000);
        }
      },
      error: (err) => {
        this.isSaving = false;
        this.message = { type: 'error', text: 'حدث خطأ أثناء حفظ الإعدادات.' };
      }
    });
  }
}
