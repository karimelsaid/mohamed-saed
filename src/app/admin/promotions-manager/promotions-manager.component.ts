import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeManagerComponent } from './theme-manager.component';
import { WheelManagerComponent } from './wheel-manager.component';
import { CouponManagerComponent } from './coupon-manager.component';
import { PackageManagerComponent } from './package-manager.component';

@Component({
  selector: 'app-promotions-manager',
  standalone: true,
  imports: [
    CommonModule,
    ThemeManagerComponent,
    WheelManagerComponent,
    CouponManagerComponent,
    PackageManagerComponent
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
      </div>
    </div>
  `,
  styles: []
})
export class PromotionsManagerComponent {
  activeTab: 'themes' | 'wheel' | 'coupons' | 'packages' = 'themes';
}
