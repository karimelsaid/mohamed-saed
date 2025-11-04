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

@Component({
  selector: 'app-merchant-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ModalDialogComponent,],
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
    preparationTime: 1
  };
  logoPreview: string | null = null;
  updatingProfile = false;
  updateMessage = '';
  updateMessageColor = 'green';

  // Validation properties
  phoneValid: boolean = false;
  phoneTouched: boolean = false;

  // Initialize edit form with current merchant data
  private initializeEditForm() {
    this.editForm.name = this.merchant?.merchantName || this.merchant?.name || '';
    this.editForm.phone = this.merchant?.phone || '';
    this.editForm.taxNumber = this.merchant?.taxNumber || '';
    this.editForm.bio = this.merchant?.bio || ''; // Ensure bio is loaded correctly
    this.editForm.preparationTime = this.merchant?.preparationTime || 1;
    this.editForm.logoFile = null;
    this.logoPreview = null;
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
    private productStateService: ProductStateService) {}

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

    // Add logo file if selected
    if (this.editForm.logoFile) {
      formData.append('logo', this.editForm.logoFile);
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

  getLogoUrl(logo: string): string {
    if (!logo) return '';
    // Construct the full URL to the logo image served statically at /uploads/books/
    return `/uploads/books/${logo}`;
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
    // This logic is now consistent with other working components like search-results.
    let imagePath = product.image_path || product.product_image || '';
    const merchantName = product.merchantName || (this.merchant ? (this.merchant.merchantName || this.merchant.name) : null);

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
      finalPath = `merchant_${merchantName}/${imageId}/${imageId}.webp`;
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
    // Navigate to order details page or show modal with order details
    this.router.navigate(['/merchant/order-details', order._id]);
  }
}
