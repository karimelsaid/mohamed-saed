import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry, map } from 'rxjs/operators';

interface Merchant {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  governorate?: string;
  city?: string;
  village?: string;
  taxNumber?: string;
  logo?: string;
}

interface Product {
  products_id: string;
  product_name: string;
  product_quantity: number;
  product_category: string;
  product_description: string;
  product_price: number;
  price_cost: number;
  product_image?: string;
  merchantLogo?: string;
}

interface Order {
  _id: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  products: { product_name: string; product_quantity: number }[];
  status: string;
  orderDate: string;
  totalAmount: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MerchantService {
  private apiUrl = '/api/merchant';

  constructor(private http: HttpClient) {}

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'حدث خطأ غير متوقع';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `خطأ: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 401:
          errorMessage = 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.';
          break;
        case 403:
          errorMessage = 'ليس لديك صلاحية للوصول إلى هذه البيانات.';
          break;
        case 404:
          errorMessage = 'لم يتم العثور على بيانات التاجر.';
          break;
        case 500:
          errorMessage = 'خطأ في الخادم. يرجى المحاولة لاحقًا.';
          break;
        default:
          errorMessage = `خطأ: ${error.status}`;
      }
    }

    console.error('Merchant Service Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  getCurrentMerchant(): Observable<Merchant> {
    return this.http.get<ApiResponse<Merchant>>(`${this.apiUrl}/current`).pipe(
      retry(1),
      catchError(this.handleError),
      map(response => {
        if (response.success && response.data) {
          return response.data;
        }
        throw new Error(response.message || 'فشل في تحميل بيانات التاجر');
      })
    );
  }

  getMerchantProducts(): Observable<Product[]> {
    return this.http.get<ApiResponse<Product[]>>(`${this.apiUrl}/products`).pipe(
      retry(1),
      catchError(this.handleError),
      map(response => {
        if (response.success && response.data) {
          return response.data;
        }
        return [];
      })
    );
  }

  getMerchantOrders(): Observable<Order[]> {
    return this.http.get<ApiResponse<Order[]>>(`${this.apiUrl}/orders`).pipe(
      retry(1),
      catchError(this.handleError),
      map(response => {
        if (response.success && response.data) {
          return response.data;
        }
        return [];
      })
    );
  }

  addProduct(productData: FormData): Observable<{ success: boolean; message: string }> {
    return this.http.post<ApiResponse<{ success: boolean; message: string }>>(`${this.apiUrl}/products`, productData).pipe(
      catchError(this.handleError),
      map(response => ({
        success: response.success || false,
        message: response.message || 'تمت العملية بنجاح'
      }))
    );
  }
}
