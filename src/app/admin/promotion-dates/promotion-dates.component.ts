import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { NotificationService } from '../../services/notification.service';
import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCalendarAlt, faSave } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-promotion-dates',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    template: `
    <div class="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 animate-in fade-in duration-300">
      <div class="flex items-center gap-3 mb-6">
        <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
          <fa-icon [icon]="['fas', 'calendar-alt']" class="text-xl"></fa-icon>
        </div>
        <div>
          <h2 class="text-2xl font-bold text-gray-800 dark:text-white">إدارة تواريخ العروض</h2>
          <p class="text-gray-500 dark:text-gray-400 text-sm">حدد تاريخ بداية ونهاية العروض العالمية في المتجر</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
        <div class="space-y-2">
          <label for="startDate" class="block text-sm font-bold text-gray-700 dark:text-gray-300">تاريخ بداية العرض</label>
          <div class="relative">
             <input id="startDate" type="date" [(ngModel)]="startDate"
                class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700 transition-all dark:text-white" />
          </div>
          <p class="text-xs text-gray-500 mt-1">سيتم تفعيل الأسعار المخفضة من هذا التاريخ.</p>
        </div>

        <div class="space-y-2">
          <label for="endDate" class="block text-sm font-bold text-gray-700 dark:text-gray-300">تاريخ نهاية العرض</label>
          <div class="relative">
            <input id="endDate" type="date" [(ngModel)]="endDate"
              class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700 transition-all dark:text-white" />
          </div>
          <p class="text-xs text-gray-500 mt-1">ستعود الأسعار لطبيعتها تلقائياً بعد انتهاء هذا اليوم.</p>
        </div>
      </div>

      <div class="mt-10 pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end">
        <button (click)="saveDates()" [disabled]="isSaving"
          class="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:shadow-lg hover:translate-y-[-2px] transition-all disabled:opacity-50">
          <fa-icon *ngIf="!isSaving" [icon]="['fas', 'save']"></fa-icon>
          <span *ngIf="!isSaving">حفظ الإعدادات 💾</span>
          <span *ngIf="isSaving">جاري الحفظ...</span>
        </button>
      </div>
    </div>
  `,
    styles: []
})
export class PromotionDatesComponent implements OnInit {
    startDate: string = '';
    endDate: string = '';
    isSaving: boolean = false;

    constructor(
        private adminService: AdminService,
        private notificationService: NotificationService,
        library: FaIconLibrary
    ) {
        library.addIcons(faCalendarAlt, faSave);
    }

    ngOnInit(): void {
        this.loadDates();
    }

    loadDates(): void {
        this.adminService.getPromotionDates().subscribe({
            next: (res) => {
                if (res.success) {
                    this.startDate = res.startDate ? res.startDate.substring(0, 10) : '';
                    this.endDate = res.endDate ? res.endDate.substring(0, 10) : '';
                }
            },
            error: (err) => {
                console.error('Error loading promotion dates', err);
            }
        });
    }

    saveDates(): void {
        if (!this.startDate || !this.endDate) {
            alert('يرجى إدخال تاريخ بداية ونهاية العرض.');
            return;
        }

        if (this.endDate <= this.startDate) {
            alert('يجب أن يكون تاريخ نهاية العرض بعد تاريخ البداية.');
            return;
        }

        this.isSaving = true;
        this.adminService.updatePromotionDates({
            startDate: this.startDate,
            endDate: this.endDate
        }).subscribe({
            next: (res) => {
                this.isSaving = false;
                if (res.success) {
                    alert('تم حفظ تواريخ العرض بنجاح.');
                } else {
                    alert('حدث خطأ أثناء حفظ تواريخ العرض.');
                }
            },
            error: (err) => {
                this.isSaving = false;
                console.error('Error saving promotion dates', err);
                alert('حدث خطأ أثناء حفظ تواريخ العرض.');
            }
        });
    }
}
