import { Injectable, Injector } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MerchantAuthService } from '../services/merchant-auth.service';
import { Router } from '@angular/router';

@Injectable()
export class MerchantAuthInterceptor implements HttpInterceptor {
  constructor(
    private injector: Injector,
    private router: Router
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
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
            if (error.status === 401 || error.status === 403) {
              // Clear authentication and redirect to login
              merchantAuthService.performLogout();
              this.router.navigate(['/login']);
              alert('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
            }
            return throwError(error);
          })
        );
      }
    }

    return next.handle(req);
  }
}
