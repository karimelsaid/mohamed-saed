import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-subscription-callback',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div class="text-center p-8">
        <div *ngIf="loading" class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mx-auto mb-4"></div>
        <div *ngIf="success" class="text-green-500 text-5xl mb-4">✅</div>
        <div *ngIf="error" class="text-red-500 text-5xl mb-4">❌</div>
        
        <h2 class="text-xl font-bold mb-2 text-gray-800 dark:text-gray-200">
          {{ loading ? 'جاري التحقق من الدفع...' : (success ? 'تم الدفع بنجاح!' : 'فشلت عملية الدفع') }}
        </h2>
        
        <p class="text-gray-500 dark:text-gray-400">
          {{ loading ? 'برجاء الانتظار قليلاً' : (success ? 'سيتم تحويلك الآن...' : message) }}
        </p>
      </div>
    </div>
  `
})
export class SubscriptionCallbackComponent implements OnInit {
    loading = true;
    success = false;
    error = false;
    message = '';

    constructor(
        private route: ActivatedRoute,
        private http: HttpClient,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.route.queryParams.subscribe(params => {
            this.verifyPayment(params);
        });
    }

    verifyPayment(params: any): void {
        // Determine backend URL
        // Determine backend URL
        const apiBase = (environment as any).apiBaseUrl || '/api';
        const apiUrl = apiBase.startsWith('http') ? apiBase : (environment.production ? apiBase : 'http://localhost:3000' + apiBase);

        this.http.get(`${apiUrl}/payment/verify-payment`, { params }).subscribe({
            next: (res: any) => {
                this.loading = false;
                if (res.success) {
                    this.success = true;
                    this.message = 'تم تفعيل الاشتراك بنجاح';

                    // Notify parent window (Modal)
                    if (window.parent) {
                        window.parent.postMessage({ type: 'payment_complete', success: true }, '*');
                    }

                    // Fallback redirect if not in iframe
                    setTimeout(() => {
                        this.router.navigate(['/library']);
                    }, 2000);
                } else {
                    this.error = true;
                    this.message = res.message || 'حدث خطأ أثناء الدفع';
                    // Notify parent window (Modal) - optional closure on failure
                    if (window.parent) {
                        window.parent.postMessage({ type: 'payment_complete', success: false }, '*');
                    }
                }
            },
            error: (err) => {
                this.loading = false;
                this.error = true;
                this.message = 'حدث خطأ في الاتصال بالسيرفر';
                console.error(err);
            }
        });
    }
}
