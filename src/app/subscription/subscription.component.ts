import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { SubscriptionService } from '../services/subscription.service';
import { Subscription } from '../models/ebook.model';
import { PaymentModalComponent } from '../payment-modal/payment-modal.component';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

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

    // Payment History Data
    paymentHistory: any[] = [];

    constructor(
        private subscriptionService: SubscriptionService,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.subscriptionService.prices$.subscribe(prices => this.prices = prices);
        this.subscriptionService.subscriptionStatus$.subscribe(sub => {
            this.subscription = sub;
            if (sub && sub.status === 'active') {
                // Mock history for now
                this.paymentHistory = [{
                    date: sub.startDate || new Date().toISOString(),
                    plan: sub.plan,
                    price: sub.plan === 'monthly' ? this.prices.monthly : this.prices.yearly,
                    status: 'completed'
                }];
            }
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

    async downloadInvoice(historyItem?: any) {
        // Use history item if provided, otherwise fallback to current subscription
        const item = historyItem || {
            date: new Date().toISOString(),
            plan: this.subscription?.plan || 'monthly',
            price: this.subscription?.plan === 'monthly' ? this.prices.monthly : this.prices.yearly
        };

        this.isLoading = true;

        try {
            // 1. Get the template
            const template = document.getElementById('invoice-template');
            if (!template) {
                console.error('Invoice template not found');
                alert('خطأ: قالب الفاتورة غير موجود');
                return;
            }

            // 2. Prepare Data
            const userStr = localStorage.getItem('user');
            let userName = 'عميل كنوز';
            let userEmail = '';
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    userName = user.name || user.username || 'عميل كنوز';
                    userEmail = user.email || '';
                } catch (e) { }
            }

            const planName = item.plan === 'monthly' ? 'اشتراك شهري Premium' : 'اشتراك سنوي VIP';
            const price = item.price;
            // Generate ID based on timestamp for consistency if re-downloaded
            const timestamp = new Date(item.date).getTime();
            const invoiceId = `INV-${timestamp.toString().slice(-6)}`;
            const dateStr = new Date(item.date).toLocaleDateString('ar-EG');
            const paymentRef = `TXN-${Math.abs(timestamp).toString(36).toUpperCase()}`;
            const duration = item.plan === 'monthly' ? '30 يوم / days' : '365 يوم / days';

            // 3. Inject Data
            const setText = (id: string, text: string) => {
                const el = document.getElementById(id);
                if (el) el.innerText = text;
            }

            setText('invoice-user-name', userName);
            setText('invoice-user-email', userEmail);
            setText('invoice-id', invoiceId);
            setText('invoice-date', dateStr);
            setText('invoice-plan-name', planName);
            setText('invoice-price', `${price} EGP`);
            setText('invoice-subtotal', `${price} EGP`);
            setText('invoice-total', `${price} EGP`);
            setText('invoice-payment-ref', paymentRef);
            setText('invoice-qr-id', invoiceId);
            setText('invoice-duration', duration);

            // 4. Import & Capture
            const { jsPDF } = await import('jspdf');
            const html2canvas = (await import('html2canvas')).default;

            // Make visible for capture
            const originalOpacity = template.style.opacity;
            const originalZIndex = template.style.zIndex;

            template.style.opacity = '1';
            template.style.zIndex = '9999';
            template.style.backgroundColor = 'white';

            // Wait for render
            await new Promise(resolve => setTimeout(resolve, 250));

            const canvas = await html2canvas(template as HTMLElement, {
                scale: 2,
                useCORS: true,
                logging: false,
                windowWidth: 794 // A4 width @ 96dpi
            });

            // Restore hidden state
            template.style.opacity = originalOpacity;
            template.style.zIndex = originalZIndex;

            // 5. Generate PDF
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

            const fileName = `فاتورة_ضريبية_${invoiceId}.pdf`;

            if (Capacitor.isNativePlatform()) {
                // Native: Save to fs and Share
                const base64Data = pdf.output('datauristring').split(',')[1];

                try {
                    const savedFile = await Filesystem.writeFile({
                        path: fileName,
                        data: base64Data,
                        directory: Directory.Cache
                    });

                    await Share.share({
                        title: 'فاتورة اشتراك كنوز بوك',
                        text: `إليك فاتورة الاشتراك رقم ${invoiceId}`,
                        url: savedFile.uri,
                        dialogTitle: 'تحميل الفاتورة'
                    });
                } catch (nativeErr) {
                    console.error('Native save/share failed', nativeErr);
                    // Fallback to basic save attempt or alert
                    alert('عذراً، حدث خطأ أثناء حفظ الملف على الهاتف.');
                }

            } else {
                // Web: Download directly
                pdf.save(fileName);
            }

        } catch (error) {
            console.error('Error generating invoice:', error);
            alert('حدث خطأ أثناء إنشاء الفاتورة. يرجى المحاولة مرة أخرى.');
        } finally {
            this.isLoading = false;
        }
    }
}
