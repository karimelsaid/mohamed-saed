
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { User } from './user.model';
import { environment } from '../../environments/environment';
import { MerchantAuthService } from '../services/merchant-auth.service';
import { SubscriptionService } from '../services/subscription.service';

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

  constructor(
    private http: HttpClient,
    private merchantAuthService: MerchantAuthService,
    private subscriptionService: SubscriptionService
  ) {
    this.checkInitialLogin();
  }

  /** Google Sign‑In */
  googleSignIn(idToken: string, referralCode?: string): Observable<User> {
    const body: any = { idToken };
    if (referralCode) {
      body.referralCode = referralCode;
    }
    return this.http.post<User>(`${this.apiUrl}/users/google-signin`, body).pipe(
      tap((user: User) => this.setUser(user))
    );
  }

  /** Traditional login */
  login(email: string, password: string): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users/login`, { email, password }).pipe(
      tap((user: User) => {
        localStorage.removeItem('referralCode');
        localStorage.removeItem('referralBookId');
        console.log('[Auth] User logged in. Cleared any existing referral data from localStorage.');
        console.log('🧠 المستخدم الراجع من السيرفر:', user);
        this.setUser(user);
        this.loadUserData(user.id);
      })
    );
  }

  requestBook(userId: string, bookName: string, authorName: string): Observable<any> {
    const data = { userId, bookName, authorName };
    return this.http.post(`${this.apiUrl}/users/request-book`, data);
  }

  private checkInitialLogin(): void {
    const userData = localStorage.getItem('user');
    if (userData) {
      const parsedUser = JSON.parse(userData);
      setTimeout(() => {
        this.isLoggedInSubject.next(true);
        this.userSubject.next(parsedUser);
        // Load user-specific data such as favorites and cart
        if (parsedUser && parsedUser.id) {
          this.loadUserData(parsedUser.id);
        }
      }, 50);
    }
  }

  setLoginStatus(status: boolean): void {
    this.isLoggedInSubject.next(status);
  }

  setUser(user: any): void {
    setTimeout(() => {
      this.userSubject.next(user);
      this.setLoginStatus(true);
      localStorage.setItem('user', JSON.stringify(user));
    }, 100);
  }

  clearUser(): void {
    this.userSubject.next(null);
    this.setLoginStatus(false);
    localStorage.removeItem('user');
    this.userSubject.next(null);
  }

  /** Account creation */
  createAccount(
    username: string,
    email: string,
    password: string,
    phone: string,
    governorate: string,
    city: string,
    village: string = '',
    referralCode?: string
  ): Observable<any> {
    const body: any = { username, email, password, phone, governorate, city, village };
    if (referralCode) {
      body.referralCode = referralCode;
    }
    return this.http.post(`${this.apiUrl}/users/create-account`, body).pipe(
      tap((response: any) => {
        if (response && response.user) {
          localStorage.removeItem('referralCode');
          localStorage.removeItem('referralBookId');
          console.log('[Auth] Account created. Cleared any existing referral data from localStorage.');
          console.log('🧠 تم إنشاء الحساب وتسجيل الدخول تلقائياً:', response.user);
          this.setUser(response.user);
          this.loadUserData(response.user.id);
        }
      })
    );
  }

  /** Merchant registration */
  registerMerchant(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/merchant/register`, formData).pipe(
      tap((response: any) => {
        if (response && response.success && response.token && response.merchant) {
          console.log('🧠 تم إنشاء حساب التاجر وتسجيل الدخول تلقائياً:', response.merchant);
          this.merchantAuthService.setMerchantAuthFromExternal(response.token, response.merchant);
          this.setUser(response.merchant);
          this.loadUserData(response.merchant._id);
        }
      })
    );
  }

  /** Favorites */
  addToFavorites(userId: string, bookId: string): Observable<any> {
    const data = { userId, bookId };
    return this.http.post(`${this.apiUrl}/users/add-to-favorites`, data);
  }

  /** Cart */
  addToCart(userId: string, bookId: string): Observable<any> {
    const data = { userId, bookId };
    return this.http.post(`${this.apiUrl}/users/add-to-cart`, data);
  }

  removeFromCart(userId: string, bookId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/remove-from-cart/${userId}/${encodeURIComponent(bookId)}`);
  }

  removeFromFavorites(userId: string, bookId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/remove-from-favorites/${userId}/${encodeURIComponent(bookId)}`);
  }

  /** Load user data (favorites & cart) */
  loadUserData(userId: string): void {
    if (!userId) {
      console.warn('⚠️ لا يوجد userId لتحميل البيانات.');
      return;
    }
    this.http.get<{ favorites: string[]; cart: string[] }>(`${this.apiUrl}/users/user-data/${userId}`).subscribe({
      next: data => {
        this.favoriteBookIds.next(data.favorites);
        this.cartBookIds.next(data.cart);
      },
      error: err => console.error('❌ خطأ أثناء تحميل بيانات المستخدم:', err)
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

  clearCart(): void {
    this.cartBookIds.next([]);
  }

  getUserProfile(userId: string): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/profile/${userId}`);
  }

  /** Logout – also clears subscription status */
  logout(): void {
    this.userSubject.next(null);
    this.isLoggedInSubject.next(false);
    this.favoriteBookIds.next([]);
    this.cartBookIds.next([]);
    localStorage.removeItem('user');
    localStorage.removeItem('referralCode');
    localStorage.removeItem('referralBookId');
    if (this.subscriptionService && this.subscriptionService.clearStatus) {
      this.subscriptionService.clearStatus();
    }
  }
}
