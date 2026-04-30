import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromotionService } from '../../services/promotion.service';

@Component({
  selector: 'app-hero-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Hero Mode Settings -->
      <div class="bg-indigo-50 dark:bg-indigo-900/30 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800 shadow-sm">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="space-y-1">
            <h2 class="text-xl font-bold text-indigo-900 dark:text-indigo-100">وضع عرض الهيرو (Hero Display Mode)</h2>
            <p class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">اختر كيف يظهر الجزء العلوي من الموقع للزوار</p>
          </div>
          
          <div class="flex items-center gap-4 bg-white dark:bg-gray-800 p-1 rounded-xl shadow-inner border dark:border-gray-700">
            <button 
              (click)="setHeroMode('slider')"
              [class.bg-indigo-600]="heroConfig.mode === 'slider'"
              [class.text-white]="heroConfig.mode === 'slider'"
              class="px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300">
              سلايدر عادي
            </button>
            <button 
              (click)="setHeroMode('scrolling')"
              [class.bg-indigo-600]="heroConfig.mode === 'scrolling'"
              [class.text-white]="heroConfig.mode === 'scrolling'"
              class="px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300">
              أعمدة كتب متحركة
            </button>
          </div>
        </div>

        <!-- Scrolling Mode Settings -->
        <div *ngIf="heroConfig.mode === 'scrolling'" class="mt-6 pt-6 border-t border-indigo-200/50 dark:border-indigo-700/50 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-2 duration-500">
          <div>
            <label class="block text-sm font-bold mb-2 text-indigo-900 dark:text-indigo-100">عدد الأعمدة</label>
            <select [(ngModel)]="heroConfig.columnCount" (change)="saveHeroConfig()" class="w-full rounded-xl border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 font-bold focus:ring-2 focus:ring-indigo-500">
              <option [ngValue]="2">عمودين (هادئ)</option>
              <option [ngValue]="3">3 أعمدة (متوازن)</option>
              <option [ngValue]="4">4 أعمدة (حيوي)</option>
              <option [ngValue]="5">5 أعمدة (كثيف)</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-bold mb-2 text-indigo-900 dark:text-indigo-100">سرعة الحركة</label>
            <select [(ngModel)]="heroConfig.scrollingSpeed" (change)="saveHeroConfig()" class="w-full rounded-xl border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 font-bold focus:ring-2 focus:ring-indigo-500">
              <option value="slow">سرعة هادئة (Slow)</option>
              <option value="medium">سرعة متوسطة (Medium)</option>
              <option value="fast">سرعة نشطة (Fast)</option>
            </select>
          </div>
          <div class="flex items-end">
             <div class="text-[10px] text-indigo-500 font-medium italic p-2 bg-indigo-50 dark:bg-gray-800 rounded-lg border border-indigo-100 dark:border-gray-700">
                سيتم سحب كتب عشوائية ذات صور عالية الجودة من متجرك تلقائياً.
             </div>
          </div>
        </div>
      </div>

      <hr class="border-gray-100 dark:border-gray-800">

      <div class="flex justify-between items-center">
        <div class="space-y-1">
          <h2 class="text-xl font-bold dark:text-white">قائمة السلايدات الحالية</h2>
          <p class="text-xs text-gray-500">هذه السلايدات تظهر فقط عندما يكون وضع العرض "سلايدر عادي"</p>
        </div>
        <button (click)="openModal()" class="bg-[#C5A059] hover:bg-gold-700 text-white px-6 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg font-bold flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
          إضافة سلايد جديد
        </button>
      </div>

      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div *ngFor="let slide of slides" class="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm overflow-hidden group hover:shadow-md transition-all duration-300">
          <div class="aspect-video relative overflow-hidden">
            <img [src]="slide.desktopPath?.startsWith('/uploads') ? slide.desktopPath : '/' + slide.desktopPath" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-5">
              <span class="text-white font-bold text-lg mb-1 leading-tight">{{ slide.titleAr || 'بدون عنوان' }}</span>
              <div class="flex items-center gap-3">
                <span class="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-white text-[10px] uppercase tracking-wider font-bold">Slide #{{ slide.order }}</span>
                <span *ngIf="slide.isActive" class="flex items-center gap-1 text-green-400 text-[10px] font-bold">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  نشط
                </span>
              </div>
            </div>
            
            <div class="absolute top-3 left-3 flex gap-2">
              <button (click)="deleteSlide(slide)" class="w-9 h-9 bg-red-500/90 backdrop-blur-md text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Modal (Simplified) -->
      <div *ngIf="showModal" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
        <div class="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-lg border dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-300">
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-2xl font-black dark:text-white">إضافة سلايد جديد</h3>
            <button (click)="closeModal()" class="text-gray-400 hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="space-y-5">
            <div class="grid grid-cols-2 gap-5">
              <div class="space-y-2">
                <label class="block text-sm font-bold dark:text-gray-300">صورة الديسكتوب</label>
                <div class="relative aspect-video bg-gray-50 dark:bg-gray-900 rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-indigo-400 transition-all group">
                  <img *ngIf="currentSlide.desktopPath" [src]="currentSlide.desktopPath.startsWith('/uploads') ? currentSlide.desktopPath : '/' + currentSlide.desktopPath" class="absolute inset-0 w-full h-full object-cover">
                  <div *ngIf="!currentSlide.desktopPath" class="text-center p-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto text-gray-300 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input type="file" (change)="onFileSelected($event, 'desktop')" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*">
                </div>
                <div *ngIf="isUploadingDesktop" class="text-[10px] text-blue-600 font-bold animate-pulse text-center">جاري الرفع...</div>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-bold dark:text-gray-300">صورة الجوال</label>
                <div class="relative aspect-[9/16] h-40 mx-auto bg-gray-50 dark:bg-gray-900 rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-indigo-400 transition-all group">
                  <img *ngIf="currentSlide.mobilePath" [src]="currentSlide.mobilePath.startsWith('/uploads') ? currentSlide.mobilePath : '/' + currentSlide.mobilePath" class="absolute inset-0 w-full h-full object-cover">
                  <div *ngIf="!currentSlide.mobilePath" class="text-center p-4">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mx-auto text-gray-300 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input type="file" (change)="onFileSelected($event, 'mobile')" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*">
                </div>
                <div *ngIf="isUploadingMobile" class="text-center text-[10px] text-blue-600 font-bold animate-pulse">جاري الرفع...</div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-bold mb-1.5 dark:text-gray-300">عنوان السلايد</label>
                <input [(ngModel)]="currentSlide.titleAr" type="text" placeholder="مثلاً: كتب نادرة" class="w-full rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-white p-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
              </div>
              <div>
                <label class="block text-sm font-bold mb-1.5 dark:text-gray-300">ترتيب العرض</label>
                <input [(ngModel)]="currentSlide.order" type="number" class="w-full rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-white p-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
              </div>
            </div>

            <label class="inline-flex items-center cursor-pointer">
              <input [(ngModel)]="currentSlide.isActive" type="checkbox" class="sr-only peer">
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
              <span class="mr-3 text-sm font-bold text-gray-700 dark:text-gray-300">تفعيل السلايد مباشرة</span>
            </label>
          </div>

          <div class="mt-8 flex gap-3">
             <button (click)="saveSlide()" [disabled]="!currentSlide.desktopPath || !currentSlide.mobilePath" class="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed">حفظ السلايد بنجاح</button>
             <button (click)="closeModal()" class="px-6 py-4 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .animate-in { animation: animateIn 0.3s ease-out; }
    @keyframes animateIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class HeroManagerComponent implements OnInit {
  slides: any[] = [];
  showModal = false;
  currentSlide = this.getEmptySlide();
  isUploadingDesktop = false;
  isUploadingMobile = false;

  heroConfig = {
    mode: 'slider',
    columnCount: 4,
    scrollingSpeed: 'fast'
  };

  constructor(private promotionService: PromotionService) { }

  ngOnInit() {
    this.loadSlides();
    this.loadHeroConfig();
  }

  loadSlides() {
    this.promotionService.getHeroSlides().subscribe({
      next: (res: any) => this.slides = res.slides || [],
      error: (err) => console.error(err)
    });
  }

  loadHeroConfig() {
    this.promotionService.getHeroConfig().subscribe({
      next: (res: any) => {
        if (res) this.heroConfig = { ...this.heroConfig, ...res };
      },
      error: (err) => console.error(err)
    });
  }

  setHeroMode(mode: 'slider' | 'scrolling') {
    this.heroConfig.mode = mode;
    this.saveHeroConfig();
  }

  saveHeroConfig() {
    this.promotionService.updateHeroConfig(this.heroConfig).subscribe({
      next: () => console.log('Hero config updated'),
      error: (err) => alert('Error updating config: ' + err.message)
    });
  }

  getEmptySlide() {
    return {
      desktopPath: '',
      mobilePath: '',
      titleAr: '',
      order: 0,
      isActive: true
    };
  }

  openModal() {
    this.currentSlide = this.getEmptySlide();
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  onFileSelected(event: any, target: 'desktop' | 'mobile') {
    const file = event.target.files[0];
    if (!file) return;

    if (target === 'desktop') this.isUploadingDesktop = true;
    else this.isUploadingMobile = true;

    this.promotionService.uploadHeroImage(file).subscribe({
      next: (res: any) => {
        if (target === 'desktop') {
          this.currentSlide.desktopPath = res.imageUrl;
          this.isUploadingDesktop = false;
        } else {
          this.currentSlide.mobilePath = res.imageUrl;
          this.isUploadingMobile = false;
        }
      },
      error: (err) => {
        alert('Upload failed: ' + (err.error?.message || err.message));
        if (target === 'desktop') this.isUploadingDesktop = false;
        else this.isUploadingMobile = false;
      }
    });
  }

  saveSlide() {
    if (!this.currentSlide.desktopPath || !this.currentSlide.mobilePath) {
      alert('يجب رفع الصور أولاً');
      return;
    }
    this.promotionService.createHeroSlide(this.currentSlide).subscribe({
      next: () => {
        this.loadSlides();
        this.closeModal();
      },
      error: (err) => alert('Error saving slide: ' + err.message)
    });
  }

  deleteSlide(slide: any) {
    if (confirm('هل أنت متأكد من حذف هذا السلايد وصوره نهائياً؟')) {
      this.promotionService.deleteHeroSlide(slide._id).subscribe({
        next: () => this.loadSlides(),
        error: (err) => alert('Error deleting slide: ' + err.message)
      });
    }
  }
}
