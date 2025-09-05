import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MerchantAuthService } from '../services/merchant-auth.service';

@Injectable()
export class MerchantAuthInterceptor implements HttpInterceptor {
  constructor(private merchantAuthService: MerchantAuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Only intercept merchant API calls
    if (req.url.includes('/api/merchant')) {
      const token = this.merchantAuthService.getToken();

      if (token) {
        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        });
        return next.handle(authReq);
      }
    }

    return next.handle(req);
  }
}
