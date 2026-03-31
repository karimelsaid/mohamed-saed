import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { DataService } from '../services/data.service';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-bourse',
  standalone: true,
  imports: [CommonModule, RouterModule, FontAwesomeModule],
  templateUrl: './bourse.component.html',
  styleUrls: ['./bourse.component.css']
})
export class BourseComponent implements OnInit, OnDestroy {
  activeOffer: any = null;
  enrichedBooks: any[] = [];
  isLoading = true;
  errorMessage = '';
  freeGiftThreshold = 1000;
  
  countdownStr = '00:00:00';
  private timer: any;

  // Toast notification
  toastMessage = '';
  toastType: 'success' | 'error' | 'warning' = 'success';
  showToastFlag = false;
  private toastTimer: any;

  constructor(
    private http: HttpClient,
    public dataService: DataService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.fetchActiveOffer();
  }

  fetchActiveOffer() {
    this.isLoading = true;
    this.errorMessage = '';
    this.http.get<{active: boolean; offer?: any; freeGiftThreshold: number; message?: string}>(`${environment.apiBaseUrl}/bourse/active`)
      .subscribe({
        next: (res) => {
          this.freeGiftThreshold = res.freeGiftThreshold;
          if (res.active && res.offer) {
            this.activeOffer = res.offer;
            this.enrichBooks();
            this.startCountdown();
          } else {
            this.activeOffer = null;
            this.errorMessage = res.message || 'لا يوجد عروض نشطة حالياً';
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error(err);
          this.errorMessage = 'حدث خطأ في جلب بيانات البورصة';
          this.isLoading = false;
        }
      });
  }

  enrichBooks() {
    this.dataService.getData().subscribe(products => {
       const mapped = this.activeOffer.books.map((b: any) => {
          const product = products.find(p => p.products_id === b.bookId) || {};
          return {
            ...b,
            product_image: product.product_image,
            merchantName: product.merchantName,
            products_id: b.bookId
          };
       });
       this.enrichedBooks = this.shuffle(mapped);
    });
  }

  private shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
  }

  startCountdown() {
    if (this.timer) clearInterval(this.timer);
    
    const updateTimer = () => {
      if (!this.activeOffer) return;
      const end = new Date(this.activeOffer.endTime).getTime();
      const now = new Date().getTime();
      const diff = end - now;

      if (diff <= 0) {
        clearInterval(this.timer);
        this.countdownStr = 'انتهى العرض!';
        setTimeout(() => this.fetchActiveOffer(), 3000);
        return;
      }

      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      this.countdownStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    updateTimer();
    this.timer = setInterval(updateTimer, 1000);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  showToast(message: string, type: 'success' | 'error' | 'warning' = 'success', duration = 4000) {
    this.toastMessage = message;
    this.toastType = type;
    this.showToastFlag = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.showToastFlag = false, duration);
  }

  addToCart(book: any) {
    if (book.quantityAvailable - book.quantitySold <= 0) {
      this.showToast('نفذت الكمية!', 'error');
      return;
    }

    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData?.id;

    if (!userId) {
       this.showToast('يرجى تسجيل الدخول أولاً', 'warning');
       return;
    }

    const bourseCartId = `${book.bookId}:bourse:${this.activeOffer._id}`;
    
    if (this.authService.isInCart(bourseCartId)) {
        this.showToast('هذا الكتاب موجود بالفعل في سلتك من عرض البورصة!', 'warning');
        return;
    }

    this.authService.addToCart(userId, bourseCartId).subscribe({
        next: () => {
            this.showToast('تم الإضافة للسلة ✅ السعر صالح حتى انتهاء العداد فقط!', 'success', 3500);
            this.authService.loadUserData(userId);
        },
        error: (err) => {
            console.error('Error adding bourse item to cart', err);
            this.showToast('حدث خطأ أثناء الإضافة للسلة', 'error');
        }
    });
  }
}
