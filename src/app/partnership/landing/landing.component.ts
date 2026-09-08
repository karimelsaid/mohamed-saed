import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent implements OnInit {
  settings: any = null;
  isLoading = true;
  isSubmitting = false;
  error = '';
  successMessage = '';

  applicationData = {
    fullName: '',
    email: '',
    phone: '',
    partnerType: 'INDIVIDUAL',
    investmentAmount: 0,
    requestedShares: 0
  };

  constructor(private http: HttpClient, library: FaIconLibrary, private router: Router) {
    library.addIconPacks(fas);
  }

  ngOnInit(): void {
    this.fetchSettings();
  }

  fetchSettings() {
    this.http.get<any>(`${environment.apiBaseUrl}/partnership/settings`).subscribe({
      next: (res) => {
        if (res.success && res.settings) {
          this.settings = res.settings;
          this.applicationData.investmentAmount = this.settings.minimumInvestment || 0;
          this.calculateShares();
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'تعذر تحميل إعدادات الشراكة. يرجى المحاولة لاحقاً.';
        this.isLoading = false;
      }
    });
  }

  calculateShares() {
    if (this.settings && this.settings.sharePrice > 0) {
      this.applicationData.requestedShares = Math.floor(this.applicationData.investmentAmount / this.settings.sharePrice);
    }
  }

  onInvestmentChange() {
    this.calculateShares();
  }

  submitApplication() {
    if (this.applicationData.investmentAmount < this.settings.minimumInvestment) {
      this.error = `الحد الأدنى للاستثمار هو ${this.settings.minimumInvestment} ج.م`;
      return;
    }
    
    if (this.applicationData.requestedShares > this.settings.availableShares) {
      this.error = `عدد الأسهم المطلوبة يتجاوز الأسهم المتاحة حالياً.`;
      return;
    }

    this.isSubmitting = true;
    this.error = '';
    this.successMessage = '';

    // NOTE: This route requires authentication in real app, might need to redirect to login if not logged in.
    this.http.post<any>(`${environment.apiBaseUrl}/partnership/apply`, this.applicationData).subscribe({
      next: (res) => {
        if (res.success) {
          this.successMessage = 'تم تقديم طلب الشراكة بنجاح! سيتم التواصل معك قريباً.';
          setTimeout(() => {
            this.router.navigate(['/partner-dashboard']);
          }, 3000);
        } else {
          this.error = res.message || 'حدث خطأ أثناء تقديم الطلب.';
        }
        this.isSubmitting = false;
      },
      error: (err) => {
        if (err.status === 401 || err.status === 403) {
           this.error = 'يرجى تسجيل الدخول أولاً لتقديم طلب الشراكة.';
        } else {
           this.error = err.error?.message || 'حدث خطأ أثناء تقديم الطلب. يرجى المحاولة مرة أخرى.';
        }
        this.isSubmitting = false;
      }
    });
  }
}
