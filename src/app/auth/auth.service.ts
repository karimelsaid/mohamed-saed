import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { User } from './user.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiBaseUrl;
  favoriteBookIds = new BehaviorSubject<string[]>([]);
  cartBookIds = new BehaviorSubject<string[]>([]);

  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  isLoggedIn$ = this.isLoggedInSubject.asObservable();

  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {
    this.checkInitialLogin();
  }

  googleSignIn(idToken: string): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users/google-signin`, { idToken }).pipe(
      tap((user: User) => {
        this.setUser(user);
      })
    );
  }

  requestBook(userId: string, bookName: string, authorName: string): Observable<any> {
    const data = { userId, bookName, authorName };
    return this.http.post(`${this.apiUrl}/users/request-book`, data);
  }

  private checkInitialLogin() {
    const userData = localStorage.getItem('user');
    if (userData) {
      this.isLoggedInSubject.next(true);
      this.userSubject.next(JSON.parse(userData));
    }
  }

  setLoginStatus(status: boolean) {
    this.isLoggedInSubject.next(status);
  }

  setUser(user: any) {
    this.userSubject.next(user);
    this.setLoginStatus(true);
    localStorage.setItem('user', JSON.stringify(user));
  }

  clearUser() {
    this.userSubject.next(null);
    this.setLoginStatus(false);
    localStorage.removeItem('user');
    this.userSubject.next(null);
  }

  createAccount(username: string, email: string, password: string, phone: string, governorate: string, city: string, village: string = ''): Observable<any> {
    return this.http.post(`${this.apiUrl}/users/create-account`, { 
      username, 
      email, 
      password, 
      phone,
      governorate,
      city,
      village
    });
  }

  registerMerchant(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/merchant/register`, formData);
  }

  login(email: string, password: string): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users/login`, { email, password }).pipe(
      tap((user: User) => {
        console.log('🧠 المستخدم الراجع من السيرفر:', user);
        this.setUser(user);
        this.loadUserData(user.id);
      })
    );
  }
  
  logout() {
    this.clearUser();
    this.clearFavoritesAndCart();
  }

  addToCart(userId: string, bookId: string): Observable<any> {
    const data = { userId, bookId };
    return this.http.post(`${this.apiUrl}/users/add-to-cart`, data);
  }

  addToFavorites(userId: string, bookId: string): Observable<any> {
    const data = { userId, bookId };
    return this.http.post(`${this.apiUrl}/users/add-to-favorites`, data);
  }

  removeFromCart(userId: string, bookId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/remove-from-cart/${userId}/${bookId}`);
  }

  removeFromFavorites(userId: string, bookId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/remove-from-favorites/${userId}/${bookId}`);
  }

  loadUserData(userId: string) {
    if (!userId) {
      console.warn('⚠️ لا يوجد userId لتحميل البيانات.');
      return;
    }

    this.http.get<{ favorites: string[], cart: string[] }>(`${this.apiUrl}/users/user-data/${userId}`)
      .subscribe({
        next: data => {
          this.favoriteBookIds.next(data.favorites);
          this.cartBookIds.next(data.cart);
        },
        error: err => {
          console.error('❌ خطأ أثناء تحميل بيانات المستخدم:', err);
        }
      });
  }

  isFavorite(bookId: string): boolean {
    return this.favoriteBookIds.getValue().includes(bookId);
  }

  isInCart(bookId: string): boolean {
    return this.cartBookIds.getValue().includes(bookId);
  }

  clearFavoritesAndCart(): void {
    this.favoriteBookIds.next([]);
    this.cartBookIds.next([]);
  }

  getUserProfile(userId: string) {
    return this.http.get<User>(`${this.apiUrl}/users/profile/${userId}`);
  }
}
