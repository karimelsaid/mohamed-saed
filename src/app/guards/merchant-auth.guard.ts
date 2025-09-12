import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { MerchantAuthService } from '../services/merchant-auth.service';

@Injectable({
  providedIn: 'root'
})
export class MerchantAuthGuard implements CanActivate {

  constructor(
    private merchantAuthService: MerchantAuthService,
    private router: Router
  ) {}

  canActivate(): boolean {
    const isAuthenticated = this.merchantAuthService.isAuthenticated();

    if (!isAuthenticated) {
      // Clear any invalid tokens
      this.merchantAuthService.performLogout();
      // Redirect to login page if not authenticated
      this.router.navigate(['/login']);
      return false;
    }

    // Check if merchant account is suspended
    const merchant = this.merchantAuthService.getCurrentMerchant();
    if (merchant && merchant.suspended) {
      // Redirect to home page for suspended merchants
      alert('حسابك موقف حالياً. يرجى التواصل مع الإدارة للمزيد من المعلومات.');
      this.router.navigate(['/']);
      return false;
    }

    return true;
  }
}
