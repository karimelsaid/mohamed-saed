import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

interface MerchantAuthResponse {
  success: boolean;
  token: string;
  merchant: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    governorate?: string;
    city?: string;
    village?: string;
    taxNumber?: string;
    logo?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MerchantAuthService {
  private apiUrl = environment.apiBaseUrl;
  private merchantTokenKey = 'merchant_token';
  private merchantDataKey = 'merchant_data';

  private merchantSubject = new BehaviorSubject<any>(null);
  merchant$ = this.merchantSubject.asObservable();

  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  isLoggedIn$ = this.isLoggedInSubject.asObservable();

  constructor(private http: HttpClient) {
    this.checkInitialLogin();
  }

  private checkInitialLogin() {
    const token = localStorage.getItem(this.merchantTokenKey);
    const merchantData = localStorage.getItem(this.merchantDataKey);

    if (token && merchantData) {
      this.isLoggedInSubject.next(true);
      this.merchantSubject.next(JSON.parse(merchantData));
    }
  }

  login(email: string, password: string): Observable<MerchantAuthResponse> {
    return this.http.post<MerchantAuthResponse>(`${this.apiUrl}/merchant/login`, { email, password }).pipe(
      tap((response: MerchantAuthResponse) => {
        if (response.success) {
          this.setMerchantAuth(response.token, response.merchant);
        }
      })
    );
  }

  logout(): Observable<any> {
    // Clear local authentication state immediately
    this.clearMerchantAuth();

    // Try to notify backend about logout (optional)
    return this.http.post(`${this.apiUrl}/merchant/logout`, {}).pipe(
      tap({
        next: () => console.log('Backend logout successful'),
        error: (error) => console.log('Backend logout failed, but local logout completed', error)
      })
    );
  }

  // Public method to handle complete logout
  performLogout(): void {
    this.clearMerchantAuth();
  }

  private setMerchantAuth(token: string, merchant: any) {
    localStorage.setItem(this.merchantTokenKey, token);
    localStorage.setItem(this.merchantDataKey, JSON.stringify(merchant));
    this.merchantSubject.next(merchant);
    this.isLoggedInSubject.next(true);
  }

  private clearMerchantAuth() {
    localStorage.removeItem(this.merchantTokenKey);
    localStorage.removeItem(this.merchantDataKey);
    this.merchantSubject.next(null);
    this.isLoggedInSubject.next(false);
  }

  getToken(): string | null {
    return localStorage.getItem(this.merchantTokenKey);
  }

  getCurrentMerchant(): any {
    const merchantData = localStorage.getItem(this.merchantDataKey);
    return merchantData ? JSON.parse(merchantData) : null;
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      // Check if token is expired
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isExpired = payload.exp * 1000 <= Date.now();

      if (isExpired) {
        this.performLogout();
        return false;
      }

      return true;
    } catch (error) {
      this.performLogout();
      return false;
    }
  }

  handleAuthError(error: any): string {
    if (error.status === 401) {
      return 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.';
    } else if (error.status === 403) {
      return 'ليس لديك صلاحية للوصول إلى هذه الصفحة.';
    } else if (error.status === 0) {
      return 'حدث خطأ في الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.';
    }
    return 'حدث خطأ أثناء المصادقة. يرجى المحاولة مرة أخرى.';
  }

  getCurrentMerchantFromAPI(): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${this.apiUrl}/merchant/current`, { headers });
  }

  getMerchantProducts(): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${this.apiUrl}/merchant/products`, { headers });
  }

  getMerchantOrders(): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${this.apiUrl}/merchant/orders`, { headers });
  }

  addMerchantProduct(productData: FormData): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.post(`${this.apiUrl}/merchant/products`, productData, { headers });
  }

  submitProductUpdateRequest(productId: string, updateData: any): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.post(`${this.apiUrl}/merchant/products/${productId}/update-request`, updateData, { headers });
  }

  getMerchantUpdateRequests(): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${this.apiUrl}/merchant/update-requests`, { headers });
  }

  deleteMerchantProduct(productId: string): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.delete(`${this.apiUrl}/merchant/products/${productId}`, { headers });
  }

  getMerchantById(id: string): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${this.apiUrl}/merchant/${id}`, { headers });
  }

  getProductsByMerchantId(id: string): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${this.apiUrl}/merchant/${id}/products`, { headers });
  }

  updateMerchantProfile(profileData: FormData): Observable<any> {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.put(`${this.apiUrl}/merchant/profile`, profileData, { headers });
  }

  getApiUrl(): string {
    return this.apiUrl;
  }
}
