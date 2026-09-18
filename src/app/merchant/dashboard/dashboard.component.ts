import { Component, OnInit } from '@angular/core';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductStateService } from '../../services/product-state.service';
import { Subscription } from 'rxjs';
import { ModalDialogComponent } from '../../shared/modal-dialog/modal-dialog.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AnalyticsService } from '../../services/analytics.service';
import { Chart, registerables } from 'chart.js';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPhone, faFileInvoice, faTruck, faClock, faStore, faEnvelope, faCheckCircle, faHourglassHalf, faPen, faCamera } from '@fortawesome/free-solid-svg-icons';
import { DataService } from '../../services/data.service';
Chart.register(...registerables);

interface ShippingRate {
  governorate: string;
  rate: number;
}

interface RegionRate {
  region: string;
  rate: number;
}

@Component({
  selector: 'app-merchant-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ModalDialogComponent, FontAwesomeModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class MerchantDashboardComponent implements OnInit {
  merchant: any = {};
  products: any[] = [];
  orders: any[] = [];
  updateRequests: any[] = [];
  
  // Icons
  faPhone = faPhone;
  faFileInvoice = faFileInvoice;
  faTruck = faTruck;
  faClock = faClock;
  faStore = faStore;
  faEnvelope = faEnvelope;
  faCheckCircle = faCheckCircle;
  faHourglassHalf = faHourglassHalf;
  faPen = faPen;
  faCamera = faCamera;
  loadingMerchant = false;
  loadingProducts = false;
  loadingOrders = false;
  loadingUpdateRequests = false;
  loadingAnalytics = false;
  loadingShippingRates = false;
  allowPublisherUpload = true; // Default to true

  regionCosts: RegionRate[] = [];

  regionMapping: { [key: string]: string[] } = {
    'القاهرة والجيزة والقليوبية': ['القاهرة', 'الجيزة', 'القليوبية'],
    'الإسكندرية والدلتا': ['الأسكندرية', 'الدقهلية', 'البحيرة', 'الغربية', 'المنوفية', 'الشرقية', 'كفر الشيخ', 'دمياط'],
    'مدن القناة': ['الإسماعلية', 'السويس', 'بورسعيد'],
    'شمال الصعيد': ['الفيوم', 'بني سويف', 'المنيا'],
    'جنوب الصعيد': ['اسيوط', 'سوهاج', 'قنا', 'الأقصر', 'اسوان'],
    'المناطق النائية': ['البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء']
  };

  regionKeys: string[] = Object.keys(this.regionMapping);

  activeTab: 'overview' | 'analytics' | 'products' | 'orders' | 'settings' | 'shippingSettings' = 'overview';
  analyticsData: any = null;
  charts: any = {};

  private productsSubscription!: Subscription;

  // Modal properties for component's modal system
  modalOpen: boolean = false;
  modalTitle: string = '';
  modalMessage: string = '';
  modalType: 'info' | 'warning' | 'error' | 'success' = 'info';
  modalConfirmText: string = 'تأكيد';
  modalCancelText: string = 'إلغاء';
  modalShowCancel: boolean = true;
  pendingAction: (() => void) | null = null;

  // Loading modal properties
  loadingModal = {
    isOpen: false,
    message: 'جاري تحديث الطلبات...'
  };

  // Multi-select properties
  selectedProducts: Set<string> = new Set();

  // View and pagination properties
  viewMode: 'grid' | 'list' = 'grid';
  currentPage = 1;
  itemsPerPage = 20;

  // Edit mode properties
  isEditMode = false;
  editForm: any = {
    name: '',
    phone: '',
    taxNumber: '',
    bio: '',
    logoFile: null,
    coverPhotoFile: null,
    preparationTime: 1,
    merchantShippingMethod: 'knoozbook'
  };
  logoPreview: string | null = null;
  coverPreview: string | null = null;
  updatingProfile = false;
  updateMessage = '';
  updateMessageColor = 'green';

  // Validation properties
  phoneValid: boolean = false;
  phoneTouched: boolean = false;

  // Order Details Modal
  selectedOrder: any = null;
  isOrderModalOpen: boolean = false;

  // Initialize edit form with current merchant data
  private initializeEditForm() {
    this.editForm.name = this.merchant?.merchantName || this.merchant?.name || '';
    this.editForm.phone = this.merchant?.phone || '';
    this.editForm.taxNumber = this.merchant?.taxNumber || '';
    this.editForm.bio = this.merchant?.bio || ''; // Ensure bio is loaded correctly
    this.editForm.preparationTime = this.merchant?.preparationTime || 1;
    this.editForm.merchantShippingMethod = this.merchant?.merchantShippingMethod || 'knoozbook';
    this.editForm.logoFile = null;
    this.editForm.coverPhotoFile = null;
    this.logoPreview = null;
    this.coverPreview = null;
    this.updateMessage = '';
    // Reset validation states
    this.phoneValid = false;
    this.phoneTouched = false;
  }

  // التحقق من رقم الهاتف
  validatePhone() {
    const egyptPhoneRegex = /^(010|011|012|015)[0-9]{8}$/;
    this.phoneTouched = true;
    this.phoneValid = egyptPhoneRegex.test(this.editForm.phone);
  }

  uploadsBaseUrl = environment.uploadsBaseUrl;
  private booksList: any = {};

  constructor(
    private merchantAuthService: MerchantAuthService,
    private router: Router,
    private http: HttpClient,
    private productStateService: ProductStateService,
    private analyticsService: AnalyticsService,
    public dataService: DataService) { }

  loadShippingRates() {
    const existingRates = this.merchant.shippingRates || [];
    
    // Ensure the edit form is synced with the latest merchant data
    if (this.merchant?.merchantShippingMethod) {
      this.editForm.merchantShippingMethod = this.merchant.merchantShippingMethod;
    }

    // Convert governorate rates to regional rates for the UI
    this.regionCosts = this.regionKeys.map(regionName => {
      const govNames = this.regionMapping[regionName];
      // Find the first matching governorate rate, or default to 50
      const matchingRate = existingRates.find((r: any) => govNames.includes(r.governorate));
      return {
        region: regionName,
        rate: matchingRate ? matchingRate.rate : 50
      };
    });
  }

  saveShippingSettings() {
    this.loadingShippingRates = true;
    
    const expandedRates: ShippingRate[] = [];
    this.regionCosts.forEach(rCost => {
      const govs = this.regionMapping[rCost.region];
      govs.forEach(gName => {
        expandedRates.push({ governorate: gName, rate: rCost.rate });
      });
    });

    console.log(`[MERCHANT-SHIPPING] Attempting to save shipping settings. Method: ${this.editForm.merchantShippingMethod}, Rates count: ${expandedRates.length}`);

    this.http.patch(`${environment.apiBaseUrl}/merchant/update-shipping-rates`, {
      merchantId: this.merchant._id,
      shippingRates: expandedRates,
      merchantShippingMethod: this.editForm.merchantShippingMethod
    }).subscribe({
      next: (res: any) => {
        this.loadingShippingRates = false;
        console.log(`[MERCHANT-SHIPPING] Save successful. Server response:`, res);
        alert('تم حفظ إعدادات الشحن بنجاح');
        
        // Update local data with fresh data from server
        if (res.merchant) {
          console.log(`[MERCHANT-SHIPPING] Updating local merchant state. Method from server: ${res.merchant.merchantShippingMethod}`);
          this.merchant = { ...res.merchant };
          // Sync with auth service and localStorage
          const token = this.merchantAuthService.getToken();
          if (token) {
            this.merchantAuthService.setMerchantAuthFromExternal(token, this.merchant);
          }
        } else {
          this.merchant.shippingRates = [...expandedRates];
          this.merchant.merchantShippingMethod = this.editForm.merchantShippingMethod;
        }
      },
      error: (err) => {
        this.loadingShippingRates = false;
        console.error('Error saving shipping settings:', err);
        alert('حدث خطأ أثناء حفظ إعدادات الشحن');
      }
    });
  }

  ngOnInit(): void {
    // Check if merchant is authenticated first
    if (!this.merchantAuthService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    // Refresh merchant data first to get latest approval status
    this.loadMerchantData();
    this.loadProducts();
    this.loadOrders();
    this.loadUpdateRequests();
    this.loadBooksList();
    this.loadAnalytics();
    this.checkPublisherUploadSetting();

    this.productsSubscription = this.productStateService.products$.subscribe(products => {
      this.loadProducts();
    });
  }

  // Check if merchant account is approved
  isMerchantApproved(): boolean {
    return this.merchant?.approved && !this.merchant?.suspended;
  }

  // Check if merchant account is pending approval
  isMerchantPending(): boolean {
    // Don't show pending warning if merchant data is still loading
    if (this.loadingMerchant) {
      return false;
    }

    // Don't show pending warning if merchant is approved
    if (this.merchant?.approved && !this.merchant?.suspended) {
      return false;
    }

    // Show pending warning only if explicitly not approved and not suspended
    // and merchant data has been loaded
    return !this.merchant?.approved && !this.merchant?.suspended;
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

        // Initialize edit form if in edit mode
        if (this.isEditMode) {
          this.initializeEditForm();
        }

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

        // Initialize shipping rates after loading merchant data
        this.loadShippingRates();
      },
      error: (error: any) => {
        this.loadingMerchant = false;

        // Handle authentication errors
        // Handle authentication errors
        if (error.status === 401) {
          // Let interceptor handle it
        } else if (error.status === 403) {
          // Let interceptor handle it or show specific message
          alert('ليس لديك صلاحية للوصول لهذا المحتوى.');
          this.router.navigate(['/']);
        } else {
          alert('فشل في تحميل بيانات التاجر');
        }
      }
    });
  }

  checkPublisherUploadSetting() {
    this.merchantAuthService.getSystemSettings().subscribe({
      next: (settings) => {
        if (settings && settings.bourseConfig) {
          this.allowPublisherUpload = settings.bourseConfig.allowPublisherUpload !== false;
        }
      },
      error: (err) => {
        console.error('Error fetching system settings:', err);
        // Default to true if fetch fails to avoid blocking users unnecessarily
        this.allowPublisherUpload = true;
      }
    });
  }

  loadProducts() {
    this.loadingProducts = true;
    this.merchantAuthService.getMerchantProducts().subscribe({
      next: (res: any) => {
        let products = res.products || res || [];
        // Remove duplicates based on _id to ensure unique products
        const uniqueProductsMap = new Map();
        for (const product of products) {
          if (product._id) {
            uniqueProductsMap.set(product._id, product);
          }
        }
        this.products = Array.from(uniqueProductsMap.values());
        this.currentPage = 1; // Reset to first page when loading products
        this.loadingProducts = false;
      },
      error: (error: any) => {
        this.loadingProducts = false;

        // Handle authentication errors
        // Handle authentication errors
        if (error.status === 401) {
          // Let interceptor handle it
        } else if (error.status === 403) {
          alert('ليس لديك صلاحية لعرض المنتجات.');
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
        // Handle authentication errors
        if (error.status === 401) {
          // Let interceptor handle it
        } else if (error.status === 403) {
          alert('ليس لديك صلاحية لعرض الطلبات.');
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
        // Handle authentication errors
        if (error.status === 401) {
          // Let interceptor handle it
        } else if (error.status === 403) {
          alert('ليس لديك صلاحية لعرض طلبات التحديث.');
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
    this.openModal(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف المنتج "${product.product_name}"؟ لا يمكن التراجع عن هذا الإجراء.`,
      'warning',
      'تأكيد',
      'إلغاء',
      true,
      () => this.confirmDeleteProduct(product)
    );
  }

  deleteOrder(order: any) {
    this.openModal(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف الطلب رقم "${order._id}"؟ لا يمكن التراجع عن هذا الإجراء.`,
      'warning',
      'تأكيد',
      'إلغاء',
      true,
      () => this.confirmDeleteOrder(order)
    );
  }

  // Modal methods
  openModal(title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info', confirmText: string = 'تأكيد', cancelText: string = 'إلغاء', showCancel: boolean = true, onConfirm?: () => void) {
    this.modalTitle = title;
    this.modalMessage = message;
    this.modalType = type;
    this.modalConfirmText = confirmText;
    this.modalCancelText = cancelText;
    this.modalShowCancel = showCancel;
    this.pendingAction = onConfirm || null;
    this.modalOpen = true;
  }

  showSuccessModal(message: string) {
    this.openModal('نجاح', message, 'success', 'تأكيد', 'إغلاق', false);
  }

  showErrorModal(message: string) {
    this.openModal('خطأ', message, 'error', 'تأكيد', 'إغلاق', false);
  }

  showLoadingModal(message: string) {
    this.loadingModal.isOpen = true;
    this.loadingModal.message = message;
  }

  closeLoadingModal() {
    this.loadingModal.isOpen = false;
  }

  closeModal() {
    this.modalOpen = false;
    this.pendingAction = null;
  }

  confirmModal() {
    if (this.pendingAction) {
      this.pendingAction();
    }
    this.closeModal();
  }

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

    this.openModal(
      'تأكيد الحذف الجماعي',
      `هل أنت متأكد من حذف ${selectedCount} منتج${selectedCount > 1 ? '' : ''}؟ لا يمكن التراجع عن هذا الإجراء.`,
      'warning',
      'تأكيد',
      'إلغاء',
      true,
      () => this.confirmBulkDelete()
    );
  }

  bulkDeleteSelectedProductsWithModal() {
    const selectedCount = this.selectedProducts.size;
    if (selectedCount === 0) return;

    this.openModal(
      'تأكيد الحذف الجماعي',
      `هل أنت متأكد من حذف ${selectedCount} منتج${selectedCount > 1 ? '' : ''}؟ لا يمكن التراجع عن هذا الإجراء.`,
      'warning',
      'تأكيد',
      'إلغاء',
      true,
      () => this.confirmBulkDelete()
    );
  }

  private confirmDeleteProduct(product: any) {
    this.merchantAuthService.deleteMerchantProduct(product._id).subscribe({
      next: () => {
        this.openModal('نجح الحذف', 'تم حذف المنتج بنجاح.', 'success', 'تأكيد', 'إغلاق', false);
        // Refresh product list after deletion
        this.loadProducts();
        this.selectedProducts.clear();
      },
      error: (error) => {
        this.openModal('خطأ في الحذف', 'حدث خطأ أثناء حذف المنتج. يرجى المحاولة مرة أخرى.', 'error', 'تأكيد', 'إغلاق', false);
      }
    });
  }

  private confirmDeleteOrder(order: any) {
    this.merchantAuthService.deleteMerchantOrder(order._id).subscribe({
      next: () => {
        this.openModal('نجح الحذف', 'تم حذف الطلب بنجاح.', 'success', 'تأكيد', 'إغلاق', false);
        // Refresh order list after deletion
        this.loadOrders();
      },
      error: (error) => {
        this.openModal('خطأ في الحذف', 'حدث خطأ أثناء حذف الطلب. يرجى المحاولة مرة أخرى.', 'error', 'تأكيد', 'إغلاق', false);
      }
    });
  }

  private confirmBulkDelete() {
    const deletePromises = Array.from(this.selectedProducts).map(productId =>
      this.merchantAuthService.deleteMerchantProduct(productId).toPromise()
    );

    Promise.all(deletePromises).then(() => {
      this.openModal('نجح الحذف الجماعي', `تم حذف ${this.selectedProducts.size} منتج بنجاح.`, 'success', 'تأكيد', 'إغلاق', false);
      this.loadProducts();
      this.selectedProducts.clear();
    }).catch((error) => {
      this.openModal('خطأ في الحذف الجماعي', 'حدث خطأ أثناء حذف بعض المنتجات. يرجى المحاولة مرة أخرى.', 'error', 'تأكيد', 'إغلاق', false);
    });
  }

  // Edit mode methods
  onSubmitProfileUpdate() {
    // Validate phone before submitting
    this.validatePhone();

    if (!this.phoneValid && this.editForm.phone.trim()) {
      this.updateMessage = 'يرجى إدخال رقم هاتف صحيح (مثال: 01012345678)';
      this.updateMessageColor = 'red';
      return;
    }

    this.updatingProfile = true;
    this.updateMessage = '';
    this.updateMessageColor = 'green';

    const formData = new FormData();

    // Add form fields - always include bio even if empty to allow clearing it
    if (this.editForm.name) formData.append('name', this.editForm.name);
    if (this.editForm.phone) formData.append('phone', this.editForm.phone);
    if (this.editForm.taxNumber) formData.append('taxNumber', this.editForm.taxNumber);
    formData.append('bio', this.editForm.bio || ''); // Always send bio field
    formData.append('preparationTime', this.editForm.preparationTime.toString()); // Always send preparationTime
    formData.append('merchantShippingMethod', this.editForm.merchantShippingMethod); 

    // Add logo file if selected
    if (this.editForm.logoFile) {
      formData.append('logo', this.editForm.logoFile);
    }

    // Add cover photo file if selected
    if (this.editForm.coverPhotoFile) {
      formData.append('coverPhoto', this.editForm.coverPhotoFile);
    }

    this.merchantAuthService.updateMerchantProfile(formData).subscribe({
      next: (res: any) => {
        this.updatingProfile = false;
        this.updateMessage = 'تم تحديث المعلومات بنجاح!';
        this.updateMessageColor = 'green';
        this.isEditMode = false;
        this.logoPreview = null;
        // Refresh merchant data
        this.loadMerchantData();
      },
      error: (error: any) => {
        this.updatingProfile = false;
        this.updateMessage = 'حدث خطأ أثناء تحديث المعلومات. يرجى المحاولة مرة أخرى.';
        this.updateMessageColor = 'red';
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.editForm.logoFile = file;
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.logoPreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  onCoverFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.editForm.coverPhotoFile = file;
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.coverPreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  getCoverUrl(cover: string | null | undefined): string {
    if (!cover) return '';
    if (cover.startsWith('http://') || cover.startsWith('https://') || cover.startsWith('data:')) {
      return cover.replace(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, 'https://knoozbook.com');
    }
    if (cover.startsWith('/uploads/') || cover.startsWith('uploads/')) {
      const clean = cover.startsWith('/') ? cover : `/${cover}`;
      return `https://knoozbook.com${clean}`;
    }
    const cleanCover = cover.startsWith('/') ? cover.substring(1) : cover;
    return `https://knoozbook.com/uploads/books/${cleanCover}`;
  }

  getLogoUrl(logo: string | null | undefined): string {
    if (!logo) return '';
    if (logo.startsWith('http://') || logo.startsWith('https://') || logo.startsWith('data:')) {
      return logo.replace(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, 'https://knoozbook.com');
    }
    if (logo.startsWith('/uploads/') || logo.startsWith('uploads/')) {
      const clean = logo.startsWith('/') ? logo : `/${logo}`;
      return `https://knoozbook.com${clean}`;
    }
    const cleanLogo = logo.startsWith('/') ? logo.substring(1) : logo;
    return `https://knoozbook.com/uploads/books/${cleanLogo}`;
  }

  getStoreSlug(): string {
    const name = this.merchant?.merchantName || this.merchant?.name || '';
    return name.trim().replace(/\s+/g, '');
  }

  getStoreUrl(): string {
    const slug = this.getStoreSlug();
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.includes('knoozbook.com')) {
      return `${window.location.origin}/${slug}`;
    }
    return `https://knoozbook.com/${slug}`;
  }

  copyStoreLinkSuccess = false;
  copyStoreLink() {
    const url = this.getStoreUrl();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.copyStoreLinkSuccess = true;
        setTimeout(() => this.copyStoreLinkSuccess = false, 3000);
      });
    }
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    if (this.isEditMode) {
      // Initialize form with current merchant data when entering edit mode
      this.initializeEditForm();
    } else {
      this.logoPreview = null;
      this.updateMessage = '';
    }
  }

  calculateDeliveryDate(orderDate: string, preparationTime: number): string {
    if (!orderDate || !preparationTime) {
      return '';
    }
    const prepDays = preparationTime;
    const orderDateObj = new Date(orderDate);
    orderDateObj.setDate(orderDateObj.getDate() + prepDays);
    return orderDateObj.toLocaleDateString();
  }

  encodeURIComponent(value: string): string {
    return encodeURIComponent(value);
  }



  loadBooksList() {
    this.http.get('/json/books_list.json').subscribe(data => {
      this.booksList = data;
    });
  }

  getBookImage(bookTitle: string): string {
    for (const category in this.booksList) {
      const book = this.booksList[category].find((b: any) => b.title === bookTitle);
      if (book && book.image_url) {
        return `/uploads/books/${book.image_url}`;
      }
    }
    return '';
  }

  getProductImageUrl(product: any): string {
    if (!product) return 'assets/image/book-placeholder.jpg';
    if (!product.merchantName && this.merchant) {
      product.merchantName = this.merchant.merchantName || this.merchant.name || this.merchant.username;
    }
    return this.dataService.getBookImageUrl(product);
  }

  confirmShipment(order: any, newStatus: string): void {
    let confirmMessage = '';
    let successMessage = '';

    switch (newStatus) {
      case 'تم الشحن':
        confirmMessage = 'هل أنت متأكد من أن الطلب تم شحنه بنجاح؟ سيتم تحديث حالة الطلب.';
        successMessage = 'تم تحديث حالة الطلب إلى تم الشحن.';
        break;
      case 'تم الاستلام':
        confirmMessage = 'هل أنت متأكد من استلام المنتج من التاجر؟ سيتم تحديث حالة الطلب.';
        successMessage = 'تم تحديث حالة الطلب إلى تم الاستلام.';
        break;
      case 'تم التسليم':
        confirmMessage = 'هل أنت متأكد من أن الطلب تم تسليمه بنجاح؟ سيتم تحديث حالة الطلب.';
        successMessage = 'تم تحديث حالة الطلب إلى تم التسليم.';
        break;
      case 'تم الإلغاء':
        confirmMessage = 'هل أنت متأكد من إلغاء الطلب؟ سيتم تحديث حالة الطلب.';
        successMessage = 'تم إلغاء الطلب.';
        break;
      default:
        confirmMessage = 'هل أنت متأكد من تحديث حالة الطلب؟';
        successMessage = 'تم تحديث حالة الطلب.';
    }

    if (confirm(confirmMessage)) {
      this.http.patch(`${environment.apiBaseUrl}/orders/update-status/${order._id}`, { status: newStatus }).subscribe({
        next: () => {
          alert(successMessage);
          this.loadOrders();
        },
        error: (error) => {
          alert('حدث خطأ أثناء تحديث حالة الطلب');
        }
      });
    }
  }

  refreshOrders(): void {
    this.loadingModal.isOpen = true;
    this.loadingModal.message = 'جاري تحديث الطلبات...';
    this.loadOrders();
    // Close modal after loading
    setTimeout(() => {
      this.loadingModal.isOpen = false;
    }, 2000); // Close after 2 seconds
  }

  autoShipOrder(order: any): void {
    this.openModal(
      'تأكيد الشحن الآلي',
      'هل تريد شحن هذا الطلب آلياً عبر شركة الشحن المتعاقد معها؟',
      'info',
      'شحن الآن',
      'إلغاء',
      true,
      () => {
        this.showLoadingModal('جاري معالجة الشحن آلياً...');
        this.http.post(`${environment.apiBaseUrl}/orders/ship/${order._id}`, {}).subscribe({
          next: (res: any) => {
            this.closeLoadingModal();
            if (res.success) {
              this.showSuccessModal('تم إنشاء الشحنة بنجاح! رقم التتبع: ' + res.data.trackingNumber);
              this.loadOrders();
            } else {
              this.showErrorModal(res.message || 'فشل إنشاء الشحنة');
            }
          },
          error: (err) => {
            this.closeLoadingModal();
            console.error('Shipment Error:', err);
            this.showErrorModal(err.error?.message || 'حدث خطأ أثناء الاتصال بشركة الشحن');
          }
        });
      }
    );
  }

  confirmShipmentWithModal(order: any, newStatus: string): void {
    let title = '';
    let message = '';
    let confirmText = 'تأكيد';
    let type: 'info' | 'warning' | 'error' | 'success' = 'info';

    switch (newStatus) {
      case 'تم الشحن':
        title = 'تأكيد الشحن';
        message = 'هل أنت متأكد من أن الطلب تم شحنه بنجاح؟ سيتم تحديث حالة الطلب.';
        confirmText = 'تأكيد الشحن';
        type = 'info';
        break;
      case 'تم الاستلام':
        title = 'تأكيد الاستلام';
        message = 'هل أنت متأكد من استلام المنتج من التاجر؟ سيتم تحديث حالة الطلب.';
        confirmText = 'تأكيد الاستلام';
        type = 'info';
        break;
      case 'تم التسليم':
        title = 'تأكيد التسليم';
        message = 'هل أنت متأكد من أن الطلب تم تسليمه بنجاح؟ سيتم تحديث حالة الطلب.';
        confirmText = 'تأكيد التسليم';
        type = 'success';
        break;
      case 'تم الإلغاء':
        title = 'تأكيد الإلغاء';
        message = 'هل أنت متأكد من إلغاء الطلب؟ سيتم تحديث حالة الطلب.';
        confirmText = 'إلغاء الطلب';
        type = 'warning';
        break;
      default:
        title = 'تأكيد تحديث الحالة';
        message = 'هل أنت متأكد من تحديث حالة الطلب؟';
        confirmText = 'تأكيد';
        type = 'info';
    }

    this.openModal(
      title,
      message,
      type,
      confirmText,
      'إلغاء',
      true,
      () => this.confirmShipmentAction(order, newStatus)
    );
  }

  private confirmShipmentAction(order: any, newStatus: string): void {
    this.http.patch(`${environment.apiBaseUrl}/orders/update-status/${order._id}`, { status: newStatus }).subscribe({
      next: () => {
        this.openModal('نجح التحديث', `تم تحديث حالة الطلب إلى ${newStatus}.`, 'success', 'تأكيد', 'إغلاق', false);
        this.loadOrders();
      },
      error: (error) => {
        this.openModal('خطأ في التحديث', 'حدث خطأ أثناء تحديث حالة الطلب. يرجى المحاولة مرة أخرى.', 'error', 'تأكيد', 'إغلاق', false);
      }
    });
  }

  deleteOrderWithModal(order: any): void {
    this.openModal(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف الطلب رقم "${order._id.slice(-8)}"؟ لا يمكن التراجع عن هذا الإجراء.`,
      'warning',
      'تأكيد',
      'إلغاء',
      true,
      () => this.confirmDeleteOrder(order)
    );
  }

  viewOrderDetails(order: any): void {
    this.selectedOrder = order;
    this.isOrderModalOpen = true;
  }

  closeOrderModal(): void {
    this.isOrderModalOpen = false;
    this.selectedOrder = null;
  }

  setTab(tab: any) {
    this.activeTab = tab;
    if (tab === 'analytics') {
      // Small delay to ensure canvas is rendered
      setTimeout(() => this.initCharts(), 100);
    } else if (tab === 'shippingSettings') {
      this.loadShippingRates();
    }
  }

  loadAnalytics() {
    this.loadingAnalytics = true;
    this.analyticsService.getMerchantStats().subscribe({
      next: (data) => {
        this.analyticsData = data;
        this.loadingAnalytics = false;
        if (this.activeTab === 'analytics') {
          this.initCharts();
        }
      },
      error: (err) => {
        console.error('Error loading analytics:', err);
        this.loadingAnalytics = false;
      }
    });
  }

  initCharts() {
    if (!this.analyticsData) return;

    // Destroy existing charts to prevent memory leaks
    Object.values(this.charts).forEach((chart: any) => chart.destroy());

    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDarkMode ? '#94a3b8' : '#64748b';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    const accentColor = isDarkMode ? '#60a5fa' : '#3b82f6';
    const isMobile = window.innerWidth < 768;

    // 1. Visitor Trend Chart
    const trendCtx = document.getElementById('visitorTrendChart') as HTMLCanvasElement;
    if (trendCtx) {
      const labels = this.analyticsData.storeViewHistory.map((h: any) => h.date);
      const data = this.analyticsData.storeViewHistory.map((h: any) => h.count);

      this.charts['trend'] = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'زوار المتجر',
            data,
            borderColor: isDarkMode ? '#60a5fa' : '#2563eb',
            backgroundColor: isDarkMode ? 'rgba(96, 165, 250, 0.2)' : 'rgba(37, 99, 235, 0.15)',
            fill: true,
            tension: 0.4,
            borderWidth: 4,
            pointRadius: isMobile ? 2 : 5,
            pointBackgroundColor: isDarkMode ? '#60a5fa' : '#2563eb',
            pointBorderColor: isDarkMode ? '#1e293b' : '#ffffff',
            pointBorderWidth: 2,
            pointHoverRadius: 7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { display: false },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
              titleColor: isDarkMode ? '#f8fafc' : '#1e293b',
              bodyColor: textColor,
              borderColor: isDarkMode ? '#334155' : '#e2e8f0',
              borderWidth: 1
            }
          },
          scales: { 
            y: { 
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { 
                color: textColor,
                font: { size: isMobile ? 10 : 12 }
              }
            },
            x: {
              grid: { display: false },
              ticks: { 
                color: textColor,
                font: { size: isMobile ? 10 : 12 },
                maxRotation: 45,
                autoSkip: true
              }
            }
          }
        }
      });
    }

    // 2. Category Performance Chart
    const catCtx = document.getElementById('categoryChart') as HTMLCanvasElement;
    if (catCtx) {
      const labels = this.analyticsData.categoryPerformance.map((c: any) => c.name);
      const data = this.analyticsData.categoryPerformance.map((c: any) => c.views);

      this.charts['category'] = new Chart(catCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: isDarkMode ? 
              ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'] :
              ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777'],
            borderWidth: isDarkMode ? 2 : 0,
            borderColor: isDarkMode ? '#1e293b' : 'transparent'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: { 
            legend: { 
              position: 'bottom',
              labels: {
                color: textColor,
                padding: 20,
                font: { size: isMobile ? 11 : 13 },
                usePointStyle: true
              }
            }
          }
        }
      });
    }
  }
}
