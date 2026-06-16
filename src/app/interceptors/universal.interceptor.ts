import { Injectable, Inject, PLATFORM_ID, Optional } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { isPlatformServer } from '@angular/common';
import { Observable } from 'rxjs';

@Injectable()
export class UniversalInterceptor implements HttpInterceptor {
    constructor(
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        let serverReq = req;

        if (isPlatformServer(this.platformId)) {
            let targetUrl = req.url;
            
            // If it starts with the production API URL, convert to relative /api
            if (targetUrl.startsWith('https://knoozbook.com/api')) {
                targetUrl = targetUrl.replace('https://knoozbook.com/api', '/api');
            }
            
            // If the request is relative (starts with /api), prepend the server base URL
            if (targetUrl.startsWith('/api')) {
                // We use localhost:3000 as identified in the backend logs
                serverReq = req.clone({
                    url: `http://localhost:3000${targetUrl}`
                });
                console.log(`🌐 [UniversalInterceptor] SSR Prefix: ${serverReq.url}`);
            }
        }

        return next.handle(serverReq);
    }
}
