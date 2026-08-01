import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface AmazonProduct {
  _id: string;
  products_id: string;
  product_name: string;
  product_price: number;
  amazonPrice?: number;
  product_quantity: number;
  amazonStatus: string;
  amazonSku?: string;
  amazonAsin?: string;
  amazonLastError?: string;
  amazonSyncedAt?: string;
  amazonRetryCount?: number;
  product_image?: string;
  image_path?: string;
}

interface EditingProduct {
  _id: string;
  amazonPrice?: number;
  product_quantity?: number;
}

@Component({
  selector: 'app-amazon-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './amazon-catalog.component.html',
  styleUrls: ['./amazon-catalog.component.css']
})
export class AmazonCatalogComponent implements OnInit, OnDestroy {
  products: AmazonProduct[] = [];
  filteredProducts: AmazonProduct[] = [];
  
  loading = false;
  searchQuery = '';
  selectedStatus = 'all';
  
  editingProductId: string | null = null;
  editingData: EditingProduct = { _id: '' };
  
  private destroy$ = new Subject<void>();

  statusOptions = [
    { value: 'all', label: 'جميع المنتجات' },
    { value: 'pending', label: 'معلق' },
    { value: 'publishing', label: 'قيد النشر' },
    { value: 'published', label: 'منشور' },
    { value: 'incomplete', label: 'غير مكتمل' },
    { value: 'failed', label: 'فاشل' },
    { value: 'retry', label: 'إعادة محاولة' },
    { value: 'suppressed', label: 'مكبوت' }
  ];

  constructor(
    private adminService: AdminService
  ) {}

  ngOnInit(): void {
    this.loadAmazonProducts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAmazonProducts(): void {
    this.loading = true;
    this.adminService.getAmazonProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.products = response.data || [];
          this.applyFilters();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading Amazon products:', error);
          this.loading = false;
        }
      });
  }

  applyFilters(): void {
    this.filteredProducts = this.products.filter(product => {
      let matchesStatus = this.selectedStatus === 'all';
      
      if (!matchesStatus) {
        if (this.selectedStatus === 'incomplete') {
          // Accept both 'incomplete' and 'pending_asin' for incomplete filter
          matchesStatus = product.amazonStatus === 'incomplete' || product.amazonStatus === 'pending_asin';
        } else {
          matchesStatus = product.amazonStatus === this.selectedStatus;
        }
      }
      
      const matchesSearch = !this.searchQuery || 
        product.product_name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        product.amazonSku?.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        product.amazonAsin?.toLowerCase().includes(this.searchQuery.toLowerCase());
      
      return matchesStatus && matchesSearch;
    });
  }

  onStatusChange(): void {
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  getStatusBadgeClass(status: string): string {
    const statusClasses: { [key: string]: string } = {
      'pending': 'badge-warning',
      'publishing': 'badge-info',
      'published': 'badge-success',
      'incomplete': 'badge-warning',
      'failed': 'badge-danger',
      'retry': 'badge-warning',
      'suppressed': 'badge-secondary'
    };
    return statusClasses[status] || 'badge-secondary';
  }

  getStatusLabel(status: string): string {
    const statusLabels: { [key: string]: string } = {
      'pending': 'معلق',
      'publishing': 'قيد النشر',
      'published': 'منشور',
      'incomplete': 'غير مكتمل',
      'failed': 'فاشل',
      'retry': 'إعادة محاولة',
      'suppressed': 'مكبوت'
    };
    return statusLabels[status] || status;
  }

  getProductImage(product: AmazonProduct): string {
    return product.product_image || product.image_path || '/assets/placeholder.png';
  }

  editProduct(product: AmazonProduct): void {
    this.editingProductId = product._id;
    this.editingData = {
      _id: product._id,
      amazonPrice: product.amazonPrice || product.product_price,
      product_quantity: product.product_quantity
    };
  }

  cancelEdit(): void {
    this.editingProductId = null;
    this.editingData = { _id: '' };
  }

  saveProductChanges(): void {
    if (!this.editingProductId) return;

    this.adminService.updateAmazonProductData(this.editingProductId, this.editingData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.cancelEdit();
          // Update the product locally to preserve scroll position
          const product = this.products.find(p => p._id === this.editingProductId);
          if (product) {
            if (this.editingData.amazonPrice) product.amazonPrice = this.editingData.amazonPrice;
            if (this.editingData.product_quantity !== undefined) product.product_quantity = this.editingData.product_quantity;
            this.applyFilters();
          }
        },
        error: (error) => {
          console.error('Error updating product:', error);
        }
      });
  }

  republishProduct(product: AmazonProduct): void {
    this.adminService.republishAmazonProduct(product._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          // Update status locally to preserve scroll position
          const productIndex = this.products.findIndex(p => p._id === product._id);
          if (productIndex !== -1) {
            this.products[productIndex].amazonStatus = 'queued';
            this.applyFilters();
          }
        },
        error: (error) => {
          console.error('Error republishing product:', error);
        }
      });
  }

  getAmazonUrl(asin: string): string {
    if (!asin) return '';
    return `https://www.amazon.eg/dp/${asin}`;
  }

  openAmazonListing(asin: string): void {
    if (asin) {
      window.open(this.getAmazonUrl(asin), '_blank');
    }
  }

  syncAllProducts(): void {
    this.loading = true;
    this.adminService.syncAllAmazonProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          alert('جاري بدء المزامنة الشاملة مع أمازون في الخلفية... ستتحدث الحالات والتأكيدات تلقائياً خلال ثوانٍ.');
          setTimeout(() => this.loadAmazonProducts(), 4000);
          setTimeout(() => this.loadAmazonProducts(), 12000);
          setTimeout(() => this.loadAmazonProducts(), 25000);
        },
        error: (error) => {
          this.loading = false;
          console.error('Error initiating bulk sync:', error);
          alert('فشل في بدء المزامنة الشاملة مع أمازون');
        }
      });
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      console.log('Text copied to clipboard');
    });
  }

  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'pending': 'clock',
      'publishing': 'spinner',
      'published': 'check-circle',
      'incomplete': 'exclamation-triangle',
      'failed': 'times-circle',
      'retry': 'redo',
      'suppressed': 'ban'
    };
    return icons[status] || 'question-circle';
  }
}
