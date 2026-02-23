import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromotionService } from '../../services/promotion.service';

@Component({
  selector: 'app-coupon-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-semibold dark:text-white">إدارة كوبونات الخصم</h2>
        <button (click)="openModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
          إنشاء كوبون جديد
        </button>
      </div>

      <div class="overflow-x-auto bg-white dark:bg-gray-700 rounded-lg shadow">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">الكود</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">الخصم</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">الاستخدام</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">الصلاحية</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">إجراءات</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
            <tr *ngFor="let coupon of coupons">
              <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{{ coupon.code }}</td>
              <td class="px-6 py-4 whitespace-nowrap dark:text-gray-300">
                {{ coupon.value }} {{ coupon.discountType === 'percentage' ? '%' : 'ج.م' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap dark:text-gray-300">
                {{ coupon.uses }} / {{ coupon.maxUses }} ({{ coupon.usedBy?.length || 0 }} مستخدم)
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                <div *ngIf="coupon.expiryDate">
                  ينتهي: {{ coupon.expiryDate | date:'short' }}
                </div>
                <div *ngIf="!coupon.expiryDate">
                  دائم
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3 rtl:space-x-reverse">
                <button (click)="openModal(coupon)" class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300">تعديل</button>
                <button (click)="deleteCoupon(coupon._id)" class="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300">حذف</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Modal -->
      <div *ngIf="showModal" (click)="closeModal()" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[1100] text-right" dir="rtl">
        <div (click)="$event.stopPropagation()" class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl overflow-y-auto max-h-[90vh] border dark:border-gray-700 shadow-2xl">
          <h3 class="text-lg font-bold mb-4 dark:text-white border-b pb-2">
            {{ isEdit ? 'تعديل الكوبون' : 'إنشاء كوبون جديد' }}
          </h3>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">كود الكوبون</label>
              <input [(ngModel)]="newCoupon.code" type="text" [disabled]="isEdit" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm disabled:opacity-50">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">نوع الخصم</label>
              <select [(ngModel)]="newCoupon.discountType" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
                <option value="percentage">نسبة مئوية (%)</option>
                <option value="fixed">مبلغ ثابت (ج.م)</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">قيمة الخصم</label>
              <input [(ngModel)]="newCoupon.value" type="number" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">الحد الأقصى للخصم (للنسبة المئوية)</label>
              <input [(ngModel)]="newCoupon.maxDiscountAmount" type="number" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">عدد مرات الاستخدام الكلي</label>
              <input [(ngModel)]="newCoupon.maxUses" type="number" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">الحد الأقصى لكل مستخدم</label>
              <input [(ngModel)]="newCoupon.maxUsers" type="number" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">الحد الأدنى للطلب</label>
              <input [(ngModel)]="newCoupon.minOrderAmount" type="number" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
            </div>

            <div class="md:col-span-2 grid grid-cols-2 gap-4 border-t dark:border-gray-600 pt-4 mt-2">
              <h4 class="col-span-2 text-sm font-bold mb-2 dark:text-white text-indigo-600 dark:text-indigo-400">حدود الاستخدام في العملية الواحدة</h4>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">أقصى عدد منتجات مختلفة</label>
                <input [(ngModel)]="newCoupon.maxProducts" type="number" placeholder="0 = غير محدود" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
                <p class="text-[10px] text-gray-500 mt-1">مثلاً: الكود يطبق على أول 3 كتب فقط في السلة</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">أقصى كمية من كل منتج</label>
                <input [(ngModel)]="newCoupon.maxQtyPerProduct" type="number" placeholder="0 = غير محدود" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
                <p class="text-[10px] text-gray-500 mt-1">مثلاً: الخصم يطبق على أول قطعتين فقط من كل كتاب</p>
              </div>
            </div>

            <div class="md:col-span-2 grid grid-cols-2 gap-4 border-t dark:border-gray-600 pt-4 mt-2">
              <h4 class="col-span-2 text-sm font-bold mb-2 dark:text-white">الفئة السعرية للمنتجات المستهدفة (اختياري)</h4>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">السعر الأدنى للمنتج</label>
                <input [(ngModel)]="newCoupon.minPrice" type="number" placeholder="مثلاً: 100" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">السعر الأقصى للمنتج</label>
                <input [(ngModel)]="newCoupon.maxPrice" type="number" placeholder="مثلاً: 500" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
              </div>
            </div>
            
             <div class="md:col-span-2 border-t dark:border-gray-600 pt-4 mt-2">
               <h4 class="text-sm font-bold mb-2 dark:text-white">مدة الصلاحية</h4>
               <div class="flex gap-4">
                 <div class="flex-1 text-right">
                   <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">المدة</label>
                   <input [(ngModel)]="newCoupon.durationValue" type="number" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
                 </div>
                 <div class="flex-1 text-right">
                   <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">الوحدة</label>
                   <select [(ngModel)]="newCoupon.durationUnit" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
                     <option value="hours">ساعات</option>
                     <option value="days">أيام</option>
                   </select>
                 </div>
               </div>
               <p *ngIf="isEdit" class="text-xs text-amber-600 mt-2 font-bold">تنبيه: تغيير مدة الصلاحية سيعيد تعيين وقت الانتهاء من الآن.</p>
             </div>
          </div>

          <div class="mt-6 flex justify-end gap-3 border-t pt-4">
            <button (click)="closeModal()" class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">إلغاء</button>
            <button (click)="saveCoupon()" class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-bold shadow-md">
              {{ isEdit ? 'تحديث الكوبون' : 'إنشاء الكوبون' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class CouponManagerComponent implements OnInit {
  coupons: any[] = [];
  showModal = false;
  isEdit = false;
  editingCouponId: string | null = null;
  newCoupon: any = this.getEmptyCoupon();

  constructor(private promotionService: PromotionService) { }

  ngOnInit() {
    this.loadCoupons();
  }

  loadCoupons() {
    this.promotionService.getAllCoupons().subscribe({
      next: (res: any) => this.coupons = res.coupons || res,
      error: (err: any) => console.error(err)
    });
  }

  getEmptyCoupon() {
    return {
      code: '',
      discountType: 'percentage',
      value: 10,
      maxUses: 100,
      maxUsers: 1,
      minOrderAmount: 0,
      maxDiscountAmount: 0,
      durationValue: 7,
      durationUnit: 'days',
      minPrice: null,
      maxPrice: null,
      maxProducts: 0,
      maxQtyPerProduct: 0
    };
  }

  openModal(coupon?: any) {
    if (coupon) {
      this.isEdit = true;
      this.editingCouponId = coupon._id;
      this.newCoupon = { ...coupon };
    } else {
      this.isEdit = false;
      this.editingCouponId = null;
      this.newCoupon = this.getEmptyCoupon();
    }
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  saveCoupon() {
    this.newCoupon.code = this.newCoupon.code.trim().toUpperCase();

    if (this.isEdit && this.editingCouponId) {
      this.promotionService.updateCoupon(this.editingCouponId, this.newCoupon).subscribe({
        next: () => {
          this.loadCoupons();
          this.closeModal();
        },
        error: (err) => alert('Error updating coupon')
      });
    } else {
      this.promotionService.createCoupon(this.newCoupon).subscribe({
        next: () => {
          this.loadCoupons();
          this.closeModal();
        },
        error: (err) => alert('Error creating coupon')
      });
    }
  }

  deleteCoupon(id: string) {
    if (confirm('هل أنت متأكد من حذف هذا الكوبون؟')) {
      this.promotionService.deleteCoupon(id).subscribe(() => this.loadCoupons());
    }
  }
}
