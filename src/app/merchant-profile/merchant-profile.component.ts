import { Component, OnInit } from '@angular/core';
import { MerchantAuthService } from '../services/merchant-auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-merchant-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './merchant-profile.component.html',
  styleUrl: './merchant-profile.component.css'
})
export class MerchantProfileComponent implements OnInit {
  merchant: any = {};
  loading = false;
  message = '';
  messageColor = 'black';
  logoPreview: string | null = null;
  selectedFile: File | null = null;
  logoTimestamp: number = Date.now();

  constructor(private merchantAuthService: MerchantAuthService, private router: Router) {}

  ngOnInit(): void {
    this.loadMerchantData();
  }

  loadMerchantData() {
    this.loading = true;
    this.merchantAuthService.getCurrentMerchantFromAPI().subscribe({
      next: (res: any) => {
        this.merchant = res.merchant || res;
        this.loading = false;
      },
      error: (error: any) => {
        this.loading = false;
        this.showMessage('فشل في تحميل بيانات التاجر', 'red');
        if (error.status === 401 || error.status === 403) {
          this.merchantAuthService.performLogout();
          this.router.navigate(['/login']);
        }
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.logoPreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  onSubmit() {
    if (!this.merchant.name) {
      this.showMessage('الاسم مطلوب', 'red');
      return;
    }

    this.loading = true;
    const formData = new FormData();
    formData.append('name', this.merchant.name);
    formData.append('phone', this.merchant.phone || '');
    formData.append('governorate', this.merchant.governorate || '');
    formData.append('city', this.merchant.city || '');
    formData.append('village', this.merchant.village || '');
    formData.append('taxNumber', this.merchant.taxNumber || '');

    if (this.selectedFile) {
      formData.append('logo', this.selectedFile);
    }

    const token = this.merchantAuthService.getToken();
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${environment.apiBaseUrl}/merchant/profile`, {
      method: 'PUT',
      headers: headers,
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      this.loading = false;
      if (data.success) {
        this.showMessage('تم تحديث البيانات بنجاح', 'green');
        this.merchant = data.merchant;
        this.logoPreview = null;
        this.selectedFile = null;
        this.logoTimestamp = Date.now(); // Force logo re-render
        // Update local storage
        localStorage.setItem('merchant_data', JSON.stringify(data.merchant));
      } else {
        this.showMessage(data.message || 'فشل في تحديث البيانات', 'red');
      }
    })
    .catch(error => {
      this.loading = false;
      this.showMessage('حدث خطأ أثناء التحديث', 'red');
      console.error('Error updating profile:', error);
    });
  }

  getLogoUrl(logo: string | null | undefined): string {
    if (!logo) return '';
    if (logo.startsWith('http://') || logo.startsWith('https://') || logo.startsWith('data:')) {
      return logo.replace(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, 'https://knoozbook.com');
    }
    if (logo.startsWith('/uploads/') || logo.startsWith('uploads/')) {
      const clean = logo.startsWith('/') ? logo : `/${logo}`;
      return `https://knoozbook.com${clean}?t=${this.logoTimestamp}`;
    }
    const cleanLogo = logo.startsWith('/') ? logo.substring(1) : logo;
    return `https://knoozbook.com/uploads/books/${cleanLogo}?t=${this.logoTimestamp}`;
  }

  onLogoError(event: any) {
    // Log error but don't hide the image
    console.error('Logo failed to load', event);
    this.showMessage('فشل في تحميل اللوجو الحالي', 'red');
  }

  private showMessage(msg: string, color: string) {
    this.message = msg;
    this.messageColor = color;
    setTimeout(() => {
      this.message = '';
    }, 5000);
  }
}
