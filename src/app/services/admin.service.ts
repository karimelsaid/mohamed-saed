import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private apiUrl = `${environment.apiBaseUrl}/admin`;

  constructor(private http: HttpClient) { }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'حدث خطأ غير متوقع';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `خطأ في الاتصال: ${error.error.message}`;
    } else {
      // Server-side error
      switch (error.status) {
        case 0:
          errorMessage = 'لا يمكن الاتصال بالخادم. تحقق من الاتصال بالإنترنت.';
          break;
        case 404:
          errorMessage = 'الخدمة المطلوبة غير موجودة.';
          break;
        case 500:
          errorMessage = 'خطأ في الخادم الداخلي.';
          break;
        case 403:
          errorMessage = 'ليس لديك صلاحية للوصول لهذه الخدمة.';
          break;
        case 401:
          errorMessage = 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.';
          break;
        default:
          errorMessage = `خطأ في الخادم: ${error.status} - ${error.message}`;
      }
    }

    console.error('AdminService Error:', error);
    return throwError(() => new Error(errorMessage));
  }

  getMerchants(): Observable<any> {
    return this.http.get(`${this.apiUrl}/merchants`).pipe(
      catchError(this.handleError)
    );
  }

  updateMerchantApproval(merchantId: string, approved: boolean): Observable<any> {
    return this.http.patch(`${this.apiUrl}/merchants/${merchantId}/approval`, { approved }).pipe(
      catchError(this.handleError)
    );
  }

  updateMerchantSuspension(merchantId: string, suspended: boolean): Observable<any> {
    return this.http.patch(`${this.apiUrl}/merchants/${merchantId}/suspension`, { suspended }).pipe(
      catchError(this.handleError)
    );
  }

  updateMerchant(merchantId: string, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/merchants/${merchantId}`, data).pipe(
      catchError(this.handleError)
    );
  }

  getMerchantProducts(): Observable<any> {
    return this.http.get(`${this.apiUrl}/merchant-products`).pipe(
      catchError(this.handleError)
    );
  }

  getMerchantProductsByMerchant(merchantId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/merchants/${merchantId}/products`).pipe(
      catchError(this.handleError)
    );
  }

  updateProductApproval(productId: string, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/products/${productId}/approval`, { status }).pipe(
      catchError(this.handleError)
    );
  }

  getProductUpdateRequests(): Observable<any> {
    return this.http.get(`${this.apiUrl}/product-update-requests`).pipe(
      catchError(this.handleError)
    );
  }

  updateProductUpdateRequest(requestId: string, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/product-update-requests/${requestId}`, { status }).pipe(
      catchError(this.handleError)
    );
  }
  getSystemSettings(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings`).pipe(
      catchError(this.handleError)
    );
  }

  getPrintingSettings(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings/printing`).pipe(
      catchError(this.handleError)
    );
  }

  updateSystemSettings(settings: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/settings`, settings).pipe(
      catchError(this.handleError)
    );
  }

  bulkAdjustPrices(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/products/bulk-adjust`, payload).pipe(
      catchError(this.handleError)
    );
  }

  getPromotionDates(): Observable<any> {
    return this.http.get(`${this.apiUrl}/promotion-dates`).pipe(
      catchError(this.handleError)
    );
  }

  updatePromotionDates(dates: { startDate: string; endDate: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/update-promotion-dates`, dates).pipe(
      catchError(this.handleError)
    );
  }

  getEconomySettings(): Observable<any> {
    return this.http.get(`${this.apiUrl}/economy-settings`).pipe(
      catchError(this.handleError)
    );
  }

  updateEconomySettings(settings: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/economy-settings`, settings).pipe(
      catchError(this.handleError)
    );
  }
}
