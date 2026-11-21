import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { environment } from '../../../environments/environment';
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
  amazonSyncedAt?: string;
  amazonLastError?: string;
  barcode?: string;
  product_image?: string;
  image_path?: string;
  product_category?: string;
  copyType?: string;
  publisher?: string;
  author?: string;
  createdAt?: string;
  views?: number;
  selected?: boolean;
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

  // Status Filter & Statistics
  selectedStatus: 'all' | 'published' | 'deleted' | 'failed' | 'pending' | 'suppressed' = 'all';
  catalogStats = { total: 0, published: 0, deleted: 0, failed: 0, pending: 0, suppressed: 0 };

  // Pagination
  currentPage = 1;
  pageSize = 20;
  pageSizeOptions = [10, 20, 50, 100];

  // Selection
  allSelected = false;

  // Bulk Price Adjustment
  showPriceModal = false;
  adjustmentType: 'fixed_increase' | 'fixed_decrease' | 'percent_increase' | 'percent_decrease' = 'fixed_increase';
  adjustmentValue: number = 0;
  priceUpdateLoading = false;
  priceUpdateResult: { count: number; data: any[] } | null = null;

  // Bulk Quantity Adjustment
  showQuantityModal = false;
  qtyAdjustmentType: 'set_fixed' | 'fixed_increase' | 'fixed_decrease' = 'set_fixed';
  qtyAdjustmentValue: number = 1;
  qtyUpdateLoading = false;
  qtyUpdateResult: { count: number; data: any[] } | null = null;

  // Sync deleted listings from Amazon
  syncingDeleted = false;

  // Scan & Fix Suppressed
  scanningSuppressed = false;
  showFixImageModal = false;
  fixingImageProduct: AmazonProduct | null = null;
  fixImageUrl: string = '';
  fixImageTitle: string = '';
  fixImageLoading = false;

  // Single product editing (Price & Quantity)
  editingProductId: string | null = null;
  editingPrice: number = 0;
  editingQuantityId: string | null = null;
  editingQuantity: number = 0;

  // Sorting & Filtering
  sortBy: 'newest' | 'oldest' | 'price_desc' | 'price_asc' | 'qty_desc' | 'qty_asc' | 'popular' = 'newest';
  selectedCategory: string = 'all';
  selectedCopyType: string = 'all'; // 'all', 'أصلي', 'هاي كوبي'
  selectedStockStatus: 'all' | 'in_stock' | 'out_of_stock' = 'all';

  availableCategories: string[] = [];
  availableCopyTypes: string[] = [];

  // Toast
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  showToast = false;

  private destroy$ = new Subject<void>();

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProducts(): void {
    this.loading = true;
    this.adminService.getAmazonCatalog(this.selectedStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (catalogRes: any) => {
          this.products = (catalogRes.data || []).map((p: any) => ({ ...p, selected: false }));
          if (catalogRes.stats) {
            this.catalogStats = catalogRes.stats;
          } else {
            // Calculate stats locally if backend didn't provide them
            this.catalogStats = {
              total: this.products.length,
              published: this.products.filter(p => p.amazonStatus === 'published').length,
              deleted: this.products.filter(p => p.amazonStatus === 'deleted').length,
              failed: this.products.filter(p => ['failed', 'incomplete'].includes(p.amazonStatus)).length,
              pending: this.products.filter(p => ['pending', 'pending_asin', 'publishing', 'queued', 'retry'].includes(p.amazonStatus)).length,
              suppressed: this.products.filter(p => p.amazonStatus === 'search_suppressed').length
            };
          }
          this.updateAvailableFilters();
          this.applyFilters();
          this.loading = false;
        },
        error: (err) => {
          console.error('Catalog API error, falling back to products endpoint:', err);
          // Fallback to regular products
          this.adminService.getAmazonProducts(this.selectedStatus === 'all' ? undefined : this.selectedStatus)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (res: any) => {
                this.products = (res.data || [])
                  .map((p: any) => ({ ...p, selected: false }));
                // Calculate stats locally from loaded products
                if (!res.stats) {
                  this.catalogStats = {
                    total: this.products.length,
                    published: this.products.filter(p => p.amazonStatus === 'published').length,
                    deleted: this.products.filter(p => p.amazonStatus === 'deleted').length,
                    failed: this.products.filter(p => ['failed', 'incomplete'].includes(p.amazonStatus)).length,
                    pending: this.products.filter(p => ['pending', 'pending_asin', 'publishing', 'queued', 'retry'].includes(p.amazonStatus)).length,
                    suppressed: this.products.filter(p => p.amazonStatus === 'search_suppressed').length
                  };
                } else {
                  this.catalogStats = res.stats;
                }
                this.updateAvailableFilters();
                this.applyFilters();
                this.loading = false;
              },
              error: (err2) => {
                console.error('Error loading products:', err2);
                this.loading = false;
              }
            });
        }
      });
  }

  setStatusFilter(status: 'all' | 'published' | 'deleted' | 'failed' | 'pending' | 'suppressed'): void {
    if (this.selectedStatus === status) return;
    this.selectedStatus = status;
    this.currentPage = 1;
    this.loadProducts();
  }

  updateAvailableFilters(): void {
    const cats = new Set<string>();
    const types = new Set<string>();

    for (const p of this.products) {
      if (p.product_category && p.product_category.trim()) {
        cats.add(p.product_category.trim());
      }
      if (p.copyType && p.copyType.trim()) {
        types.add(p.copyType.trim());
      }
    }

    this.availableCategories = Array.from(cats).sort((a, b) => a.localeCompare(b, 'ar'));
    this.availableCopyTypes = Array.from(types).sort((a, b) => a.localeCompare(b, 'ar'));
  }

  applyFilters(): void {
    const q = (this.searchQuery || '').toLowerCase().trim();

    let result = this.products.filter(product => {
      // 1. Text Search across multiple fields
      if (q) {
        const matchesName = product.product_name?.toLowerCase().includes(q);
        const matchesSku = product.amazonSku?.toLowerCase().includes(q);
        const matchesAsin = product.amazonAsin?.toLowerCase().includes(q);
        const matchesBarcode = product.barcode?.toLowerCase().includes(q);
        const matchesPublisher = product.publisher?.toLowerCase().includes(q);
        const matchesAuthor = product.author?.toLowerCase().includes(q);
        const matchesCategory = product.product_category?.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesAsin && !matchesBarcode && !matchesPublisher && !matchesAuthor && !matchesCategory) {
          return false;
        }
      }

      // 2. Category Filter
      if (this.selectedCategory !== 'all') {
        if (product.product_category !== this.selectedCategory) {
          return false;
        }
      }

      // 3. Copy Type Filter (أصلي / هاي كوبي)
      if (this.selectedCopyType !== 'all') {
        if (product.copyType !== this.selectedCopyType) {
          return false;
        }
      }

      // 4. Stock Filter
      if (this.selectedStockStatus === 'in_stock' && (product.product_quantity || 0) <= 0) {
        return false;
      }
      if (this.selectedStockStatus === 'out_of_stock' && (product.product_quantity || 0) > 0) {
        return false;
      }

      return true;
    });

    // 5. Sorting
    result.sort((a, b) => {
      const priceA = a.amazonPrice || a.product_price || 0;
      const priceB = b.amazonPrice || b.product_price || 0;
      const qtyA = a.product_quantity || 0;
      const qtyB = b.product_quantity || 0;
      const viewsA = a.views || 0;
      const viewsB = b.views || 0;
      const dateA = new Date(a.amazonSyncedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.amazonSyncedAt || b.createdAt || 0).getTime();

      switch (this.sortBy) {
        case 'newest': return dateB - dateA;
        case 'oldest': return dateA - dateB;
        case 'price_desc': return priceB - priceA;
        case 'price_asc': return priceA - priceB;
        case 'qty_desc': return qtyB - qtyA;
        case 'qty_asc': return qtyA - qtyB;
        case 'popular': return viewsB - viewsA;
        default: return dateB - dateA;
      }
    });

    this.filteredProducts = result;
    this.currentPage = 1;
    this.updateSelectAll();
  }

  resetAllFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'all';
    this.selectedCopyType = 'all';
    this.selectedStockStatus = 'all';
    this.sortBy = 'newest';
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilters();
  }

  // ─── Pagination Getters & Methods ────────────────────────────
  get totalPages(): number {
    return Math.ceil(this.filteredProducts.length / this.pageSize) || 1;
  }

  get paginatedProducts(): AmazonProduct[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredProducts.slice(start, start + this.pageSize);
  }

  get startIndex(): number {
    return this.filteredProducts.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get endIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredProducts.length);
  }

  get averagePrice(): number {
    if (!this.products.length) return 0;
    const sum = this.products.reduce((acc, p) => acc + (p.amazonPrice || p.product_price || 0), 0);
    return sum / this.products.length;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updateSelectAll();
    }
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.updateSelectAll();
  }

  getPageNumbers(): (number | string)[] {
    const total = this.totalPages;
    const current = this.currentPage;
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    pages.push(1);
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  }

  // ─── Selection ───────────────────────────────────────────────
  toggleSelectAll(): void {
    this.allSelected = !this.allSelected;
    this.paginatedProducts.forEach(p => p.selected = this.allSelected);
  }

  selectAllMatching(): void {
    this.filteredProducts.forEach(p => p.selected = true);
    this.allSelected = true;
    this.showToastMessage(`تم تحديد جميع الـ ${this.filteredProducts.length} منتج`, 'success');
  }

  clearSelection(): void {
    this.products.forEach(p => p.selected = false);
    this.allSelected = false;
  }

  updateSelectAll(): void {
    this.allSelected = this.paginatedProducts.length > 0 && this.paginatedProducts.every(p => p.selected);
  }

  get selectedCount(): number {
    return this.products.filter(p => p.selected).length;
  }

  get selectedProducts(): AmazonProduct[] {
    return this.products.filter(p => p.selected);
  }

  // ─── Single Product Price Edit ───────────────────────────────
  startEditPrice(product: AmazonProduct): void {
    this.editingProductId = product._id;
    this.editingPrice = product.amazonPrice || product.product_price;
  }

  cancelEditPrice(): void {
    this.editingProductId = null;
    this.editingPrice = 0;
  }

  saveProductPrice(product: AmazonProduct): void {
    if (this.editingPrice <= 0) return;

    this.adminService.updateAmazonProductData(product._id, { amazonPrice: this.editingPrice })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          product.amazonPrice = this.editingPrice;
          this.cancelEditPrice();
          this.showToastMessage('تم تحديث السعر على أمازون بنجاح ✅', 'success');
        },
        error: (err) => {
          console.error('Error updating price:', err);
          this.showToastMessage('فشل تحديث السعر', 'error');
        }
      });
  }

  // ─── Single Product Quantity Edit ───────────────────────────
  startEditQuantity(product: AmazonProduct): void {
    this.editingQuantityId = product._id;
    this.editingQuantity = product.product_quantity ?? 0;
  }

  cancelEditQuantity(): void {
    this.editingQuantityId = null;
    this.editingQuantity = 0;
  }

  saveProductQuantity(product: AmazonProduct): void {
    if (this.editingQuantity < 0) return;

    this.adminService.updateAmazonProductData(product._id, { product_quantity: this.editingQuantity })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          product.product_quantity = this.editingQuantity;
          this.cancelEditQuantity();
          this.showToastMessage('تم تحديث الكمية على أمازون بنجاح ✅', 'success');
        },
        error: (err) => {
          console.error('Error updating quantity:', err);
          this.showToastMessage('فشل تحديث الكمية', 'error');
        }
      });
  }

  // ─── Bulk Price Modal ────────────────────────────────────────
  openPriceModal(): void {
    if (this.selectedCount === 0) return;
    this.showPriceModal = true;
    this.adjustmentType = 'fixed_increase';
    this.adjustmentValue = 0;
    this.priceUpdateResult = null;
  }

  closePriceModal(): void {
    this.showPriceModal = false;
    this.priceUpdateResult = null;
  }

  applyBulkPrice(): void {
    if (this.adjustmentValue <= 0 || this.selectedCount === 0) return;

    this.priceUpdateLoading = true;
    const ids = this.selectedProducts.map(p => p._id);

    this.adminService.bulkUpdateAmazonPrice(ids, this.adjustmentType, this.adjustmentValue)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.priceUpdateLoading = false;
          this.priceUpdateResult = { count: response.count, data: response.data || [] };

          // Update local products with new prices
          for (const updated of (response.data || [])) {
            const p = this.products.find(pr => pr._id === updated._id);
            if (p) {
              p.amazonPrice = updated.newPrice;
              p.selected = false;
            }
          }
          this.allSelected = false;

          this.showToastMessage(`تم تحديث أسعار ${response.count} منتج بنجاح`, 'success');
        },
        error: (error) => {
          this.priceUpdateLoading = false;
          console.error('Error bulk updating prices:', error);
          this.showToastMessage('فشل تحديث الأسعار', 'error');
        }
      });
  }

  getAdjustmentLabel(): string {
    switch (this.adjustmentType) {
      case 'fixed_increase': return 'زيادة بالقيمة (ج.م)';
      case 'fixed_decrease': return 'نقصان بالقيمة (ج.م)';
      case 'percent_increase': return 'زيادة بالنسبة المئوية (%)';
      case 'percent_decrease': return 'نقصان بالنسبة المئوية (%)';
      default: return '';
    }
  }

  previewPrice(product: AmazonProduct): number {
    const current = product.amazonPrice || product.product_price || 0;
    let newPrice = current;
    switch (this.adjustmentType) {
      case 'fixed_increase': newPrice = current + this.adjustmentValue; break;
      case 'fixed_decrease': newPrice = current - this.adjustmentValue; break;
      case 'percent_increase': newPrice = current * (1 + this.adjustmentValue / 100); break;
      case 'percent_decrease': newPrice = current * (1 - this.adjustmentValue / 100); break;
    }
    return Math.max(0.01, Math.round(newPrice * 100) / 100);
  }

  // ─── Bulk Quantity Modal ─────────────────────────────────────
  openQuantityModal(): void {
    if (this.selectedCount === 0) return;
    this.showQuantityModal = true;
    this.qtyAdjustmentType = 'set_fixed';
    this.qtyAdjustmentValue = 1;
    this.qtyUpdateResult = null;
  }

  closeQuantityModal(): void {
    this.showQuantityModal = false;
    this.qtyUpdateResult = null;
  }

  applyBulkQuantity(): void {
    if (this.selectedCount === 0 || this.qtyAdjustmentValue < 0) return;

    this.qtyUpdateLoading = true;
    const ids = this.selectedProducts.map(p => p._id);

    this.adminService.bulkUpdateAmazonQuantity(ids, this.qtyAdjustmentType, this.qtyAdjustmentValue)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.qtyUpdateLoading = false;
          this.qtyUpdateResult = { count: response.count, data: response.data || [] };

          // Update local products with new quantities
          for (const updated of (response.data || [])) {
            const p = this.products.find(pr => pr._id === updated._id);
            if (p) {
              p.product_quantity = updated.newQuantity;
              p.selected = false;
            }
          }
          this.allSelected = false;

          this.showToastMessage(`تم تحديث كميات ${response.count} منتج ومزامنتها مع أمازون بنجاح ✅`, 'success');
        },
        error: (error) => {
          this.qtyUpdateLoading = false;
          console.error('Error bulk updating quantities:', error);
          this.showToastMessage('فشل تحديث الكميات', 'error');
        }
      });
  }

  getQtyAdjustmentLabel(): string {
    switch (this.qtyAdjustmentType) {
      case 'set_fixed': return 'تعيين كمية موحدة';
      case 'fixed_increase': return 'زيادة بالعدد (+)';
      case 'fixed_decrease': return 'إنقاص بالعدد (-)';
      default: return '';
    }
  }

  previewQuantity(product: AmazonProduct): number {
    const current = product.product_quantity ?? 0;
    let newQty = current;
    switch (this.qtyAdjustmentType) {
      case 'set_fixed': newQty = this.qtyAdjustmentValue; break;
      case 'fixed_increase': newQty = current + this.qtyAdjustmentValue; break;
      case 'fixed_decrease': newQty = Math.max(0, current - this.qtyAdjustmentValue); break;
    }
    return Math.max(0, Math.floor(newQty));
  }

  // ─── Delete / Sync Deleted Listings ─────────────────────────
  syncDeletedListings(): void {
    if (this.syncingDeleted) return;
    if (!confirm('هل تريد فحص المنتجات ومطابقتها مع حسابك في أمازون مصر لحذف أي منتج غير مفعل أو محذوف؟')) {
      return;
    }

    this.syncingDeleted = true;
    this.adminService.syncDeletedAmazonListings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.syncingDeleted = false;
          const count = res.deletedCount || 0;
          const amazonDel = res.deletedFromAmazonCount || 0;
          if (count > 0 || amazonDel > 0) {
            let msg = `تمت المطابقة: تمت إزالة ${count} منتج محلياً`;
            if (amazonDel > 0) {
              msg += ` وحذف ${amazonDel} منتج غير مفعل من أمازون`;
            }
            this.showToastMessage(msg, 'success');
            this.loadProducts();
          } else {
            this.showToastMessage('جميع المنتجات المعروضة نشطة ومتطابقة 100% مع أمازون!', 'success');
          }
        },
        error: (err: any) => {
          this.syncingDeleted = false;
          console.error('Error syncing deleted listings:', err);
          this.showToastMessage('فشل فحص المنتجات ومطابقتها مع أمازون', 'error');
        }
      });
  }

  removeProductFromCatalog(product: AmazonProduct): void {
    if (!confirm(`هل أنت متأكد من إزالة "${product.product_name}" من المخزون المعروض لأمازون؟`)) {
      return;
    }

    this.adminService.removeAmazonProductFromCatalog(product._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.products = this.products.filter(p => p._id !== product._id);
          this.applyFilters();
          this.showToastMessage('تم حذف المنتج من قائمة المعروضات بنجاح', 'success');
        },
        error: (err: any) => {
          console.error('Error removing product:', err);
          this.showToastMessage('فشل حذف المنتج من الكتالوج', 'error');
        }
      });
  }

  // ─── Reactivate & Repair Features ─────────────────────────
  reactivatingId: string | null = null;
  showRepairModal = false;
  repairingProduct: AmazonProduct | null = null;
  repairForm = {
    product_name: '',
    amazonPrice: 0,
    product_quantity: 0,
    barcode: '',
    amazonAsin: '',
    product_image: ''
  };
  repairLoading = false;

  reactivateProduct(product: AmazonProduct): void {
    if (this.reactivatingId) return;
    this.reactivatingId = product._id;

    this.adminService.republishAmazonProduct(product._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.reactivatingId = null;
          product.amazonStatus = 'queued';
          this.showToastMessage('تم بدء إعادة تفعيل ونشر المنتج على أمازون بنجاح 🚀', 'success');
        },
        error: (err: any) => {
          this.reactivatingId = null;
          console.error('Error reactivating product:', err);
          this.showToastMessage(err.message || 'فشل إعادة تفعيل المنتج', 'error');
        }
      });
  }

  openRepairModal(product: AmazonProduct): void {
    this.repairingProduct = product;
    this.repairForm = {
      product_name: product.product_name || '',
      amazonPrice: product.amazonPrice || product.product_price || 0,
      product_quantity: product.product_quantity || 1,
      barcode: product.barcode || '',
      amazonAsin: product.amazonAsin || '',
      product_image: product.product_image || product.image_path || ''
    };
    this.showRepairModal = true;
  }

  closeRepairModal(): void {
    this.showRepairModal = false;
    this.repairingProduct = null;
  }

  saveAndReactivate(): void {
    if (!this.repairingProduct) return;
    this.repairLoading = true;

    this.adminService.repairAmazonProduct(this.repairingProduct._id, this.repairForm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.repairLoading = false;
          if (this.repairingProduct) {
            this.repairingProduct.product_name = this.repairForm.product_name;
            this.repairingProduct.amazonPrice = this.repairForm.amazonPrice;
            this.repairingProduct.product_quantity = this.repairForm.product_quantity;
            this.repairingProduct.barcode = this.repairForm.barcode;
            this.repairingProduct.amazonAsin = this.repairForm.amazonAsin;
            this.repairingProduct.product_image = this.repairForm.product_image;
            this.repairingProduct.amazonStatus = 'queued';
            this.repairingProduct.amazonLastError = undefined;
          }
          this.closeRepairModal();
          this.showToastMessage('تم حفظ بيانات الإصلاح وجاري إعادة النشر والتفعيل 🚀', 'success');
        },
        error: (err: any) => {
          this.repairLoading = false;
          console.error('Error repairing product:', err);
          this.showToastMessage(err.message || 'فشل حفظ وتفعيل المنتج', 'error');
        }
      });
  }

  // ─── Scan & Fix Suppressed Listings ──────────────────────────
  scanSuppressed(): void {
    if (this.scanningSuppressed) return;
    this.scanningSuppressed = true;

    this.adminService.scanSuppressedAmazonListings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.scanningSuppressed = false;
          const count = res.suppressedCount || 0;
          if (count > 0) {
            this.showToastMessage(`تم العثور على ${count} منتج محجوب من البحث في أمازون 🔍`, 'success');
            this.loadProducts();
          } else {
            this.showToastMessage('لا توجد منتجات محجوبة من البحث — جميع المنتجات نشطة ✅', 'success');
          }
        },
        error: (err: any) => {
          this.scanningSuppressed = false;
          console.error('Error scanning suppressed listings:', err);
          this.showToastMessage('فشل فحص المنتجات المحجوبة من البحث', 'error');
        }
      });
  }

  openFixImageModal(product: AmazonProduct): void {
    this.fixingImageProduct = product;
    this.fixImageUrl = product.product_image || product.image_path || '';
    this.fixImageTitle = product.product_name || '';
    this.showFixImageModal = true;
  }

  closeFixImageModal(): void {
    this.showFixImageModal = false;
    this.fixingImageProduct = null;
    this.fixImageUrl = '';
    this.fixImageTitle = '';
  }

  submitFixImage(): void {
    if (!this.fixingImageProduct || !this.fixImageUrl.trim()) return;
    this.fixImageLoading = true;

    this.adminService.fixSuppressedImage(this.fixingImageProduct._id, this.fixImageUrl.trim(), this.fixImageTitle.trim() || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.fixImageLoading = false;
          if (this.fixingImageProduct) {
            this.fixingImageProduct.amazonStatus = 'published';
            this.fixingImageProduct.product_image = this.fixImageUrl;
            this.fixingImageProduct.amazonLastError = undefined;
          }
          this.closeFixImageModal();
          this.showToastMessage('تم إرسال الصورة الجديدة لأمازون بنجاح — سيتم رفع الحجب خلال دقائق 🖼️✅', 'success');
        },
        error: (err: any) => {
          this.fixImageLoading = false;
          console.error('Error fixing suppressed image:', err);
          this.showToastMessage(err.message || 'فشل إرسال الصورة الجديدة لأمازون', 'error');
        }
      });
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'published': return 'منشور / نشط';
      case 'deleted': return 'محذوف / غير مفعل';
      case 'failed': return 'فشل النشر';
      case 'suppressed': return 'معلق / محظور';
      case 'search_suppressed': return 'تم منع البحث';
      case 'incomplete': return 'بيانات ناقصة';
      case 'pending':
      case 'publishing':
      case 'queued':
      case 'retry':
        return 'قيد المزامنة';
      default: return status || 'غير محدد';
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'published':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
      case 'deleted':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800';
      case 'failed':
      case 'suppressed':
      case 'incomplete':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
      case 'search_suppressed':
        return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────
  getProductImage(product: AmazonProduct): string {
    const path = (product.image_path || '').trim();
    const img = (product.product_image || '').trim();

    // 1. Full HTTP/HTTPS URLs (Asfar, Amazon CDN, Cloudinary, etc.)
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    if (img.startsWith('http://') || img.startsWith('https://')) {
      return img;
    }

    // 2. Relative uploads paths (/uploads/...)
    const host = environment.production ? 'https://knoozbook.com' : 'http://localhost:3000';
    if (path.startsWith('/uploads/')) {
      return `${host}${path}`;
    }
    if (img.startsWith('/uploads/')) {
      return `${host}${img}`;
    }

    // 3. ID or filename
    const id = product.products_id || product._id;
    if (img && (img.includes('.webp') || img.includes('.jpg') || img.includes('.jpeg') || img.includes('.png'))) {
      return `${environment.uploadsBaseUrl}/merchant_karim_admin/${id}/${img}`;
    }
    if (id) {
      return `${environment.uploadsBaseUrl}/merchant_karim_admin/${id}/${id}.webp`;
    }

    return 'assets/image/book-placeholder.jpg';
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (!target || !target.src) return;

    // If localhost:3000 returned 404, fallback to production knoozbook.com CDN
    if (target.src.includes('localhost:3000') && !target.src.includes('prod_fallback')) {
      target.src = target.src.replace('http://localhost:3000', 'https://knoozbook.com') + (target.src.includes('?') ? '&' : '?') + 'prod_fallback=1';
      return;
    }

    // If merchant_karim_admin failed, try admin__karim_mohamed__
    if (target.src.includes('merchant_karim_admin') && !target.src.includes('admin_fallback')) {
      target.src = target.src.replace('merchant_karim_admin', 'admin__karim_mohamed__') + (target.src.includes('?') ? '&' : '?') + 'admin_fallback=1';
      return;
    }

    if (!target.src.includes('book-placeholder.jpg')) {
      target.src = 'assets/image/book-placeholder.jpg';
    }
  }

  getAmazonUrl(asin: string): string {
    return asin ? `https://www.amazon.eg/dp/${asin}` : '';
  }

  openAmazonListing(asin: string): void {
    if (asin) window.open(this.getAmazonUrl(asin), '_blank');
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.showToastMessage('تم النسخ إلى الحافظة', 'success');
    });
  }

  showToastMessage(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    setTimeout(() => this.showToast = false, 3000);
  }
}
