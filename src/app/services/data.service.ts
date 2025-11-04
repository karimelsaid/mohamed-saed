import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, forkJoin } from 'rxjs';
import { tap, map } from 'rxjs/operators';
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

  constructor(private http: HttpClient) { }

  getData(): Observable<any> {
    // Fetch both books and products and combine them
    const books$ = this.http.get<any[]>(this.apiUrl);
    const products$ = this.http.get<any[]>(this.productsApiUrl);

    return forkJoin([books$, products$]).pipe(
      map(([books, products]) => {
        const combined = [...books, ...products];
        // Remove duplicates based on products_id to ensure unique products
        const uniqueMap = new Map();
        for (const item of combined) {
          if (item.products_id) {
            uniqueMap.set(item.products_id, item);
          }
        }
        return Array.from(uniqueMap.values());
      })
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
