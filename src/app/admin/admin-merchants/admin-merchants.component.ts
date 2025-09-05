import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Merchant {
  _id: string;
  name: string;
  email: string;
  logo?: string;
  approved: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-admin-merchants',
  standalone: false,
  templateUrl: './admin-merchants.component.html',
  styleUrls: ['./admin-merchants.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class AdminMerchantsComponent implements OnInit {
  merchants: Merchant[] = [];
  backendBaseUrl: string = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadMerchants();
  }

  loadMerchants(): void {
    this.http.get<{ success: boolean; merchants: Merchant[] }>(`${this.backendBaseUrl}/admin/merchants`).subscribe({
      next: (response) => {
        if (response.success) {
          this.merchants = response.merchants;
        }
      },
      error: (err) => {
        console.error('Error loading merchants:', err);
      }
    });
  }

  toggleApproval(merchant: Merchant): void {
    const newApproval = !merchant.approved;
    this.http.patch(`${this.backendBaseUrl}/admin/merchants/${merchant._id}/approval`, { approved: newApproval }).subscribe({
      next: (response: any) => {
        if (response.success) {
          merchant.approved = newApproval;
          alert(`تم ${newApproval ? 'الموافقة على' : 'رفض'} التاجر بنجاح.`);
        } else {
          alert('حدث خطأ أثناء تحديث حالة التاجر.');
        }
      },
      error: (err) => {
        console.error('Error updating merchant approval:', err);
        alert('حدث خطأ أثناء تحديث حالة التاجر.');
      }
    });
  }
}
