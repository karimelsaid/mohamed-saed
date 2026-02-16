import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { MerchantAuthService } from '../services/merchant-auth.service';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class MerchantAuthGuard implements CanActivate {

  constructor(
    private merchantAuthService: MerchantAuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> | boolean {
    const isAuthenticated = this.merchantAuthService.isAuthenticated();

    if (!isAuthenticated) {
      // Clear any invalid tokens
      this.merchantAuthService.performLogout();
      // Redirect to login page if not authenticated
      this.router.navigate(['/login']);
      return false;
    }

    // Always fetch fresh merchant data from API to get latest approval status
    return this.merchantAuthService.getCurrentMerchantFromAPI().pipe(
      map((response) => {
        const merchant = response.merchant;
        // Check if merchant account is suspended
        if (merchant && merchant.suspended) {
          // Redirect to home page for suspended merchants
          alert('حسابك موقوف حالياً. يرجى التواصل مع الإدارة للمزيد من المعلومات.');
          this.router.navigate(['/']);
          return false;
        }

        // Check if merchant account is approved - for all merchant routes
        const currentRoute = route.routeConfig?.path;
        // Check if current route requires approval
        const routeData = route.data;
        const requiresApproval = routeData?.['requiresApproval'];

        if (requiresApproval && merchant && !merchant.approved) {
          // Show clear message to unapproved merchants
          alert('حسابك قيد المراجعة من قبل الإدارة. لا يمكنك الوصول لهذه الصفحة حتى يتم الموافقة على حسابك.');
          // Redirect to merchant dashboard instead of home page
          this.router.navigate(['/merchant/dashboard']);
          return false;
        }

        return true;
      }),
      catchError((error) => {
        // If API call fails, redirect to login
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }
}
