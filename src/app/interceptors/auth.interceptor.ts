import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

    // List of paths that require authentication
    private protectedPaths = [
        '/api/subscriptions',
        '/api/user-library',
        '/api/reading-progress',
        '/api/reading-progress',
        '/api/ebooks',
        '/api/users' // CRITICAL FIX: Protect user routes to send token for profile load
    ];

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        // Check if this request is to a protected path
        const isProtectedPath = this.protectedPaths.some(path => req.url.includes(path));

        if (isProtectedPath) {
            // 1. Try generic user token
            const userStr = localStorage.getItem('user');
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    if (user && (user.token || user.accessToken)) {
                        return next.handle(req.clone({
                            setHeaders: { Authorization: `Bearer ${user.token || user.accessToken}` },
                            withCredentials: true
                        }));
                    }
                } catch (e) {
                    console.error('Error parsing user from localStorage:', e);
                }
            }

            // 2. Try merchant token
            const merchantToken = localStorage.getItem('merchant_token');
            if (merchantToken) {
                return next.handle(req.clone({
                    setHeaders: { Authorization: `Bearer ${merchantToken}` },
                    withCredentials: true
                }));
            }
        }

        return next.handle(req);
    }
}
