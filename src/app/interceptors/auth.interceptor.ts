import { Injectable, Injector, Inject, PLATFORM_ID } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../environments/environment';

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

    constructor(
        private injector: Injector,
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        let authReq = req;

        // Skip auth logic on server or for external media
        if (!isPlatformBrowser(this.platformId)) {
            return next.handle(req);
        }

        // Determine if request is internal (Kenouz API or local)
        const isInternal = req.url.includes('/api/') ||
            req.url.startsWith(environment.apiBaseUrl) ||
            req.url.includes('knoozbook.com/api') ||
            req.url.startsWith('/auth/') ||
            req.url.startsWith('/admin/') ||
            req.url.includes('knoozbook.com/auth');

        // EXTRA safety: Explicitly skip external audio/font domains
        const isExternalMedia = req.url.includes('quranicaudio.com') ||
            req.url.includes('quran.com') ||
            req.url.includes('googleapis.com') ||
            req.url.includes('jsdelivr.net');

        // Safe logging without window reference
        console.log(`🔍 [AuthInterceptor] Intercepting: ${req.url} (isInternal: ${isInternal})`);

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

                    // 2. Selection Logic
                    if (isMerchantRoute && merchantToken) {
                        token = merchantToken;
                    } else if (userToken) {
                        token = userToken;
                    } else {
                        token = merchantToken || authToken;
                    }

                    if (token) {
                        authReq = authReq.clone({
                            setHeaders: { Authorization: `Bearer ${token}` }
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
                }
                return throwError(error);
            })
        );
    }
}
