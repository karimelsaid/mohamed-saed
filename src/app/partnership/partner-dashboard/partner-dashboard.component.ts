import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-partner-dashboard',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule, RouterModule],
  templateUrl: './partner-dashboard.component.html',
  styleUrls: ['./partner-dashboard.component.css']
})
export class PartnerDashboardComponent implements OnInit {
  isLoading = true;
  partner: any = null;
  investments: any[] = [];
  applications: any[] = [];
  profits: any[] = [];
  error = '';

  // Summary Metrics
  totalInvestment = 0;
  totalShares = 0;
  totalOwnership = 0;
  totalEstimatedProfit = 0;
  totalApprovedProfit = 0;
  totalPaidProfit = 0;

  constructor(private http: HttpClient, library: FaIconLibrary, private router: Router) {
    library.addIconPacks(fas);
  }

  ngOnInit(): void {
    this.fetchDashboard();
  }

  fetchDashboard() {
    this.http.get<any>(`${environment.apiBaseUrl}/partnership/dashboard`).subscribe({
      next: (res) => {
        if (res.success) {
          this.partner = res.partner;
          this.investments = res.investments || [];
          this.applications = res.applications || [];
          this.profits = res.profits || [];
          this.calculateMetrics();
        }
        this.isLoading = false;
      },
      error: (err) => {
        if (err.status === 401 || err.status === 403) {
           this.error = 'يرجى تسجيل الدخول للوصول إلى لوحة الشريك.';
        } else if (err.status === 404) {
           this.error = 'لا يوجد لديك حساب شريك حالياً. يرجى تقديم طلب الشراكة أولاً.';
        } else {
           this.error = 'حدث خطأ أثناء تحميل بيانات اللوحة.';
        }
        this.isLoading = false;
      }
    });
  }

  calculateMetrics() {
    this.totalInvestment = this.investments.reduce((sum, inv) => sum + (inv.status === 'ACTIVE' ? inv.investmentAmount : 0), 0);
    this.totalShares = this.investments.reduce((sum, inv) => sum + (inv.status === 'ACTIVE' ? inv.sharesPurchased : 0), 0);
    this.totalOwnership = this.investments.reduce((sum, inv) => sum + (inv.status === 'ACTIVE' ? inv.ownershipPercentage : 0), 0);
    
    this.totalEstimatedProfit = this.profits.reduce((sum, p) => sum + (p.status === 'ESTIMATED' ? p.partnerProfit : 0), 0);
    this.totalApprovedProfit = this.profits.reduce((sum, p) => sum + (p.status === 'APPROVED' ? p.partnerProfit : 0), 0);
    this.totalPaidProfit = this.profits.reduce((sum, p) => sum + (p.status === 'PAID' ? p.partnerProfit : 0), 0);
  }
}
