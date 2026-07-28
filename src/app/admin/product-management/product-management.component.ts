import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faAmazon } from '@fortawesome/free-brands-svg-icons';
import { AdminService } from '../../services/admin.service';
import { ModalService } from '../../services/modal.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-product-management',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './product-management.component.html',
  styleUrls: ['./product-management.component.css']
})
export class ProductManagementComponent implements OnInit {
  products: any[] = [];
  loading = false;
  error = '';
  
  // Amazon tracking
  publishingToAmazon = new Set<string>();
  syncingAmazon = new Set<string>();
  retryingAmazon = new Set<string>();
  
  // Filters
  statusFilter = 'all';
  amazonStatusFilter = 'all';
  searchQuery = '';
  
  // Pagination
  currentPage = 1;
  itemsPerPage = 20;
  totalItems = 0;
  
  // Edit mode
  editingProduct: any = null;
  showEditModal = false;
  saving = false;
  
  // Amazon price settings
  profitPercentage: number = 80; // Default 80% profit margin
  systemSettings: any = null;
  
  uploadsBaseUrl = environment.uploadsBaseUrl;

  constructor(
    private adminService: AdminService,
    private modalService: ModalService,
    private library: FaIconLibrary
  ) {
    library.addIcons(faAmazon);
  }

  ngOnInit(): void {
    this.loadSystemSettings();
    this.loadProducts();
  }

  loadSystemSettings() {
    this.adminService.getSystemSettings().subscribe({
      next: (res) => {
        this.systemSettings = res;
        if (res.amazon?.priceIncreasePercentage) {
          this.profitPercentage = res.amazon.priceIncreasePercentage;
        }
      },
      error: () => {
        console.error('Failed to load system settings');
      }
    });
  }

  calculateAmazonPrice(basePrice: number): number {
    if (!basePrice) return 0;
    return basePrice * (1 + this.profitPercentage / 100);
  }

  updateProfitPercentage() {
    if (!this.systemSettings) {
      this.systemSettings = { amazon: {} };
    }
    if (!this.systemSettings.amazon) {
      this.systemSettings.amazon = {};
    }
    
    this.systemSettings.amazon.priceIncreasePercentage = this.profitPercentage;
    
    this.adminService.updateSystemSettings(this.systemSettings).subscribe({
      next: (res) => {
        this.showSuccessModal('تم تحديث نسبة الربح بنجاح');
      },
      error: (err) => {
        this.showErrorModal('فشل في تحديث نسبة الربح');
      }
    });
  }

  allProducts: any[] = [];

  loadProducts() {
    this.loading = true;
    this.adminService.getAmazonProducts(this.amazonStatusFilter).subscribe({
      next: (res) => {
        this.allProducts = res.data || [];
        this.products = [...this.allProducts];
        this.totalItems = this.products.length;
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        this.error = 'حدث خطأ أثناء تحميل المنتجات';
        this.loading = false;
      }
    });
  }

  applyFilters() {
    let filtered = [...this.allProducts];
    
    // Status filter
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === this.statusFilter);
    }
    
    // Search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.product_name?.toLowerCase().includes(query) ||
        p._id?.toLowerCase().includes(query) ||
        p.amazonSku?.toLowerCase().includes(query) ||
        p.amazonAsin?.toLowerCase().includes(query)
      );
    }
    
    this.products = filtered;
    this.totalItems = this.products.length;
  }

  getPaginatedProducts() {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.products.slice(start, end);
  }

  onPageChange(page: number) {
    this.currentPage = page;
  }

  // Amazon Methods
  publishToAmazon(productId: string) {
    if (this.publishingToAmazon.has(productId)) return;
    
    this.publishingToAmazon.add(productId);
    
    this.adminService.publishProductToAmazon(productId).subscribe({
      next: (res) => {
        this.publishingToAmazon.delete(productId);
        this.showSuccessModal('تم بدء النشر على أمازون');
        this.pollAmazonStatus(productId);
      },
      error: (err) => {
        this.publishingToAmazon.delete(productId);
        this.showErrorModal('فشل في بدء النشر على أمازون');
      }
    });
  }

  syncAmazon(productId: string) {
    if (this.syncingAmazon.has(productId)) return;
    
    this.syncingAmazon.add(productId);
    
    this.adminService.syncProductAmazon(productId).subscribe({
      next: (res) => {
        this.syncingAmazon.delete(productId);
        this.showSuccessModal('تم بدء المزامنة مع أمازون');
        this.pollAmazonStatus(productId);
      },
      error: (err) => {
        this.syncingAmazon.delete(productId);
        this.showErrorModal('فشل في المزامنة مع أمازون');
      }
    });
  }

  retryAmazon(productId: string) {
    if (this.retryingAmazon.has(productId)) return;
    
    this.retryingAmazon.add(productId);
    
    this.adminService.retryProductAmazonPublish(productId).subscribe({
      next: (res) => {
        this.retryingAmazon.delete(productId);
        this.showSuccessModal('تم بدء إعادة المحاولة على أمازون');
        this.pollAmazonStatus(productId);
      },
      error: (err) => {
        this.retryingAmazon.delete(productId);
        this.showErrorModal('فشل في إعادة المحاولة على أمازون');
      }
    });
  }

  pollAmazonStatus(productId: string) {
    const pollInterval = setInterval(() => {
      this.adminService.getProductAmazonStatus(productId).subscribe({
        next: (res) => {
          const product = this.products.find(p => p._id === productId);
          if (product) {
            product.amazonStatus = res.data.status;
            product.amazonSku = res.data.sku;
            product.amazonAsin = res.data.asin;
            product.amazonLastError = res.data.lastError;
            product.amazonRetryCount = res.data.retryCount;

            if (res.data.status === 'published' || res.data.status === 'failed' || res.data.status === 'suppressed') {
              clearInterval(pollInterval);
            }
          }
        },
        error: () => {
          clearInterval(pollInterval);
        }
      });
    }, 5000);

    setTimeout(() => {
      clearInterval(pollInterval);
    }, 15 * 60 * 1000);
  }

  isPublishingToAmazon(productId: string): boolean {
    return this.publishingToAmazon.has(productId);
  }

  isSyncingAmazon(productId: string): boolean {
    return this.syncingAmazon.has(productId);
  }

  isRetryingAmazon(productId: string): boolean {
    return this.retryingAmazon.has(productId);
  }

  getAmazonStatusText(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'معلق',
      'publishing': 'جاري النشر',
      'published': 'منشور',
      'retry': 'إعادة المحاولة',
      'failed': 'فشل',
      'suppressed': 'مكتوم'
    };
    return statusMap[status] || status;
  }

  getAmazonStatusClass(status: string): string {
    const classMap: { [key: string]: string } = {
      'pending': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      'publishing': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'published': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'retry': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      'failed': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      'suppressed': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
    };
    return classMap[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }

  // Edit Methods
  openEditModal(product: any) {
    this.editingProduct = { ...product };
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editingProduct = null;
  }

  saveProduct() {
    if (!this.editingProduct) return;
    
    this.saving = true;
    
    const formData = new FormData();
    formData.append('product_name', this.editingProduct.product_name);
    formData.append('product_quantity', parseInt(this.editingProduct.product_quantity, 10).toString());
    formData.append('product_price', (parseFloat(this.editingProduct.product_price) || 0).toString());
    formData.append('product_description', this.editingProduct.product_description || '');
    
    if (this.editingProduct.weight) formData.append('weight', this.editingProduct.weight.toString());
    if (this.editingProduct.length) formData.append('length', this.editingProduct.length.toString());
    if (this.editingProduct.width) formData.append('width', this.editingProduct.width.toString());
    if (this.editingProduct.height) formData.append('height', this.editingProduct.height.toString());

    this.adminService.updateProduct(this.editingProduct._id, formData).subscribe({
      next: (res) => {
        this.saving = false;
        this.showSuccessModal('تم تحديث المنتج بنجاح');
        this.closeEditModal();
        this.loadProducts();
      },
      error: (err) => {
        this.saving = false;
        this.showErrorModal('فشل في تحديث المنتج');
      }
    });
  }

  deleteProduct(productId: string) {
    this.modalService.openModal({
      title: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف هذا المنتج؟',
      type: 'warning',
      confirmText: 'نعم، احذف',
      cancelText: 'إلغاء',
      showCancel: true,
      action: () => {
        this.adminService.deleteProduct(productId).subscribe({
          next: (res) => {
            this.showSuccessModal('تم حذف المنتج بنجاح');
            this.loadProducts();
          },
          error: (err) => {
            this.showErrorModal('فشل في حذف المنتج');
          }
        });
      }
    });
  }

  // Helper Methods
  getProductImageUrl(product: any): string {
    let imagePath = product.image_path || product.product_image || '';
    const merchantName = product.merchantId?.username || '';

    if (imagePath && imagePath.startsWith('/uploads/books/')) {
      return imagePath;
    }

    const imageId = product.products_id || product.product_image;
    if (!imageId) {
      return '/assets/placeholder-book.jpg';
    }

    let finalPath;
    if (merchantName) {
      const sanitizedMerchantName = merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      finalPath = `merchant_${sanitizedMerchantName}/${imageId}/${imageId}.webp`;
    } else {
      finalPath = `admin__karim_mohamed__/${imageId}/${imageId}.webp`;
    }

    const fullPath = `${this.uploadsBaseUrl}/${finalPath}`.replace('/books/books/', '/books/');
    return fullPath;
  }

  showSuccessModal(message: string): void {
    this.modalService.openModal({
      title: 'نجاح',
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

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }
}
