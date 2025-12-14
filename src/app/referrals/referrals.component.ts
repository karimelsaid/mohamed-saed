import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCopy, faShareAlt, faMoneyBillWave, faLink, faTimes, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../auth/auth.service';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { Book } from '../book';
import { environment } from '../../environments/environment';
import { User } from '../auth/user.model';
import { switchMap, take } from 'rxjs/operators';

@Component({
  selector: 'app-referrals',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule, FormsModule, RouterModule],
  templateUrl: './referrals.component.html',
  styleUrls: ['./referrals.component.css']
})
export class ReferralsComponent implements OnInit {
  decodeURIComponent = decodeURIComponent;
  @Output() closeModalEvent = new EventEmitter<void>();
  @Output() closeAllModalsEvent = new EventEmitter<void>();

  faCopy = faCopy;
  faShareAlt = faShareAlt;
  faMoneyBillWave = faMoneyBillWave;
  faLink = faLink;
  faTimes = faTimes;
  faGlobe = faGlobe;

  referralBalance: number = 0;
  referralCode: string = '';
  referrals: any[] = [];
  currentProductId: string = '';
  referralLink: string = '';
  productName: string = '';
  isRequestingPayment = false; // Add this property
  user: User | null = null;
  allProducts: Book[] = [];
  filteredProducts: Book[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private dataService: DataService
  ) { }

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      this.user = user;
      if (user && user.id) {
        this.loadReferralData(user.id);
      }
    });
    this.dataService.getData().subscribe(products => {
      if (products) {
        this.allProducts = products;
        this.filteredProducts = products;
      }
    });
  }

  loadReferralData(userId: string) {
    // Load balance
    this.http.get(`${environment.apiBaseUrl}/users/referral-balance/${userId}`).subscribe({
      next: (response: any) => {
        this.referralBalance = response.balance;
        this.referralCode = response.referralCode;
      },
      error: (error) => {
        console.error('Error loading referral balance:', error);
      }
    });

    // Load referrals
    this.http.get(`${environment.apiBaseUrl}/users/referrals/${userId}`).subscribe({
      next: (response: any) => {
        this.referrals = response.referrals;
      },
      error: (error) => {
        console.error('Error loading referrals:', error);
      }
    });
  }

  requestPayment() {
    if (this.isRequestingPayment) {
      return;
    }
    this.isRequestingPayment = true;

    this.authService.user$.pipe(
      take(1), // Get the current user value once and then unsubscribe
      switchMap(user => {
        if (!user || !user.id) {
          throw new Error('User not logged in');
        }
        return this.http.post(`${environment.apiBaseUrl}/payment-requests/request`, { userId: user.id });
      })
    ).subscribe({
      next: (response: any) => {
        alert('تم إرسال طلب الدفع بنجاح');
        this.isRequestingPayment = false;
        this.authService.user$.pipe(take(1)).subscribe(user => user && this.loadReferralData(user.id)); // Refresh balance
      },
      error: (error) => {
        console.error('Payment request failed:', error);
        alert(`فشل طلب الدفع: ${error.error?.message || 'حدث خطأ غير متوقع'}`);
        this.isRequestingPayment = false;
      }
    });
  }

  generateReferralLink(productId: string) {
    this.currentProductId = productId;
    // First, get the product name from the data service
    this.dataService.getData().subscribe((products: Book[]) => {
      const product = products.find((p: Book) => p.products_id.toString() === productId);
      if (!product) {
        alert('لم يتم العثور على المنتج بالمعرف المدخل.');
        return;
      }
      this.productName = product.product_name;

      // Now, generate the link with the product name and category
      this.authService.user$.subscribe(user => {
        if (user && user.id) {
          this.http.post(`${environment.apiBaseUrl}/users/generate-referral-link`, {
            userId: user.id,
            productId,
            productName: this.productName, // Send product name to backend
            productCategory: product.product_category // Send category to backend
          }).subscribe({
            next: (response: any) => {
              let link = response.link;
              // Ensure link is absolute and uses production domain
              if (link && !link.startsWith('http')) {
                link = `https://knoozbook.com${link.startsWith('/') ? '' : '/'}${link}`;
              } else if (link && link.includes('localhost')) {
                link = link.replace(/http:\/\/localhost:\d+/, 'https://knoozbook.com');
                link = link.replace(/https:\/\/localhost:\d+/, 'https://knoozbook.com');
              }
              this.referralLink = link;
            },
            error: (error) => {
              console.error('Error generating referral link:', error);
            }
          });
        }
      });
    });
  }

  generateGeneralReferralLink() {
    this.authService.user$.pipe(take(1)).subscribe(user => {
      if (user && this.referralCode) {
        // AUTOMATIC FIX: Use production domain explicitly to avoid localhost/file issues on Android/Cordova
        const baseUrl = 'https://knoozbook.com';
        // Construct the general referral link for registration
        this.referralLink = `${baseUrl}/register?ref=${this.referralCode}`;
      } else {
        alert('لا يمكن إنشاء رابط الإحالة. الرجاء المحاولة مرة أخرى.');
        console.error('User or referral code is missing.');
      }
    });
  }

  copyLink() {
    const decodedUrl = decodeURIComponent(this.referralLink);
    navigator.clipboard.writeText(decodedUrl);
    alert('تم نسخ الرابط!');
  }

  shareLink() {
    if (navigator.share) {
      // Robust share logic
      let shareUrl = this.referralLink;
      try {
        // Verify URL validity, default to Knoozbook if specific parsing fails
        const urlObj = new URL(this.referralLink);
        // If we want to ensure encoded/decoded consistency:
        // But usually keeping it as is is safest if it's already a valid execution URL.
        // The previous logic tried to decode pathname components.
        // Let's rely on the cleaned this.referralLink from generation methods.
      } catch (e) {
        console.warn('Invalid URL for share, attempting adjustment', e);
        if (!shareUrl.startsWith('http')) {
          shareUrl = `https://knoozbook.com/${shareUrl.replace(/^\//, '')}`;
        }
      }

      const isGeneralReferral = shareUrl.includes('/register?ref=');

      // Decode for clean display
      const cleanShareUrl = decodeURIComponent(shareUrl);

      navigator.share({
        title: isGeneralReferral ? 'انضم إلى موقعنا' : 'شارك هذا المنتج',
        text: (isGeneralReferral ? 'انضم إلى موقعنا واحصل على عروض رائعة!' : 'تحقق من هذا المنتج المثير!') + `\n${cleanShareUrl}`
      }).catch((error) => {
        console.warn('Share failed or cancelled:', error);
        // Do not automatically fallback to copy on cancel, as it confuses users.
      });
    } else {
      this.copyLink();
    }
  }

  closeModal() {
    this.referralLink = '';
    this.currentProductId = '';
    this.closeModalEvent.emit();
  }

  closeAllModals() {
    this.closeAllModalsEvent.emit();
  }

  copyId(productId: string) {
    navigator.clipboard.writeText(productId);
    alert('تم نسخ رقم المنتج!');
  }

  filterProducts(value: string) {
    const searchTerm = value.toLowerCase();
    if (!searchTerm) {
      this.filteredProducts = this.allProducts;
    } else {
      this.filteredProducts = this.allProducts.filter(product =>
        (product.product_name && product.product_name.toLowerCase().includes(searchTerm)) ||
        (product.products_id && product.products_id.toString().toLowerCase().includes(searchTerm))
      );
    }
  }

  deleteReferral(referralId: string) {
    if (confirm('هل أنت متأكد من حذف هذه الإحالة؟')) {
      this.authService.user$.pipe(take(1)).subscribe(user => {
        if (user && user.id) {
          this.http.delete(`${environment.apiBaseUrl}/users/referrals/${user.id}/${referralId}`).subscribe({
            next: (response: any) => {
              alert('تم حذف الإحالة بنجاح');
              this.loadReferralData(user.id); // Refresh the list
            },
            error: (error) => {
              console.error('Error deleting referral:', error);
              alert('حدث خطأ أثناء حذف الإحالة');
            }
          });
        }
      });
    }
  }
}
