import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { SubscriptionService } from '../services/subscription.service';
import { Subscription } from '../models/ebook.model';
import { PaymentModalComponent } from '../payment-modal/payment-modal.component';

@Component({
    selector: 'app-subscription',
    standalone: true,
    imports: [CommonModule, RouterModule, PaymentModalComponent],
    templateUrl: './subscription.component.html',
    styleUrls: ['./subscription.component.css']
})
export class SubscriptionComponent implements OnInit {
    subscription: Subscription | null = null;
    isLoading = false;
    selectedPlan: 'monthly' | 'yearly' = 'monthly';
    prices = { monthly: 50, yearly: 500 };
    error: string | null = null;
    success: string | null = null;

    // Modal state
    showPaymentModal = false;
    paymentUrl = '';

    constructor(
        private subscriptionService: SubscriptionService,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.prices = this.subscriptionService.getPrices();
        this.subscriptionService.subscriptionStatus$.subscribe(sub => {
            this.subscription = sub;
        });
    }

    selectPlan(plan: 'monthly' | 'yearly'): void {
        this.selectedPlan = plan;
    }

    subscribe(): void {
        if (!this.subscriptionService.hasToken()) {
            this.router.navigate(['/login'], { queryParams: { returnUrl: '/subscription' } });
            return;
        }

        this.isLoading = true;
        this.error = null;

        this.subscriptionService.subscribe(this.selectedPlan, 'card').subscribe({
            next: (response) => {
                console.log('📦 Full subscription response:', response);
                this.isLoading = false;

                if (response.success) {
                    // Check if payment URL is provided
                    if (response.paymentSessionUrl) {
                        console.log('✅ Payment URL received:', response.paymentSessionUrl);
                        this.paymentUrl = response.paymentSessionUrl;
                        this.showPaymentModal = true;
                    } else if (response.paymentRequired) {
                        // Payment is required but no URL provided - backend issue
                        console.error('❌ Backend error: Payment required but no URL provided', response);
                        this.error = 'خطأ في نظام الدفع. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.';
                    } else {
                        // No payment needed - subscription activated directly
                        console.log('✅ Subscription activated without payment');
                        this.success = 'تم الاشتراك بنجاح!';
                        // Refresh subscription status
                        this.subscriptionService.getSubscriptionStatus().subscribe();
                    }
                } else {
                    console.error('❌ Subscription request failed:', response);
                    this.error = response.message || 'حدث خطأ في إنشاء الاشتراك';
                }
            },
            error: (err) => {
                console.error('❌ Subscription error:', err);
                this.isLoading = false;
                this.error = err.error?.message || 'حدث خطأ في إنشاء الاشتراك';
            }
        });
    }

    onPaymentModalClose(): void {
        this.showPaymentModal = false;
        this.paymentUrl = '';
    }

    onPaymentComplete(success: boolean): void {
        this.onPaymentModalClose();
        if (success) {
            this.success = 'تم الدفع بنجاح! جاري تفعيل اشتراكك...';
            // Refresh subscription status
            this.subscriptionService.getSubscriptionStatus().subscribe(() => {
                setTimeout(() => {
                    this.router.navigate(['/library']);
                }, 1500);
            });
        } else {
            this.error = 'لم تكتمل عملية الدفع. حاول مرة أخرى.';
        }
    }

    // Cancel Modal State
    showCancelModal = false;

    cancelSubscription(): void {
        this.showCancelModal = true;
    }

    closeCancelModal(): void {
        this.showCancelModal = false;
    }

    confirmCancellation(): void {
        this.closeCancelModal();
        this.isLoading = true;
        this.subscriptionService.cancelSubscription().subscribe({
            next: () => {
                this.isLoading = false;
                this.success = 'تم إلغاء الاشتراك بنجاح. نأسف لرؤيتك تغادر 💔';
                this.getRemainingDays(); // Refresh UI
            },
            error: () => {
                this.isLoading = false;
                this.error = 'حدث خطأ في إلغاء الاشتراك';
            }
        });
    }

    getRemainingDays(): number {
        return this.subscriptionService.getRemainingDays();
    }
}
