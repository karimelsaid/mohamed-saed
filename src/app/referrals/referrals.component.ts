import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCopy, faShareAlt, faMoneyBillWave, faLink, faTimes, faGlobe, faUsers } from '@fortawesome/free-solid-svg-icons';
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
  faUsers = faUsers;

  referralBalance: number = 0;
  referralCode: string = '';
  referrals: any[] = [];
  currentProductId: string = '';
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

  shareCode() {
    if (this.referralCode && navigator.share) {
      navigator.share({
        title: 'كود دعوة كنوز بوك',
        text: `استخدم كود الدعوة الخاص بي: ${this.referralCode} عند التسجيل في كنوز بوك!`,
      }).catch(err => console.log('Error sharing:', err));
    } else if (this.referralCode) {
      this.copyCode();
      alert('تم نسخ الكود للمشاركة!');
    }
  }

  copyCode() {
    if (this.referralCode) {
      navigator.clipboard.writeText(this.referralCode);
      alert('تم نسخ كود الدعوة!');
    } else {
      alert('كود الدعوة غير متوفر حالياً');
    }
  }

  closeModal() {
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
