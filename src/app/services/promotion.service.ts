import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, BehaviorSubject, tap } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class PromotionService {
    private apiUrl = `${environment.apiBaseUrl}/promotions`;
    private activeThemeSubject = new BehaviorSubject<any>(null);
    public activeTheme$ = this.activeThemeSubject.asObservable();

    private activeCouponSubject = new BehaviorSubject<any>(null);
    public activeCoupon$ = this.activeCouponSubject.asObservable();

    constructor(private http: HttpClient) { }

    setActiveCoupon(coupon: any) {
        this.activeCouponSubject.next(coupon);
    }

    getActiveTheme(): Observable<any> {
        return this.http.get(`${this.apiUrl}/active-theme`).pipe(
            tap((res: any) => {
                if (res && res.theme) {
                    this.activeThemeSubject.next(res.theme);
                }
            })
        );
    }

    initializeTheme() {
        this.getActiveTheme().subscribe();
    }

    spinWheel(userId: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/wheel/spin`, { userId });
    }

    calculateOffer(productIds: string[]): Observable<any> {
        return this.http.post(`${this.apiUrl}/calculate-offer`, { productIds });
    }

    validateCoupon(code: string, userId: string, orderAmount: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/validate-coupon`, { code, userId, orderAmount });
    }

    // Admin Methods
    getAllThemes(): Observable<any> {
        return this.http.get(`${this.apiUrl}/themes`);
    }

    createTheme(theme: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/themes`, theme);
    }

    updateTheme(id: string, theme: any): Observable<any> {
        return this.http.put(`${this.apiUrl}/themes/${id}`, theme);
    }

    toggleTheme(id: string): Observable<any> {
        return this.http.patch(`${this.apiUrl}/themes/${id}/toggle`, {});
    }

    getAllCoupons(): Observable<any> {
        return this.http.get(`${this.apiUrl}/coupons`);
    }

    createCoupon(coupon: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/coupons`, coupon);
    }

    updateCoupon(id: string, coupon: any): Observable<any> {
        return this.http.put(`${this.apiUrl}/coupons/${id}`, coupon);
    }

    deleteCoupon(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/coupons/${id}`);
    }

    getWheelConfig(): Observable<any> {
        return this.http.get(`${this.apiUrl}/wheel-config`);
    }

    updateWheelConfig(config: any): Observable<any> {
        return this.http.put(`${this.apiUrl}/wheel-config`, config);
    }

    getAllPackages(): Observable<any> {
        return this.http.get(`${this.apiUrl}/packages`);
    }

    createPackage(pkg: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/packages`, pkg);
    }

    deletePackage(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/packages/${id}`);
    }
}
