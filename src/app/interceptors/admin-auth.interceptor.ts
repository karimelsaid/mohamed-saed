import { Injectable, Injector, Inject, PLATFORM_ID } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AdminAuthInterceptor implements HttpInterceptor {
  constructor(
    private injector: Injector,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!isPlatformBrowser(this.platformId)) {
      return next.handle(req);
    }

    // Only intercept admin and amazon API calls
    if (req.url.includes('/api/admin') || req.url.includes('/api/amazon') || req.url.includes('/api/notifications/admin')) {
      const user = JSON.parse(localStorage.getItem('user') || 'null');

      if (user && user.token) {
        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${user.token}`
          }
        });

        return next.handle(authReq).pipe(
          catchError((error: HttpErrorResponse) => {
            if (error.status === 401) {
              // Skip force logout for register-sale to let the component handle authError and guide the user
              if (req.url.includes('/api/admin/register-sale')) {
                return throwError(error);
              }

              // Only logout if the user is actually an admin
              const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
              if (currentUser && currentUser.role === 'admin') {
                const authService = this.injector.get(AuthService);
                authService.logout();
                this.router.navigate(['/login']);
              }
            } else if (error.status === 403) {
              // Avoid alerts on server (already guarded by isPlatformBrowser but good practice)
              console.error('Forbidden access');
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
