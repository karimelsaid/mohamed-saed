import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../../environments/environment';

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

  constructor(private http: HttpClient) { }

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
    this.http.patch(`${environment.apiBaseUrl}/payment-requests/${requestId}`, { status })
      .subscribe({
        next: (response: any) => {
          alert('تم تحديث حالة الطلب بنجاح');
          // تحديث الطلب في الواجهة فوراً بدلاً من إعادة تحميل القائمة بالكامل
          const index = this.requests.findIndex(req => req._id === requestId);
          if (index !== -1) {
            this.requests[index].status = status;
          }
        },
        error: (err) => {
          console.error('Error updating request status:', err);
          alert('فشل تحديث حالة الطلب');
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
