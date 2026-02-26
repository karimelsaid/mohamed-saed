import { Injectable, Injector, Inject, PLATFORM_ID } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MerchantAuthService } from '../services/merchant-auth.service';
import { Router } from '@angular/router';

@Injectable()
export class MerchantAuthInterceptor implements HttpInterceptor {
  constructor(
    private injector: Injector,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!isPlatformBrowser(this.platformId)) {
      return next.handle(req);
    }

    // Only intercept merchant API calls
    if (req.url.includes('/merchant')) {
      const merchantAuthService = this.injector.get(MerchantAuthService);
      const token = merchantAuthService.getToken();

      if (token) {
        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        });

        return next.handle(authReq).pipe(
          catchError((error: HttpErrorResponse) => {
            if (error.status === 401) {
              merchantAuthService.performLogout();
              this.router.navigate(['/login']);
            } else if (error.status === 403) {
              console.error('Forbidden merchant access');
              this.router.navigate(['/']);
            }
            return throwError(error);
          })
        );
      }
    }

    return next.handle(req);
  }
}
