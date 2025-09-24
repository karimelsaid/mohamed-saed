import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../services/admin.service';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../services/modal.service';

@Component({
  selector: 'app-product-approval',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './product-approval.component.html',
  styleUrls: ['./product-approval.component.css']
})
export class ProductApprovalComponent implements OnInit {
  products: any[] = [];
  loading = false;
  error = '';
  approvingProducts = new Set<string>(); // Track products being approved
  showSuccessToast = false;
  successMessage = '';
  approvedCount = 0;

  constructor(private adminService: AdminService, private modalService: ModalService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts() {
    this.loading = true;
    this.adminService.getMerchantProducts().subscribe({
      next: (res) => {
        this.products = res.products.filter((p: any) => p.status === 'pending');
        this.loading = false;
      },
      error: (err) => {
        this.error = 'حدث خطأ أثناء تحميل المنتجات';
        this.loading = false;
      }
    });
  }

  approveProduct(productId: string) {
    if (this.approvingProducts.has(productId)) {
      return; // Prevent duplicate approval
    }

    this.approvingProducts.add(productId);

    this.adminService.updateProductApproval(productId, 'approved').subscribe({
      next: () => {
        this.approvingProducts.delete(productId);
        this.approvedCount++;
        this.showSuccessToast = true;
        this.successMessage = `تمت الموافقة على المنتج بنجاح! إجمالي المنتجات المعتمدة: ${this.approvedCount}`;
        this.loadProducts();

        // Hide toast after 3 seconds
        setTimeout(() => {
          this.showSuccessToast = false;
        }, 3000);
      },
      error: () => {
        this.approvingProducts.delete(productId);
        this.showErrorModal('فشل في الموافقة على المنتج');
      }
    });
  }

  rejectProduct(productId: string) {
    this.adminService.updateProductApproval(productId, 'rejected').subscribe({
      next: () => {
        this.loadProducts();
      },
      error: () => {
        this.showErrorModal('فشل في رفض المنتج');
      }
    });
  }

  isApproving(productId: string): boolean {
    return this.approvingProducts.has(productId);
  }

  // Helper methods for showing modals
  showErrorModal(message: string): void {
    this.modalService.openModal({
      title: 'خطأ',
      message: message,
      type: 'error',
      confirmText: 'موافق',
      showCancel: false
    });
  }
}
