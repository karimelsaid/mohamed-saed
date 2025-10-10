import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faUserCircle, faEnvelope, faPhoneAlt, faSignOutAlt, faSignInAlt, faUserPlus, faClipboardList, faMoneyBillWave, faLink, faMapMarkerAlt } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../auth.service';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ReferralsComponent } from '../../referrals/referrals.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-account-modal',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule, ReferralsComponent],
  templateUrl: './account-modal.component.html',
  styleUrls: ['./account-modal.component.css']
})
export class AccountModalComponent implements OnInit {
  @Output() modalClosed = new EventEmitter<void>();

  faUserCircle = faUserCircle;
  faEnvelope = faEnvelope;
  faPhoneAlt = faPhoneAlt;
  faSignOutAlt = faSignOutAlt;
  faSignInAlt = faSignInAlt;
  faUserPlus = faUserPlus;
  faClipboardList = faClipboardList;
  faMoneyBillWave = faMoneyBillWave;
  faLink = faLink;
  faMapMarkerAlt = faMapMarkerAlt; // This was missing

  show = false;
  showReferralModal = false;
  isLoggedIn: boolean = false;
  isMerchantLoggedIn: boolean = false;

  user: any = {
    username: '',
    email: '',
    phone: ''
  };

  merchant: any = null;

  referralBalance: number = 0;

  constructor(
    private router: Router,
    private authService: AuthService,
    private merchantAuthService: MerchantAuthService,
    private cdRef: ChangeDetectorRef,
    private http: HttpClient
  ) { }

  ngOnInit() {
    // اسمع لتحديثات تسجيل الدخول
    this.authService.isLoggedIn$.subscribe(status => {
      this.isLoggedIn = status;
    });

    // اسمع لتحديث بيانات المستخدم
    this.authService.user$.subscribe(user => {
      if (user) {
        this.user = user;
        this.loadReferralBalance();
      }
    });

    // استمع لتحديثات تسجيل دخول التاجر
    this.merchantAuthService.isLoggedIn$.subscribe(status => {
      this.isMerchantLoggedIn = status;
      if (!status) {
        this.merchant = null;
      } else if (status && (!this.merchant || !this.merchant.email)) {
        // If merchant is logged in but data is not loaded, try to load it
        this.refreshMerchantData();
      }
    });

    // استمع لتحديث بيانات التاجر
    this.merchantAuthService.merchant$.subscribe(merchant => {
      this.merchant = merchant;
    });

    // Load merchant data if merchant is logged in but data is missing
    if (this.merchantAuthService.isAuthenticated() && (!this.merchant || !this.merchant.email)) {
      this.refreshMerchantData();
    }
  }

  loadUserData(userId: string) {
    if (!userId) {
      this.authService.clearFavoritesAndCart(); // أو أي إجراء مناسب
      return;
    }

    this.authService.loadUserData(userId);
  }

  openModal() {
    this.show = true;
    this.loadReferralBalance();
    // Refresh merchant data if merchant is logged in
    if (this.isMerchantLoggedIn) {
      // If merchant data is not loaded, refresh it
      if (!this.merchant || !this.merchant.email) {
        this.refreshMerchantData();
      }
    }
  }

  loadReferralBalance() {
    if (this.user && this.user.id) {
      this.http.get(`${environment.apiBaseUrl}/users/referral-balance/${this.user.id}`).subscribe({
        next: (response: any) => {
          this.referralBalance = response.balance;
        },
        error: (error) => {
          console.error('Error loading referral balance:', error);
        }
      });
    }
  }

  refreshMerchantData() {
    this.merchantAuthService.getCurrentMerchantFromAPI().subscribe({
      next: (response) => {
        if (response.success && response.merchant) {
          const merchantData = response.merchant;
          // Update the merchant auth service state
          this.merchantAuthService['merchantSubject'].next(merchantData);
          // Update local storage
          localStorage.setItem('merchant_data', JSON.stringify(merchantData));
          this.merchant = merchantData;
          this.cdRef.detectChanges();
        }
      },
      error: (error) => {
        // Handle error silently
      }
    });
  }

  closeModal() {
    this.show = false;
    this.modalClosed.emit();
  }

  goToLogin() {
    this.closeModal();
    this.router.navigate(['/login']);
  }

  goToRegister() {
    this.closeModal();
    this.router.navigate(['/register']);
  }

  goToMerchantDashboard() {
    this.closeModal();
    this.router.navigate(['/merchant/dashboard']);
  }

  viewReferrals() {
    this.showReferralModal = true;
    this.show = false; // إخفاء نافذة الحساب الرئيسية
  }

  handleReferralModalClose() {
    this.showReferralModal = false;
    this.show = true;
    this.cdRef.detectChanges(); // Force change detection
  }

  goToProfile() {
    this.closeModal();
    this.router.navigate(['/profile']);
  }

  logout() {
    // Check if merchant is logged in and logout accordingly
    if (this.isMerchantLoggedIn) {
      // Clear local state first
      this.isMerchantLoggedIn = false;
      this.merchant = null;

      // Use public method to clear auth state
      this.merchantAuthService.performLogout();

      // Try to notify backend about logout (optional)
      this.merchantAuthService.logout().subscribe({
        next: () => {
          // Merchant logged out successfully
        },
        error: (error) => {
          // Backend logout failed, but local logout completed
        }
      });

      // Also logout from regular user session if exists
      if (this.isLoggedIn) {
        this.authService.logout();
      }
    } else {
      this.authService.logout();
    }
    this.closeModal();
    this.router.navigate(['/']);
  }

  setUserData(userData: { username: string; email: string; phone: string }) {
    localStorage.setItem('user', JSON.stringify(userData));
    this.user = userData;
    this.isLoggedIn = true;
    this.authService.setLoginStatus(true); // تحديث حالة تسجيل الدخول عند إضافة بيانات المستخدم
  }
}
