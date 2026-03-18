import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, forkJoin } from 'rxjs';
import { tap, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private apiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/books/get-excel-data' : '/api/books/get-excel-data';
  private productsApiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/products/get-excel-data' : '/api/products/get-excel-data';
  private recentBooksApiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/books/get-recent-books' : '/api/books/get-recent-books';
  private ordersApiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/orders' : '/api/orders';
  private usersApiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/users' : '/api/users';

  private ordersSubject = new BehaviorSubject<any[]>([]);
  public orders$ = this.ordersSubject.asObservable();

  private uploadsBaseUrl = environment.uploadsBaseUrl || '/uploads/books';

  constructor(private http: HttpClient) { }

  getBookImageUrl(book: any): string {
    let imagePath = book.product_image ? String(book.product_image) : '';
    const products_id = book.products_id || (book as any)._id;

    if (!imagePath) {
      const isMerchant = book.merchantName && book.merchantName !== 'تاجر كنوز';
      if (isMerchant) {
        const sanitizedMerchantName = book.merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        imagePath = 'merchant_' + sanitizedMerchantName + '/' + products_id + '/' + products_id + '.webp';
      } else {
        imagePath = 'admin__karim_mohamed__/' + products_id + '/' + products_id + '.webp';
      }
    } else {
      if (imagePath.includes('/')) {
        const parts = imagePath.split('/');
        const isMerchant = (imagePath.includes('merchant_') || book.merchantName) && book.merchantName !== 'تاجر كنوز';

        if (isMerchant) {
          const filename = parts[parts.length - 1];
          const id = parts[parts.length - 2];
          const sanitizedMerchantName = book.merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
          imagePath = 'merchant_' + sanitizedMerchantName + '/' + id + '/' + filename;
        } else if (imagePath.includes('admin__') || book.merchantName === 'تاجر كنوز') {
          const filename = parts[parts.length - 1];
          const id = parts[parts.length - 2] || filename.split('.')[0];
          imagePath = 'admin__karim_mohamed__/' + id + '/' + filename;
        } else {
          imagePath = parts[parts.length - 1];
        }
      } else {
        const isMerchant = book.merchantName && book.merchantName !== 'تاجر كنوز';
        if (!imagePath.includes('.') && /^\d+$/.test(imagePath)) {
          if (isMerchant) {
            const sanitizedMerchantName = book.merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
            imagePath = 'merchant_' + sanitizedMerchantName + '/' + imagePath + '/' + imagePath + '.webp';
          } else {
            imagePath = 'admin__karim_mohamed__/' + imagePath + '/' + imagePath + '.webp';
          }
        } else if (imagePath.includes('.') && /^\d+_\d+\.webp$/.test(imagePath)) {
          const id = imagePath.split('_')[0];
          if (isMerchant) {
            const sanitizedMerchantName = book.merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
            imagePath = 'merchant_' + sanitizedMerchantName + '/' + id + '/' + imagePath;
          } else {
            imagePath = 'admin__karim_mohamed__/' + id + '/' + imagePath;
          }
        } else if (!imagePath.includes('.')) {
          imagePath += '.webp';
        }
      }
    }
    return this.uploadsBaseUrl + '/' + imagePath;
  }

  getData(): Observable<any[]> { // Changed return type to any[]
    // Add timestamp to bypass browser/server cache for real-time data
    const timestamp = new Date().getTime();
    // Corrected URL to use this.apiUrl directly with timestamp
    return this.http.get<any[]>(`${this.apiUrl}?t=${timestamp}`).pipe(
      map(books => {
        const uniqueItems = new Map<string, any>(); // Changed Book to any

        books.forEach(book => {
          let id = book.products_id || (book as any)._id;
          if (id) {
            id = id.toString();
            // Keep the first occurrence — backend already handles dedup and pricing
            if (!uniqueItems.has(id)) {
              uniqueItems.set(id, { ...book, products_id: id });
            }
          }
        });

        const result = Array.from(uniqueItems.values());
        return result;
      }),
      shareReplay(1)
    );
  }

  getRecentBooks(): Observable<any> {
    return this.http.get(this.recentBooksApiUrl);
  }

  getProductsByCategory(category: string): Observable<any> {
    return this.http.get(`${this.productsApiUrl}?category=${encodeURIComponent(category)}`);
  }

  getBooksByCategory(category: string): Observable<any> {
    return this.http.get(`${this.apiUrl}?category=${encodeURIComponent(category)}`);
  }

  submitOrder(orderData: any): Observable<any> {
    return this.http.post(this.ordersApiUrl + '/submit', orderData);
  }

  getOrders(userId: string): Observable<any> {
    return this.http.get(this.ordersApiUrl + '/user-orders/' + userId);
  }

  loadOrders(userId: string): Observable<any> {
    return this.getOrders(userId).pipe(
      tap(orders => {
        this.ordersSubject.next(orders);
      })
    );
  }

  updateOrders(orders: any[]): void {
    this.ordersSubject.next(orders);
  }

  updateUserProfile(user: any): Observable<any> {
    const url = this.usersApiUrl + '/update-profile/' + user.id;
    return this.http.put(url, user);
  }

  updateOrderShippingAddress(userId: string, orderId: string, addressData: any): Observable<any> {
    const url = this.usersApiUrl + '/' + userId + '/orders/' + orderId + '/shipping-address';
    return this.http.put(url, addressData);
  }
}
