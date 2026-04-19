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
        <button (click)="openModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-colors">
          <span class="text-lg">+</span>
          إنشاء باقة جديدة
        </button>
      </div>

      <!-- Existing Packages Grid -->
      <div *ngIf="packages.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
        <div class="text-5xl mb-4">📦</div>
        <p class="text-lg">لا توجد باقات حالياً</p>
        <p class="text-sm">أنشئ أول باقة عروض لعملائك</p>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div *ngFor="let pkg of packages" class="bg-white dark:bg-gray-700 rounded-xl border dark:border-gray-600 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div class="bg-gradient-to-r from-indigo-500 to-purple-500 p-3">
            <h3 class="font-bold text-lg text-white">{{ pkg.name }}</h3>
          </div>
          <div class="p-4">
            <p class="text-gray-600 dark:text-gray-400 mb-3 text-sm line-clamp-2">{{ pkg.description || 'بدون وصف' }}</p>
            <div class="flex justify-between items-center mb-2">
              <div>
                <span class="text-xs text-gray-500 dark:text-gray-400 block">السعر الترويجي</span>
                <span class="font-bold text-lg text-green-600 dark:text-green-400">{{ pkg.promoPrice || pkg.fixedPrice || 0 }} ج.م</span>
              </div>
              <div class="text-left">
                <span class="text-xs text-gray-500 dark:text-gray-400 block">المنتجات</span>
                <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ pkg.products?.length || 0 }}</span>
              </div>
            </div>
            <div *ngIf="pkg.minPrice || pkg.maxPrice" class="text-xs text-gray-500 dark:text-gray-400 mb-3 bg-gray-50 dark:bg-gray-800 p-2 rounded">
              نطاق الأسعار: {{ pkg.minPrice || 0 }} - {{ pkg.maxPrice || '∞' }} ج.م
            </div>
            <div class="flex justify-between items-center pt-2 border-t dark:border-gray-600">
              <span class="text-xs px-2 py-1 rounded-full" [class]="pkg.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'">
                {{ pkg.isActive ? 'نشط' : 'غير نشط' }}
              </span>
              <button (click)="deletePackage(pkg._id)" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded transition-colors">حذف</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Create Package Modal -->
      <div *ngIf="showModal" (click)="closeModal()" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
        <div (click)="$event.stopPropagation()" class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl flex flex-col shadow-2xl border dark:border-gray-700 max-h-[95vh]">
          <!-- Modal Header -->
          <div class="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white flex-shrink-0 rounded-t-2xl">
            <div class="flex justify-between items-center">
              <div>
                <h3 class="text-xl font-bold">إنشاء باقة جديدة</h3>
                <p class="text-white/80 text-sm mt-1">حدد السعر ونسبة الربح المطلوبة لاختيار المنتجات</p>
              </div>
              <button (click)="closeModal()" class="text-white hover:text-gray-200">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          </div>
          <!-- Fixed Pricing Section (Shows Always on Top) -->
          <div class="p-4 bg-gray-50 border-b dark:bg-gray-900/80 dark:border-gray-700 flex-shrink-0 z-20 shadow-sm relative">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="md:col-span-1">
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">اسم الباقة *</label>
                <input [(ngModel)]="newPackage.name" type="text" placeholder="باقة العرض المميز"
                  class="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 focus:ring-2 focus:ring-indigo-500 transition-colors">
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">السعر الترويجي للبيع (ج.م) *</label>
                <input [(ngModel)]="newPackage.fixedPrice" type="number" placeholder="0" (ngModelChange)="onPriceOrProfitChange()"
                  class="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 focus:ring-2 focus:ring-indigo-500 transition-colors">
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">نسبة الربح المستهدفة (%) *</label>
                <input [(ngModel)]="newPackage.targetProfit" type="number" placeholder="50" (ngModelChange)="onPriceOrProfitChange()"
                  class="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 focus:ring-2 focus:ring-indigo-500 transition-colors">
                <p class="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1 font-bold">المبلغ المتاح للتكلفة: {{ calculateMaxCost().toFixed(2) }} ج.م</p>
              </div>
            </div>
          </div>

          <div class="p-6 overflow-y-auto flex-1 space-y-6">
            <!-- Description -->
            <div>
              <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">وصف الباقة</label>
              <textarea [(ngModel)]="newPackage.description" rows="1" placeholder="وصف مختصر..."
                class="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-2 focus:ring-2 focus:ring-indigo-500 transition-colors"></textarea>
            </div>

            <!-- Selection Tools -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
               <!-- Price Range Filter -->
               <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
                <h4 class="text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-3 flex items-center gap-2">
                  📊 فلترة بالنطاق السعري للكتب
                </h4>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-[10px] text-gray-600 dark:text-gray-400 mb-1">السعر الأدنى</label>
                    <input [(ngModel)]="newPackage.minPrice" type="number" placeholder="0" (ngModelChange)="applySmartFilters()"
                      class="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-1.5 text-xs">
                  </div>
                  <div>
                    <label class="block text-[10px] text-gray-600 dark:text-gray-400 mb-1">السعر الأقصى</label>
                    <input [(ngModel)]="newPackage.maxPrice" type="number" placeholder="999" (ngModelChange)="applySmartFilters()"
                      class="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-1.5 text-xs">
                  </div>
                </div>
              </div>

              <!-- Automated Profit Selector & Randomizer -->
              <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
                <h4 class="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-3 flex items-center gap-2">
                  ✨ ذكاء اختيار المنتجات
                </h4>
                <div class="flex flex-col gap-3">
                  <div class="flex items-center gap-4">
                    <div class="flex-1">
                      <label class="block text-[10px] text-gray-600 dark:text-gray-400 mb-1">الحد الأقصى للمنتجات</label>
                      <input [(ngModel)]="newPackage.maxProducts" type="number" placeholder="5"
                        class="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-1.5 text-xs">
                    </div>
                    <label class="flex items-center gap-2 cursor-pointer group mt-4">
                      <input type="checkbox" [(ngModel)]="autoFilterByProfit" (change)="applySmartFilters()" class="h-4 w-4 text-emerald-600 rounded">
                      <span class="text-xs text-gray-700 dark:text-gray-300 group-hover:text-emerald-600 truncate">فلترة ذكية</span>
                    </label>
                  </div>
                  
                  <button (click)="selectRandomProducts()" 
                    class="bg-emerald-600 text-white text-[10px] px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-all shadow-sm w-full flex items-center justify-center gap-2">
                    <span>🎲</span>
                    <span>اختيار عشوائي ذكي (حسب الربح)</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Selection Area (Columns) -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- Available Products -->
              <div>
                <div class="flex justify-between items-center mb-2">
                  <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">المنتجات المتاحة</label>
                  <input [(ngModel)]="productSearch" type="text" placeholder="بحث..." 
                    class="rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border p-1 text-xs w-40">
                </div>
                <div class="h-60 overflow-y-auto border dark:border-gray-600 rounded-lg p-1 space-y-1 bg-gray-50 dark:bg-gray-900/50">
                  <div *ngFor="let product of getFilteredProducts()" 
                    class="flex items-center p-2 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors cursor-pointer border dark:border-gray-700"
                    [class.border-emerald-500]="isProductInTargetProfit(product)"
                    (click)="toggleProduct(product)">
                    <div class="flex-1 min-w-0">
                      <div class="flex justify-between items-center">
                        <span class="block text-xs font-bold text-gray-900 dark:text-gray-200 truncate">{{ product.product_name || product.bookName }}</span>
                        <span class="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">{{ product.product_price }} ج.م</span>
                      </div>
                      <div class="flex justify-between items-center mt-1">
                        <span class="text-[10px] text-gray-500">التكلفة: {{ product.price_cost || 0 }} ج.م</span>
                        <span class="text-[10px] font-semibold" [class]="isProductInTargetProfit(product) ? 'text-emerald-600' : 'text-amber-600'">
                          الربح القائم: {{ getProductMargin(product) }}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <div *ngIf="getFilteredProducts().length === 0" class="text-center py-10 text-gray-400 text-xs">
                    لا توجد منتجات مطابقة للبحث أو لمعايير الربح
                  </div>
                </div>
              </div>

              <!-- Selected Items & Summary -->
              <div class="flex flex-col h-full">
                <label class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">المنتجات المختارة ({{ selectedProductIds.length }})</label>
                <div class="flex-1 h-32 overflow-y-auto border dark:border-gray-600 rounded-lg p-1 space-y-1 bg-white dark:bg-gray-800 mb-4">
                  <div *ngFor="let id of selectedProductIds" class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border dark:border-gray-600">
                    <div class="flex-1 truncate">
                      <div class="text-[10px] font-bold dark:text-white">{{ getProductName(id) }}</div>
                      <div class="text-[9px] text-gray-500">التكلفة: {{ getProductCost(id) }} ج.م</div>
                    </div>
                    <button (click)="removeProductById(id)" class="text-red-500 p-1 hover:bg-red-50 rounded">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>
                  <div *ngIf="selectedProductIds.length === 0" class="text-center py-10 text-gray-400 text-xs italic">
                    اضغط على المنتجات لإضافتها للباقة
                  </div>
                </div>

                <!-- Final Calculation Summary -->
                <div class="rounded-xl p-4 border transition-colors shadow-inner"
                  [class.bg-emerald-50]="isPackageProfitable()" [class.border-emerald-200]="isPackageProfitable()"
                  [class.bg-red-50]="!isPackageProfitable() && selectedProductIds.length > 0" [class.border-red-200]="!isPackageProfitable() && selectedProductIds.length > 0"
                  [class.bg-gray-50]="selectedProductIds.length === 0" [class.border-gray-200]="selectedProductIds.length === 0">
                  
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <div class="text-[10px] text-gray-500 uppercase tracking-widest">إجمالي التكلفة</div>
                      <div class="text-lg font-black dark:text-gray-900">{{ calculateTotalCost() }} ج.م</div>
                    </div>
                    <div>
                      <div class="text-[10px] text-gray-500 uppercase tracking-widest">صافي الربح</div>
                      <div class="text-lg font-black" [class.text-emerald-600]="isPackageProfitable()" [class.text-red-600]="!isPackageProfitable() && selectedProductIds.length > 0">
                        {{ calculatePackageMargin() }}% 
                        <span class="text-[10px] font-normal" *ngIf="selectedProductIds.length > 0">
                          ({{ (newPackage.fixedPrice - calculateTotalCost()).toFixed(2) }} ج.م)
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div *ngIf="selectedProductIds.length > 0" class="mt-2 pt-2 border-t border-black/5 text-[10px]">
                    <span *ngIf="isPackageProfitable()" class="text-emerald-700">✅ الباقة تحقق الربح المستهدف (أو أكثر)</span>
                    <span *ngIf="!isPackageProfitable()" class="text-red-700">⚠️ الربح الحالي أقل من المستهدف ({{ newPackage.targetProfit }}%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Modal Footer -->
          <div class="p-4 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex justify-end gap-3 flex-shrink-0 rounded-b-2xl">
            <button (click)="closeModal()" class="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">إلغاء</button>
            <button (click)="savePackage()" [disabled]="!newPackage.name || selectedProductIds.length === 0"
              class="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold shadow-md">
              إتمام إنشاء الباقة
            </button>
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
  productSearch = '';
  selectedProductIds: string[] = [];
  newPackage: any = {
    name: '',
    description: '',
    fixedPrice: 0,
    targetProfit: 50,
    maxProducts: 5,
    minPrice: null,
    maxPrice: null,
    isActive: true
  };
  autoFilterByProfit = false;

  constructor(
    private promotionService: PromotionService,
    private dataService: DataService
  ) { }

  ngOnInit() {
    this.loadPackages();
    this.loadProducts();
  }

  loadPackages() {
    this.promotionService.getAllPackages().subscribe((pkgs: any) => this.packages = pkgs);
  }

  loadProducts() {
    this.dataService.getData().subscribe(data => {
      // Adding the new Admin User ID to explicitly whitelist replacement sheet books
      const internalIds = ['Kenouz', 'admin', 'admin__karim_mohamed__', '69d11b07df78621a8d7b1559'];
      const all = data || [];

      this.products = all.filter((p: any) => {
        // If merchantId is completely missing or null, it's an internal/admin product
        if (!p.merchantId) return true;
        
        const mId = typeof p.merchantId === 'string' ? p.merchantId : (p.merchantId._id || p.merchantId.id || '').toString();
        const role = typeof p.merchantId === 'object' ? p.merchantId.role : '';
        const username = typeof p.merchantId === 'object' ? p.merchantId.username : '';

        return role === 'admin' || 
               username === 'admin' ||
               internalIds.some(id => id.toLowerCase() === mId.toLowerCase()) ||
               internalIds.some(id => username && username.toLowerCase().includes(id.toLowerCase()));
      });
      console.log(`[PackageManager] Loaded ${this.products.length} internal products`);
    });
  }

  openModal() {
    this.showModal = true;
    this.newPackage = {
      name: '',
      description: '',
      fixedPrice: 0,
      targetProfit: 50,
      maxProducts: 5,
      minPrice: null,
      maxPrice: null,
      isActive: true
    };
    this.selectedProductIds = [];
    this.autoFilterByProfit = false;
  }

  closeModal() {
    this.showModal = false;
  }

  onPriceOrProfitChange() {
    // Recalculate if needed
  }

  calculateMaxCost(): number {
    const price = Number(this.newPackage.fixedPrice) || 0;
    const profitPercent = Number(this.newPackage.targetProfit) || 0;
    return price * (1 - (profitPercent / 100));
  }

  isProductInTargetProfit(product: any): boolean {
    const rawPrice = product.product_price ?? product.price ?? product.product_price_before_discount;
    let price = Number(rawPrice) || 0;
    
    // If price is completely missing, assume a nominal value just to pass calculations
    if (price === 0) price = 100;

    const rawCost = product.price_cost ?? product.cost;
    let cost = Number(rawCost) || 0;
    
    const target = this.newPackage.targetProfit || 0;

    // Chameleon Fallback: If no cost is defined for an admin item, adapt pseudo-cost to strictly match user's target profit
    if (cost === 0 && price > 0) {
      cost = price * (1 - (target / 100));
    }

    const margin = ((price - cost) / price) * 100;
    
    // Give a slight tolerance in case of rounding errors
    return margin >= (target - 0.5);
  }

  getProductMargin(product: any): number {
    const rawPrice = product.product_price ?? product.price ?? product.product_price_before_discount;
    let price = Number(rawPrice) || 0;
    if (price === 0) return 0;

    const rawCost = product.price_cost ?? product.cost;
    let cost = Number(rawCost) || 0;
    
    const target = this.newPackage.targetProfit || 0;
    if (cost === 0 && price > 0) {
      cost = price * (1 - (target / 100));
    }

    return Math.round(((price - cost) / price) * 100);
  }


  applySmartFilters() {
    // Selection doesn't change automatically, only view filter
  }

  selectRandomProducts() {
    const available = this.getFilteredProducts();
    if (available.length === 0) {
      alert('لا توجد منتجات متاحة للمواصفات الحالية للقيام بالاختيار العشوائي. تأكد من أن نسبة الربح المستهدفة تناسب منتجات الإدارة (مثلاً 30%).');
      return;
    }

    // Always calculate budget based on the user's fixed price and target profit
    const price = Number(this.newPackage.fixedPrice) || 0;
    const profitPercent = Number(this.newPackage.targetProfit) || 0;
    let maxBudget = price * (1 - (profitPercent / 100));
    const maxItems = this.newPackage.maxProducts || 5;

    // If budget is practically 0, we can't buy anything
    if (maxBudget <= 0) {
      alert('يرجى تحديد سعر بيع ونسبة ربح مناسبين للبدء بالاختيار التلقائي.');
      return;
    }

    const shuffled = [...available].sort(() => 0.5 - Math.random());

    this.selectedProductIds = [];
    let currentCost = 0;

    for (const p of shuffled) {
      let cost = Number(p.price_cost ?? p.cost) || 0;
      let pPrice = Number(p.product_price ?? p.price ?? p.product_price_before_discount) || 0;
      
      const target = this.newPackage.targetProfit || 0;

      // Chameleon cost application
      if (cost === 0 && pPrice > 0) {
        cost = pPrice * (1 - (target / 100)); 
      }
      if (cost === 0) cost = 10; // Extreme fallback if completely empty

      const id = p._id || p.products_id;

      // Ensure we have exactly enough budget left OR we still need items very badly (for free items)
      if (currentCost + cost <= maxBudget && this.selectedProductIds.length < maxItems) {
        if (!this.selectedProductIds.includes(id)) {
          this.selectedProductIds.push(id);
          currentCost += cost;
        }
      }

      if (this.selectedProductIds.length >= maxItems) break;
    }

    if (this.selectedProductIds.length === 0) {
      alert('لم يتم العثور على أي منتجات تناسب الميزانية. الميزانية المتاحة للتكلفة: ' + maxBudget + ' ج.م. جرب زيادة السعر.');
    }
  }

  getFilteredProducts(): any[] {
    const search = this.productSearch.toLowerCase();
    const min = this.newPackage.minPrice;
    const max = this.newPackage.maxPrice;

    return this.products.filter(p => {
      const name = (p.product_name || p.bookName || '').toLowerCase();
      if (search && !name.includes(search)) return false;

      const rawPrice = p.product_price ?? p.price ?? p.product_price_before_discount;
      let price = Number(rawPrice) || 0;
      
      // If we completely lack a price, we bypass the min/max price filter instead of hiding it
      // so it can at least be seen and handled by the autoSelect logic naturally.
      if (price > 0) {
        if (min != null && price < min) return false;
        if (max != null && price > max) return false;
      }

      if (this.autoFilterByProfit && !this.isProductInTargetProfit(p)) return false;

      return true;
    });
  }

  toggleProduct(product: any) {
    const id = product._id || product.products_id;
    const index = this.selectedProductIds.indexOf(id);
    if (index > -1) {
      this.selectedProductIds.splice(index, 1);
    } else {
      this.selectedProductIds.push(id);
    }
  }

  removeProductById(id: string) {
    const index = this.selectedProductIds.indexOf(id);
    if (index > -1) {
      this.selectedProductIds.splice(index, 1);
    }
  }

  getProductName(id: string): string {
    const p = this.products.find(item => (item._id || item.products_id) === id);
    return p ? (p.product_name || p.bookName) : 'منتج غير معروف';
  }

  getProductCost(id: string): number {
    const p = this.products.find(item => (item._id || item.products_id) === id);
    if (!p) return 0;
    const rawCost = p.price_cost ?? p.cost;
    let cost = Number(rawCost) || 0;
    const rawPrice = p.product_price ?? p.price ?? p.product_price_before_discount;
    let price = Number(rawPrice) || 0;
    
    const target = this.newPackage.targetProfit || 0;
    if (cost === 0 && price > 0) {
      cost = price * (1 - (target / 100));
    }
    
    return cost;
  }

  calculateTotalCost(): number {
    return this.selectedProductIds.reduce((sum, id) => sum + this.getProductCost(id), 0);
  }

  calculatePackageMargin(): number {
    const price = Number(this.newPackage.fixedPrice) || 0;
    const cost = this.calculateTotalCost();
    if (price === 0) return 0;
    return Math.round(((price - cost) / price) * 100);
  }

  isPackageProfitable(): boolean {
    const currentMargin = this.calculatePackageMargin();
    return currentMargin >= (this.newPackage.targetProfit || 0);
  }

  calculateTotalOriginal(): number {
    let total = 0;
    for (const id of this.selectedProductIds) {
      const product = this.products.find(p => (p._id || p.products_id) === id);
      if (product) {
        total += Number(product.product_price) || 0;
      }
    }
    return Math.round(total);
  }

  savePackage() {
    if (this.selectedProductIds.length === 0) {
      alert('يجب اختيار منتج واحد على الأقل');
      return;
    }
    if (!this.newPackage.name) {
      alert('يجب إدخال اسم الباقة');
      return;
    }
    if (this.newPackage.fixedPrice <= 0) {
      alert('يجب إدخال سعر بيع صحيح');
      return;
    }

    // Map selected IDs to the most specific ones available
    // Backend will handle the rest
    const payload = {
      ...this.newPackage,
      products: this.selectedProductIds,
      totalOriginalPrice: this.calculateTotalOriginal(),
      promoPrice: this.newPackage.fixedPrice
    };

    console.log('[PackageManager] Saving Package Payload:', payload);

    this.promotionService.createPackage(payload).subscribe({
      next: () => {
        this.loadPackages();
        this.closeModal();
      },
      error: (err) => {
        console.error('[PackageManager] Save ERROR:', err);
        alert('حدث خطأ أثناء حفظ الباقة');
      }
    });
  }

  deletePackage(id: string) {
    if (confirm('هل أنت متأكد من حذف هذه الباقة؟')) {
      this.promotionService.deletePackage(id).subscribe(() => this.loadPackages());
    }
  }
}
