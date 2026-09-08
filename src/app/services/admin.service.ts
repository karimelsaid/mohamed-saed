import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
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

  // Amazon Publishing Methods
  publishProductToAmazon(productId: string): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/amazon/products/${productId}/amazon/publish`, {}).pipe(
      catchError(this.handleError)
    );
  }

  getProductAmazonStatus(productId: string): Observable<any> {
    return this.http.get(`${environment.apiBaseUrl}/amazon/products/${productId}/amazon/status`).pipe(
      catchError(this.handleError)
    );
  }

  getAmazonProducts(status?: string): Observable<any> {
    const params: any = {};
    if (status && status !== 'all') params.status = status;
    // Use the regular products endpoint which fetches all products including pending
    return this.http.get(`${environment.apiBaseUrl}/amazon/products`, { params }).pipe(
      catchError(this.handleError)
    );
  }

  retryProductAmazonPublish(productId: string): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/amazon/products/${productId}/amazon/retry`, {}).pipe(
      catchError(this.handleError)
    );
  }

  getAmazonJobProgress(jobId: string): Observable<any> {
    return this.http.get(`${environment.apiBaseUrl}/amazon/jobs/${jobId}/progress`).pipe(
      catchError(this.handleError)
    );
  }

  syncProductAmazon(productId: string): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/amazon/products/${productId}/amazon/sync`, {}).pipe(
      catchError(this.handleError)
    );
  }

  private getAuthHeaders(): { headers?: HttpHeaders } {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      if (user && user.token) {
        return { headers: new HttpHeaders({ 'Authorization': `Bearer ${user.token}` }) };
      }
    } catch(e) {}
    return {};
  }

  // Amazon Accounts Management
  getAmazonAccounts(): Observable<any> {
    return this.http.get(`${environment.apiBaseUrl}/amazon/accounts`, this.getAuthHeaders()).pipe(
      catchError(this.handleError)
    );
  }

  createAmazonAccount(data: any): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/amazon/accounts`, data, this.getAuthHeaders()).pipe(
      catchError(this.handleError)
    );
  }

  updateAmazonAccount(id: string, data: any): Observable<any> {
    return this.http.put(`${environment.apiBaseUrl}/amazon/accounts/${id}`, data, this.getAuthHeaders()).pipe(
      catchError(this.handleError)
    );
  }

  activateAmazonAccount(id: string): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/amazon/accounts/${id}/activate`, {}, this.getAuthHeaders()).pipe(
      catchError(this.handleError)
    );
  }

  testAmazonAccountConnection(id: string): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/amazon/accounts/${id}/test`, {}, this.getAuthHeaders()).pipe(
      catchError(this.handleError)
    );
  }

  deleteAmazonAccount(id: string): Observable<any> {
    return this.http.delete(`${environment.apiBaseUrl}/amazon/accounts/${id}`, this.getAuthHeaders()).pipe(
      catchError(this.handleError)
    );
  }

  // Merchant Amazon OAuth Integration
  generateMerchantAmazonAuthUrl(merchantId: string): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/amazon/oauth/auth-url`, { merchantId }, this.getAuthHeaders()).pipe(
      catchError(this.handleError)
    );
  }

  getLinkedMerchantAmazonAccounts(): Observable<any> {
    return this.http.get(`${environment.apiBaseUrl}/amazon/oauth/merchants`, this.getAuthHeaders()).pipe(
      catchError(this.handleError)
    );
  }

  unlinkMerchantAmazonAccount(id: string): Observable<any> {
    return this.http.delete(`${environment.apiBaseUrl}/amazon/oauth/merchants/${id}`, this.getAuthHeaders()).pipe(
      catchError(this.handleError)
    );
  }

  updateAmazonProductData(productId: string, data: any): Observable<any> {
    return this.http.put(`${environment.apiBaseUrl}/amazon/products/${productId}/update`, data).pipe(
      catchError(this.handleError)
    );
  }

  republishAmazonProduct(productId: string): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/amazon/products/${productId}/republish`, {}).pipe(
      catchError(this.handleError)
    );
  }

  syncAllAmazonProducts(): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/amazon/products/bulk/sync`, {}).pipe(
      catchError(this.handleError)
    );
  }

  // Product Management Methods
  getAllProducts(): Observable<any> {
    return this.http.get(`${this.apiUrl}/products`).pipe(
      catchError(this.handleError)
    );
  }

  updateProduct(productId: string, formData: FormData): Observable<any> {
    return this.http.put(`${this.apiUrl}/products/${productId}`, formData).pipe(
      catchError(this.handleError)
    );
  }

  deleteProduct(productId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/products/${productId}`).pipe(
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

  // Marketers
  listMarketers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/marketers`).pipe(
      tap(res => console.log('📊 [ADMIN_SERVICE] Marketers received:', res)),
      catchError(this.handleError)
    );
  }

  promoteToMarketer(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/marketers/promote`, { email }).pipe(
      catchError(this.handleError)
    );
  }

  updateMarketerConfig(userId: string, config: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/marketers/${userId}/config`, config).pipe(
      catchError(this.handleError)
    );
  }

  assignMarketerTask(userId: string, task: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/marketers/${userId}/tasks`, task).pipe(
      catchError(this.handleError)
    );
  }

  addMarketerPrize(marketerId: string, prize: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/marketers/prizes/add`, { marketerId, ...prize }).pipe(
      catchError(this.handleError)
    );
  }

  removeMarketerPrize(marketerId: string, prizeId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/marketers/prizes/remove`, { marketerId, prizeId }).pipe(
      catchError(this.handleError)
    );
  }

  getGlobalPrizes(): Observable<any> {
    return this.http.get(`${this.apiUrl}/marketers/global-prizes`).pipe(
      catchError(this.handleError)
    );
  }

  addGlobalPrize(prize: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/marketers/global-prizes/add`, prize).pipe(
      catchError(this.handleError)
    );
  }

  removeGlobalPrize(prizeId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/marketers/global-prizes/${prizeId}`).pipe(
      catchError(this.handleError)
    );
  }
}
