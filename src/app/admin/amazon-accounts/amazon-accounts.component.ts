import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';

interface AmazonAccountItem {
  _id: string;
  accountName: string;
  sellerId: string;
  marketplaceId: string;
  region: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  isActive: boolean;
  connectionStatus: 'connected' | 'error' | 'untested';
  lastTestedAt?: string;
  lastError?: string;
  isTesting?: boolean;
}

@Component({
  selector: 'app-amazon-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './amazon-accounts.component.html',
  styleUrls: ['./amazon-accounts.component.css']
})
export class AmazonAccountsComponent implements OnInit {
  accounts: AmazonAccountItem[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Modal State
  showModal = false;
  isEditMode = false;
  saving = false;

  accountForm: Partial<AmazonAccountItem> = {
    accountName: '',
    sellerId: '',
    marketplaceId: 'ARBP9OOSHTCHU',
    region: 'eu',
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    isActive: false
  };

  editingAccountId: string | null = null;

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadAccounts();
  }

  loadAccounts(): void {
    this.loading = true;
    this.errorMessage = '';
    this.adminService.getAmazonAccounts().subscribe({
      next: (res: any) => {
        this.loading = false;
        if (res.success) {
          this.accounts = res.data || [];
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'فشل في تحميل حسابات أمازون';
      }
    });
  }

  openCreateModal(): void {
    this.isEditMode = false;
    this.editingAccountId = null;
    this.accountForm = {
      accountName: '',
      sellerId: '',
      marketplaceId: 'ARBP9OOSHTCHU',
      region: 'eu',
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      isActive: this.accounts.length === 0
    };
    this.showModal = true;
  }

  openEditModal(account: AmazonAccountItem): void {
    this.isEditMode = true;
    this.editingAccountId = account._id;
    this.accountForm = {
      accountName: account.accountName,
      sellerId: account.sellerId,
      marketplaceId: account.marketplaceId,
      region: account.region,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      refreshToken: account.refreshToken,
      isActive: account.isActive
    };
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.saving = false;
  }

  saveAccount(): void {
    if (!this.accountForm.accountName || !this.accountForm.sellerId || !this.accountForm.clientId || !this.accountForm.refreshToken) {
      alert('يرجى ملء جميع الحقول المطلوبة (اسم الحساب، Merchant ID، Client ID، Refresh Token)');
      return;
    }

    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';

    if (this.isEditMode && this.editingAccountId) {
      this.adminService.updateAmazonAccount(this.editingAccountId, this.accountForm).subscribe({
        next: (res: any) => {
          this.saving = false;
          this.closeModal();
          this.successMessage = 'تم تحديث حساب أمازون بنجاح';
          this.loadAccounts();
        },
        error: (err) => {
          this.saving = false;
          alert(err.error?.message || 'خطأ أثناء تحديث الحساب');
        }
      });
    } else {
      this.adminService.createAmazonAccount(this.accountForm).subscribe({
        next: (res: any) => {
          this.saving = false;
          this.closeModal();
          this.successMessage = 'تم إضافة حساب أمازون بنجاح';
          this.loadAccounts();
        },
        error: (err) => {
          this.saving = false;
          alert(err.error?.message || 'خطأ أثناء إضافة الحساب');
        }
      });
    }
  }

  toggleActive(account: AmazonAccountItem): void {
    if (account.isActive) return; // Already active

    if (!confirm(`هل أنت تأكد من تنشيط ربط حساب "${account.accountName}"؟ سيتم توجيه جميع عمليات المزامنة والنشر إليه.`)) {
      return;
    }

    this.adminService.activateAmazonAccount(account._id).subscribe({
      next: (res: any) => {
        this.successMessage = `تم تنشيط الحساب "${account.accountName}" بنجاح`;
        this.loadAccounts();
      },
      error: (err) => {
        alert(err.error?.message || 'فشل في تنشيط الحساب');
      }
    });
  }

  testConnection(account: AmazonAccountItem): void {
    account.isTesting = true;
    this.adminService.testAmazonAccountConnection(account._id).subscribe({
      next: (res: any) => {
        account.isTesting = false;
        if (res.success) {
          account.connectionStatus = 'connected';
          account.lastError = undefined;
          alert('✅ تم الاتصال بنجاح مع سيرفرات أمازون SP-API!');
        } else {
          account.connectionStatus = 'error';
          account.lastError = res.error;
          alert('❌ فشل الاتصال: ' + (res.error || 'تأكد من المفاتيح'));
        }
        this.loadAccounts();
      },
      error: (err) => {
        account.isTesting = false;
        account.connectionStatus = 'error';
        alert('❌ خطأ في اختبار الاتصال');
      }
    });
  }

  deleteAccount(account: AmazonAccountItem): void {
    if (!confirm(`هل أنت متأكد من حذف حساب "${account.accountName}"؟`)) {
      return;
    }

    this.adminService.deleteAmazonAccount(account._id).subscribe({
      next: (res: any) => {
        this.successMessage = 'تم حذف الحساب بنجاح';
        this.loadAccounts();
      },
      error: (err) => {
        alert(err.error?.message || 'فشل في حذف الحساب');
      }
    });
  }
}
