import { Injectable, Injector } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

    // List of paths that require authentication
    private protectedPaths = [
        '/api/subscriptions',
        '/api/user-library',
        '/api/reading-progress',
        '/api/ebooks',
        '/api/users',
        '/api/gamification',
        '/api/notifications'
    ];

    constructor(private injector: Injector, private router: Router) { }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        let authReq = req;

        // Skip specific external domains that don't allow credentials or don't need auth
        if (!req.url.includes('googleapis.com') && !req.url.includes('jsdelivr.net') && !req.url.includes('api.quran.com')) {
            const userStr = localStorage.getItem('user');
            const merchantToken = localStorage.getItem('merchant_token');

            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    let token = user.token || user.accessToken;

                    if (!token) {
                        token = localStorage.getItem('merchant_token');
                    }

                    if (token) {
                        // Attach User Token
                        // console.log(`🔑 [AuthInterceptor] Token found and attached for ${req.url}`);
                        authReq = req.clone({
                            setHeaders: { Authorization: `Bearer ${token}` },
                            withCredentials: true
                        });
                    } else {
                        console.warn(`⚠️ [AuthInterceptor] User found in localStorage but NO TOKEN found for ${req.url}`);
                    }
                } catch (e) {
                    console.error('❌ [AuthInterceptor] Error parsing user', e);
                }
            }
            // If no user token, check for merchant token
            else if (merchantToken) {
                authReq = req.clone({
                    setHeaders: { Authorization: `Bearer ${merchantToken}` },
                    withCredentials: true
                });
            }
        }

        return next.handle(authReq).pipe(
            catchError((error: HttpErrorResponse) => {
                if (error.status === 401) {
                    console.error(`🚨 [AuthInterceptor] 401 Unauthorized for ${req.url}`);

                    // NOTE: Temporarily disabled automatic logout to prevent losing sessions on Android 
                    // when intermittent auth issues occur.
                    /*
                    if (req.url.includes('/api') && !this.router.url.includes('/login')) {
                        const authService = this.injector.get(AuthService);
                        authService.logout();
                        this.router.navigate(['/login']);
                    }
                    */
                }
                return throwError(error);
            })
        );
    }
}
