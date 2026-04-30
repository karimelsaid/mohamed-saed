import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromotionService } from '../../services/promotion.service';
import { DataService } from '../../services/data.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSearch, faCheckCircle, faPlus, faMinus, faBook, faTimes } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-wheel-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  template: `
    <div class="space-y-6">
      <div class="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mb-4">
        <div class="flex">
          <div class="ml-3">
            <p class="text-sm text-yellow-700 dark:text-yellow-400">
              تنبيه: أنت تقوم بتعديل جوائز الثيم النشط حالياً. تأكد من وجود ثيم نشط أولاً.
            </p>
          </div>
        </div>
      </div>

      <div *ngIf="!loading; else spinner">
        <div *ngIf="activeTheme; else noTheme">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold dark:text-white">جوائز عجلة الحظ ({{ activeTheme.name }})</h2>
            <button (click)="savePrizes()" class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 shadow-lg active:scale-95 transition-all">
              حفظ التغييرات
            </button>
          </div>

          <!-- Spin Limit Control -->
          <div class="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div class="flex-1">
              <h3 class="font-bold text-indigo-800 dark:text-indigo-300 mb-1">🎡 عدد الدوران اليومي لكل مستخدم</h3>
              <p class="text-xs text-indigo-600 dark:text-indigo-400">حدد كم مرة يمكن للمستخدم تدوير العجلة يومياً. اضغط "حفظ التغييرات" لتطبيقه.</p>
            </div>
            <div class="flex items-center gap-3">
              <button (click)="decreaseSpinLimit()" class="w-9 h-9 rounded-full bg-indigo-200 dark:bg-indigo-800 text-indigo-900 dark:text-white font-bold text-lg hover:bg-indigo-300 dark:hover:bg-indigo-700 transition-colors flex items-center justify-center">−</button>
              <span class="text-2xl font-bold text-indigo-800 dark:text-white w-10 text-center">{{ spinLimit }}</span>
              <button (click)="$any(this).increaseSpinLimit()" class="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-700 transition-colors flex items-center justify-center">+</button>
              <span class="text-sm text-gray-500 dark:text-gray-400">مرة/يوم</span>
            </div>
          </div>

          <div class="grid gap-4">
            <div *ngFor="let prize of prizes; let i = index" class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700 flex flex-col md:flex-row items-center gap-4 hover:shadow-md transition-all">
              <span class="font-bold text-gray-400 dark:text-gray-500 w-8">#{{i + 1}}</span>
              
              <div class="flex-1 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full">
                <!-- Label -->
                <div class="space-y-1">
                  <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">النص (Label)</label>
                  <input [(ngModel)]="prize.label" type="text" class="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                </div>
                
                <!-- Type -->
                <div class="space-y-1">
                  <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">النوع</label>
                  <select [(ngModel)]="prize.type" class="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                    <option value="coupon">كوبون</option>
                    <option value="points">نقطة</option>
                    <option value="book">كتاب</option>
                    <option value="nothing">لا شيء</option>
                  </select>
                </div>

                <!-- Value / Pool Management -->
                <div class="space-y-1 md:col-span-2">
                  <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ prize.type === 'book' ? 'مجموعة الكتب' : 'القيمة (Value)' }}
                  </label>
                  
                  <div *ngIf="prize.type === 'book'" class="flex gap-2">
                    <div class="flex-1 bg-gray-50 dark:bg-gray-900 border dark:border-gray-600 rounded-lg p-2 text-xs truncate dark:text-gray-300">
                      {{ getSelectedBooksSummary(prize.value) }}
                    </div>
                    <button (click)="openBookSelector(i)" class="px-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                      <fa-icon [icon]="faBook"></fa-icon>
                    </button>
                  </div>

                  <input *ngIf="prize.type !== 'book'" [(ngModel)]="prize.value" type="text" 
                         class="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" 
                         [placeholder]="prize.type === 'coupon' ? 'أدخل كود الكوبون' : 'أدخل القيمة'">
                </div>

                <!-- Quantity & Probability -->
                <div class="grid grid-cols-2 gap-2">
                  <div class="space-y-1">
                    <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">العدد</label>
                    <input [(ngModel)]="prize.quantity" type="number" min="1" class="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2 outline-none">
                  </div>
                  <div class="space-y-1">
                    <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">الاحتمال</label>
                    <input [(ngModel)]="prize.probability" type="number" step="0.05" class="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2 outline-none">
                  </div>
                </div>
              </div>

              <button (click)="removePrize(i)" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                 حذف
              </button>
            </div>
          </div>

          <button (click)="addPrize()" class="mt-4 w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-xl hover:border-indigo-400 hover:text-indigo-600 dark:hover:hover:border-indigo-500 dark:hover:text-indigo-400 transition-all font-bold">
            <fa-icon [icon]="faPlus" class="ml-2"></fa-icon>
            إضافة جائزة جديدة
          </button>
        </div>
        
        <ng-template #noTheme>
          <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700">
            <p class="text-xl text-gray-500 dark:text-gray-400">لا يوجد ثيم نشط حالياً. يرجى تفعيل ثيم من تبويب "إدارة الثيمات".</p>
          </div>
        </ng-template>
      </div>

      <ng-template #spinner>
        <div class="flex justify-center items-center py-20">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </ng-template>
    </div>

    <!-- Book Selector Modal -->
    <div *ngIf="showSelector" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div class="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
          <div>
            <h3 class="text-xl font-bold dark:text-white">اختر الكتب للمجموعة</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">يمكنك اختيار عدة كتب ليتم اختيار أحدهما عشوائياً للرابح.</p>
          </div>
          <button (click)="closeBookSelector()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500">
            <fa-icon [icon]="faTimes"></fa-icon>
          </button>
        </div>

        <!-- Search -->
        <div class="p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <div class="relative">
            <fa-icon [icon]="faSearch" class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"></fa-icon>
            <input type="text" [(ngModel)]="searchTerm" (input)="filterBooks()" 
                   placeholder="ابحث باسم الكتاب أو التصنيف..." 
                   class="w-full pr-12 pl-4 py-3 border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <div *ngFor="let book of filteredBooks" 
               (click)="toggleBookSelection(book.products_id)"
               class="flex items-center p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors border-2 border-transparent"
               [ngClass]="{'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20': tempSelectedIds.includes(book.products_id)}">
            
            <img [src]="'https://knoozbook.com/Backend/uploads/' + book.product_image" 
                 class="w-12 h-16 object-cover rounded shadow-sm">
            
            <div class="mr-4 flex-1">
              <h4 class="font-bold text-sm dark:text-white">{{ book.product_name }}</h4>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ book.product_category }} | {{ book.product_price }} EGP</p>
            </div>

            <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                 [ngClass]="{
                   'bg-indigo-600 border-indigo-600': tempSelectedIds.includes(book.products_id),
                   'border-gray-300 dark:border-gray-600': !tempSelectedIds.includes(book.products_id)
                 }">
              <fa-icon *ngIf="tempSelectedIds.includes(book.products_id)" [icon]="faCheckCircle" class="text-white text-xs"></fa-icon>
            </div>
          </div>

          <div *ngIf="filteredBooks.length === 0" class="text-center py-10 opacity-50">
            <p>لا توجد نتائج بحث...</p>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex justify-between items-center">
          <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400">تم اختيار {{ tempSelectedIds.length }} كتاب</span>
          <div class="flex gap-3">
            <button (click)="closeBookSelector()" class="px-6 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">إلغاء</button>
            <button (click)="applySelection()" class="px-8 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all">تطبيق</button>
          </div>
        </div>
      </div>
  `
})
export class WheelManagerComponent implements OnInit {
  activeTheme: any = null;
  prizes: any[] = [];
  spinLimit: number = 1;
  loading = true;

  // Book Selector State
  showSelector = false;
  allBooks: any[] = [];
  filteredBooks: any[] = [];
  searchTerm = '';
  selectedPrizeIndex: number | null = null;
  tempSelectedIds: string[] = [];

  // Icons
  faSearch = faSearch;
  faCheckCircle = faCheckCircle;
  faPlus = faPlus;
  faMinus = faMinus;
  faBook = faBook;
  faTimes = faTimes;

  constructor(
    private promotionService: PromotionService,
    private dataService: DataService
  ) { }

  ngOnInit() {
    this.loadActiveTheme();
    this.loadAllBooks();
  }

  loadAllBooks() {
    this.dataService.getData().subscribe(books => {
      this.allBooks = books;
      this.filteredBooks = books;
    });
  }

  loadActiveTheme() {
    this.loading = true;
    this.promotionService.getActiveTheme().subscribe({
      next: (res: any) => {
        this.activeTheme = res.theme;
        if (this.activeTheme && this.activeTheme.luckyWheel) {
          this.prizes = this.activeTheme.luckyWheel.prizes || [];
          // Ensure quantity exists
          this.prizes.forEach(p => {
            if (p.quantity === undefined) p.quantity = 1;
          });
          this.spinLimit = this.activeTheme.luckyWheel.spinLimitPerUser || 1;
        }
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  getSelectedBooksSummary(value: any): string {
    if (!value || value === '') return 'لا يوجد كتب مختارة';
    const ids = Array.isArray(value) ? value : value.split(',').filter((id: string) => id);
    if (ids.length === 0) return 'لا يوجد كتب مختارة';
    return `تم اختيار ${ids.length} كتاب`;
  }

  openBookSelector(index: number) {
    this.selectedPrizeIndex = index;
    const value = this.prizes[index].value || '';
    this.tempSelectedIds = Array.isArray(value) ? [...value] : value.split(',').filter((id: string) => id);
    this.showSelector = true;
    this.searchTerm = '';
    this.filteredBooks = this.allBooks;
  }

  closeBookSelector() {
    this.showSelector = false;
    this.selectedPrizeIndex = null;
    this.tempSelectedIds = [];
  }

  filterBooks() {
    const term = this.searchTerm.toLowerCase();
    this.filteredBooks = this.allBooks.filter(b =>
      b.product_name.toLowerCase().includes(term) ||
      b.product_category.toLowerCase().includes(term)
    );
  }

  toggleBookSelection(bookId: string) {
    const index = this.tempSelectedIds.indexOf(bookId);
    if (index > -1) {
      this.tempSelectedIds.splice(index, 1);
    } else {
      this.tempSelectedIds.push(bookId);
    }
  }

  applySelection() {
    if (this.selectedPrizeIndex !== null) {
      this.prizes[this.selectedPrizeIndex].value = this.tempSelectedIds.join(',');
      this.closeBookSelector();
    }
  }

  increaseSpinLimit() {
    this.spinLimit = Math.min(this.spinLimit + 1, 10);
  }

  decreaseSpinLimit() {
    this.spinLimit = Math.max(this.spinLimit - 1, 1);
  }

  addPrize() {
    this.prizes.push({
      label: 'جائزة جديدة',
      type: 'coupon',
      value: '',
      quantity: 1,
      probability: 0.1,
      icon: 'gift'
    });
  }

  removePrize(index: number) {
    this.prizes.splice(index, 1);
  }

  savePrizes() {
    if (!this.activeTheme) return;

    const updatedTheme = {
      ...this.activeTheme,
      luckyWheel: {
        ...this.activeTheme.luckyWheel,
        prizes: this.prizes,
        spinLimitPerUser: this.spinLimit
      }
    };

    this.promotionService.updateTheme(this.activeTheme._id, updatedTheme).subscribe({
      next: () => alert('تم حفظ الإعدادات بنجاح ✅'),
      error: () => alert('حدث خطأ أثناء الحفظ')
    });
  }
}
