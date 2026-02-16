import { Injectable, Injector } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AdminAuthInterceptor implements HttpInterceptor {
  constructor(
    private injector: Injector,
    private router: Router
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Only intercept admin API calls
    if (req.url.includes('/api/admin') || req.url.includes('/api/notifications/admin')) {
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
              // Only logout if the user is actually an admin
              const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
              if (currentUser && currentUser.role === 'admin') {
                const authService = this.injector.get(AuthService);
                authService.logout();
                this.router.navigate(['/login']);
                // alert('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
              }
              // If not admin, do nothing (let the component handle it or ignore)
            } else if (error.status === 403) {
              alert('ليس لديك صلاحية للوصول لهذا المحتوى.');
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
