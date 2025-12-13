import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Subscription } from '../models/ebook.model';

interface SubscriptionStatusResponse {
    success: boolean;
    hasSubscription: boolean;
    data?: Subscription;
    message?: string;
}

interface SubscribeResponse {
    success: boolean;
    message: string;
    data: Subscription;
    paymentRequired: boolean;
    paymentSessionUrl?: string; // Added for payment integration
}

interface ActivateResponse {
    success: boolean;
    message: string;
    data: Subscription;
}

interface CancelResponse {
    success: boolean;
    message: string;
}

import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class SubscriptionService {
    private apiUrl = `${environment.apiBaseUrl}/subscriptions`;

    private subscriptionStatusSubject = new BehaviorSubject<Subscription | null>(null);
    public subscriptionStatus$ = this.subscriptionStatusSubject.asObservable();

    constructor(private http: HttpClient) {
        this.loadSubscriptionStatus();
    }

    private loadSubscriptionStatus(): void {
        // Retrieve token from stored user object (if present)
        const userStr = localStorage.getItem('user');
        let token: string | null = null;
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                token = (user && (user.token || user.accessToken)) ? (user.token || user.accessToken) : null;
            } catch (e) {
                console.error('Error parsing user from localStorage:', e);
            }
        }

        // Fallback: Check for Merchant Token if no user token found
        if (!token) {
            token = localStorage.getItem('merchant_token');
        }

        console.log('🔐 Subscription Service: token exists?', !!token);

        if (token) {
            this.getSubscriptionStatus().subscribe({
                next: (response) => {
                    console.log('✅ Subscription status loaded:', response);
                    this.subscriptionStatusSubject.next(response.data || null);
                },
                error: (err) => {
                    console.error('❌ Error loading subscription status:', err);
                    this.subscriptionStatusSubject.next(null);
                }
            });
        } else {
            console.log('⚠️ No token found, skipping subscription load');
        }
    }

    getSubscriptionStatus(): Observable<SubscriptionStatusResponse> {
        return this.http.get<SubscriptionStatusResponse>(`${this.apiUrl}/status`);
    }

    getSubscriptionHistory(): Observable<any> {
        return this.http.get(`${this.apiUrl}/history`);
    }

    subscribe(plan: 'monthly' | 'yearly', paymentMethod: string): Observable<SubscribeResponse> {
        return this.http.post<SubscribeResponse>(`${this.apiUrl}/subscribe`, {
            plan,
            paymentMethod
        }).pipe(
            tap(response => {
                if (response.success && response.data) {
                    this.subscriptionStatusSubject.next(response.data);
                }
            })
        );
    }

    activateSubscription(subscriptionId: string): Observable<ActivateResponse> {
        return this.http.post<ActivateResponse>(`${this.apiUrl}/activate/${subscriptionId}`, {}).pipe(
            tap(response => {
                if (response.success && response.data) {
                    this.subscriptionStatusSubject.next(response.data);
                }
            })
        );
    }

    renewSubscription(paymentMethod: string): Observable<SubscribeResponse> {
        return this.http.post<SubscribeResponse>(`${this.apiUrl}/renew`, {
            paymentMethod
        });
    }

    cancelSubscription(reason?: string): Observable<CancelResponse> {
        return this.http.post<CancelResponse>(`${this.apiUrl}/cancel`, { reason }).pipe(
            tap(response => {
                if (response.success) {
                    this.subscriptionStatusSubject.next(null);
                }
            })
        );
    }

    hasActiveSubscription(): boolean {
        const subscription = this.subscriptionStatusSubject.value;
        if (!subscription) return false;
        return subscription.status === 'active' && new Date(subscription.endDate) > new Date();
    }

    getRemainingDays(): number {
        const subscription = this.subscriptionStatusSubject.value;
        if (!subscription) return 0;

        const endDate = new Date(subscription.endDate);
        const today = new Date();
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays > 0 ? diffDays : 0;
    }

    getPrices(): { monthly: number; yearly: number } {
        return {
            monthly: 50,
            yearly: 500
        };
    }

    // Clear subscription status (used on logout)
    clearStatus(): void {
        this.subscriptionStatusSubject.next(null);
    }

    refreshStatus(): void {
        this.loadSubscriptionStatus();
    }
    hasToken(): boolean {
        // 1. Check Standard User Token
        const userStr = localStorage.getItem('user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user && (user.token || user.accessToken)) return true;
            } catch (e) { }
        }

        // 2. Check Merchant Token
        const merchantToken = localStorage.getItem('merchant_token');
        return !!merchantToken;
    }
}
