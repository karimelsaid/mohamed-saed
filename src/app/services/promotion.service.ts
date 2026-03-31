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

    private hexToRgb(hex: string): string {
        if (!hex) return '0, 0, 0';
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `${r}, ${g}, ${b}`;
    }

    applyThemeGlobal(config: any) {
        if (!config || typeof document === 'undefined') return;
        const root = document.documentElement;

        // Primary Color
        if (config.primaryColor) {
            root.style.setProperty('--promo-primary', config.primaryColor);
            const primaryRgb = this.hexToRgb(config.primaryColor);
            root.style.setProperty('--promo-primary-rgb', primaryRgb);
            root.style.setProperty('--promo-primary-alpha-10', `rgba(${primaryRgb}, 0.1)`);
            root.style.setProperty('--promo-primary-alpha-20', `rgba(${primaryRgb}, 0.2)`);
        }

        // Secondary Color
        if (config.secondaryColor) {
            root.style.setProperty('--promo-secondary', config.secondaryColor);
            const secondaryRgb = this.hexToRgb(config.secondaryColor);
            root.style.setProperty('--promo-secondary-rgb', secondaryRgb);
            root.style.setProperty('--promo-secondary-alpha-10', `rgba(${secondaryRgb}, 0.1)`);
            root.style.setProperty('--promo-bg', `rgba(${secondaryRgb}, 0.05)`);
        } else {
            root.style.setProperty('--promo-bg', '#f8fafc');
        }

        // Accent Color
        if (config.accentColor) {
            root.style.setProperty('--promo-accent', config.accentColor);
            const accentRgb = this.hexToRgb(config.accentColor);
            root.style.setProperty('--promo-accent-rgb', accentRgb);
            root.style.setProperty('--promo-accent-alpha-20', `rgba(${accentRgb}, 0.2)`);
        }

        // Font Family
        if (config.fontFamily) {
            root.style.setProperty('--promo-font', config.fontFamily);
        }
    }

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

    // Hero Slide Management
    getHeroSlides(): Observable<any> {
        return this.http.get(`${this.apiUrl}/hero-slides`);
    }

    createHeroSlide(slide: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/hero-slides`, slide);
    }

    deleteHeroSlide(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/hero-slides/${id}`);
    }

    uploadHeroImage(file: File): Observable<any> {
        const formData = new FormData();
        formData.append('image', file);
        return this.http.post(`${this.apiUrl}/hero-slides/upload`, formData);
    }

    getHeroConfig(): Observable<any> {
        return this.http.get(`${this.apiUrl}/hero-config`);
    }

    updateHeroConfig(config: any): Observable<any> {
        // This usually goes through admin settings, but we can wrap it or call admin service
        // For simplicity, we'll assume there's a dedicated hero-config update or use general settings
        return this.http.put(`${environment.apiBaseUrl}/admin/settings`, { heroConfig: config });
    }

    getHeroBooks(): Observable<any> {
        return this.http.get(`${this.apiUrl}/hero-books`);
    }

    getBourseSettings(): Observable<any> {
        return this.http.get(`${environment.apiBaseUrl}/bourse/settings`);
    }
}
