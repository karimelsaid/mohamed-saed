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

        // Determine if request is internal (Kenouz API or local)
        const isInternal = req.url.startsWith('/api') ||
            req.url.startsWith('/auth') ||
            req.url.startsWith('/admin') ||
            req.url.startsWith('/uploads') ||
            req.url.includes(window.location.host);

        // EXTRA safety: Explicitly skip external audio/font domains
        const isExternalMedia = req.url.includes('quranicaudio.com') ||
            req.url.includes('quran.com') ||
            req.url.includes('googleapis.com') ||
            req.url.includes('jsdelivr.net');

        if (isInternal && !isExternalMedia) {
            const userStr = localStorage.getItem('user');
            const merchantToken = localStorage.getItem('merchant_token');
            const authToken = localStorage.getItem('auth_token');

            if (userStr || merchantToken || authToken) {
                try {
                    let token: string | null = null;
                    const isMerchantRoute = req.url.includes('/api/merchant');

                    // 1. Get user token from parsed user object
                    let userToken: string | null = null;
                    if (userStr) {
                        const userObj = JSON.parse(userStr);
                        userToken = userObj.token || userObj.accessToken;
                    }

                    // 2. Selection Logic:
                    // - If it's a merchant route, prefer merchantToken.
                    // - Otherwise, prefer userToken.
                    // - Fallback to authToken (generic) if others missing.
                    if (isMerchantRoute && merchantToken) {
                        token = merchantToken;
                    } else if (userToken) {
                        token = userToken;
                    } else {
                        token = merchantToken || authToken;
                    }

                    if (token) {
                        // Attach Token
                        authReq = req.clone({
                            setHeaders: { Authorization: `Bearer ${token}` },
                            withCredentials: true
                        });
                    }
                } catch (e) {
                    console.error('❌ [AuthInterceptor] Error parsing user or token', e);
                }
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
