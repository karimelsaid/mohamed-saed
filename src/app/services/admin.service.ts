import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private apiUrl = `${environment.apiBaseUrl}/admin`;

  constructor(private http: HttpClient) {}

  getMerchants(): Observable<any> {
    return this.http.get(`${this.apiUrl}/merchants`);
  }

  updateMerchantApproval(merchantId: string, approved: boolean): Observable<any> {
    return this.http.patch(`${this.apiUrl}/merchants/${merchantId}/approval`, { approved });
  }

  updateMerchantSuspension(merchantId: string, suspended: boolean): Observable<any> {
    return this.http.patch(`${this.apiUrl}/merchants/${merchantId}/suspension`, { suspended });
  }

  getMerchantProducts(): Observable<any> {
    return this.http.get(`${this.apiUrl}/merchant-products`);
  }

  getMerchantProductsByMerchant(merchantId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/merchants/${merchantId}/products`);
  }

  updateProductApproval(productId: string, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/products/${productId}/approval`, { status });
  }

  getProductUpdateRequests(): Observable<any> {
    return this.http.get(`${this.apiUrl}/product-update-requests`);
  }

  updateProductUpdateRequest(requestId: string, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/product-update-requests/${requestId}`, { status });
  }
}
