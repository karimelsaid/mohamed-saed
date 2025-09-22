import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../services/admin.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-merchant-management',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './merchant-management.component.html',
  styleUrls: ['./merchant-management.component.css']
})
export class MerchantManagementComponent implements OnInit {
  merchants: any[] = [];
  loading = false;
  selectedMerchant: any = null;
  merchantProducts: any[] = [];
  showProductsModal = false;
  loadingProducts = false;

  // Edit product properties
  showEditModal = false;
  editingProduct: any = null;
  editForm = {
    product_name: '',
    product_price: '',
    product_quantity: '',
    product_category: '',
    product_description: ''
  };

  // Product update requests properties
  showUpdateRequestsModal = false;
  productUpdateRequests: any[] = [];
  loadingUpdateRequests = false;

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadMerchants();
  }

  loadMerchants() {
    this.loading = true;
    this.adminService.getMerchants().subscribe({
      next: (res: any) => {
        this.merchants = res.merchants || [];
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading merchants:', error);
        this.loading = false;
        // Show user-friendly error message instead of alert
        alert(error.message || 'فشل في تحميل التجار');
      }
    });
  }

  approveMerchant(merchant: any) {
    if (confirm('هل أنت متأكد من الموافقة على هذا التاجر؟')) {
      this.adminService.updateMerchantApproval(merchant._id, true).subscribe({
        next: () => {
          alert('تم الموافقة على التاجر بنجاح');
          this.loadMerchants();
        },
        error: (error) => {
          console.error('Error approving merchant:', error);
          alert(error.message || 'فشل في الموافقة على التاجر');
        }
      });
    }
  }

  rejectMerchant(merchant: any) {
    if (confirm('هل أنت متأكد من رفض هذا التاجر؟')) {
      this.adminService.updateMerchantApproval(merchant._id, false).subscribe({
        next: () => {
          alert('تم رفض التاجر بنجاح');
          this.loadMerchants();
        },
        error: (error) => {
          console.error('Error rejecting merchant:', error);
          alert(error.message || 'فشل في رفض التاجر');
        }
      });
    }
  }

  suspendMerchant(merchant: any) {
    if (confirm('هل أنت متأكد من إيقاف هذا التاجر؟')) {
      this.adminService.updateMerchantSuspension(merchant._id, true).subscribe({
        next: () => {
          alert('تم إيقاف التاجر بنجاح');
          this.loadMerchants();
        },
        error: (error) => {
          console.error('Error suspending merchant:', error);
          alert(error.message || 'فشل في إيقاف التاجر');
        }
      });
    }
  }

  activateMerchant(merchant: any) {
    if (confirm('هل أنت متأكد من تفعيل هذا التاجر؟')) {
      this.adminService.updateMerchantSuspension(merchant._id, false).subscribe({
        next: () => {
          alert('تم تفعيل التاجر بنجاح');
          this.loadMerchants();
        },
        error: (error) => {
          console.error('Error activating merchant:', error);
          alert(error.message || 'فشل في تفعيل التاجر');
        }
      });
    }
  }

  viewMerchantProducts(merchant: any) {
    this.selectedMerchant = merchant;
    this.loadingProducts = true;
    this.showProductsModal = true;
    this.showUpdateRequestsModal = false; // Ensure update requests modal is closed

    this.adminService.getMerchantProductsByMerchant(merchant._id).subscribe({
      next: (res: any) => {
        this.merchantProducts = res.products || [];
        this.loadingProducts = false;
      },
      error: (error) => {
        console.error('Error loading merchant products:', error);
        this.loadingProducts = false;
        alert(error.message || 'فشل في تحميل منتجات التاجر');
      }
    });
  }

  closeProductsModal() {
    this.showProductsModal = false;
    this.showUpdateRequestsModal = false; // Ensure update requests modal is also closed
    this.selectedMerchant = null;
    this.merchantProducts = [];
  }

  editProduct(product: any) {
    this.editingProduct = product;
    this.editForm = {
      product_name: product.product_name,
      product_price: product.product_price,
      product_quantity: product.product_quantity,
      product_category: product.product_category,
      product_description: product.product_description
    };
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editingProduct = null;
    this.editForm = {
      product_name: '',
      product_price: '',
      product_quantity: '',
      product_category: '',
      product_description: ''
    };
  }

  saveProductChanges() {
    if (!this.editingProduct) return;

    // Here you would typically call an API to update the product
    // For now, we'll just update the local array
    const index = this.merchantProducts.findIndex(p => p._id === this.editingProduct._id);
    if (index !== -1) {
      this.merchantProducts[index] = {
        ...this.merchantProducts[index],
        ...this.editForm
      };
    }

    alert('تم حفظ التغييرات بنجاح');
    this.closeEditModal();
  }

  approveProduct(product: any) {
    if (confirm('هل أنت متأكد من الموافقة على هذا المنتج؟')) {
      this.adminService.updateProductApproval(product._id, 'approved').subscribe({
        next: () => {
          alert('تمت الموافقة على المنتج بنجاح');
          this.viewMerchantProducts(this.selectedMerchant);
        },
        error: (error) => {
          console.error('Error approving product:', error);
          alert(error.message || 'فشل في الموافقة على المنتج');
        }
      });
    }
  }

  rejectProduct(product: any) {
    if (confirm('هل أنت متأكد من رفض هذا المنتج؟')) {
      this.adminService.updateProductApproval(product._id, 'rejected').subscribe({
        next: () => {
          alert('تم رفض المنتج بنجاح');
          this.viewMerchantProducts(this.selectedMerchant);
        },
        error: (error) => {
          console.error('Error rejecting product:', error);
          alert(error.message || 'فشل في رفض المنتج');
        }
      });
    }
  }

  // Product Update Requests Methods
  viewProductUpdateRequests() {
    this.loadingUpdateRequests = true;
    this.showUpdateRequestsModal = true;
    this.showProductsModal = false; // Ensure products modal is closed

    this.adminService.getProductUpdateRequests().subscribe({
      next: (res: any) => {
        this.productUpdateRequests = res.requests || [];
        this.loadingUpdateRequests = false;
      },
      error: (error) => {
        console.error('Error loading product update requests:', error);
        this.loadingUpdateRequests = false;
        alert(error.message || 'فشل في تحميل طلبات تحديث المنتجات');
      }
    });
  }

  closeUpdateRequestsModal() {
    this.showUpdateRequestsModal = false;
    this.showProductsModal = false; // Ensure products modal is also closed
    this.productUpdateRequests = [];
  }

  approveUpdateRequest(request: any) {
    if (confirm('هل أنت متأكد من الموافقة على طلب تحديث هذا المنتج؟')) {
      this.adminService.updateProductUpdateRequest(request._id, 'approved').subscribe({
        next: () => {
          alert('تمت الموافقة على طلب التحديث بنجاح');
          this.viewProductUpdateRequests();
        },
        error: (error) => {
          console.error('Error approving update request:', error);
          alert(error.message || 'فشل في الموافقة على طلب التحديث');
        }
      });
    }
  }

  rejectUpdateRequest(request: any) {
    if (confirm('هل أنت متأكد من رفض طلب تحديث هذا المنتج؟')) {
      this.adminService.updateProductUpdateRequest(request._id, 'rejected').subscribe({
        next: () => {
          alert('تم رفض طلب التحديث بنجاح');
          this.viewProductUpdateRequests();
        },
        error: (error) => {
          console.error('Error rejecting update request:', error);
          alert(error.message || 'فشل في رفض طلب التحديث');
        }
      });
    }
  }
}
