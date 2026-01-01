import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../../environments/environment';
import { ModalService } from '../../services/modal.service';

interface PaymentRequest {
  _id: string;
  userId: {
    _id: string;
    username: string;
    email: string;
    phone: string;
  };
  amount: number;
  status: 'pending' | 'completed' | 'rejected';
  createdAt: string;
}

@Component({
  selector: 'app-payment-requests',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  templateUrl: './payment-requests.component.html',
  styleUrls: ['./payment-requests.component.css']
})
export class PaymentRequestsComponent implements OnInit {
  requests: PaymentRequest[] = [];
  isLoading = false;
  faCheck = faCheck;
  faTimes = faTimes;

  constructor(
    private http: HttpClient,
    private modalService: ModalService
  ) { }

  ngOnInit(): void {
    this.loadPaymentRequests();
  }

  loadPaymentRequests(): void {
    this.isLoading = true;
    this.http.get<{ success: boolean, requests: PaymentRequest[] }>(`${environment.apiBaseUrl}/admin/payment-requests`)
      .subscribe({
        next: (data) => {
          this.requests = data.requests;
          this.isLoading = false;
        },
        error: (err) => {
          // Enhanced error logging
          console.error('Error fetching payment requests:', err.message, 'Status:', err.status, 'URL:', err.url);
          this.isLoading = false;
        }
      });
  }

  updateRequestStatus(requestId: string, status: 'completed' | 'rejected'): void {
    const request = this.requests.find(req => req._id === requestId);
    if (!request) return;

    this.http.patch(`${environment.apiBaseUrl}/payment-requests/${requestId}`, { status })
      .subscribe({
        next: (response: any) => {
          this.modalService.showSuccess(`تم ${status === 'completed' ? 'قبول' : 'رفض'} طلب الدفع بنجاح`);

          // Send notification to the user
          const notificationPayload = {
            title: status === 'completed' ? '✅ تم تنفيذ طلب الدفع' : '❌ تم رفض طلب الدفع',
            body: status === 'completed'
              ? `تمت الموافقة على طلب سحب مبلغ ${request.amount} جنيه بنجاح.`
              : `نعتذر، تم رفض طلب سحب مبلغ ${request.amount} جنيه. يرجى التواصل مع الدعم للمزيد من التفاصيل.`,
            url: '/wallet', // Assuming there's a wallet or history page
            userId: request.userId._id
          };

          this.http.post(`${environment.apiBaseUrl}/notifications/admin/send`, notificationPayload)
            .subscribe({
              error: (err) => console.error('Error sending notification:', err)
            });

          // Update UI locally
          request.status = status;
        },
        error: (err) => {
          console.error('Error updating request status:', err);
          this.modalService.showError('فشل تحديث حالة الطلب');
        }
      });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pending': return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
      case 'completed': return 'bg-green-200 text-green-800 dark:bg-green-900/50 dark:text-green-300';
      case 'rejected': return 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300';
      default: return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }
}
