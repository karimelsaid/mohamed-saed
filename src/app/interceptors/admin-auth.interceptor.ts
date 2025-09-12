import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AdminAuthInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Only intercept admin API calls
    if (req.url.includes('/api/admin')) {
      const user = JSON.parse(localStorage.getItem('user') || 'null');

      if (user && user.token) {
        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${user.token}`
          }
        });

        return next.handle(authReq).pipe(
          catchError((error: HttpErrorResponse) => {
            if (error.status === 401 || error.status === 403) {
              // Clear authentication and redirect to login
              this.authService.logout();
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
