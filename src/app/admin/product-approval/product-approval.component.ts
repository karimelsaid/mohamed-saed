import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../services/admin.service';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../services/modal.service';
import { environment } from '../../../environments/environment';

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
  publishingToAmazon = new Set<string>(); // Track products being published to Amazon
  retryingAmazon = new Set<string>(); // Track products being retried on Amazon
  syncingAmazon = new Set<string>(); // Track products being synced to Amazon
  showSuccessToast = false;
  successMessage = '';
  approvedCount = 0;

  uploadsBaseUrl = environment.uploadsBaseUrl;

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

  // Amazon Publishing Methods
  publishToAmazon(productId: string) {
    if (this.publishingToAmazon.has(productId)) {
      return;
    }

    this.publishingToAmazon.add(productId);

    this.adminService.publishProductToAmazon(productId).subscribe({
      next: (res) => {
        this.publishingToAmazon.delete(productId);
        this.showSuccessToast = true;
        this.successMessage = 'تم بدء النشر على أمازون';
        
        // Start polling for status
        this.pollAmazonStatus(productId);

        setTimeout(() => {
          this.showSuccessToast = false;
        }, 3000);
      },
      error: (err) => {
        this.publishingToAmazon.delete(productId);
        this.showErrorModal('فشل في بدء النشر على أمازون');
      }
    });
  }

  retryAmazonPublish(productId: string) {
    if (this.retryingAmazon.has(productId)) {
      return;
    }

    this.retryingAmazon.add(productId);

    this.adminService.retryProductAmazonPublish(productId).subscribe({
      next: (res) => {
        this.retryingAmazon.delete(productId);
        this.showSuccessToast = true;
        this.successMessage = 'تم بدء إعادة المحاولة على أمازون';
        
        // Start polling for status
        this.pollAmazonStatus(productId);

        setTimeout(() => {
          this.showSuccessToast = false;
        }, 3000);
      },
      error: (err) => {
        this.retryingAmazon.delete(productId);
        this.showErrorModal('فشل في إعادة المحاولة على أمازون');
      }
    });
  }

  syncAmazon(productId: string) {
    if (this.syncingAmazon.has(productId)) {
      return;
    }

    this.syncingAmazon.add(productId);

    this.adminService.syncProductAmazon(productId).subscribe({
      next: (res) => {
        this.syncingAmazon.delete(productId);
        this.showSuccessToast = true;
        this.successMessage = 'تم بدء المزامنة مع أمازون';
        
        // Start polling for status
        this.pollAmazonStatus(productId);

        setTimeout(() => {
          this.showSuccessToast = false;
        }, 3000);
      },
      error: (err) => {
        this.syncingAmazon.delete(productId);
        this.showErrorModal('فشل في المزامنة مع أمازون');
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

            // Stop polling if status is final
            if (res.data.status === 'published' || res.data.status === 'failed' || res.data.status === 'suppressed') {
              clearInterval(pollInterval);
            }
          }
        },
        error: () => {
          clearInterval(pollInterval);
        }
      });
    }, 5000); // Poll every 5 seconds

    // Stop polling after 15 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 15 * 60 * 1000);
  }

  isPublishingToAmazon(productId: string): boolean {
    return this.publishingToAmazon.has(productId);
  }

  isRetryingAmazon(productId: string): boolean {
    return this.retryingAmazon.has(productId);
  }

  isSyncingAmazon(productId: string): boolean {
    return this.syncingAmazon.has(productId);
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

  getAmazonPublishButtonText(productId: string, status: string): string {
    if (this.isPublishingToAmazon(productId)) {
      return 'جاري النشر...';
    }
    
    if (status === 'publishing') {
      return 'جاري النشر على أمازون...';
    }
    
    if (status === 'published') {
      return 'منشور على أمازون ✓';
    }
    
    if (status === 'failed') {
      return 'فشل النشر';
    }
    
    if (status === 'suppressed') {
      return 'مكتوم';
    }
    
    return 'نشر على أمازون';
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

  getProductImageUrl(product: any): string {
    // This logic is now consistent with other working components like search-results.
    let imagePath = product.image_path || product.product_image || '';
    const merchantName = product.merchantId?.username || '';

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
}
