import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromotionService } from '../../services/promotion.service';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-package-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-semibold dark:text-white">إدارة الباقات والعروض</h2>
        <button (click)="openModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
          إنشاء باقة جديدة
        </button>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div *ngFor="let pkg of packages" class="bg-white dark:bg-gray-700 p-4 rounded-lg border dark:border-gray-600 shadow-sm">
          <h3 class="font-bold text-lg mb-2 dark:text-white">{{ pkg.name }}</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-2">{{ pkg.description }}</p>
          <div class="flex justify-between items-center mb-4">
            <span class="font-bold text-green-600 dark:text-green-400">{{ pkg.fixedPrice }} ج.م</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ pkg.products?.length || 0 }} منتجات</span>
          </div>
          <div class="flex justify-end">
            <button (click)="deletePackage(pkg._id)" class="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 text-sm">حذف</button>
          </div>
        </div>
      </div>

      <!-- Modal -->
      <div *ngIf="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl overflow-y-auto max-h-[90vh] border dark:border-gray-700">
          <h3 class="text-lg font-bold mb-4 dark:text-white">إنشاء باقة جديدة</h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">اسم الباقة</label>
              <input [(ngModel)]="newPackage.name" type="text" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">السعر الثابت</label>
              <input [(ngModel)]="newPackage.fixedPrice" type="number" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">يجب أن يغطي السعر التكلفة + 50% ربح على الأقل</p>
            </div>

            <div class="grid grid-cols-2 gap-4 border-t dark:border-gray-600 pt-4 mt-2">
              <h4 class="col-span-2 text-sm font-bold mb-2 dark:text-white">الفئة السعرية للمنتجات (بديل الاختيار اليدوي)</h4>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">السعر الأدنى</label>
                <input [(ngModel)]="newPackage.minPrice" type="number" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">السعر الأقصى</label>
                <input [(ngModel)]="newPackage.maxPrice" type="number" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 shadow-sm">
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">اختيار المنتجات</label>
              <div class="mt-2 h-48 overflow-y-auto border dark:border-gray-600 rounded-md p-2 space-y-2 dark:bg-gray-700">
                <div *ngFor="let product of products" class="flex items-center">
                  <input type="checkbox" [value]="product._id" (change)="toggleProduct(product._id, $event)" class="h-4 w-4 text-indigo-600 border-gray-300 rounded">
                  <label class="mr-2 ml-2 block text-sm text-gray-900 dark:text-gray-300">
                    {{ product.bookName }} - {{ product.product_price }} ج.م
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-3">
            <button (click)="closeModal()" class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">إلغاء</button>
            <button (click)="savePackage()" class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">حفظ الباقة</button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PackageManagerComponent implements OnInit {
  packages: any[] = [];
  products: any[] = [];
  showModal = false;
  newPackage: any = { name: '', products: [], fixedPrice: 0 };

  constructor(private promotionService: PromotionService, private dataService: DataService) { }

  ngOnInit() {
    this.loadPackages();
    this.loadProducts();
  }

  loadPackages() {
    this.promotionService.getAllPackages().subscribe({
      next: (res: any) => this.packages = Array.isArray(res) ? res : (res.packages || []),
      error: (err: any) => console.error(err)
    });
  }

  loadProducts() {
    this.dataService.getData().subscribe({
      next: (res: any) => this.products = res || [],
      error: (err: any) => console.error(err)
    });
  }

  openModal() {
    this.newPackage = { name: '', products: [], fixedPrice: 0, minPrice: null, maxPrice: null };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  toggleProduct(productId: string, event: any) {
    if (event.target.checked) {
      this.newPackage.products.push(productId);
    } else {
      const index = this.newPackage.products.indexOf(productId);
      if (index > -1) {
        this.newPackage.products.splice(index, 1);
      }
    }
  }

  savePackage() {
    if (this.newPackage.products.length === 0) {
      alert('يجب اختيار منتج واحد على الأقل');
      return;
    }
    this.promotionService.createPackage(this.newPackage).subscribe({
      next: () => {
        this.loadPackages();
        this.closeModal();
      },
      error: () => alert('حدث خطأ أثناء حفظ الباقة')
    });
  }

  deletePackage(id: string) {
    if (confirm('هل أنت متأكد من حذف هذه الباقة؟')) {
      this.promotionService.deletePackage(id).subscribe(() => this.loadPackages());
    }
  }
}
