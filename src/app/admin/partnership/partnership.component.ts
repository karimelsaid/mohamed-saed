import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { fas } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-admin-partnership',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './partnership.component.html',
  styleUrls: ['./partnership.component.css']
})
export class PartnershipComponent implements OnInit {
  activeTab = 'settings';
  isLoading = true;
  
  settings: any = {
    status: 'CLOSED',
    companyValuation: 0,
    totalShares: 0,
    sharePrice: 0,
    availableShares: 0,
    minimumInvestment: 0,
    maximumInvestment: 0,
    cancellationPeriodDays: 14,
    description: ''
  };
  
  applications: any[] = [];
  capTable: any[] = [];
  
  successMessage = '';
  error = '';

  constructor(private http: HttpClient, library: FaIconLibrary) {
    library.addIconPacks(fas);
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData() {
    this.isLoading = true;
    if (this.activeTab === 'settings') this.fetchSettings();
    else if (this.activeTab === 'applications') this.fetchApplications();
    else if (this.activeTab === 'captable') this.fetchCapTable();
  }

  setTab(tab: string) {
    this.activeTab = tab;
    this.successMessage = '';
    this.error = '';
    this.loadData();
  }

  fetchSettings() {
    this.http.get<any>(`${environment.apiBaseUrl}/admin/partnership/settings`).subscribe({
      next: (res) => {
        if (res.success && res.settings) {
          this.settings = res.settings;
        }
        this.isLoading = false;
      },
      error: (err) => this.handleError(err)
    });
  }

  saveSettings() {
    this.isLoading = true;
    this.http.patch<any>(`${environment.apiBaseUrl}/admin/partnership/settings`, this.settings).subscribe({
      next: (res) => {
        if (res.success) {
          this.settings = res.settings;
          this.successMessage = 'تم حفظ الإعدادات بنجاح.';
        }
        this.isLoading = false;
      },
      error: (err) => this.handleError(err)
    });
  }

  fetchApplications() {
    this.http.get<any>(`${environment.apiBaseUrl}/admin/partnership/applications`).subscribe({
      next: (res) => {
        if (res.success) {
          this.applications = res.applications;
        }
        this.isLoading = false;
      },
      error: (err) => this.handleError(err)
    });
  }

  approveApplication(id: string) {
    if (!confirm('هل أنت متأكد من اعتماد طلب الشراكة؟ سيتم إنشاء استثمار وتحديث أسهم الشريك.')) return;
    
    this.isLoading = true;
    this.http.post<any>(`${environment.apiBaseUrl}/admin/partnership/partners/${id}/approve`, {}).subscribe({
      next: (res) => {
        if (res.success) {
          this.successMessage = 'تم اعتماد الشراكة بنجاح.';
          this.fetchApplications();
        }
      },
      error: (err) => this.handleError(err)
    });
  }

  fetchCapTable() {
    this.http.get<any>(`${environment.apiBaseUrl}/admin/partnership/cap-table`).subscribe({
      next: (res) => {
        if (res.success) {
          this.capTable = res.shareholders;
        }
        this.isLoading = false;
      },
      error: (err) => this.handleError(err)
    });
  }

  private handleError(err: any) {
    this.error = err.error?.message || 'حدث خطأ غير متوقع.';
    this.isLoading = false;
  }
}
