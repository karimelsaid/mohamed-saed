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

    // 1. Get the base image source (prioritize image_path as it contains the ?v= timestamp)
    let imagePath = book.image_path || book.product_image || '';
    if (typeof imagePath !== 'string') imagePath = String(imagePath);

    // 2. Resolve the products_id (used for folder naming)
    let products_id = book.products_id || (book as any)._id;
    if (products_id) products_id = String(products_id).trim();

    // 3. Determine if it's admin or merchant
    const merchantName = book.merchantName;
    const isAdmin = book.merchantRole === 'admin' || !merchantName || merchantName === 'كنوز' || merchantName === 'تاجر كنوز' || merchantName === 'Kenouz';

    // 4. Handle paths with slashes (Extract filename or validate structured path)
    if (imagePath && imagePath.includes('/')) {
      const parts = imagePath.split('/');
      const filename = parts[parts.length - 1];
      
      // Check if the path's ownership matches the book's ownership
      const pathIsAdmin = imagePath.includes('admin');
      const ownershipMatches = (isAdmin && pathIsAdmin) || (!isAdmin && imagePath.includes('merchant'));

      if (ownershipMatches && parts.length >= 3) {
        // Ownership matches and we have a full structured path, use it
        imagePath = parts.slice(-3).join('/');
      } else {
        // Ownership mismatch or incomplete path, just take the filename and rebuild later
        imagePath = filename;
      }
    }

    // 5. If it's just a filename (no slashes), wrap it in the structured path
    if (imagePath && !imagePath.includes('/')) {
      let filename = imagePath;
      if (!filename.includes('.')) {
        filename += '.webp';
      }

      const folderName = products_id || (filename.match(/^\d+/) ? filename.match(/^\d+/)![0] : 'unknown');
      
      if (isAdmin) {
        imagePath = `admin__karim_mohamed__/${folderName}/${filename}`;
      } else {
        const sanitizedMerchantName = String(merchantName || 'merchant').replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        imagePath = `merchant_${sanitizedMerchantName}/${folderName}/${filename}`;
      }
    } 
    // 6. Handle empty path fallback
    else if (!imagePath) {
      const folderName = products_id || 'unknown';
      if (isAdmin) {
        imagePath = `admin__karim_mohamed__/${folderName}/${folderName}.webp`;
      } else {
        const sanitizedMerchantName = String(merchantName || 'merchant').replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        imagePath = `merchant_${sanitizedMerchantName}/${folderName}/${folderName}.webp`;
      }
    }

    // 7. Return the final URL with uploadsBaseUrl
    const cleanBase = this.uploadsBaseUrl.replace(/\/$/, '');
    
    // Check if the path already contains the base (to avoid double prefixing)
    if (imagePath.includes(cleanBase)) {
      return imagePath.startsWith('/') ? imagePath : '/' + imagePath;
    }

    const finalPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
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
            
            // Standardize merchant detection (Treat Kenouz/Empty as Admin)
            const rawMerchantName = book.merchantName || '';
            const isKenouz = !rawMerchantName || rawMerchantName === 'كنوز' || rawMerchantName === 'تاجر كنوز' || rawMerchantName === 'Kenouz' || book.merchantRole === 'admin';
            
            const enrichedBook = { 
              ...book, 
              products_id: id,
              merchantRole: isKenouz ? 'admin' : (book.merchantRole || 'merchant'),
              // Ensure merchantName is removed if it's Kenouz to hide "By Kenouz"
              merchantName: isKenouz ? null : rawMerchantName
            };

            if (!uniqueItems.has(id)) {
              uniqueItems.set(id, enrichedBook);
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
