import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';
import { AnalyticsTrackingService } from '../../services/analytics-tracking.service';

@Component({
    selector: 'app-order-callback',
    template: `
    <div class="flex items-center justify-center min-h-screen bg-gray-50 flex-col p-4 text-center">
        <div *ngIf="loading" class="flex flex-col items-center">
             <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
             <span class="text-gray-600 font-medium">جاري التحقق من الدفع...</span>
        </div>
        
        <div *ngIf="!loading && success" class="flex flex-col items-center animate-fade-in">
            <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-500 text-3xl">✓</div>
            <h3 class="text-xl font-bold text-gray-800 mb-2">تم الدفع بنجاح!</h3>
            <p class="text-gray-600 mb-6">شكراً لك، تم تأكيد طلبك.</p>
            <p class="text-sm text-gray-500 mb-4">سيتم توجيهك تلقائياً...</p>
            <button (click)="closeWindow()" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition">
                إغلاق
            </button>
        </div>

        <div *ngIf="!loading && !success" class="flex flex-col items-center animate-fade-in">
             <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-500 text-3xl">✕</div>
             <h3 class="text-xl font-bold text-gray-800 mb-2">فشل التحقق</h3>
             <p class="text-red-600 mb-6">{{ errorMessage }}</p>
             <button (click)="closeWindow()" class="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition">
                إغلاق
            </button>
        </div>
    </div>
    `,
    standalone: true,
    imports: [CommonModule]
})
export class OrderCallbackComponent implements OnInit {
    loading = true;
    success = false;
    errorMessage = '';

    constructor(
        private route: ActivatedRoute,
        private http: HttpClient,
        private router: Router,
        private analyticsTrackingService: AnalyticsTrackingService
    ) { }

    ngOnInit(): void {
        this.route.queryParams.subscribe(params => {
            console.log('Order Callback Params:', params);

            // Determine API URL (handle local development)
            const apiBase = environment.apiBaseUrl || 'http://localhost:3000';
            const apiUrl = `${apiBase}/payment/verify-order-payment`;

            this.http.get(apiUrl, { params }).subscribe({
                next: (response: any) => {
                    console.log('Order Verification Response:', response);
                    this.loading = false;
                    this.success = response.success;

                    if (this.success) {
                        // Track purchase batch event
                        if (response['orderId'] && response['products'] && Array.isArray(response['products'])) {
                            const products = response['products'].map((p: any) => ({
                                productId: p.id || p.book || p.bookId || p.products_id,
                                amount: p.price || p.product_price || p.amount || 0
                            }));
                            this.analyticsTrackingService.trackPurchaseBatch(
                                products,
                                response['orderId']
                            );
                        }
                        this.notifyParent(true, response.message);
                        // Auto redirect after 3 seconds
                        setTimeout(() => {
                            this.closeWindow();
                        }, 3000);
                    } else {
                        this.errorMessage = response.message || 'حدث خطأ أثناء التحقق';
                        this.notifyParent(false, this.errorMessage);
                    }
                },
                error: (err) => {
                    console.error('Order Verification Error:', err);
                    this.loading = false;
                    this.success = false;
                    this.errorMessage = 'فشل الاتصال بالخادم';
                    this.notifyParent(false, this.errorMessage);
                }
            });
        });
    }

    notifyParent(success: boolean, message: string): void {
        const msg = {
            type: 'payment_complete',
            success: success,
            message: message
        };
        if (window.parent) {
            window.parent.postMessage(msg, '*');
        }
        if (window.opener) {
            window.opener.postMessage(msg, '*');
        }
    }

    closeWindow(): void {
        // Try to redirect to requests page if manual close
        if (window.top) {
            window.top.location.href = '/requests';
        } else {
            this.router.navigate(['/requests']);
        }
    }
}
