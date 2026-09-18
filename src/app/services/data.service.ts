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
  private searchApiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/books/search' : '/api/books/search';
  private ordersApiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/orders' : '/api/orders';
  private usersApiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/users' : '/api/users';
  private categoriesApiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/books/categories' : '/api/books/categories';
  private adminCategoriesApiUrl = environment.apiBaseUrl ? environment.apiBaseUrl + '/categories' : '/api/categories';

  private ordersSubject = new BehaviorSubject<any[]>([]);
  public orders$ = this.ordersSubject.asObservable();

  private booksSubject = new BehaviorSubject<any[]>([]);
  private isLoaded = false;
  private loadingObservable: Observable<any[]> | null = null;

  private uploadsBaseUrl = environment.uploadsBaseUrl || '/uploads/books';

  constructor(private http: HttpClient) { }

  // Utility to shuffle an array (Fisher-Yates algorithm)
  shuffleArray(array: any[]): any[] {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  }

  getBookImageUrl(book: any): string {
    if (!book) return 'assets/image/book-placeholder.jpg';

    // 1. Check if product_image itself is a full URL (variation specific)
    const product_image = book.product_image || '';
    if (typeof product_image === 'string' && (product_image.startsWith('http://') || product_image.startsWith('https://'))) {
      return product_image;
    }

    // 2. Check if image_path is a full URL (original source)
    let image_path = book.image_path || '';
    if (typeof image_path === 'string' && (image_path.startsWith('http://') || image_path.startsWith('https://'))) {
      if (!product_image || 
          product_image === book.products_id || 
          product_image === (book.products_id + '.webp') || 
          product_image === book.barcode || 
          product_image === (book.barcode + '.webp')) {
        return image_path;
      }
    }

    let host = environment.apiBaseUrl.replace('/api', '');
    if (!host || host.includes('localhost') || host.includes('127.0.0.1')) {
      host = 'https://knoozbook.com';
    }

    let uploadsBase = this.uploadsBaseUrl;
    if (!uploadsBase || uploadsBase.includes('localhost') || uploadsBase.includes('127.0.0.1')) {
      uploadsBase = 'https://knoozbook.com/uploads/books';
    }

    // 2b. If image_path is already a local /uploads/ path, return it with the full host address.
    if (typeof image_path === 'string' && image_path.startsWith('/uploads/')) {
      return host + image_path;
    }

    // 1b. If product_image is already a local /uploads/ path, return it with the full host address.
    if (typeof product_image === 'string' && product_image.startsWith('/uploads/')) {
      return host + product_image;
    }

    // 3. Resolve the products_id (used for folder naming)
    let products_id = book.products_id || (book as any)._id;
    if (products_id) products_id = String(products_id).trim();

    // 4. Determine if it's admin or merchant
    const merchantName = book.merchantName;
    const isExplicitMerchant = book.merchantRole === 'merchant' || (book.merchantId && book.merchantRole !== 'admin');
    const isAdmin = !isExplicitMerchant && (book.merchantRole === 'admin' || book.merchantRole === 'publisher' || !merchantName || merchantName === 'كنوز' || merchantName === 'تاجر كنوز' || merchantName === 'Kenouz');

    const folderName = book.barcode || products_id || 'unknown';
    let final_image = product_image || (folderName + '.webp');
    
    // Ensure extension
    if (typeof final_image === 'string' && !final_image.includes('.')) {
      final_image += '.webp';
    }

    if (isAdmin) {
      const adminName = book.adminName || 'karim_mohamed__';
      return `${uploadsBase}/admin__${adminName}/${folderName}/${final_image}`;
    } else {
      const sanitizedMerchantName = String(merchantName || 'merchant').replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      return `${uploadsBase}/merchant_${sanitizedMerchantName}/${folderName}/${final_image}`;
    }
  }

  getData(): Observable<any[]> {
    if (this.isLoaded) {
      return this.booksSubject.asObservable();
    }

    if (this.loadingObservable) {
      return this.loadingObservable;
    }

    const timestamp = new Date().getTime();
    this.loadingObservable = this.http.get<any[]>(`${this.apiUrl}?t=${timestamp}`).pipe(
      map(books => {
        const uniqueItems = new Map<string, any>();

        books.forEach(book => {
          let id = book.products_id || (book as any)._id;
          if (id) {
            id = id.toString();
            
            // Standardize merchant detection (Treat Kenouz/Empty as Admin)
            const rawMerchantName = book.merchantName || '';
            const isKenouz = !rawMerchantName || rawMerchantName === 'كنوز' || rawMerchantName === 'تاجر كنوز' || rawMerchantName === 'Kenouz' || book.merchantRole === 'admin';
            // 'publisher' = virtual publisher with no DB account (e.g. دار دوّن)
            const isPublisher = book.merchantRole === 'publisher';
            
            const enrichedBook = { 
              ...book, 
              products_id: id,
              // Keep 'publisher' role so the frontend shows the publisher link;
              // treat Kenouz/empty as 'admin' to hide the merchant link
              merchantRole: isPublisher ? 'publisher' : (isKenouz ? 'admin' : (book.merchantRole || 'merchant')),
              // Ensure merchantName is removed if it's Kenouz to hide "By Kenouz"
              merchantName: isKenouz && !isPublisher ? null : rawMerchantName
            };

            if (!uniqueItems.has(id)) {
              uniqueItems.set(id, enrichedBook);
            }
          }
        });

        const result = Array.from(uniqueItems.values());
        this.booksSubject.next(result);
        this.isLoaded = true;
        this.loadingObservable = null;
        return result;
      }),
      shareReplay(1)
    );

    return this.loadingObservable;
  }

  getBookById(id: string): Observable<any> {
    // If cache is loaded, find it in memory instantly (0ms network request!)
    if (this.isLoaded) {
      const book = this.booksSubject.value.find(b => b.products_id.toString() === id.toString());
      if (book) {
        return new Observable(observer => {
          observer.next(book);
          observer.complete();
        });
      }
    }

    // Otherwise, fetch just the single book details from the server (lightweight)
    const url = environment.apiBaseUrl ? `${environment.apiBaseUrl}/books/details/${id}` : `/api/books/details/${id}`;
    return this.http.get<{ success: boolean; data: any }>(url).pipe(
      map(res => res.success ? res.data : null)
    );
  }

  clearCache(): void {
    this.isLoaded = false;
    this.booksSubject.next([]);
    this.loadingObservable = null;
  }

  getRecentBooks(): Observable<any> {
    return this.http.get(this.recentBooksApiUrl);
  }

  search(params: any): Observable<any> {
    let queryParams = `?q=${encodeURIComponent(params.q || '')}`;
    if (params.page) queryParams += `&page=${params.page}`;
    if (params.limit) queryParams += `&limit=${params.limit}`;
    if (params.category) queryParams += `&category=${encodeURIComponent(params.category)}`;
    if (params.minPrice) queryParams += `&minPrice=${params.minPrice}`;
    if (params.maxPrice) queryParams += `&maxPrice=${params.maxPrice}`;
    if (params.publisher) queryParams += `&publisher=${encodeURIComponent(params.publisher)}`;
    if (params.author) queryParams += `&author=${encodeURIComponent(params.author)}`;
    if (params.sortBy) queryParams += `&sortBy=${params.sortBy}`;

    return this.http.get<any>(this.searchApiUrl + queryParams);
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
    const url = this.usersApiUrl + '/profile/' + user.id;
    return this.http.put(url, user);
  }

  updateOrderShippingAddress(userId: string, orderId: string, addressData: any): Observable<any> {
    const url = this.usersApiUrl + '/' + userId + '/orders/' + orderId + '/shipping-address';
    return this.http.put(url, addressData);
  }

  getCategories(): Observable<any> {
    return this.http.get<any>(this.categoriesApiUrl);
  }

  // Admin Categories Management
  getAdminCategories(): Observable<any> {
    return this.http.get<any>(this.adminCategoriesApiUrl);
  }

  createAdminCategory(data: any, token: string): Observable<any> {
    const headers = { Authorization: `Bearer ${token}` };
    return this.http.post<any>(this.adminCategoriesApiUrl, data, { headers });
  }

  updateAdminCategory(id: string, data: any, token: string): Observable<any> {
    const headers = { Authorization: `Bearer ${token}` };
    return this.http.put<any>(`${this.adminCategoriesApiUrl}/${id}`, data, { headers });
  }

  deleteAdminCategory(id: string, token: string): Observable<any> {
    const headers = { Authorization: `Bearer ${token}` };
    return this.http.delete<any>(`${this.adminCategoriesApiUrl}/${id}`, { headers });
  }
}
