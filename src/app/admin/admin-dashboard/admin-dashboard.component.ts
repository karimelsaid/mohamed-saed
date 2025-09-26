import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { AuthService } from '../../auth/auth.service';
import { Router } from '@angular/router';
import { DataService } from '../../services/data.service';
import { take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { NotificationService } from '../../services/notification.service';
import { ModalDialogComponent } from '../../shared/modal-dialog/modal-dialog.component';
import { ModalService, ModalConfig } from '../../services/modal.service';
import * as XLSX from 'xlsx';
import { FreeShippingRulesComponent } from './free-shipping/free-shipping-rules.component';
import { Subscription } from 'rxjs';

interface Order {
  _id: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  book: string;
  quantity: number;
  status: string;
  orderDate: string;
  totalAmount: number;
  isMerchantOrder?: boolean;
}

interface RequestedBook {
  _id: string;
  userId: string;
  username?: string;
  bookName: string;
  authorName: string;
  dateRequested: string;
  added: boolean;
}

interface Product {
  products_id: string;
  product_name: string;
  product_quantity: number;
  product_category: string;
  product_description: string;
  product_price: number;
  price_cost: number;
  product_image?: string;
  promotionEndDate?: string;
  product_price_before_discount?: number;
  product_discount_percent?: number;
  createdAt?: string; // Added creation date for sorting by recently added
  fileOrder?: number; // Added to track order in file for sorting
}

interface OrderProduct {
  product_name: string;
  product_quantity: number;
}

interface GroupedOrder {
  _id: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  products: OrderProduct[];
  status: string;
  orderDate: string;
  totalAmount: number;
  isMerchantOrder?: boolean;
}

interface PrintOrder {
  orderId: string;
  userId: string;
  username: string;
  email: string;
  phone: string;
  address: string;
  status: string;
  orderDate: string;
  totalAmount: number;
  printProject: {
    filename: string;
    filepath: string;
    size: string;
    coverType: string;
    printColor: string;
    pages: number;
    copies: number;
    notes: string;
    projectTitle: string;
    estimatedPrice: number;
    createdAt: Date;
  };
  fileIndex: number; // Added to fix TypeScript error
}

@Component({
  selector: 'app-admin-dashboard',
  standalone : false,
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})



export class AdminDashboardComponent implements OnInit {
  orders: GroupedOrder[] = [];
  allOrders: GroupedOrder[] = [];
  requestedBooks: RequestedBook[] = [];
  isAdmin: boolean = false;
  currentView: 'orders' | 'requestedBooks' | 'printOrders' | 'addProduct' | 'products' | 'newPage' | 'freeShippingRules' | 'merchants' | 'productApproval' | 'merchantOrders' = 'orders';

  manualPromotionStartDate: string = '';
  manualPromotionEndDate: string = '';

  // Pagination state for orders
  ordersPage: number = 1;
  ordersPageSize: number = 10;

  // Pagination state for requestedBooks
  requestedBooksPage: number = 1;
  requestedBooksPageSize: number = 10;

  // Pagination state for printOrders
  printOrdersPage: number = 1;
  printOrdersPageSize: number = 10;

  printOrders: PrintOrder[] = [];

  allProducts: Product[] = [];
  originalProducts: Product[] = [];
  products: Product[] = [];
  productsPage: number = 1;
  productsPageSize: number = 50;
  searchTerm: string = '';

  // New properties for sorting
  sortField: keyof Product | '' = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Multi-select properties
  selectedProducts: Set<string> = new Set();
  selectedOrders: Set<string> = new Set();
  showArchived: boolean = false;

  backendBaseUrl: string = environment.apiBaseUrl;
  uploadsBaseUrl: string = environment.uploadsBaseUrl;

  product = {
    product_name: '',
    product_quantity: 1,
    product_category: '',
    product_description: '',
    product_price: 0,
    price_cost: 0
  };

  selectedFile: File | null = null;
  imageError: string | null = null;

  uploading: boolean = false;
  uploadProgress: number = 0;
  uploadSuccess: boolean = false;

  readonly MAX_IMAGE_SIZE_BYTES = 1024 * 1024; // 1 MB

  // Modal properties for component's modal system
  modalOpen: boolean = false;
  modalTitle: string = '';
  modalMessage: string = '';
  modalType: 'info' | 'warning' | 'error' | 'success' = 'info';
  modalConfirmText: string = 'تأكيد';
  modalCancelText: string = 'إلغاء';
  modalShowCancel: boolean = true;
  pendingAction: (() => void) | null = null;

  // Modal service properties (separate from component modal)
  modalServiceOpen: boolean = false;
  modalServiceTitle: string = '';
  modalServiceMessage: string = '';
  modalServiceType: 'info' | 'warning' | 'error' | 'success' = 'info';
  modalServiceConfirmText: string = 'تأكيد';
  modalServiceCancelText: string = 'إلغاء';
  modalServiceShowCancel: boolean = true;
  modalServiceAction: (() => void) | null = null;

  categories: string[] = [
    'روايات وقصص',
    'تطوير الذات وعلم النفس',
    'كتب دينية',
    'قواميس ومراجع',
    'صحة وطب وعلوم',
    'أعمال وتسويق ومالية',
    'فنون وحرف',
    'تاريخ وسير ذاتية',
    'تربية وأطفال'
  ];

  // Reverse map from full category name to short key
  categoryReverseMap: { [key: string]: string } = {
    'روايات وقصص': 'رواية',
    'تطوير الذات وعلم النفس': 'تنمية',
    'كتب دينية': 'ديني',
    'قواميس ومراجع': 'قاموس',
    'صحة وطب وعلوم': 'صحة',
    'أعمال وتسويق ومالية': 'اعمال',
    'فنون وحرف': 'فن',
    'تاريخ وسير ذاتية': 'تاريخ',
    'تربية وأطفال': 'تربية'
  };

  private modalServiceSubscription?: Subscription;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private dataService: DataService,
    private notificationService: NotificationService,
    private modalService: ModalService
  ) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      if (user && user.email === 'admin@example.com' && user.role === 'admin') {
        this.isAdmin = true;
        this.loadOrders();
        this.loadPromotionDates();
        this.loadNotifications();
      } else {
        this.isAdmin = false;
        this.router.navigate(['/']);
      }
    });

    // Subscribe to modal service events (separate from component modal system)
    this.modalServiceSubscription = this.modalService.modal$.subscribe(modalConfig => {
      this.modalServiceOpen = true;
      this.modalServiceTitle = modalConfig.title;
      this.modalServiceMessage = modalConfig.message;
      this.modalServiceType = modalConfig.type;
      this.modalServiceConfirmText = modalConfig.confirmText || 'تأكيد';
      this.modalServiceCancelText = modalConfig.cancelText || 'إلغاء';
      this.modalServiceShowCancel = modalConfig.showCancel || false;
      this.modalServiceAction = modalConfig.action || null;
    });
  }

  ngOnDestroy(): void {
    if (this.modalServiceSubscription) {
      this.modalServiceSubscription.unsubscribe();
    }
  }

  toggleSelectAll(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.products.forEach(product => this.selectedProducts.add(product.products_id));
    } else {
      this.selectedProducts.clear();
    }
  }

  switchView(view: 'orders' | 'requestedBooks' | 'printOrders' | 'addProduct' | 'products' | 'newPage' | 'freeShippingRules' | 'merchants' | 'productApproval' | 'merchantOrders'): void {
    this.currentView = view;
    if (view === 'orders' || view === 'merchantOrders') {
      this.ordersPage = 1; // Reset page when switching views
      this.loadOrders();
    } else if (view === 'requestedBooks') {
      this.fetchRequestedBooks();
    } else if (view === 'printOrders') {
      this.loadPrintOrders();
    } else if (view === 'products') {
      this.loadProducts();
    } else if (view === 'merchants') {
      // No data loading needed currently for merchants
    } else if (view === 'productApproval') {
      // No data loading needed currently for productApproval
    } else if (view === 'newPage') {
      // No data loading needed for newPage currently
    } else if (view === 'freeShippingRules') {
      // No data loading needed currently for freeShippingRules
    }
  }

  loadPromotionDates(): void {
    this.http.get<{ success: boolean; startDate: string; endDate: string }>(`${this.backendBaseUrl}/admin/promotion-dates`).subscribe({
      next: (response) => {
        if (response.success) {
          this.manualPromotionStartDate = response.startDate ? response.startDate.substring(0, 10) : '';
          this.manualPromotionEndDate = response.endDate ? response.endDate.substring(0, 10) : '';
        }
      },
      error: (err) => {
        // Error handled silently
      }
    });
  }

  savePromotionDates(): void {
    if (!this.manualPromotionStartDate || !this.manualPromotionEndDate) {
      this.showErrorModal('يرجى إدخال تاريخ بداية ونهاية العرض.');
      return;
    }
    if (this.manualPromotionEndDate <= this.manualPromotionStartDate) {
      this.showErrorModal('يجب أن يكون تاريخ نهاية العرض بعد تاريخ البداية.');
      return;
    }
    const payload = {
      startDate: this.manualPromotionStartDate,
      endDate: this.manualPromotionEndDate
    };
    this.http.post(`${this.backendBaseUrl}/admin/update-promotion-dates`, payload).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.showSuccessModal('تم حفظ تواريخ العرض بنجاح.');
        } else {
          this.showErrorModal('حدث خطأ أثناء حفظ تواريخ العرض.');
        }
      },
      error: (err) => {
        // Error handled silently
        this.showErrorModal('حدث خطأ أثناء حفظ تواريخ العرض.');
      }
    });
  }

  loadProducts(): void {
    this.http.get<{ success: boolean; products: Product[] }>(`${this.backendBaseUrl}/admin/products`).subscribe({
      next: (response) => {
        if (response.success) {
          // Trim product_category to match categories array exactly
          response.products.forEach((p, index) => {
            if (p.product_category && typeof p.product_category === 'string') {
              p.product_category = p.product_category.trim();
            }
            // Ensure product_category is set to a valid category or default to first category
            if (!p.product_category || !this.categories.includes(p.product_category)) {
              p.product_category = this.categories[0];
            }
            // Add fileOrder property based on index in the file
            p.fileOrder = index;
          });
          this.allProducts = response.products;
          this.originalProducts = JSON.parse(JSON.stringify(response.products)); // deep copy for change detection
          this.updateProductsPage();
        }
      },
      error: (err) => {
        let errorMessage = 'فشل في تحميل المنتجات';

        if (err.status === 404) {
          errorMessage = 'نقطة النهاية غير موجودة. يرجى التحقق من إعدادات الخادم.';
        } else if (err.status === 401) {
          errorMessage = 'غير مصرح لك بالوصول. يرجى تسجيل الدخول كمدير.';
        } else if (err.status === 500) {
          errorMessage = 'خطأ في الخادم. يرجى المحاولة لاحقاً.';
        } else if (err.message) {
          errorMessage = `خطأ: ${err.message}`;
        }

        this.showErrorModal(errorMessage);
      }
    });
  }

  get filteredProducts(): Product[] {
    let filtered = this.allProducts;

    if (this.searchTerm) {
      const lowerSearch = this.searchTerm.toLowerCase();
      filtered = filtered.filter(p => {
        if (!p.product_name || typeof p.product_name !== 'string') {
          return false;
        }
        return p.product_name.toLowerCase().includes(lowerSearch);
      });
    }

    if (this.sortField !== '') {
      filtered = filtered.slice().sort((a, b) => {
        if (this.sortField === 'createdAt' || this.sortField === 'fileOrder') {
          const aOrder = a.fileOrder ?? 0;
          const bOrder = b.fileOrder ?? 0;
          // Sort by file order: asc means oldest first (first in file), desc means newest last (last in file)
          if (this.sortDirection === 'asc') {
            return aOrder - bOrder;
          } else {
            return bOrder - aOrder;
          }
        }

        const aValue = a[this.sortField as keyof Product];
        const bValue = b[this.sortField as keyof Product];

        if (aValue == null) return 1;
        if (bValue == null) return -1;

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return this.sortDirection === 'asc' ? comparison : -comparison;
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          return this.sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        } else {
          return 0;
        }
      });
    }

    return filtered;
  }

  updateProductsPage(): void {
    const start = (this.productsPage - 1) * this.productsPageSize;
    const end = this.productsPage * this.productsPageSize;
    this.products = this.filteredProducts.slice(start, end);
  }

  nextProductsPage(): void {
    if (this.productsPage < this.totalProductsPages()) {
      this.productsPage++;
      this.updateProductsPage();
      this.scrollToTop();
    }
  }

  onSearchTermChange(): void {
    this.productsPage = 1;
    this.updateProductsPage();
  }

  onSortFieldChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (!target) return;
    const value = target.value as keyof Product | '';
    if (value === this.sortField) {
      // Toggle direction
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = value;
      this.sortDirection = 'asc';
    }
    this.productsPage = 1;
    this.updateProductsPage();
  }

  toggleSortDirection(): void {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.updateProductsPage();
  }

  prevProductsPage(): void {
    if (this.productsPage > 1) {
      this.productsPage--;
      this.updateProductsPage();
      this.scrollToTop();
    }
  }

  totalProductsPages(): number {
    return Math.ceil(this.filteredProducts.length / this.productsPageSize);
  }

  updateProduct(product: Product): void {
    const updateData = {
      product_name: product.product_name,
      product_quantity: product.product_quantity,
      product_category: product.product_category,
      product_description: product.product_description,
      product_price: product.product_price,
      price_cost: product.price_cost
    };
    this.http.patch(`${this.backendBaseUrl}/admin/products/${product.products_id}`, updateData).subscribe({
      next: () => {
        this.showSuccessModal('تم تحديث بيانات المنتج بنجاح');
        this.loadProducts();
      },
      error: (err) => {
        this.showErrorModal('حدث خطأ أثناء تحديث بيانات المنتج');
      }
    });
  }

  saveAllProducts(): void {
    const changedProducts = this.allProducts.filter(p => this.hasProductChanged(p));
    if (changedProducts.length === 0) {
      this.showErrorModal('لا توجد تغييرات لحفظها.');
      return;
    }
    const updatePayload = { products: changedProducts.map(p => ({
      products_id: p.products_id,
      product_name: p.product_name,
      product_quantity: p.product_quantity,
      product_category: p.product_category,
      product_description: p.product_description,
      product_price: p.product_price,
      price_cost: p.price_cost
    }))};

    this.http.post(`${this.backendBaseUrl}/admin/products/batch-update`, updatePayload).subscribe({
      next: () => {
        this.showSuccessModal('تم حفظ جميع التغييرات بنجاح');
        this.loadProducts();
        // Call sync-json-to-excel to update Excel file after batch update
        this.http.post(`${this.backendBaseUrl}/admin/sync-json-to-excel`, {}).subscribe({
          next: () => {
            // Excel file updated after batch update
          },
          error: (err) => {
            // Error updating Excel file after batch update
          }
        });
      },
      error: (err) => {
        // Error batch updating products
        this.showErrorModal('حدث خطأ أثناء حفظ التغييرات');
      }
    });
  }

  hasProductChanged(product: Product): boolean {
    const original = this.originalProducts.find(p => p.products_id === product.products_id);
    if (!original) return true;
    return (
      product.product_name !== original.product_name ||
      product.product_quantity !== original.product_quantity ||
      product.product_category !== original.product_category ||
      product.product_description !== original.product_description ||
      product.product_price !== original.product_price ||
      product.price_cost !== original.price_cost
    );
  }

  replaceProductImage(product: Product, file: File | null): void {
    if (!file) {
      this.showErrorModal('يرجى اختيار صورة جديدة للمنتج');
      return;
    }
    const formData = new FormData();
    formData.append('image', file);
    this.http.post(`${this.backendBaseUrl}/admin/products/${product.products_id}/image`, formData).subscribe({
      next: () => {
        this.showSuccessModal('تم تحديث صورة المنتج بنجاح');
        this.loadProducts();
      },
      error: (err) => {
        // Error replacing product image
        this.showErrorModal('حدث خطأ أثناء تحديث صورة المنتج');
      }
    });
  }

  deleteProduct(product: Product): void {
    this.deleteProductWithModal(product);
  }

  // Multi-select methods
  toggleProductSelection(productId: string): void {
    if (this.selectedProducts.has(productId)) {
      this.selectedProducts.delete(productId);
    } else {
      this.selectedProducts.add(productId);
    }
  }

  isProductSelected(productId: string): boolean {
    return this.selectedProducts.has(productId);
  }

  selectAllProducts(): void {
    if (this.isAllProductsSelected()) {
      this.selectedProducts.clear();
    } else {
      this.products.forEach(product => {
        this.selectedProducts.add(product.products_id);
      });
    }
  }

  isAllProductsSelected(): boolean {
    return this.products.length > 0 && this.products.every(product => this.selectedProducts.has(product.products_id));
  }

  isSomeProductsSelected(): boolean {
    return this.selectedProducts.size > 0 && this.selectedProducts.size < this.products.length;
  }

  bulkDeleteSelectedProducts(): void {
    this.bulkDeleteSelectedProductsWithModal();
  }

  handleImageError(event: any) {
    const imageElement = event.target;

    if (!imageElement.errorStep) {
      imageElement.errorStep = 1;
    } else {
      imageElement.errorStep++;
    }

    const imageName = imageElement.src.split('/').pop().split('.')[0];

    switch (imageElement.errorStep) {
      case 1:
        imageElement.src = this.uploadsBaseUrl + `/${imageName}.webp`;
        break;
      case 2:
        imageElement.src = this.uploadsBaseUrl + `/${imageName}.png`;
        break;
      case 3:
        imageElement.src = this.uploadsBaseUrl + `/${imageName}.jpg`;
        break;
      default:
        imageElement.src = this.uploadsBaseUrl + '/default.webp';
        break;
    }
  }

  exportProductsToExcel(): void {
    const worksheet = XLSX.utils.json_to_sheet(this.products);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    XLSX.writeFile(workbook, 'products.xlsx');
  }

  importProductsFromExcel(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const importedProducts: Product[] = XLSX.utils.sheet_to_json(sheet);
      // Update products one by one
      importedProducts.forEach((prod) => {
        if (prod.products_id) {
          this.updateProduct(prod as Product);
        }
      });
      this.showSuccessModal('تم استيراد وتحديث المنتجات من ملف Excel');
      this.loadProducts();
    };
    reader.readAsBinaryString(file);
  }

  confirmPrintOrderShipment(userId: string, orderId: string, newStatus: string): void {
    let confirmMessage = '';
    let successMessage = '';

    switch (newStatus) {
      case 'تم الشحن':
        confirmMessage = 'هل أنت متأكد من أن طلب الطباعة تم شحنه بنجاح؟ سيتم تحديث حالة الطلب.';
        successMessage = 'تم تحديث حالة طلب الطباعة إلى تم الشحن.';
        break;
      case 'تم التسليم':
        confirmMessage = 'هل أنت متأكد من أن طلب الطباعة تم تسليمه بنجاح؟ سيتم تحديث حالة الطلب.';
        successMessage = 'تم تحديث حالة طلب الطباعة إلى تم التسليم.';
        break;
      case 'تم الإلغاء':
        confirmMessage = 'هل أنت متأكد من إلغاء طلب الطباعة؟ سيتم تحديث حالة الطلب.';
        successMessage = 'تم إلغاء طلب الطباعة.';
        break;
      default:
        confirmMessage = 'هل أنت متأكد من تحديث حالة طلب الطباعة؟';
        successMessage = 'تم تحديث حالة طلب الطباعة.';
    }

    if (confirm(confirmMessage)) {
      this.http.patch(`${this.backendBaseUrl}/print/update-status/${userId}/${orderId}`, { status: newStatus }).subscribe({
        next: () => {
          this.showSuccessModal(successMessage);
          this.loadPrintOrders();
          this.loadNotifications();
          this.authService.user$.pipe(take(1)).subscribe(user => {
            if (user && user.id) {
              this.notificationService.refreshNotifications(user.id);
            }
          });
        },
        error: (error) => {
          this.showErrorModal('حدث خطأ أثناء تحديث حالة طلب الطباعة');
        }
      });
    }
  }

  extractFilename(filepath: string): string {
    if (!filepath) return '';
    const parts = filepath.split(/[\\/]/);
    return parts[parts.length - 1].trim();
  }

  encodeUriComponentSafe(value: string): string {
    return encodeURIComponent(value);
  }

  formatOrderDate(dateString: string): string {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' };
    return new Intl.DateTimeFormat('ar-EG', options).format(date);
  }

  loadNotifications(): void {
    this.authService.user$.pipe(take(1)).subscribe(user => {
      if (user && user.id) {
        this.notificationService.getNotifications(user.id).subscribe(notifications => {
          // Removed console log as per user request
        });
      }
    });
  }

  loadOrders(): void {
    this.authService.user$.pipe(take(1)).subscribe(user => {
      const merchantId = user ? user.id : '';
      const params = merchantId ? `?merchantId=${merchantId}` : '';
      const archivedParam = this.showArchived ? '&includeArchived=true' : '';
      this.http.get<Order[]>(`${environment.apiBaseUrl}/orders/all${params}${archivedParam}`).subscribe({
        next: (data) => {
          const groupedOrdersMap: { [key: string]: GroupedOrder } = {};

          data.forEach(order => {
            if (!groupedOrdersMap[order._id]) {
              groupedOrdersMap[order._id] = {
                _id: order._id,
                customerName: order.customerName,
                email: order.email,
                phone: order.phone,
                address: order.address,
                products: [],
                status: order.status,
                orderDate: order.orderDate,
                totalAmount: order.totalAmount,
                isMerchantOrder: order.isMerchantOrder || false
              };
            }
            groupedOrdersMap[order._id].products.push({
              product_name: order.book,
              product_quantity: order.quantity
            });
          });

          this.allOrders = Object.values(groupedOrdersMap).sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());
          this.updateOrdersPage();
        },
        error: (err) => {
          // Error handled silently
        }
      });
    });
  }

  toggleShowArchived(): void {
    this.showArchived = !this.showArchived;
    this.loadOrders();
  }

  archiveOrder(orderId: string): void {
    const action = () => {
      this.http.patch(`${environment.apiBaseUrl}/orders/update-status/${orderId}`, { status: 'مؤرشف' }).subscribe({
        next: () => {
          this.showSuccessModal('تم أرشفة الطلب بنجاح');
          this.loadOrders();
          this.loadNotifications();
          this.authService.user$.pipe(take(1)).subscribe(user => {
            if (user && user.id) {
              this.notificationService.refreshNotifications(user.id);
            }
          });
        },
        error: (err) => {
          this.showErrorModal('حدث خطأ أثناء أرشفة الطلب.');
        }
      });
    };

    this.openModal(
      'تأكيد الأرشفة',
      'هل أنت متأكد من أرشفة هذا الطلب؟',
      'warning',
      'أرشفة',
      'إلغاء',
      true,
      action
    );
  }

  updateOrdersPage(): void {
    let filteredOrders = this.allOrders;
    if (this.currentView === 'orders') {
      filteredOrders = this.allOrders.filter(order => !order.isMerchantOrder); // show only non-merchant orders
    } else if (this.currentView === 'merchantOrders') {
      filteredOrders = this.allOrders.filter(order => order.isMerchantOrder);
    }
    const start = (this.ordersPage - 1) * this.ordersPageSize;
    const end = this.ordersPage * this.ordersPageSize;
    this.orders = filteredOrders.slice(start, end);
  }

  nextOrdersPage(): void {
    if (this.ordersPage < this.totalOrdersPages()) {
      this.ordersPage++;
      this.updateOrdersPage();
      this.scrollToTop();
    }
  }

  prevOrdersPage(): void {
    if (this.ordersPage > 1) {
      this.ordersPage--;
      this.updateOrdersPage();
      this.scrollToTop();
    }
  }

  totalOrdersPages(): number {
    let filteredCount = this.allOrders.length;
    if (this.currentView === 'orders') {
      filteredCount = this.allOrders.filter(order => !order.isMerchantOrder).length; // count only non-merchant orders
    } else if (this.currentView === 'merchantOrders') {
      filteredCount = this.allOrders.filter(order => order.isMerchantOrder).length;
    }
    return Math.ceil(filteredCount / this.ordersPageSize);
  }

  fetchRequestedBooks(): void {
    this.http.get<RequestedBook[]>(`${environment.apiBaseUrl}/users/requested-books`).subscribe({
      next: (data) => {
        this.requestedBooks = data.slice((this.requestedBooksPage - 1) * this.requestedBooksPageSize, this.requestedBooksPage * this.requestedBooksPageSize);
      },
      error: (err) => {
        // Error handled silently
      }
    });
  }

  loadPrintOrders(): void {
    this.http.get<{ success: boolean; printOrders: PrintOrder[] }>(`${environment.apiBaseUrl}/print/all-print-orders`).subscribe({
      next: (response) => {
        if (response.success) {
          const allPrintOrders = response.printOrders;
          this.printOrders = allPrintOrders.slice((this.printOrdersPage - 1) * this.printOrdersPageSize, this.printOrdersPage * this.printOrdersPageSize);
        }
      },
      error: (err) => {
        // Error handled silently
      }
    });
  }

  getDownloadUrl(printOrder: PrintOrder): string {
    // Construct the download URL using userId, orderId, and fileIndex
    return `${environment.apiBaseUrl}/print/download-file/${printOrder.userId}/${printOrder.orderId}/${printOrder.fileIndex}`;
  }

  nextPrintOrdersPage(): void {
    this.printOrdersPage++;
    this.loadPrintOrders();
    this.scrollToTop();
  }

  prevPrintOrdersPage(): void {
    if (this.printOrdersPage > 1) {
      this.printOrdersPage--;
      this.loadPrintOrders();
    }
    this.scrollToTop();
  }

  nextRequestedBooksPage(): void {
    this.requestedBooksPage++;
    this.fetchRequestedBooks();
    this.scrollToTop();
  }

  prevRequestedBooksPage(): void {
    if (this.requestedBooksPage > 1) {
      this.requestedBooksPage--;
      this.fetchRequestedBooks();
    }
    this.scrollToTop();
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleAddedStatus(suggestion: RequestedBook): void {
    const newStatus = !suggestion.added;
    if (confirm(`هل أنت متأكد من تغيير حالة الاقتراح إلى ${newStatus ? 'تم إضافته' : 'لم يتم إضافته' }؟`)) {
      this.http.patch(`${environment.apiBaseUrl}/users/requested-books/${suggestion.userId}/${suggestion._id}`, { added: newStatus }).subscribe({
        next: (response) => {
          suggestion.added = newStatus;
          this.showSuccessModal('تم تحديث حالة الاقتراح بنجاح');
          this.authService.user$.pipe(take(1)).subscribe(user => {
            if (user && user.id) {
              this.notificationService.refreshNotifications(user.id);
            }
          });
                    const bookStatusMessage = newStatus ? `تم إضافة اقتراح الكتاب "${suggestion.bookName}"` : `تم إزالة اقتراح الكتاب "${suggestion.bookName}"`;
        },
        error: (error) => {
          this.showErrorModal('حدث خطأ أثناء تحديث حالة الاقتراح');
        }
      });
    }
  }

  deleteRequestedBook(suggestionId: string, userId: string): void {
    this.deleteRequestedBookWithModal(suggestionId, userId);
  }

  confirmShipmentWithModal(orderId: string, newStatus: string): void {
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

    const action = () => {
      this.http.patch(`${environment.apiBaseUrl}/orders/update-status/${orderId}`, { status: newStatus }).subscribe({
        next: () => {
          this.showSuccessModal(successMessage);
          this.loadOrders();
          this.loadNotifications();
          this.authService.user$.pipe(take(1)).subscribe(user => {
            if (user && user.id) {
              this.notificationService.refreshNotifications(user.id);
            }
          });
           const statusVerbMap: { [key: string]: string } = {
            'تم الشحن': 'شحن',
            'تم الاستلام': 'استلام',
            'تم التسليم': 'تسليم',
            'تم الإلغاء': 'إلغاء'
          };
          const verb = statusVerbMap[newStatus] || 'تحديث';
        },
        error: (err) => {
          this.showErrorModal('حدث خطأ أثناء تحديث حالة الطلب.');
        }
      });
    };

    this.openModal(
      'تأكيد تحديث الحالة',
      confirmMessage,
      'warning',
      'تأكيد',
      'إلغاء',
      true,
      action
    );
  }

  confirmShipment(orderId: string, newStatus: string): void {
    this.confirmShipmentWithModal(orderId, newStatus);
  }



  deleteOrder(orderId: string): void {
    this.deleteOrderWithModal(orderId);
  }

  deletePrintOrder(userId: string, orderId: string): void {
    if (confirm('هل أنت متأكد من حذف طلب الطباعة؟')) {
      this.http.delete(`${this.backendBaseUrl}/print/delete-print-order/${userId}/${orderId}`).subscribe({
        next: () => {
          this.showSuccessModal('تم حذف طلب الطباعة بنجاح');
          this.loadPrintOrders();
        },
        error: (err) => {
          this.showErrorModal('حدث خطأ أثناء حذف طلب الطباعة');
        }
      });
    }
  }

  onFileSelected(event: Event): void {
    this.imageError = null;
    const input = event.target as HTMLInputElement | null;
    if (input && input.files && input.files.length > 0) {
      const file = input.files[0];
      const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
      if (!validImageTypes.includes(file.type)) {
        this.imageError = 'يرجى تحميل ملف صورة صالح (JPEG, PNG, GIF, WEBP, BMP, SVG).';
        this.selectedFile = null;
      } else if (file.size > this.MAX_IMAGE_SIZE_BYTES) {
        this.imageError = `حجم الصورة أكبر من 1 ميجابايت. يرجى تحميل صورة أصغر.`;
        this.selectedFile = null;
      } else {
        this.selectedFile = file;
      }
    } else {
      this.selectedFile = null;
    }
  }

  submitAddProduct(): void {
    // Prevent multiple simultaneous submissions
    if (this.uploading) {
      return;
    }

    this.imageError = null;
    if (!this.selectedFile) {
      this.imageError = 'يرجى اختيار صورة المنتج.';
      return;
    }

    // Additional validation for required fields
    if (
      !this.product.product_name ||
      !this.product.product_quantity ||
      !this.product.product_category ||
      !this.product.product_description ||
      this.product.product_price === null ||
      this.product.price_cost === null
    ) {
      this.showErrorModal('يرجى ملء جميع الحقول المطلوبة بشكل صحيح.');
      return;
    }

    // Convert full category name to short key before sending
    const shortCategory = this.categoryReverseMap[this.product.product_category] || this.product.product_category;

    const formData = new FormData();
    formData.append('image', this.selectedFile);
    formData.append('product_name', this.product.product_name);
    formData.append('product_quantity', this.product.product_quantity.toString());
    formData.append('product_category', shortCategory);
    formData.append('product_description', this.product.product_description);
    formData.append('product_price', this.product.product_price.toString());
    formData.append('price_cost', this.product.price_cost.toString());

    this.uploading = true;
    this.uploadProgress = 0;
    this.uploadSuccess = false;

    this.http.request('POST', `${this.backendBaseUrl}/admin/add-product`, {
      body: formData,
      reportProgress: true,
      observe: 'events'
    }).subscribe({
      next: (event) => {
        if (event.type === 1 && event.total) { // HttpEventType.UploadProgress
          this.uploadProgress = Math.round((event.loaded / event.total) * 100);
        } else if (event.type === 4) { // HttpEventType.Response
          this.uploadSuccess = true;
          this.uploading = false;

          // Store the current product data for potential reuse
          const currentProductData = { ...this.product };
          const currentFile = this.selectedFile;

          // Reset form immediately to prevent duplicate submissions
          this.resetProductForm();

          // Show success modal with options
          this.showProductAddedModal(currentProductData, currentFile);

          // Auto-hide success modal after 3 seconds
          setTimeout(() => {
            this.uploadSuccess = false;
          }, 3000);
        }
      },
      error: (error) => {
        this.uploading = false;
        this.uploadProgress = 0;
        this.uploadSuccess = false;
        this.showErrorModal('حدث خطأ أثناء إضافة المنتج.');
      }
    });
  }

  private resetProductForm(): void {
    this.product = {
      product_name: '',
      product_quantity: 1,
      product_category: '',
      product_description: '',
      product_price: 0,
      price_cost: 0
    };
    this.selectedFile = null;
    this.imageError = null;
  }

  // Modal methods
  openModal(title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info', confirmText: string = 'تأكيد', cancelText: string = 'إلغاء', showCancel: boolean = true, action?: () => void): void {
    this.modalTitle = title;
    this.modalMessage = message;
    this.modalType = type;
    this.modalConfirmText = confirmText;
    this.modalCancelText = cancelText;
    this.modalShowCancel = showCancel;
    this.pendingAction = action || null;
    this.modalOpen = true;
  }

  closeModal(): void {
    this.modalOpen = false;
    this.modalTitle = '';
    this.modalMessage = '';
    this.modalType = 'info';
    this.modalConfirmText = 'تأكيد';
    this.modalCancelText = 'إلغاء';
    this.modalShowCancel = true;
    this.pendingAction = null;
  }

  confirmModal(): void {
    if (this.pendingAction) {
      this.pendingAction();
    }
    this.closeModal();
  }

  // Modal service methods (separate from component modal)
  confirmModalService(): void {
    if (this.modalServiceAction) {
      this.modalServiceAction();
    }
    this.closeModalService();
  }

  closeModalService(): void {
    this.modalServiceOpen = false;
    this.modalServiceTitle = '';
    this.modalServiceMessage = '';
    this.modalServiceType = 'info';
    this.modalServiceConfirmText = 'تأكيد';
    this.modalServiceCancelText = 'إلغاء';
    this.modalServiceShowCancel = true;
    this.modalServiceAction = null;
  }

  // Enhanced delete methods using modal
  deleteProductWithModal(product: Product): void {
    const action = () => {
      this.http.delete(`${this.backendBaseUrl}/admin/products/${product.products_id}`).subscribe({
        next: () => {
          this.showSuccessModal('تم حذف المنتج بنجاح');
          this.loadProducts();
        },
        error: (err) => {
          let errorMessage = 'حدث خطأ أثناء حذف المنتج';

          if (err.status === 404) {
            errorMessage = 'المنتج غير موجود أو تم حذفه مسبقاً.';
          } else if (err.status === 401) {
            errorMessage = 'غير مصرح لك بالحذف. يرجى تسجيل الدخول كمدير.';
          } else if (err.status === 500) {
            errorMessage = 'خطأ في الخادم. يرجى المحاولة لاحقاً.';
          }

          this.showErrorModal(errorMessage);
        }
      });
    };

    this.openModal(
      'تأكيد الحذف',
      'هل أنت متأكد من حذف هذا المنتج نهائياً؟ سيتم حذف الصورة أيضاً.',
      'warning',
      'حذف',
      'إلغاء',
      true,
      action
    );
  }

  bulkDeleteSelectedProductsWithModal(): void {
    const selectedIds = Array.from(this.selectedProducts);
    if (selectedIds.length === 0) {
      this.showErrorModal('يرجى اختيار منتجات لحذفها');
      return;
    }

    const action = () => {
      this.http.delete(`${this.backendBaseUrl}/admin/products`, { body: { barcodes: selectedIds } }).subscribe({
        next: () => {
          this.showSuccessModal('تم حذف المنتجات المحددة بنجاح');
          this.selectedProducts.clear();
          this.loadProducts();
        },
        error: (err) => {
          this.showErrorModal('حدث خطأ أثناء حذف المنتجات');
        }
      });
    };

    this.openModal(
      'تأكيد الحذف الجماعي',
      `هل أنت متأكد من حذف ${selectedIds.length} منتج نهائياً؟ سيتم حذف الصور أيضاً.`,
      'warning',
      'حذف الكل',
      'إلغاء',
      true,
      action
    );
  }

  // Order multi-select methods
  toggleOrderSelection(orderId: string): void {
    if (this.selectedOrders.has(orderId)) {
      this.selectedOrders.delete(orderId);
    } else {
      this.selectedOrders.add(orderId);
    }
  }

  isOrderSelected(orderId: string): boolean {
    return this.selectedOrders.has(orderId);
  }

  selectAllOrders(): void {
    if (this.isAllOrdersSelected()) {
      this.selectedOrders.clear();
    } else {
      this.orders.forEach(order => {
        this.selectedOrders.add(order._id);
      });
    }
  }

  isAllOrdersSelected(): boolean {
    return this.orders.length > 0 && this.orders.every(order => this.selectedOrders.has(order._id));
  }

  isSomeOrdersSelected(): boolean {
    return this.selectedOrders.size > 0 && this.selectedOrders.size < this.orders.length;
  }

  bulkUpdateOrderStatus(newStatus: string): void {
    const selectedIds = Array.from(this.selectedOrders);
    if (selectedIds.length === 0) {
      this.showErrorModal('يرجى اختيار طلبات لتحديثها');
      return;
    }

    let confirmMessage = '';
    let successMessage = '';

    switch (newStatus) {
      case 'تم الشحن':
        confirmMessage = `هل أنت متأكد من شحن ${selectedIds.length} طلب؟`;
        successMessage = 'تم تحديث حالة الطلبات المحددة إلى تم الشحن.';
        break;
      case 'تم الإلغاء':
        confirmMessage = `هل أنت متأكد من إلغاء ${selectedIds.length} طلب؟`;
        successMessage = 'تم إلغاء الطلبات المحددة.';
        break;
      default:
        confirmMessage = `هل أنت متأكد من تحديث حالة ${selectedIds.length} طلب إلى ${newStatus}؟`;
        successMessage = `تم تحديث حالة الطلبات المحددة إلى ${newStatus}.`;
    }

    const action = () => {
      // Update each order individually since backend might not support bulk update
      let completed = 0;
      selectedIds.forEach(orderId => {
        this.http.patch(`${environment.apiBaseUrl}/orders/update-status/${orderId}`, { status: newStatus }).subscribe({
          next: () => {
            completed++;
            if (completed === selectedIds.length) {
              this.showSuccessModal(successMessage);
              this.selectedOrders.clear();
              this.loadOrders();
              this.loadNotifications();
              this.authService.user$.pipe(take(1)).subscribe(user => {
                if (user && user.id) {
                  this.notificationService.refreshNotifications(user.id);
                }
              });
            }
          },
          error: (err) => {
            this.showErrorModal('حدث خطأ أثناء تحديث حالة الطلبات.');
          }
        });
      });
    };

    this.openModal(
      'تأكيد تحديث الحالة الجماعي',
      confirmMessage,
      'warning',
      'تأكيد',
      'إلغاء',
      true,
      action
    );
  }

  bulkDeleteSelectedOrders(): void {
    const selectedIds = Array.from(this.selectedOrders);
    if (selectedIds.length === 0) {
      this.showErrorModal('يرجى اختيار طلبات لحذفها');
      return;
    }

    const action = () => {
      // Call backend bulk delete endpoint with all selected order IDs
      this.http.delete(`${environment.apiBaseUrl}/orders/bulk-delete`, { body: { orderIds: selectedIds } }).subscribe({
        next: () => {
          this.showSuccessModal('تم حذف الطلبات المحددة بنجاح');
          this.selectedOrders.clear();
          this.loadOrders();
          this.loadNotifications();
          this.authService.user$.pipe(take(1)).subscribe(user => {
            if (user && user.id) {
              this.notificationService.refreshNotifications(user.id);
              this.dataService.loadOrders(user.id).subscribe();
            }
          });
        },
        error: (err) => {
          this.showErrorModal('حدث خطأ أثناء حذف الطلبات.');
        }
      });
    };

    this.openModal(
      'تأكيد الحذف الجماعي',
      `هل أنت متأكد من حذف ${selectedIds.length} طلب نهائياً؟`,
      'warning',
      'حذف الكل',
      'إلغاء',
      true,
      action
    );
  }

  deleteOrderWithModal(orderId: string): void {
    const action = () => {
      this.http.delete(`${environment.apiBaseUrl}/orders/delete/${orderId}`).subscribe({
        next: () => {
          this.showSuccessModal('تم حذف الطلب بنجاح');
          this.loadOrders();
          this.loadNotifications();
          this.authService.user$.pipe(take(1)).subscribe(user => {
            if (user && user.id) {
              this.notificationService.refreshNotifications(user.id);
            }
          });
          this.authService.user$.pipe(take(1)).subscribe(user => {
            if (user && user.id) {
              this.dataService.loadOrders(user.id).subscribe();
            }
          });
        },
        error: (err) => {
          this.showErrorModal('حدث خطأ أثناء حذف الطلب.');
        }
      });
    };

    this.openModal(
      'تأكيد الحذف',
      'هل أنت متأكد أنك تريد حذف هذا الطلب؟',
      'warning',
      'حذف',
      'إلغاء',
      true,
      action
    );
  }

  deletePrintOrderWithModal(userId: string, orderId: string): void {
    const action = () => {
      this.http.delete(`${this.backendBaseUrl}/print/delete-print-order/${userId}/${orderId}`).subscribe({
        next: () => {
          this.showSuccessModal('تم حذف طلب الطباعة بنجاح');
          this.loadPrintOrders();
        },
        error: (err) => {
          this.showErrorModal('حدث خطأ أثناء حذف طلب الطباعة');
        }
      });
    };

    this.openModal(
      'تأكيد الحذف',
      'هل أنت متأكد من حذف طلب الطباعة؟',
      'warning',
      'حذف',
      'إلغاء',
      true,
      action
    );
  }

  deleteRequestedBookWithModal(suggestionId: string, userId: string): void {
    const action = () => {
      this.http.delete(`${environment.apiBaseUrl}/users/requested-books/${userId}/${suggestionId}`).subscribe({
        next: () => {
          this.showSuccessModal('تم حذف الاقتراح بنجاح');
          this.fetchRequestedBooks();
          this.authService.user$.pipe(take(1)).subscribe(user => {
            if (user && user.id) {
              this.notificationService.refreshNotifications(user.id);
            }
          });
        },
        error: (err) => {
          this.showErrorModal('حدث خطأ أثناء حذف الاقتراح');
        }
      });
    };

    this.openModal(
      'تأكيد الحذف',
      'هل أنت متأكد من حذف هذا الاقتراح نهائياً؟',
      'warning',
      'حذف',
      'إلغاء',
      true,
      action
    );
  }

  // Helper methods for showing different modal types
  showSuccessModal(message: string): void {
    this.openModal('نجح العملية', message, 'success', 'موافق', '', false);
  }

  showErrorModal(message: string): void {
    this.openModal('خطأ', message, 'error', 'موافق', '', false);
  }

  showInfoModal(title: string, message: string): void {
    this.openModal(title, message, 'info', 'موافق', '', false);
  }

  showWarningModal(title: string, message: string, action?: () => void): void {
    this.openModal(title, message, 'warning', 'تأكيد', 'إلغاء', true, action || undefined);
  }

  showProductAddedModal(productData: any, file: File | null): void {
    // Prevent multiple modals from opening
    if (this.modalOpen) {
      return;
    }

    const action = () => {
      // Reset form and stay on add product page
      this.product = { ...productData };
      this.selectedFile = file;
      this.switchView('addProduct');
      this.closeModal();
    };

    const goToDashboardAction = () => {
      // Reset form and go to dashboard
      this.product = {
        product_name: '',
        product_quantity: 1,
        product_category: '',
        product_description: '',
        product_price: 0,
        price_cost: 0
      };
      this.selectedFile = null;
      this.imageError = null;
      this.switchView('orders');
      this.closeModal();
    };

    // Show the selection modal immediately without the blocking success modal
    this.modalService.openModal({
      title: 'تم إضافة المنتج بنجاح',
      message: 'تم إضافة المنتج بنجاح! ماذا تريد أن تفعل؟',
      type: 'success',
      confirmText: 'إضافة منتج جديد بنفس البيانات',
      cancelText: 'الذهاب إلى لوحة التحكم',
      showCancel: true,
      action: action
    });

    // Store the dashboard action for the cancel button
    this.pendingAction = goToDashboardAction;
  }
}
