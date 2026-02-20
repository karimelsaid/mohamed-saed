
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { User } from './user.model';
import { environment } from '../../environments/environment';
import { MerchantAuthService } from '../services/merchant-auth.service';
import { SubscriptionService } from '../services/subscription.service';
import { NotificationService } from '../services/notification.service';

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
    private subscriptionService: SubscriptionService,
    private notificationService: NotificationService
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
      tap((response: any) => {
        console.log('🔍 [AuthService] Raw Google Sign-In Response:', response);
        const user = response.user || response;

        // CRITICAL FIX: Normalize ID (Backend might return _id)
        if (!user.id && user._id) {
          user.id = user._id;
        }

        // CRITICAL FIX: Merge token if present for Google Sign-In
        const userWithToken = { ...user };

        // Extract token from various possible locations
        const token = response.token || response.accessToken || user.token;

        if (token) {
          userWithToken.token = token;

          // SPECIAL HANDLING FOR MERCHANTS
          if (user.role === 'merchant') {
            localStorage.setItem('merchant_token', token);
            // Also notify merchant service if possible/needed, but localStorage is the critical fix for interceptors
            this.merchantAuthService.setMerchantAuthFromExternal(token, user);
          }
        } else {
          console.error('❌ [AuthService] NO TOKEN FOUND IN GOOGLE SIGN-IN RESPONSE!');
        }

        this.setUser(userWithToken);
      })
    );
  }

  /** Traditional login */
  login(email: string, password: string): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users/login`, { email, password }).pipe(
      tap((response: any) => {
        localStorage.removeItem('referralCode');
        localStorage.removeItem('referralBookId');
        console.log('[Auth] User logged in. Cleared any existing referral data from localStorage.');

        const user = response.user || response;

        // CRITICAL FIX: Normalize ID
        if (!user.id && user._id) {
          user.id = user._id;
        }

        console.log('🧠 المستخدم الراجع من السيرفر:', user);

        // CRITICAL FIX: Merge token if present
        const userWithToken = { ...user };
        if (response.token) {
          userWithToken.token = response.token;
        } else if (response.accessToken) {
          userWithToken.token = response.accessToken;
        }

        this.setUser(userWithToken);
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
      try {
        const parsedUser = JSON.parse(userData);

        // CRITICAL FIX: Normalize ID for stored sessions
        if (parsedUser && !parsedUser.id && parsedUser._id) {
          console.log('🛠️ [AuthService] Auto-fixing missing ID in stored session');
          parsedUser.id = parsedUser._id;
          // Create userWithToken logic here if needed, but mostly just fixing the object
          localStorage.setItem('user', JSON.stringify(parsedUser)); // Update storage
        }

        this.isLoggedInSubject.next(true);
        this.userSubject.next(parsedUser);
        // Load user-specific data such as favorites and cart
        if (parsedUser && parsedUser.id) {
          this.loadUserData(parsedUser.id);
        }
      } catch (e) {
        console.error('Error parsing stored user:', e);
        this.logout();
      }
    }
  }

  setLoginStatus(status: boolean): void {
    this.isLoggedInSubject.next(status);
  }

  isLoggedIn(): boolean {
    return this.isLoggedInSubject.getValue();
  }

  get currentUserValue() {
    return this.userSubject.getValue();
  }

  getPublicProfile(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/users/public-profile/${userId}`);
  }

  setUser(user: any): void {
    this.userSubject.next(user);
    this.setLoginStatus(true);
    localStorage.setItem('user', JSON.stringify(user));
  }

  clearUser(): void {
    console.warn('⚠️ [AuthService] Clearing User!');
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
    gender: string = '',
    referralCode?: string
  ): Observable<any> {
    const body: any = { username, email, password, phone, governorate, city, village, gender };
    if (referralCode) {
      body.referralCode = referralCode;
    }
    return this.http.post(`${this.apiUrl}/users/register`, body).pipe(
      tap((response: any) => {
        if (response && response.user) {
          localStorage.removeItem('referralCode');
          localStorage.removeItem('referralBookId');
          console.log('[Auth] Account created. Cleared any existing referral data from localStorage.');
          console.log('🧠 تم إنشاء الحساب وتسجيل الدخول تلقائياً:', response.user);

          // CRITICAL FIX: Normalize ID
          if (!response.user.id && response.user._id) {
            response.user.id = response.user._id;
          }

          // CRITICAL FIX: Merge token into user object so AuthInterceptor can find it
          const userWithToken = { ...response.user };
          if (response.token) {
            userWithToken.token = response.token;
          }

          this.setUser(userWithToken);
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

          // CRITICAL FIX: Merge token into merchant object for AuthInterceptor
          const merchantWithToken = { ...response.merchant, token: response.token };
          this.setUser(merchantWithToken);
          this.loadUserData(response.merchant._id);
        }
      })
    );
  }

  /** Favorites */
  addToFavorites(userId: string, bookId: string): Observable<any> {
    const data = { userId, bookId };
    return this.http.post(`${this.apiUrl}/users/favorites`, data);
  }

  /** Cart */
  addToCart(userId: string, bookId: string): Observable<any> {
    const data = { userId, bookId };
    return this.http.post(`${this.apiUrl}/users/cart`, data);
  }

  removeFromCart(userId: string, bookId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/cart/${userId}/${encodeURIComponent(bookId)}`);
  }

  removeFromFavorites(userId: string, bookId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/favorites/${userId}/${encodeURIComponent(bookId)}`);
  }

  /** Load user data (favorites & cart) */
  loadUserData(userId: string): void {
    if (!userId) {
      console.warn('⚠️ لا يوجد userId لتحميل البيانات.');
      return;
    }
    this.http.get<any>(`${this.apiUrl}/users/${userId}`).subscribe({
      next: data => {
        this.favoriteBookIds.next(data.favorites || []);
        this.cartBookIds.next(data.cart || []);
        if (data.user) {
          const currentUser = this.currentUserValue;

          // Check if user data actually changed to prevent infinite loop
          const hasChanged = JSON.stringify(currentUser?.quranProgress) !== JSON.stringify(data.user.quranProgress) ||
            JSON.stringify(currentUser?.gamification) !== JSON.stringify(data.user.gamification) ||
            JSON.stringify(currentUser?.earnedCoupons) !== JSON.stringify(data.user.earnedCoupons);

          if (hasChanged) {
            console.log('🔄 [AuthService] User data changed, updating user state.');
            this.setUser({ ...currentUser, ...data.user });
          }
        }
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
    console.warn('🚨 [AuthService] LOGOUT CALLED! Trace:', new Error().stack);
    this.userSubject.next(null);
    this.isLoggedInSubject.next(false);
    this.favoriteBookIds.next([]);
    this.cartBookIds.next([]);
    localStorage.removeItem('user');
    localStorage.removeItem('referralCode');
    localStorage.removeItem('referralBookId');

    // CRITICAL FIX: Also clear merchant session
    this.merchantAuthService.performLogout();

    // Clear notifications cache
    if (this.notificationService) {
      this.notificationService.clearNotifications();
    }

    if (this.subscriptionService && this.subscriptionService.clearStatus) {
      this.subscriptionService.clearStatus();
    }
  }
}
