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
    if (!book) return 'assets/images/book-placeholder.jpg';

    // 1. If we have a full image_path that isn't just an ID, use it (but sanitize prefix)
    let imagePath = book.image_path || book.product_image || '';
    if (typeof imagePath !== 'string') imagePath = String(imagePath);

    // 2. Resolve the products_id
    const products_id = book.products_id || (book as any)._id;

    // 3. If it's a raw barcode/numeric ID, build the full subfolder path
    if (imagePath && !imagePath.includes('/') && /^\d+$/.test(imagePath)) {
      const isAdmin = book.merchantRole === 'admin' || (!book.merchantId && !book.merchantName) || book.merchantName === 'تاجر كنوز' || book.merchantName === 'كنوز';
      if (!isAdmin) {
        const sanitizedMerchantName = (book.merchantName || 'merchant').replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        imagePath = `merchant_${sanitizedMerchantName}/${imagePath}/${imagePath}.webp`;
      } else {
        imagePath = `admin__karim_mohamed__/${imagePath}/${imagePath}.webp`;
      }
    } 
    // 4. Handle paths that might be already partially constructed but missing subfolder context
    else if (imagePath && imagePath.includes('/') && !imagePath.includes('admin__') && !imagePath.includes('merchant_')) {
      // This is a legacy path format, try to reconstruct it correctly
      const parts = imagePath.split('/');
      const filename = parts[parts.length - 1];
      const isAdmin = book.merchantRole === 'admin' || (!book.merchantId && !book.merchantName) || book.merchantName === 'تاجر كنوز' || book.merchantName === 'كنوز';
      
      if (!isAdmin) {
          const sanitizedMerchantName = (book.merchantName || 'merchant').replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
          imagePath = `merchant_${sanitizedMerchantName}/${products_id}/${filename}`;
      } else {
          imagePath = `admin__karim_mohamed__/${products_id}/${filename}`;
      }
    }

    // 5. Clean up the final result to prevent double-slashing or redundant uploadsBaseUrl
    const cleanBase = this.uploadsBaseUrl.replace(/\/$/, '');
    
    // If the path already has the base, don't prepend it again
    if (imagePath.includes(cleanBase)) {
        return imagePath.startsWith('/') ? imagePath : '/' + imagePath;
    }

    // Ensure imagePath doesn't start with a slash if we're prepending the base
    const finalPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
    
    // Ensure we are pointing at the books subfolder specifically if not already there
    // But since cleanBase IS /uploads/books, we just append
    return `${cleanBase}/${finalPath}`;
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
