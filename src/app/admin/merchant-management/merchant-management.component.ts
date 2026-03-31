import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../services/admin.service';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../services/modal.service';
import { environment } from '../../../environments/environment';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { 
  faStar, faStarHalfAlt, faStore, faBox, faShoppingBag, 
  faChartLine, faCheckCircle, faTimesCircle, faExclamationTriangle,
  faEye, faEdit, faTrash, faUser, faEnvelope, faPhone, faClock
} from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-merchant-management',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './merchant-management.component.html',
  styleUrls: ['./merchant-management.component.css']
})
export class MerchantManagementComponent implements OnInit {
  // Icons
  faStar = faStar;
  faStarHalfAlt = faStarHalfAlt;
  faStore = faStore;
  faBox = faBox;
  faShoppingBag = faShoppingBag;
  faChartLine = faChartLine;
  faCheckCircle = faCheckCircle;
  faTimesCircle = faTimesCircle;
  faExclamationTriangle = faExclamationTriangle;
  faEye = faEye;
  faEdit = faEdit;
  faTrash = faTrash;
  faUser = faUser;
  faEnvelope = faEnvelope;
  faPhone = faPhone;
  faClock = faClock;

  merchants: any[] = [];
  loading = false;
  selectedMerchant: any = null;

  get stats() {
    return {
      total: this.merchants.length,
      approved: this.merchants.filter(m => m.approved).length,
      pending: this.merchants.filter(m => !m.approved).length,
      suspended: this.merchants.filter(m => m.suspended).length
    };
  }
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

  uploadsBaseUrl = environment.uploadsBaseUrl;

  constructor(private adminService: AdminService, private modalService: ModalService) { }

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
        this.showErrorModal(error.message || 'فشل في تحميل التجار');
      }
    });
  }

  approveMerchant(merchant: any) {
    if (confirm('هل أنت متأكد من الموافقة على هذا التاجر؟')) {
      this.adminService.updateMerchantApproval(merchant._id, true).subscribe({
        next: () => {
          this.showSuccessModal('تم الموافقة على التاجر بنجاح');
          this.loadMerchants();
        },
        error: (error) => {
          console.error('Error approving merchant:', error);
          this.showErrorModal(error.message || 'فشل في الموافقة على التاجر');
        }
      });
    }
  }

  rejectMerchant(merchant: any) {
    if (confirm('هل أنت متأكد من رفض هذا التاجر؟')) {
      this.adminService.updateMerchantApproval(merchant._id, false).subscribe({
        next: () => {
          this.showSuccessModal('تم رفض التاجر بنجاح');
          this.loadMerchants();
        },
        error: (error) => {
          console.error('Error rejecting merchant:', error);
          this.showErrorModal(error.message || 'فشل في رفض التاجر');
        }
      });
    }
  }

  suspendMerchant(merchant: any) {
    if (confirm('هل أنت متأكد من إيقاف هذا التاجر؟')) {
      this.adminService.updateMerchantSuspension(merchant._id, true).subscribe({
        next: () => {
          this.showSuccessModal('تم إيقاف التاجر بنجاح');
          this.loadMerchants();
        },
        error: (error) => {
          console.error('Error suspending merchant:', error);
          this.showErrorModal(error.message || 'فشل في إيقاف التاجر');
        }
      });
    }
  }

  activateMerchant(merchant: any) {
    if (confirm('هل أنت متأكد من تفعيل هذا التاجر؟')) {
      this.adminService.updateMerchantSuspension(merchant._id, false).subscribe({
        next: () => {
          this.showSuccessModal('تم تفعيل التاجر بنجاح');
          this.loadMerchants();
        },
        error: (error) => {
          console.error('Error activating merchant:', error);
          this.showErrorModal(error.message || 'فشل في تفعيل التاجر');
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
        this.showErrorModal(error.message || 'فشل في تحميل منتجات التاجر');
      }
    });
  }

  closeProductsModal() {
    this.showProductsModal = false;
    this.showUpdateRequestsModal = false;
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

    this.showSuccessModal('تم حفظ التغييرات بنجاح');
    this.closeEditModal();
  }

  approveProduct(product: any) {
    if (confirm('هل أنت متأكد من الموافقة على هذا المنتج؟')) {
      this.adminService.updateProductApproval(product._id, 'approved').subscribe({
        next: () => {
          this.showSuccessModal('تمت الموافقة على المنتج بنجاح');
          this.viewMerchantProducts(this.selectedMerchant);
        },
        error: (error) => {
          console.error('Error approving product:', error);
          this.showErrorModal(error.message || 'فشل في الموافقة على المنتج');
        }
      });
    }
  }

  rejectProduct(product: any) {
    if (confirm('هل أنت متأكد من رفض هذا المنتج؟')) {
      this.adminService.updateProductApproval(product._id, 'rejected').subscribe({
        next: () => {
          this.showSuccessModal('تم رفض المنتج بنجاح');
          this.viewMerchantProducts(this.selectedMerchant);
        },
        error: (error) => {
          console.error('Error rejecting product:', error);
          this.showErrorModal(error.message || 'فشل في رفض المنتج');
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
        this.showErrorModal(error.message || 'فشل في تحميل طلبات تحديث المنتجات');
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
          this.showSuccessModal('تمت الموافقة على طلب التحديث بنجاح');
          this.viewProductUpdateRequests();
        },
        error: (error) => {
          console.error('Error approving update request:', error);
          this.showErrorModal(error.message || 'فشل في الموافقة على طلب التحديث');
        }
      });
    }
  }

  rejectUpdateRequest(request: any) {
    if (confirm('هل أنت متأكد من رفض طلب تحديث هذا المنتج؟')) {
      this.adminService.updateProductUpdateRequest(request._id, 'rejected').subscribe({
        next: () => {
          this.showSuccessModal('تم رفض طلب التحديث بنجاح');
          this.viewProductUpdateRequests();
        },
        error: (error) => {
          console.error('Error rejecting update request:', error);
          this.showErrorModal(error.message || 'فشل في رفض طلب التحديث');
        }
      });
    }
  }

  // Helper methods for showing modals
  showSuccessModal(message: string): void {
    this.modalService.openModal({
      title: 'نجح العملية',
      message: message,
      type: 'success',
      confirmText: 'موافق',
      showCancel: false
    });
  }

  showErrorModal(message: string): void {
    this.modalService.openModal({
      title: 'خطأ',
      message: message,
      type: 'error',
      confirmText: 'موافق',
      showCancel: false
    });
  }

  getActivityLevel(merchant: any): { label: string, color: string } {
    const score = (merchant.productCount || 0) * 1 + (merchant.totalSales || 0) / 100;
    if (score >= 50) return { label: 'مرتفع', color: 'text-green-600 bg-green-50 border-green-200' };
    if (score >= 10) return { label: 'متوسط', color: 'text-blue-600 bg-blue-50 border-blue-200' };
    return { label: 'مبتدئ', color: 'text-gray-600 bg-gray-50 border-gray-200' };
  }

  getStars(rating: number): any[] {
    const stars = [];
    const fullStars = Math.floor(rating || 0);
    const hasHalfStar = (rating || 0) % 1 >= 0.5;
    
    for (let i = 1; i <= 5; i++) {
        if (i <= fullStars) {
            stars.push({ type: 'full', icon: this.faStar });
        } else if (i === fullStars + 1 && hasHalfStar) {
            stars.push({ type: 'half', icon: this.faStarHalfAlt });
        } else {
            stars.push({ type: 'empty', icon: this.faStar });
        }
    }
    return stars;
  }

  getProductImageUrl(product: any): string {
    // This logic is now consistent with other working components like search-results.
    let imagePath = product.image_path || product.product_image || '';
    const merchantName = product.merchantName || (this.selectedMerchant ? (this.selectedMerchant.merchantName || this.selectedMerchant.name) : null);

    // If a full path is already provided in image_path, use it directly.
    if (imagePath && imagePath.startsWith('/uploads/books/')) {
      // The path is already correct, just return it.
      return imagePath;
    }

    // If not, build the path from scratch
    const imageId = product.products_id || product.product_image;
    if (!imageId) {
      return '/assets/placeholder-book.jpg';
    }

    let finalPath;
    if (merchantName) {
      const sanitizedMerchantName = merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      finalPath = `merchant_${sanitizedMerchantName}/${imageId}/${imageId}.webp`;
    } else {
      // Fallback to admin path if no merchant name is found
      finalPath = `admin__karim_mohamed__/${imageId}/${imageId}.webp`;
    }

    // Construct the full path, ensuring not to duplicate '/books/'
    // uploadsBaseUrl is likely '/uploads' or '/uploads/books'
    // The final path should be /uploads/books/merchant_...
    const fullPath = `${this.uploadsBaseUrl}/${finalPath}`.replace('/books/books/', '/books/');
    return fullPath;
  }

  getMerchantLogoUrl(merchant: any): string {
    const merchantName = merchant.name || merchant.username;
    const logoId = merchant.logo || merchant.merchant_logo;

    // If logoId is already a full path (contains '/'), use it directly
    if (logoId && logoId.includes('/')) {
      return `${this.uploadsBaseUrl}/${logoId}`.replace('/books/books/', '/books/');
    }

    let finalPath;
    if (logoId) {
      const sanitizedMerchantName = merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      finalPath = `merchant_${sanitizedMerchantName}/${logoId}/${logoId}.webp`;
    } else {
      // Use default logo.webp in merchant's directory
      const sanitizedMerchantName = merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      finalPath = `merchant_${sanitizedMerchantName}/logo/logo.webp`;
    }
    const fullPath = `${this.uploadsBaseUrl}/${finalPath}`.replace('/books/books/', '/books/');
    return fullPath;
  }
}
