import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';

interface MerchantOption {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  governorate?: string;
  city?: string;
}

interface LinkedAmazonAccount {
  _id: string;
  accountName: string;
  sellerId: string;
  marketplaceId: string;
  region: string;
  connectionStatus: 'connected' | 'error' | 'untested';
  createdAt: string;
  merchantId?: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
  };
}

@Component({
  selector: 'app-merchant-amazon-link',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './merchant-amazon-link.component.html',
  styleUrls: ['./merchant-amazon-link.component.css']
})
export class MerchantAmazonLinkComponent implements OnInit {
  merchants: MerchantOption[] = [];
  linkedAccounts: LinkedAmazonAccount[] = [];
  selectedMerchantId: string = '';
  
  loadingMerchants = false;
  loadingAccounts = false;
  generatingUrl = false;

  successMessage = '';
  errorMessage = '';

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadMerchants();
    this.loadLinkedAccounts();
  }

  loadMerchants(): void {
    this.loadingMerchants = true;
    this.adminService.getMerchants().subscribe({
      next: (res: any) => {
        this.loadingMerchants = false;
        if (res && (res.merchants || res.data || Array.isArray(res))) {
          this.merchants = res.merchants || res.data || (Array.isArray(res) ? res : []);
        }
      },
      error: (err) => {
        this.loadingMerchants = false;
        console.error('Error loading merchants:', err);
      }
    });
  }

  loadLinkedAccounts(): void {
    this.loadingAccounts = true;
    this.errorMessage = '';
    this.adminService.getLinkedMerchantAmazonAccounts().subscribe({
      next: (res: any) => {
        this.loadingAccounts = false;
        if (res.success) {
          this.linkedAccounts = res.data || [];
        }
      },
      error: (err) => {
        this.loadingAccounts = false;
        this.errorMessage = err.error?.message || 'فشل في تحميل حسابات التجار المربوطة';
      }
    });
  }

  initiateOAuthFlow(): void {
    if (!this.selectedMerchantId) {
      alert('يرجى اختيار التاجر أولاً للبدء في ربط حسابه على أمازون');
      return;
    }

    const merchant = this.merchants.find(m => m._id === this.selectedMerchantId);
    const merchantName = merchant ? merchant.name : 'التاجر المختار';

    if (!confirm(`هل تريد الآن فتح صفحة الموافقة الرسمية من أمازون Seller Central لربط حساب التاجر "${merchantName}"؟`)) {
      return;
    }

    this.generatingUrl = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.adminService.generateMerchantAmazonAuthUrl(this.selectedMerchantId).subscribe({
      next: (res: any) => {
        this.generatingUrl = false;
        if (res.success && res.data?.authUrl) {
          this.successMessage = `جاري التوجيه إلى أمازون Seller Central لموافقة التاجر "${merchantName}"...`;
          // Open Amazon Seller Central consent page in a new tab/window strictly with version=production
          window.open(res.data.authUrl, '_blank', 'noopener,noreferrer');
        } else {
          this.errorMessage = res.message || 'فشل في إنشاء رابط التفويض من أمازون';
        }
      },
      error: (err) => {
        this.generatingUrl = false;
        this.errorMessage = err.error?.message || 'خطأ أثناء إنشاء رابط الموافقة من أمازون';
      }
    });
  }

  unlinkAccount(account: LinkedAmazonAccount): void {
    const merchantName = account.merchantId?.name || account.accountName;
    if (!confirm(`هل أنت متأكد من إلغاء ربط حساب أمازون للتاجر "${merchantName}"؟`)) {
      return;
    }

    this.adminService.unlinkMerchantAmazonAccount(account._id).subscribe({
      next: (res: any) => {
        this.successMessage = 'تم إلغاء ربط الحساب بنجاح';
        this.loadLinkedAccounts();
      },
      error: (err) => {
        alert(err.error?.message || 'فشل في إلغاء ربط الحساب');
      }
    });
  }
}
