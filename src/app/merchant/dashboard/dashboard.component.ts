import { Component, OnInit } from '@angular/core';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalDialogComponent } from '../../shared/modal-dialog/modal-dialog.component';

@Component({
  selector: 'app-merchant-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalDialogComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class MerchantDashboardComponent implements OnInit {
  merchant: any = {};
  products: any[] = [];
  orders: any[] = [];
  updateRequests: any[] = [];
  loadingMerchant = false;
  loadingProducts = false;
  loadingOrders = false;
  loadingUpdateRequests = false;

  // Modal properties
  modalConfig = {
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'تأكيد',
    cancelText: 'إلغاء',
    showCancel: true,
    type: 'info' as 'info' | 'warning' | 'error' | 'success'
  };

  // Multi-select properties
  selectedProducts: Set<string> = new Set();

  // View and pagination properties
  viewMode: 'grid' | 'list' = 'grid';
  currentPage = 1;
  itemsPerPage = 20;

  constructor(private merchantAuthService: MerchantAuthService, private router: Router) {}

  ngOnInit(): void {
    // Refresh merchant data first to get latest approval status
    this.loadMerchantData();
    this.loadProducts();
    this.loadOrders();
    this.loadUpdateRequests();
  }

  get pendingProductsCount(): number {
    return this.products.filter(p => p.status === 'pending').length;
  }

  get totalPages(): number {
    return Math.ceil(this.products.length / this.itemsPerPage);
  }

  get paginatedProducts(): any[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.products.slice(start, end);
  }

  changeView(mode: 'grid' | 'list') {
    this.viewMode = mode;
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  changeItemsPerPage() {
    // Reset to first page when changing items per page
    this.currentPage = 1;
  }

  loadMerchantData() {
    this.loadingMerchant = true;
    this.merchantAuthService.getCurrentMerchantFromAPI().subscribe({
      next: (res: any) => {
        this.merchant = res.merchant || res;
        this.loadingMerchant = false;

        // If merchant account is suspended, redirect to home page immediately
        if (this.merchant.suspended) {
          // Clear merchant data to prevent showing "approved" status
          this.merchant.approved = false;
          // Use setTimeout to ensure navigation happens after any alerts
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 100);
          return;
        }
      },
      error: (error: any) => {
        this.loadingMerchant = false;

        // Handle authentication errors
        if (error.status === 401 || error.status === 403) {
          alert('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
          this.merchantAuthService.performLogout();
          this.router.navigate(['/login']);
        } else {
          alert('فشل في تحميل بيانات التاجر');
        }
      }
    });
  }

  loadProducts() {
    this.loadingProducts = true;
    this.merchantAuthService.getMerchantProducts().subscribe({
      next: (res: any) => {
        this.products = res.products || res || [];
        this.currentPage = 1; // Reset to first page when loading products
        this.loadingProducts = false;
      },
      error: (error: any) => {
        this.loadingProducts = false;

        // Handle authentication errors
        if (error.status === 401 || error.status === 403) {
          alert('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
          this.merchantAuthService.performLogout();
          this.router.navigate(['/login']);
        } else {
          alert('فشل في تحميل المنتجات');
        }
      }
    });
  }

  loadOrders() {
    this.loadingOrders = true;
    this.merchantAuthService.getMerchantOrders().subscribe({
      next: (res: any) => {
        this.orders = res.orders || res || [];
        this.loadingOrders = false;
      },
      error: (error: any) => {
        this.loadingOrders = false;

        // Handle authentication errors
        if (error.status === 401 || error.status === 403) {
          alert('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
          this.merchantAuthService.performLogout();
          this.router.navigate(['/login']);
        } else {
          alert('فشل في تحميل الطلبات');
        }
      }
    });
  }

  loadUpdateRequests() {
    this.loadingUpdateRequests = true;
    this.merchantAuthService.getMerchantUpdateRequests().subscribe({
      next: (res: any) => {
        this.updateRequests = res.requests || res || [];
        this.loadingUpdateRequests = false;
      },
      error: (error: any) => {
        this.loadingUpdateRequests = false;

        // Handle authentication errors
        if (error.status === 401 || error.status === 403) {
          alert('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
          this.merchantAuthService.performLogout();
          this.router.navigate(['/login']);
        } else {
          alert('فشل في تحميل طلبات تحديث المنتجات');
        }
      }
    });
  }

  addProduct() {
    this.router.navigate(['/merchant/add-product']);
  }

  editProduct(product: any) {
    // Navigate to edit product page with product ID
    this.router.navigate(['/merchant/edit-product', product._id]);
  }

  deleteProduct(product: any) {
    this.showModal(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف المنتج "${product.product_name}"؟ لا يمكن التراجع عن هذا الإجراء.`,
      'warning',
      () => this.confirmDeleteProduct(product)
    );
  }

  // Modal methods
  showModal(title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info', onConfirm?: () => void) {
    this.modalConfig = {
      isOpen: true,
      title,
      message,
      confirmText: 'تأكيد',
      cancelText: 'إلغاء',
      showCancel: true,
      type
    };
    this.onConfirmCallback = onConfirm;
  }

  onModalConfirm() {
    if (this.onConfirmCallback) {
      this.onConfirmCallback();
    }
  }

  onModalCancel() {
    this.modalConfig.isOpen = false;
  }

  onModalClose() {
    this.modalConfig.isOpen = false;
  }

  private onConfirmCallback?: () => void;

  // Multi-select methods
  toggleProductSelection(productId: string) {
    if (this.selectedProducts.has(productId)) {
      this.selectedProducts.delete(productId);
    } else {
      this.selectedProducts.add(productId);
    }
  }

  isProductSelected(productId: string): boolean {
    return this.selectedProducts.has(productId);
  }

  selectAllProducts() {
    if (this.selectedProducts.size === this.products.length) {
      this.selectedProducts.clear();
    } else {
      this.products.forEach(product => this.selectedProducts.add(product._id));
    }
  }

  isAllProductsSelected(): boolean {
    return this.products.length > 0 && this.selectedProducts.size === this.products.length;
  }

  isSomeProductsSelected(): boolean {
    return this.selectedProducts.size > 0 && this.selectedProducts.size < this.products.length;
  }

  bulkDeleteSelectedProducts() {
    const selectedCount = this.selectedProducts.size;
    if (selectedCount === 0) return;

    this.showModal(
      'تأكيد الحذف الجماعي',
      `هل أنت متأكد من حذف ${selectedCount} منتج${selectedCount > 1 ? '' : ''}؟ لا يمكن التراجع عن هذا الإجراء.`,
      'warning',
      () => this.confirmBulkDelete()
    );
  }

  private confirmDeleteProduct(product: any) {
    this.merchantAuthService.deleteMerchantProduct(product._id).subscribe({
      next: () => {
        this.showModal('نجح الحذف', 'تم حذف المنتج بنجاح.', 'success');
        // Refresh product list after deletion
        this.loadProducts();
        this.selectedProducts.clear();
      },
      error: (error) => {
        this.showModal('خطأ في الحذف', 'حدث خطأ أثناء حذف المنتج. يرجى المحاولة مرة أخرى.', 'error');
        console.error('Error deleting product:', error);
      }
    });
  }

  private confirmBulkDelete() {
    const deletePromises = Array.from(this.selectedProducts).map(productId =>
      this.merchantAuthService.deleteMerchantProduct(productId).toPromise()
    );

    Promise.all(deletePromises).then(() => {
      this.showModal('نجح الحذف الجماعي', `تم حذف ${this.selectedProducts.size} منتج بنجاح.`, 'success');
      this.loadProducts();
      this.selectedProducts.clear();
    }).catch((error) => {
      this.showModal('خطأ في الحذف الجماعي', 'حدث خطأ أثناء حذف بعض المنتجات. يرجى المحاولة مرة أخرى.', 'error');
      console.error('Error bulk deleting products:', error);
    });
  }
}
