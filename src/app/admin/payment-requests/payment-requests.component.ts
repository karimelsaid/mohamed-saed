import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-payment-requests',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  templateUrl: './payment-requests.component.html',
  styleUrls: ['./payment-requests.component.css']
})
export class PaymentRequestsComponent implements OnInit {
  requests: any[] = [];
  isLoading = true;
  faCheck = faCheck;
  faTimes = faTimes;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.loadPaymentRequests();
  }

  loadPaymentRequests(): void {
    this.isLoading = true;
    this.http.get<any>(`${environment.apiBaseUrl}/admin/payment-requests`).subscribe({
      next: (response) => {
        this.requests = response.requests;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading payment requests:', error);
        this.isLoading = false;
      }
    });
  }

  updateRequestStatus(requestId: string, status: 'completed' | 'rejected'): void {
    this.http.patch<any>(`${environment.apiBaseUrl}/admin/payment-requests/${requestId}`, { status }).subscribe({
      next: () => {
        const request = this.requests.find(r => r._id === requestId);
        if (request) {
          request.status = status;
        }
      },
      error: (error) => {
        console.error(`Error updating request status to ${status}:`, error);
        alert('حدث خطأ أثناء تحديث حالة الطلب.');
      }
    });
  }

  getStatusClass(status: string): string {
    if (status === 'completed') return 'bg-green-100 text-green-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  }
}