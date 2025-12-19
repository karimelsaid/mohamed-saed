import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { AuthService } from '../../auth/auth.service';
import { Router, RouterModule } from '@angular/router';
import { DataService } from '../../services/data.service';
import { take, finalize, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { NotificationService } from '../../services/notification.service';
import { ModalDialogComponent } from '../../shared/modal-dialog/modal-dialog.component';
import { ModalService } from '../../services/modal.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MerchantManagementComponent } from '../merchant-management/merchant-management.component';
import { ProductApprovalComponent } from '../product-approval/product-approval.component';
import * as XLSX from 'xlsx';
import { FreeShippingRulesComponent } from './free-shipping/free-shipping-rules.component';
import { Subscription } from 'rxjs';
import { FaIconLibrary, FontAwesomeModule, FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faShoppingCart, faStore, faBook, faPrint, faPlus, faEdit, faTruck, faUsers, faCheckCircle, faMoneyBillWave, faSitemap, faPlusCircle, faImage, faTag, faHashtag, faList, faDollarSign, faAlignLeft, faExclamationTriangle, faCartPlus, faHeart, faMobileAlt, faCamera, faTimes, faHome, faChartLine, faCog, faBars, faUserClock, faCoins, faUserPlus, faChartBar, faBell, faSearch, faSlidersH } from '@fortawesome/free-solid-svg-icons';
// PaymentRequestsComponent removed
import { UserHierarchyComponent } from '../user-hierarchy/user-hierarchy.component';
import { AmazonPriceCalculatorComponent } from '../amazon-price-calculator/amazon-price-calculator.component';
import { AdminEbooksComponent } from '../admin-ebooks/admin-ebooks.component';
import { AdminNotificationsComponent } from '../admin-notifications/admin-notifications.component';

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
  image_path?: string;
  promotionEndDate?: string;
  product_price_before_discount?: number;
  product_discount_percent?: number;
  createdAt?: string; // Added creation date for sorting by recently added
  editMode?: boolean; // For toggling edit mode on product cards
  detailsOpen?: boolean; // For toggling details visibility on product cards
  isSaving?: boolean; // To show saving progress
  fileOrder?: number; // Added to track order in file for sorting
  merchantName?: string; // Added for merchant products
  [key: string]: any; // Allow any string as a key
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
  address: string; // Keep for backward compatibility if needed
  shippingAddress?: {
    deliveryType: 'pickup' | 'postOffice' | 'delivery';
    pickupLocation?: string;
    governorate?: string;
    city?: string;
    village?: string;
    name?: string;
    address?: string; // For post office address
  };
  status: string;
  orderDate: string;
  totalAmount: number;
  printProjects: {
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
  }[];
}

interface UrgencyRequest {
  _id: string;
  bookId: string;
  bookName: string;
  merchantId: string | null;
  merchantName: string | null;
  userId: string;
  username: string;
  requestedAt: string;
  fulfilled?: boolean;
}

interface UserInsight {
  user: any;
  score: number;
  readingTimeAvg: string;
  currentStreak: number;
  bestStreak: number;
  conversionProbability: 'High' | 'Medium' | 'Low';
  topInterests: string[];
}

interface SystemSettings {
  gamification: {
    loginPoints: number;
    readingPointsPerMinute: number;
    referralPoints: number;
    streakBonus7Days: number;
    streakBonus30Days: number;
    reviewPoints: number;
  };
  economy: {
    coinExchangeRate: number;
    minimumWithdrawal: number;
  };
  maintenanceMode: boolean;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    FontAwesomeModule,
    ModalDialogComponent,
    FreeShippingRulesComponent,
    MerchantManagementComponent,
    ProductApprovalComponent,
    // PaymentRequestsComponent removed
    UserHierarchyComponent,
    AmazonPriceCalculatorComponent,
    AdminEbooksComponent,
    AdminNotificationsComponent
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  orders: GroupedOrder[] = [];
  allOrders: GroupedOrder[] = [];
  requestedBooks: RequestedBook[] = [];
  allRequestedBooks: RequestedBook[] = [];
  isAdmin: boolean = false; // Add paymentRequests to the type union
  showSidebar: boolean = true;
  currentView: 'dashboard' | 'userIntelligence' | 'orders' | 'requestedBooks' | 'printOrders' | 'addProduct' | 'products' | 'newPage' | 'freeShippingRules' | 'merchants' | 'productApproval' | 'merchantOrders' | 'paymentRequests' | 'userHierarchy' | 'urgencyRequests' | 'amazonCalculator' | 'ebooks' | 'mobileVersion' | 'gamificationControl' | 'notifications' = 'dashboard';

  // Gamification Control Properties
  systemSettings: SystemSettings = {
    gamification: {
      loginPoints: 10,
      readingPointsPerMinute: 1,
      referralPoints: 50,
      streakBonus7Days: 100,
      streakBonus30Days: 500,
      reviewPoints: 20
    },
    economy: {
      coinExchangeRate: 50,
      minimumWithdrawal: 500
    },
    maintenanceMode: false
  };
  isSavingSettings: boolean = false;
  originalSettings: SystemSettings | null = null;

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
  allPrintOrders: PrintOrder[] = [];

  // Pagination state for urgencyRequests
  urgencyRequestsPage: number = 1;
  urgencyRequestsPageSize: number = 10;

  urgencyRequests: UrgencyRequest[] = [];
  allUrgencyRequests: UrgencyRequest[] = [];

  allProducts: Product[] = [];
  originalProducts: Product[] = [];
  products: Product[] = [];
  productsPage: number = 1;
  productsPageSize: number = 50;
  searchTerm: string = '';

  // New properties for sorting
  sortField: keyof Product | '' = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Ebook filter property
  ebookFilter: 'all' | 'withEbook' | 'withoutEbook' = 'all';

  // Multi-select properties
  selectedProducts: Set<string> = new Set();
  selectedOrders: Set<string> = new Set();
  selectedPrintOrders: Set<string> = new Set();

  // Stats properties
  totalOrders: number = 0;
  totalMerchantOrders: number = 0;
  totalProducts: number = 0;
  totalLikes: number = 0;
  totalCartItems: number = 0;
  totalUsers: number = 0;
  totalRequestedBooks: number = 0;
  totalPrintOrders: number = 0;
  totalUrgencyRequests: number = 0;
  totalCoins: number = 0;
  totalReferrals: number = 0;

  // Smart Dashboard Stats (Phase 1)
  activeUsersNow: number = 0;
  todayReaders: number = 0;
  todayCoins: number = 0;
  todayReferrals: number = 0;

  // Smart Alerts
  lowReadingAlert: boolean = false;
  activeChallengeAlert: boolean = true; // Mocked for now

  // Filter properties for products
  filterOptions: string[] = [];
  currentFilter: string = 'جميع الفئات';

  // Icons
  faShoppingCart = faShoppingCart;
  faStore = faStore;
  faBook = faBook;
  faPrint = faPrint;
  faPlus = faPlus;
  faEdit = faEdit;
  faTruck = faTruck;
  faUsers = faUsers;
  faCheckCircle = faCheckCircle;
  faMoneyBillWave = faMoneyBillWave;
  faSitemap = faSitemap;
  faCamera = faCamera;
  faTimes = faTimes;
  faUserClock = faUserClock;
  faCoins = faCoins;
  faUserPlus = faUserPlus;
  faChartBar = faChartBar;
  faBell = faBell;
  faSearch = faSearch; // Ensure faSearch is imported or added to library

  // User Intelligence Phase 2
  usersList: any[] = [];
  selectedUserInsight: UserInsight | null = null;
  showUserAnalysisModal: boolean = false;
  userSearchTerm: string = '';
  filteredUsersList: any[] = [];

  @ViewChild('videoElement') videoElement!: ElementRef;
  @ViewChild('canvasElement') canvasElement!: ElementRef;

  showCameraModal: boolean = false;
  cameraStream: MediaStream | null = null;


  showArchived: boolean = false;

  backendBaseUrl: string = environment.apiBaseUrl;
  uploadsBaseUrl: string = environment.uploadsBaseUrl;

  selectedEpubFile: File | null = null;

  product: any = {
    product_category: '',
    product_quantity: 1,
    product_name: '',
    product_description: '',
    product_price: 0,
    price_cost: 0,
    author: '',
    publisher: '',
    pages: '',
    coverType: '',
    language: '',
    publishYear: '',
    stationeryType: '',
    material: '',
    color: '',
    size: '',
    brand: '',
    electronicsType: '',
    model: '',
    specs: '',
    warranty: '',
    clothingType: '',
    season: '',
    originCountry: '',
    cosmeticsType: '',
    sizeWeight: '',
    ingredients: '',
    suitableFor: '',
    shoeType: '',
    furnitureType: '',
    height: '',
    deliveryMethod: '',
    toyType: '',
    ageGroup: '',
    safety: '',
    fabricType: '',
    width: '',
    length: '',
    usage: '',
    suggestedCategory: ''
  };
  selectedFiles: File[] = [];
  selectedFilesPreviews: string[] = [];
  mainImageIndex: number = 0;
  imageError: string | null = null;

  imageUrl: string = '';
  imageUrls: string[] = [];



  uploading: boolean = false;
  uploadProgress: number = 0;
  uploadSuccess: boolean = false;

  readonly MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB

  isDragOver: boolean = false;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    const items = event.dataTransfer?.items;

    if (files && files.length > 0) {
      // Handle dropped files
      const validFiles = Array.from(files).filter(file => {
        const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
        return validImageTypes.includes(file.type) && file.size <= this.MAX_IMAGE_SIZE_BYTES;
      });

      if (validFiles.length > 0) {
        if (validFiles.length + this.selectedFiles.length > 3) {
          this.imageError = 'يمكنك تحميل حتى 3 صور فقط.';
          return;
        }
        this.selectedFiles.push(...validFiles);
        this.generatePreviews(validFiles);
      }
    } else if (items) {
      // Handle dropped URLs from browser tabs
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'string' && item.type === 'text/uri-list') {
          item.getAsString((url) => {
            this.addImageFromUrlDirect(url);
          });
        }
      }
    }
  }

  addImageFromUrlDirect(url: string): void {
    if (this.imageUrls.length >= 3) {
      this.imageError = 'يمكنك إضافة حتى 3 روابط صور فقط.';
      return;
    }

    try {
      new URL(url);
      if (!this.imageUrls.includes(url)) {
        this.imageUrls.push(url);
      }
    } catch (error) {
      // Invalid URL, ignore
    }
  }

  addImageFromUrl(): void {
    if (this.imageUrls.length >= 3) {
      this.imageError = 'يمكنك إضافة حتى 3 روابط صور فقط.';
      return;
    }

    if (!this.imageUrl) {
      this.imageError = 'يرجى إدخال رابط صورة صالح.';
      return;
    }

    try {
      new URL(this.imageUrl);
      if (!this.imageUrls.includes(this.imageUrl)) {
        this.imageUrls.push(this.imageUrl);
        this.imageUrl = ''; // Clear the input
      } else {
        this.imageError = 'هذا الرابط موجود بالفعل.';
      }
    } catch (error) {
      this.imageError = 'رابط الصورة غير صالح.';
    }
  }

  // --- Camera Logic ---
  currentFacingMode: 'user' | 'environment' = 'environment';

  async openCamera() {
    console.log('📸 Admin: Opening camera request...');
    this.showCameraModal = true;
    this.cdr.detectChanges(); // Force update to ensure modal exists in DOM

    // 1. Check support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('نأسف، المتصفح لا يدعم تشغيل الكاميرا.');
      this.showCameraModal = false;
      return;
    }

    try {
      console.log('📸 Admin: Requesting media stream with mode:', this.currentFacingMode);

      // Stop previous stream if any
      if (this.cameraStream) {
        this.cameraStream.getTracks().forEach(track => track.stop());
        this.cameraStream = null;
      }

      // 2. Request stream with specific facing mode
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.currentFacingMode }
      });

      // CRITICAL FIX: Check if modal was closed while waiting for stream
      if (!this.showCameraModal) {
        console.log('📸 Admin: Modal closed during initialization, stopping stream.');
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      this.cameraStream = stream;
      console.log('📸 Admin: Stream obtained:', this.cameraStream);

      // 3. Attach stream
      setTimeout(() => {
        let videoEl: HTMLVideoElement | null = null;
        if (this.videoElement && this.videoElement.nativeElement) {
          videoEl = this.videoElement.nativeElement;
        } else {
          videoEl = document.getElementById('adminCameraVideo') as HTMLVideoElement;
        }

        if (videoEl) {
          console.log('📸 Admin: Assigning stream to video element');
          videoEl.srcObject = this.cameraStream;
          videoEl.muted = true;
          // Visual feedback: Mirror if user/front camera
          videoEl.style.transform = this.currentFacingMode === 'user' ? 'scaleX(-1)' : 'none';

          videoEl.play().catch((e: any) => console.error('📸 Admin: Play error', e));
        } else {
          console.error('📸 Admin: Video element NOT found in DOM!');
        }
      }, 300);

    } catch (err: any) {
      console.error('❌ Error accessing camera:', err);
      // Explicit alert for the user
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('تم رفض إذن الوصول للكاميرا.');
      } else {
        alert('تعذر فتح الكاميرا: ' + (err.message || err));
      }
      this.showCameraModal = false;
      this.cdr.detectChanges();
    }
  }

  switchCamera() {
    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    this.openCamera();
  }

  closeCamera() {
    this.showCameraModal = false;
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
  }

  captureImage() {
    if (this.videoElement && this.canvasElement) {
      const video = this.videoElement.nativeElement;
      const canvas = this.canvasElement.nativeElement;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob: Blob) => {
        if (blob) {
          if (this.selectedFiles.length + this.imageUrls.length >= 3) {
            this.modalService.showWarning(
              'تنبيه',
              'لا يمكن إضافة المزيد من الصور (الحد الأقصى 3)'
            );
            this.closeCamera();
            return;
          }

          const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
          this.selectedFiles.push(file);
          this.generatePreviews([file]);
          this.closeCamera();
        }
      }, 'image/jpeg');
    }
  }



  // Modal properties for component's modal system
  modalOpen: boolean = false;
  modalTitle: string = '';
  modalMessage: string = '';
  modalType: 'info' | 'warning' | 'error' | 'success' = 'info';
  modalConfirmText: string = 'تأكيد';
  modalCancelText: string = 'إلغاء';
  modalShowCancel: boolean = true;
  pendingAction: (() => void) | null = null;

  // Progress modal properties
  progressModalOpen: boolean = false;
  progressModalMessage: string = 'جاري الحفظ...';

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
    'تربية وأطفال',
    'أدوات مكتبية',
    'إلكترونيات',
    'ملابس',
    'التجميل والعناية الشخصية',
    'الأحذية',
    'أثاث وديكور المنزل',
    'هدية وألعاب',
    'أقمشة',
    'غير مصنف'
  ];

  mainCategories: string[] = [
    'كتب',
    'أدوات مكتبية',
    'إلكترونيات',
    'ملابس',
    'التجميل والعناية الشخصية',
    'الأحذية',
    'أثاث وديكور المنزل',
    'هدية وألعاب',
    'أقمشة',
    'غير مصنف'
  ];

  bookSubCategories: string[] = [
    'روايات وقصص',
    'تطوير الذات وعلم النفس',
    'كتب دينية',
    'قواميس ومراجع',
    'صحة وطب وعلوم',
    'أعمال وتسويق ومالية',
    'فنون وحرف',
    'تاريخ وسير ذاتية',
    'تربية وأطفال',
  ];

  selectedMainCategory: string = '';
  // Map from short key to full category name
  categoryMap: { [key: string]: string } = {
    'رواية': 'روايات وقصص',
    'تنمية': 'تطوير الذات وعلم النفس',
    'ديني': 'كتب دينية',
    'قاموس': 'قواميس ومراجع',
    'صحة': 'صحة وطب وعلوم',
    'اعمال': 'أعمال وتسويق ومالية',
    'فن': 'فنون وحرف',
    'تاريخ': 'تاريخ وسير ذاتية',
    'تربية': 'تربية وأطفال',
    'أدوات مكتبية': 'أدوات مكتبية',
    'إلكترونيات': 'إلكترونيات',
    'ملابس': 'ملابس',
    'تجميل': 'التجميل والعناية الشخصية',
    'احذية': 'الأحذية',
    'اثاث': 'أثاث وديكور المنزل',
    'العاب': 'هدية وألعاب',
    'غير مصنف': 'غير مصنف',
    'أقمشة': 'أقمشة',
    'أخرى': 'غير مصنف'
  };

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
    'تربية وأطفال': 'تربية',
    'أدوات مكتبية': 'أدوات مكتبية',
    'إلكترونيات': 'إلكترونيات',
    'ملابس': 'ملابس',
    'التجميل والعناية الشخصية': 'تجميل',
    'الأحذية': 'احذية',
    'أثاث وديكور المنزل': 'اثاث',
    'هدية وألعاب': 'العاب',
    'أقمشة': 'أقمشة',
    'غير مصنف': 'غير مصنف'
  };

  // Map from category to specific fields
  categoryFieldsMap: { [key: string]: string[] } = {
    'روايات وقصص': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
    'تطوير الذات وعلم النفس': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
    'كتب دينية': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
    'قواميس ومراجع': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
    'صحة وطب وعلوم': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
    'أعمال وتسويق ومالية': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
    'فنون وحرف': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
    'تاريخ وسير ذاتية': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
    'تربية وأطفال': ['author', 'publisher', 'pages', 'coverType', 'language', 'publishYear'],
    'أدوات مكتبية': ['stationeryType', 'material', 'color', 'size', 'brand'],
    'إلكترونيات': ['electronicsType', 'model', 'specs', 'warranty'],
    'ملابس': ['clothingType', 'season', 'originCountry'],
    'التجميل والعناية الشخصية': ['cosmeticsType', 'sizeWeight', 'ingredients', 'suitableFor'],
    'الأحذية': ['shoeType'],
    'أثاث وديكور المنزل': ['furnitureType', 'length', 'width', 'height', 'deliveryMethod'],
    'هدية وألعاب': ['toyType', 'ageGroup', 'safety'],
    'أقمشة': ['fabricType', 'width', 'length', 'usage'],
    'غير مصنف': ['suggestedCategory']
  };

  isBookCategory(category: string): boolean {
    if (!category) return false;
    const lowerCategory = category.toLowerCase();
    // Check for explicit 'Books' or 'كتب' or common book categories
    if (lowerCategory === 'كتب' || lowerCategory === 'books' ||
      // Explicit user-specified categories
      category === 'روايات وقصص' ||
      category === 'تطوير الذات وعلم النفس' ||
      category === 'كتب دينية' ||
      category === 'قواميس ومراجع' ||
      category === 'صحة وطب وعلوم' ||
      category === 'أعمال وتسويق ومالية' ||
      category === 'فنون وحرف' ||
      category === 'تاريخ وسير ذاتية' ||
      category === 'تربية وأطفال' ||
      // Common keywords
      lowerCategory.includes('رواية') || lowerCategory.includes('قصص') ||
      lowerCategory.includes('novel') || lowerCategory.includes('story') ||
      lowerCategory.includes('ديني') || lowerCategory.includes('تطوير') ||
      lowerCategory.includes('نفس') || lowerCategory.includes('أعمال') ||
      lowerCategory.includes('تسويق') || lowerCategory.includes('صحة') ||
      lowerCategory.includes('طب') || lowerCategory.includes('قاموس') ||
      lowerCategory.includes('مراجع') || lowerCategory.includes('تربية') ||
      lowerCategory.includes('أطفال') || lowerCategory.includes('تاريخ') ||
      lowerCategory.includes('سير') || lowerCategory.includes('فنون') ||
      lowerCategory.includes('حرف')) {
      return true;
    }

    const fullCategory = this.categoryMap[category] || category;
    const fields = this.categoryFieldsMap[fullCategory];
    return fields ? fields.includes('author') : false;
  }

  private modalServiceSubscription?: Subscription;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private dataService: DataService,
    private notificationService: NotificationService,
    private modalService: ModalService,
    private cdr: ChangeDetectorRef,
    library: FaIconLibrary
  ) {
    library.addIcons(
      faShoppingCart, faStore, faBook, faPrint, faPlus, faEdit, faTruck, faUsers, faCheckCircle, faMoneyBillWave, faSitemap, faPlusCircle, faImage, faTag, faHashtag, faList, faDollarSign, faAlignLeft, faExclamationTriangle, faCartPlus, faHeart, faMobileAlt, faCamera, faTimes, faHome, faChartLine, faCog, faBars, faUserClock, faCoins, faUserPlus, faChartBar, faBell, faSearch, faSlidersH
    );
  }

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      if (user && user.email === 'admin@example.com' && user.role === 'admin') {
        this.isAdmin = true;
        this.loadOrders();
        this.loadPromotionDates();
        this.loadNotifications();
        this.loadStats();
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

    // Initialize filter options
    this.filterOptions = ['جميع الفئات', ...this.categories];

    // Initialize Mobile Version Data (Default structure)
    this.mobileVersionConfig = {
      android: { minBuildNumber: 0, storeUrl: '', forceUpdate: false },
      ios: { minBuildNumber: 0, storeUrl: '', forceUpdate: false }
    };
  }

  ngOnDestroy(): void {
    if (this.modalServiceSubscription) {
      this.modalServiceSubscription.unsubscribe();
    }
  }

  toggleSelectAll(event: Event): void { // Add paymentRequests to the type union
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.products.forEach(product => this.selectedProducts.add(product.products_id));
    } else {
      this.selectedProducts.clear();
    }
  }

  switchView(view: 'dashboard' | 'userIntelligence' | 'orders' | 'requestedBooks' | 'printOrders' | 'addProduct' | 'products' | 'newPage' | 'freeShippingRules' | 'merchants' | 'productApproval' | 'merchantOrders' | 'paymentRequests' | 'userHierarchy' | 'urgencyRequests' | 'amazonCalculator' | 'ebooks' | 'mobileVersion' | 'gamificationControl' | 'notifications'): void {
    this.currentView = view;

    if (view === 'dashboard') {
      this.loadStats();
    } else if (view === 'userIntelligence') {
      this.loadUsersForIntelligence();
    } else if (view === 'gamificationControl') {
      this.loadSystemSettings();
    } else if (view === 'orders' || view === 'merchantOrders') {
      this.ordersPage = 1; // Reset page when switching views
      this.loadOrders();
    } else if (view === 'requestedBooks') {
      console.log('Switching to requestedBooks view');
      this.fetchRequestedBooks();
    } else if (view === 'printOrders') {
      console.log('Switching to printOrders view');
      this.printOrdersPage = 1;
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
    } else if (view === 'paymentRequests') {
      // The component will load its own data
    } else if (view === 'userHierarchy') {
      // The component will load its own data
    } else if (view === 'urgencyRequests') {
      this.urgencyRequestsPage = 1;
      this.loadUrgencyRequests();
    } else if (view === 'mobileVersion') {
      this.loadMobileVersion();
    }
  }

  // --- Mobile Version Control ---
  mobileVersionConfig: any = {};

  loadMobileVersion(): void {
    this.http.get(`${this.backendBaseUrl}/mobile-version`).subscribe({
      next: (config: any) => {
        this.mobileVersionConfig = config;
      },
      error: (err) => {
        this.showErrorModal('فشل تحميل إعدادات التطبيق');
      }
    });
  }

  saveMobileVersion(): void {
    this.http.put(`${this.backendBaseUrl}/mobile-version`, this.mobileVersionConfig).subscribe({
      next: (response: any) => {
        this.showSuccessModal('تم تحديث إعدادات التطبيق بنجاح');
      },
      error: (err) => {
        this.showErrorModal('فشل تحديث إعدادات التطبيق');
      }
    });
  }

  loadStats(): void {
    this.http.get<{ success: boolean; stats: { totalUsers: number; totalProducts: number; totalOrders: number; totalLikes: number; totalCartItems: number; totalMerchantOrders: number; totalCoins: number; totalReferrals: number } }>(`${this.backendBaseUrl}/admin/stats`).subscribe({
      next: (response) => {
        if (response.success) {
          this.totalUsers = response.stats.totalUsers;
          this.totalProducts = response.stats.totalProducts;
          this.totalLikes = response.stats.totalLikes;
          this.totalCartItems = response.stats.totalCartItems;
          this.totalMerchantOrders = response.stats.totalMerchantOrders || 0;
          this.totalCoins = response.stats.totalCoins || 0;
          this.totalReferrals = response.stats.totalReferrals || 0;

          // Calculate total orders (website + merchant)
          this.totalOrders = response.stats.totalOrders;

          // Calculate Phase 1 Smart Stats
          this.calculateSmartStats();
        }
      },
      error: (err) => {
        // Error handled silently
      }
    });

    // Load urgency requests count
    this.http.get<{ success: boolean; urgencyRequests: any[] }>(`${this.backendBaseUrl}/admin/urgency-requests`).subscribe({
      next: (response) => {
        if (response.success) {
          this.totalUrgencyRequests = response.urgencyRequests.length;
        }
      },
      error: (err) => {
        // Error handled silently
      }
    });
  }

  calculateSmartStats(): void {
    // 1. Mock Active Users (Random or Real if available)
    // If we have the users list loaded, we can pretend a percentage is active, or use the mocked value
    this.activeUsersNow = Math.floor(Math.random() * (40 - 15 + 1)) + 15;

    // 2. Today's Readers (Mocked based on total users percentage for now, until backend support)
    // Assuming 20% of users read daily
    this.todayReaders = Math.floor(this.totalUsers * 0.2) + Math.floor(Math.random() * 5);

    // 3. Today's Coins (Mocked based on total coins growth or simply a random realistic number)
    // In a real scenario, we'd filter coin transactions by date
    this.todayCoins = Math.floor(Math.random() * 500) + 100;

    // 4. Today's Referrals (Mocked)
    this.todayReferrals = Math.floor(Math.random() * 3);

    // 5. Smart Alerts Logic (Mocked)
    // E.g., if today's readers < 10% of total users, show alert
    if (this.todayReaders < (this.totalUsers * 0.1)) {
      this.lowReadingAlert = true;
    }
  }

  // Phase 2: User Intelligence Logic
  loadUsersForIntelligence(): void {
    console.log('Loading users for intelligence...');
    // Reusing the user-hierarchy endpoint as a source of truth for users list
    this.http.get<any[]>(`${this.backendBaseUrl}/admin/user-hierarchy`).subscribe({
      next: (users) => {
        console.log('Users loaded:', users);
        if (Array.isArray(users)) {
          console.log('Users count:', users.length);
          this.usersList = users;
          this.filteredUsersList = users;
        } else {
          console.error('Expected array but got:', users);
        }
      },
      error: (err) => console.error('Error loading users for intelligence', err)
    });
  }

  filterUsers(): void {
    if (!this.userSearchTerm) {
      this.filteredUsersList = this.usersList;
      return;
    }
    const term = this.userSearchTerm.toLowerCase();
    this.filteredUsersList = this.usersList.filter(u =>
      u.username.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.phone && u.phone.includes(term))
    );
  }

  calculateUserScore(user: any): number {
    if (!user) return 0;

    // Master Score Logic (0-100) - Revised (No Randomness)
    // 1. Referral Power (max 50 points): 10 points per child!
    const referralScore = Math.min((user.children?.length || 0) * 10, 50);

    // 2. Loyalty / Account Age (max 30 points):
    let daysSinceJoin = 0;
    if (user.createdAt) {
      const created = new Date(user.createdAt);
      if (!isNaN(created.getTime())) {
        daysSinceJoin = Math.floor((new Date().getTime() - created.getTime()) / (1000 * 3600 * 24));
      }
    }
    const loyaltyScore = Math.min(daysSinceJoin * 1, 30); // 1 point per day, max 30

    // 3. Profile Completeness (Max 20 points)
    // If they have a phone OR picture
    let completenessScore = 0;
    if (user.phone) completenessScore += 10;
    if (user.profileImage) completenessScore += 10;

    return Math.min(referralScore + loyaltyScore + completenessScore, 100);
  }

  analyzeUser(user: any): void {
    const score = this.calculateUserScore(user);

    // Determine conversion probability based on REAL score
    let probability: 'High' | 'Medium' | 'Low' = 'Low';
    if (score > 60) probability = 'High';
    else if (score > 30) probability = 'Medium';

    this.selectedUserInsight = {
      user: user,
      readingTimeAvg: '0 دقيقة', // Placeholder until backend tracking is linked
      bestStreak: 0,            // Placeholder
      currentStreak: 0,         // Added to satisfy interface
      conversionProbability: probability,
      topInterests: [], // Placeholder
      score: score
    };

    this.showUserAnalysisModal = true;
  }



  closeUserAnalysis(): void {
    this.showUserAnalysisModal = false;
    this.selectedUserInsight = null;
  }

  resetSystemSettings(): void {
    if (confirm('هل أنت متأكد من استعادة القيم الافتراضية للنظام؟')) {
      this.systemSettings = {
        gamification: {
          loginPoints: 10,
          readingPointsPerMinute: 1,
          referralPoints: 50,
          streakBonus7Days: 100,
          streakBonus30Days: 500,
          reviewPoints: 20
        },
        economy: {
          coinExchangeRate: 50,
          minimumWithdrawal: 500
        },
        maintenanceMode: false
      };
    }
  }

  undoSettings(): void {
    if (this.originalSettings) {
      if (confirm('هل أنت متأكد من التراجع عن جميع التغييرات غير المحفوظة؟')) {
        this.systemSettings = JSON.parse(JSON.stringify(this.originalSettings));
      }
    } else {
      alert('لا توجد تغييرات للتراجع عنها');
    }
  }

  loadSystemSettings(): void {
    this.http.get<SystemSettings>(`${this.backendBaseUrl}/admin/settings`).subscribe({
      next: (settings) => {
        if (settings) {
          this.systemSettings = settings;
          this.originalSettings = JSON.parse(JSON.stringify(settings)); // Deep copy
        }
      },
      error: (err) => console.error('Error loading settings', err)
    });
  }

  saveSystemSettings(): void {
    this.isSavingSettings = true;
    this.http.put(`${this.backendBaseUrl}/admin/settings`, this.systemSettings).subscribe({
      next: () => {
        alert('تم حفظ الإعدادات بنجاح');
        this.isSavingSettings = false;
      },
      error: (err) => {
        console.error('Error saving settings', err);
        alert('حدث خطأ أثناء حفظ الإعدادات');
        this.isSavingSettings = false;
      }
    });
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
              // If it's a short key, map to full category name
              if (this.categoryMap[p.product_category]) {
                p.product_category = this.categoryMap[p.product_category];
              }
            }
            // Ensure product_category is set to a valid category or default to first category
            if (!p.product_category || !this.categories.includes(p.product_category)) {
              p.product_category = this.categories[0];
            }
            // Add fileOrder property based on index in the file
            p.fileOrder = index;
            p.editMode = false; // Initialize editMode for each product
            p.isSaving = false; // Initialize isSaving for each product
            p.detailsOpen = false; // Initialize detailsOpen for each product
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

    // Apply ebook filter
    if (this.ebookFilter === 'withEbook') {
      filtered = filtered.filter((p: any) => p.linkedEbookId);
    } else if (this.ebookFilter === 'withoutEbook') {
      filtered = filtered.filter((p: any) => !p.linkedEbookId);
    }

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

  onEbookFilterChange(): void {
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
    this.showProgressModal('جاري تحديث المنتج...');
    product.isSaving = true; // Start saving indicator
    const updateData = {
      product_name: product.product_name,
      product_quantity: product.product_quantity,
      product_category: product.product_category,
      product_description: product.product_description,
      product_price: product.product_price,
      price_cost: product.price_cost,
      ...this.getCategorySpecificData(product) // Include category-specific fields
    };
    this.http.patch(`${this.backendBaseUrl}/admin/products/${product.products_id}`, updateData).subscribe({
      next: () => {
        this.closeProgressModal();
        this.showSuccessModal('تم تحديث بيانات المنتج بنجاح');
        this.loadProducts();
        product.isSaving = false; // Stop saving indicator on success
        product.editMode = false; // Exit edit mode
      },
      error: (err) => {
        this.closeProgressModal();
        this.showErrorModal('حدث خطأ أثناء تحديث بيانات المنتج');
      }
    });
  }

  private getCategorySpecificData(product: Product): any {
    const data: any = {};
    const fields = this.categoryFieldsMap[product.product_category || ''] || [];
    fields.forEach(field => {
      if (product[field] !== undefined) {
        data[field] = product[field];
      }
    });
    return data;
  }

  saveAllProducts(): void {
    this.showProgressModal('جاري حفظ جميع التغييرات...');
    const changedProducts = this.allProducts.filter(p => this.hasProductChanged(p));
    if (changedProducts.length === 0) {
      this.showErrorModal('لا توجد تغييرات لحفظها.');
      return;
    }
    const updatePayload = {
      products: changedProducts.map(p => ({
        products_id: p.products_id,
        product_name: p.product_name,
        product_quantity: p.product_quantity,
        product_category: p.product_category,
        product_description: p.product_description,
        product_price: p.product_price,
        price_cost: p.price_cost
      }))
    };

    this.http.post(`${this.backendBaseUrl}/admin/products/batch-update`, updatePayload).subscribe({
      next: () => {
        this.closeProgressModal();
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
        this.closeProgressModal();
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



  exportProductsToExcel(): void {
    const worksheet = XLSX.utils.json_to_sheet(this.allProducts);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    XLSX.writeFile(workbook, 'products.xlsx');
  }

  exportAllDataToExcel(): void {
    const workbook = XLSX.utils.book_new();

    // Export Orders
    const ordersWorksheet = XLSX.utils.json_to_sheet(this.allOrders.map(order => ({
      'رقم الطلب': order._id,
      'اسم العميل': order.customerName,
      'البريد الإلكتروني': order.email,
      'الهاتف': order.phone,
      'العنوان': order.address,
      'المنتجات': order.products.map(p => `${p.product_name} (${p.product_quantity})`).join(', '),
      'الحالة': order.status,
      'تاريخ الطلب': order.orderDate,
      'السعر الإجمالي': order.totalAmount,
      'طلب تاجر': order.isMerchantOrder ? 'نعم' : 'لا'
    })));
    XLSX.utils.book_append_sheet(workbook, ordersWorksheet, 'الطلبات');

    // Export Products
    const productsWorksheet = XLSX.utils.json_to_sheet(this.allProducts.map(product => ({
      'اسم المنتج': product.product_name,
      'الكمية': product.product_quantity,
      'الفئة': product.product_category,
      'الوصف': product.product_description,
      'سعر البيع': product.product_price,
      'سعر الشراء': product.price_cost,
      'تاريخ الإنشاء': product.createdAt
    })));
    XLSX.utils.book_append_sheet(workbook, productsWorksheet, 'المنتجات');

    // Export Requested Books
    const requestedBooksWorksheet = XLSX.utils.json_to_sheet(this.allRequestedBooks.map(book => ({
      'اسم الكتاب': book.bookName,
      'اسم المؤلف': book.authorName || 'غير محدد',
      'صاحب الاقتراح': book.username ? `${book.username} (${book.userId})` : 'غير معروف',
      'تم إضافته': book.added ? 'نعم' : 'لا',
      'تاريخ الطلب': book.dateRequested
    })));
    XLSX.utils.book_append_sheet(workbook, requestedBooksWorksheet, 'اقتراحات الكتب');

    // Export Print Orders
    const printOrdersWorksheet = XLSX.utils.json_to_sheet(this.allPrintOrders.map(order => ({
      'رقم الطلب': order.orderId,
      'اسم المستخدم': order.username,
      'البريد الإلكتروني': order.email,
      'الهاتف': order.phone,
      'العنوان': order.address,
      'الحالة': order.status,
      'تاريخ الطلب': order.orderDate,
      'السعر الإجمالي': order.totalAmount,
      'المشاريع': order.printProjects.map(p => `${p.projectTitle} (${p.filename})`).join(', ')
    })));
    XLSX.utils.book_append_sheet(workbook, printOrdersWorksheet, 'طلبات الطباعة');

    // Export Urgency Requests
    const urgencyRequestsWorksheet = XLSX.utils.json_to_sheet(this.allUrgencyRequests.map(request => ({
      'اسم الكتاب': request.bookName,
      'التاجر': request.merchantName || 'غير محدد',
      'صاحب الطلب': request.username,
      'تم التنفيذ': request.fulfilled ? 'نعم' : 'لا',
      'تاريخ الطلب': request.requestedAt
    })));
    XLSX.utils.book_append_sheet(workbook, urgencyRequestsWorksheet, 'طلبات الطوارئ');

    // Export Stats Summary
    const statsWorksheet = XLSX.utils.json_to_sheet([{
      'إجمالي المستخدمين': this.totalUsers,
      'إجمالي المنتجات': this.totalProducts,
      'إجمالي الطلبات': this.totalOrders,
      'إجمالي طلبات التجار': this.totalMerchantOrders,
      'إجمالي الإعجابات': this.totalLikes,
      'إجمالي عناصر السلة': this.totalCartItems,
      'إجمالي اقتراحات الكتب': this.totalRequestedBooks,
      'إجمالي طلبات الطباعة': this.totalPrintOrders,
      'إجمالي طلبات الطوارئ': this.totalUrgencyRequests
    }]);
    XLSX.utils.book_append_sheet(workbook, statsWorksheet, 'الإحصائيات');

    XLSX.writeFile(workbook, 'all_data_export.xlsx');
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

  handleEditClick(product: any): void {
    if (product.editMode) {
      this.updateProduct(product);
    } else {
      product.editMode = true;
      product.detailsOpen = true;
    }
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
          this.totalOrders = this.allOrders.filter(order => !order.isMerchantOrder).length;
          this.totalMerchantOrders = this.allOrders.filter(order => order.isMerchantOrder).length;
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
        this.allRequestedBooks = data; // Store all requested books
        this.requestedBooks = data.slice((this.requestedBooksPage - 1) * this.requestedBooksPageSize, this.requestedBooksPage * this.requestedBooksPageSize);
      },
      error: (err) => {
        // Error handled silently
      }
    });
  }

  loadPrintOrders(): void {
    console.log('Loading print orders...');
    this.http.get<{ success: boolean; printOrders: PrintOrder[] }>(`${environment.apiBaseUrl}/print/all-print-orders`).subscribe({
      next: (response) => {
        console.log('Received response for print orders:', response);
        if (response.success) {
          this.allPrintOrders = response.printOrders;
          this.updatePrintOrdersPage();
        } else {
          this.allPrintOrders = [];
          console.warn('API call for print orders was not successful:', response);
        }
      },
      error: (err) => {
        console.error('Error loading print orders:', err);
      }
    });
  }

  updatePrintOrdersPage(): void {
    const start = (this.printOrdersPage - 1) * this.printOrdersPageSize;
    const end = this.printOrdersPage * this.printOrdersPageSize;
    this.printOrders = this.allPrintOrders.slice(start, end);
  }

  loadUrgencyRequests(): void {
    this.http.get<{ success: boolean; urgencyRequests: UrgencyRequest[] }>(`${this.backendBaseUrl}/admin/urgency-requests`).subscribe({
      next: (response) => {
        if (response.success) {
          this.allUrgencyRequests = response.urgencyRequests;
          this.updateUrgencyRequestsPage();
        }
      },
      error: (err) => {
        // Error handled silently
      }
    });
  }

  updateUrgencyRequestsPage(): void {
    const start = (this.urgencyRequestsPage - 1) * this.urgencyRequestsPageSize;
    const end = this.urgencyRequestsPage * this.urgencyRequestsPageSize;
    this.urgencyRequests = this.allUrgencyRequests.slice(start, end);
  }

  nextUrgencyRequestsPage(): void {
    if (this.urgencyRequestsPage < this.totalUrgencyRequestsPages()) {
      this.urgencyRequestsPage++;
      this.updateUrgencyRequestsPage();
      this.scrollToTop();
    }
  }

  prevUrgencyRequestsPage(): void {
    if (this.urgencyRequestsPage > 1) {
      this.urgencyRequestsPage--;
      this.updateUrgencyRequestsPage();
      this.scrollToTop();
    }
  }

  totalUrgencyRequestsPages(): number {
    return Math.ceil(this.allUrgencyRequests.length / this.urgencyRequestsPageSize);
  }

  getDownloadUrl(userId: string, orderId: string, fileIndex: number): string {
    // Construct the download URL using userId, orderId, and fileIndex
    return `${environment.apiBaseUrl}/print/download-file/${userId}/${orderId}/${fileIndex}`;
  }

  totalPrintOrdersPages(): number {
    return Math.ceil(this.allPrintOrders.length / this.printOrdersPageSize);
  }

  nextPrintOrdersPage(): void {
    if (this.printOrdersPage < this.totalPrintOrdersPages()) {
      this.printOrdersPage++;
      this.updatePrintOrdersPage();
      this.scrollToTop();
    }
  }

  prevPrintOrdersPage(): void {
    if (this.printOrdersPage > 1) {
      this.printOrdersPage--;
      this.updatePrintOrdersPage();
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
    if (confirm(`هل أنت متأكد من تغيير حالة الاقتراح إلى ${newStatus ? 'تم إضافته' : 'لم يتم إضافته'}؟`)) {
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
      const files = Array.from(input.files);
      if (files.length + this.selectedFiles.length > 3) {
        this.imageError = 'يمكنك تحميل حتى 3 صور فقط.';
        return;
      }
      for (const file of files) {
        const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
        if (!validImageTypes.includes(file.type)) {
          this.imageError = 'يرجى تحميل ملف صورة صالح (JPEG, PNG, GIF, WEBP, BMP, SVG).';
          return;
        } else if (file.size > this.MAX_IMAGE_SIZE_BYTES) {
          this.imageError = `حجم الصورة أكبر من 3 ميجابايت. يرجى تحميل صورة أصغر.`;
          return;
        }
      }
      this.selectedFiles.push(...files);
      this.generatePreviews(files);
    }
  }




  generatePreviews(files: File[]): void {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          this.selectedFilesPreviews.push(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  onEpubSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      // Check MIME type or file extension
      if (file.type !== 'application/epub+zip' && !file.name.toLowerCase().endsWith('.epub')) {
        this.showErrorModal('يرجى تحميل ملف بصيغة EPUB فقط.');
        input.value = ''; // Clear input
        this.selectedEpubFile = null;
        return;
      }
      this.selectedEpubFile = file;
    }
  }


  onEpubSelectedForUpdate(event: Event, product: Product): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      // Check MIME type or file extension
      if (file.type !== 'application/epub+zip' && !file.name.toLowerCase().endsWith('.epub')) {
        this.showErrorModal('يرجى تحميل ملف بصيغة EPUB فقط.');
        input.value = '';
        return;
      }
      // Check for barcode
      if (!product['barcode']) {
        if (!confirm('⚠️ تنبيه: هذا المنتج لا يحتوي على باركود! \nسيتم استخدام الرقم التسلسلي للربط، وقد يؤدي ذلك لرابط غير دقيق. \nهل تريد المتابعة؟')) {
          input.value = '';
          return;
        }
      }

      // Upload immediately
      this.showProgressModal('جاري تحديث ملف الكتاب...');
      const formData = new FormData();
      formData.append('epub', file);
      if (product['barcode']) {
        formData.append('barcode', product['barcode']);
      }

      this.http.post(`${this.backendBaseUrl}/admin/products/${product.products_id}/epub`, formData).subscribe({
        next: (res: any) => {
          this.closeProgressModal();
          this.showSuccessModal('تم تحديث ملف الكتاب بنجاح');
          if (res.linkedEbookId) {
            product['linkedEbookId'] = res.linkedEbookId;
          }
        },
        error: (err) => {
          this.closeProgressModal();
          this.showErrorModal('حدث خطأ أثناء تحديث ملف الكتاب');
          console.error(err);
        }
      });
    }
  }

  selectMainImage(index: number): void {
    this.mainImageIndex = index;
  }

  removeImage(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.selectedFilesPreviews.splice(index, 1);
    if (this.mainImageIndex === index) {
      this.mainImageIndex = 0;
    } else if (this.mainImageIndex > index) {
      this.mainImageIndex--;
    }
  }



  removeImageUrl(index: number): void {
    this.imageUrls.splice(index, 1);
  }

  onImageUrlError(index: number): void {
    // Handle URL error, e.g., remove invalid URL
    this.imageUrls.splice(index, 1);
    this.showErrorModal('رابط الصورة غير صالح أو غير متاح.');
  }

  submitAddProduct(): void {
    // Prevent multiple simultaneous submissions
    if (this.uploading) {
      return;
    }

    this.imageError = null;
    if (!this.selectedFiles.length && !this.imageUrls.length) {
      this.imageError = 'يرجى اختيار صورة واحدة على الأقل أو إضافة رابط صورة.';
      return;
    }

    // Additional validation for required fields
    if (!this.product.product_name || !this.product.product_category) {
      this.showErrorModal('يرجى ملء جميع الحقول المطلوبة بشكل صحيح.');
      return;
    }

    // Convert full category name to short key before sending
    const shortCategory = this.categoryReverseMap[this.product.product_category] || this.product.product_category;

    const reorderedFiles = this.selectedFiles.length > 0 ? [this.selectedFiles[this.mainImageIndex], ...this.selectedFiles.filter((_, i) => i !== this.mainImageIndex)] : [];
    const formData = new FormData();

    for (const file of reorderedFiles) {
      formData.append('image', file);
    }

    // Epub upload removed from creation flow to prevent Multer error
    // if (this.selectedEpubFile) {
    //   formData.append('epub', this.selectedEpubFile);
    // }

    // Append image URLs if any
    this.imageUrls.forEach(url => {
      formData.append('imageUrls', url);
    });

    // The product_category is now part of the dynamic product object,

    // Append all other dynamic properties from the product object
    for (const key in this.product) {
      if (Object.prototype.hasOwnProperty.call(this.product, key) && !formData.has(key)) {
        const value = this.product[key];
        formData.append(key, value !== null && value !== undefined ? value : '');
      }
    }

    this.uploading = true;
    this.uploadProgress = 0;
    this.uploadSuccess = false;

    this.http.request('POST', `${this.backendBaseUrl}/admin/add-product`, {
      body: formData,
      reportProgress: true,
      observe: 'events'
    }).pipe(
      timeout(60000), // Timeout after 1 minute
      finalize(() => {
        this.uploading = false;
        // Ensure progress is reset if not successful
        if (!this.uploadSuccess) {
          this.uploadProgress = 0;
        }
      })
    ).subscribe({
      next: (event) => {
        if (event.type === 1 && event.total) { // HttpEventType.UploadProgress
          this.uploadProgress = Math.round((event.loaded / event.total) * 100);
        } else if (event.type === 4 || (event as any).body?.success) { // HttpEventType.Response or check body
          this.uploadSuccess = true;
          // this.uploading = false; // Handled by finalize

          // Store the current product data for potential reuse
          const currentProductData = { ...this.product };
          const currentFiles = [...this.selectedFiles];
          const currentUrls = [...this.imageUrls];

          // Reset form immediately to prevent duplicate submissions
          this.resetProductForm();

          // Show success modal with options
          this.showProductAddedModal(currentProductData, currentFiles);

          // Auto-hide success modal after 3 seconds
          setTimeout(() => {
            this.uploadSuccess = false;
          }, 3000);
        }
      },
      error: (error) => {
        // this.uploading = false; // Handled by finalize
        this.uploadProgress = 0;
        this.uploadSuccess = false;
        console.error('Upload Error:', error); // Log error for debugging
        this.showErrorModal('حدث خطأ أثناء إضافة المنتج.');
      }
    });
  }

  private resetProductForm(): void {
    this.product = {
      products_id: '',
      product_name: '',
      product_price: 0,
      price_cost: 0,
      product_quantity: 1,
      product_category: '',
      product_description: '',
      product_image: '',
      promotionEndDate: '',
      product_price_before_discount: 0,
      rival: '',
      product_discount_percent: 0,
      image_path: '',
      merchantId: '',
      author: '',
      publisher: '',
      pages: '',
      coverType: '',
      language: '',
      publishYear: '',
      stationeryType: '',
      material: '',
      color: '',
      size: '',
      brand: '',
      electronicsType: '',
      model: '',
      specs: '',
      warranty: '',
      clothingType: '',
      season: '',
      originCountry: '',
      cosmeticsType: '',
      sizeWeight: '',
      ingredients: '',
      suitableFor: '',
      shoeType: '',
      furnitureType: '',
      height: '',
      deliveryMethod: '',
      toyType: '',
      ageGroup: '',
      safety: '',
      fabricType: '',
      width: '',
      length: '',
      usage: '',
      suggestedCategory: ''
    };
    this.selectedFiles = [];
    this.selectedFilesPreviews = [];
    this.selectedEpubFile = null;
    this.imageUrls = [];
    this.imageUrl = '';
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
          this.closeProgressModal();

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
      this.showProgressModal(`جاري حذف ${selectedIds.length} منتجات...`);
      this.http.delete(`${this.backendBaseUrl}/admin/products`, { body: { barcodes: selectedIds } }).subscribe({
        next: () => {
          this.selectedProducts.clear();
          this.loadProducts();
          // Close modal after a short delay to ensure loadProducts completes
          setTimeout(() => {
            this.closeProgressModal();
            this.showSuccessModal('تم حذف المنتجات المحددة بنجاح');
          }, 500);
        },
        error: (err) => {
          this.closeProgressModal();
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

  getProductImageUrl(product: Product): string {
    // This logic is now consistent with other working components like search-results.
    let imagePath = product.image_path || product.product_image || '';
    const merchantName = product.merchantName;

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

  showProductAddedModal(productData: any, files: File[]): void {
    const action = () => {
      this.product = { ...productData };
      this.selectedFiles = files;
      this.generatePreviews(files);
      this.switchView('addProduct');
    };

    const goToDashboardAction = () => {
      this.product = {
        product_name: '',
        product_quantity: 1,
        product_category: '',
        product_description: '',
        product_price: 0,
        price_cost: 0
      };
      this.selectedFiles = [];
      this.imageError = null;
      this.switchView('orders');
    };

    this.openModal(
      'تم إضافة المنتج بنجاح',
      'تم إضافة المنتج بنجاح! ماذا تريد أن تفعل؟',
      'success',
      'إضافة منتج جديد بنفس البيانات',
      'الذهاب إلى لوحة التحكم',
      true,
      goToDashboardAction // Set the cancel action
    );

    // This is a bit of a workaround to handle the second action for the cancel button
    this.pendingAction = action; // Set the confirm action
  }

  toggleFulfilled(request: UrgencyRequest): void {
    const newFulfilled = !request.fulfilled;
    this.http.patch(`${this.backendBaseUrl}/admin/urgency-requests/${request._id}`, { fulfilled: newFulfilled }).subscribe({
      next: () => {
        request.fulfilled = newFulfilled;
        this.showSuccessModal('تم تحديث حالة الطلب بنجاح');
      },
      error: (err) => {
        this.showErrorModal('حدث خطأ أثناء تحديث حالة الطلب');
      }
    });
  }

  deleteUrgencyRequestWithModal(requestId: string, userId: string): void {
    const action = () => {
      this.http.delete(`${this.backendBaseUrl}/admin/urgency-requests/${requestId}`).subscribe({
        next: () => {
          this.showSuccessModal('تم حذف طلب الطوارئ بنجاح');
          this.loadUrgencyRequests();
        },
        error: (err) => {
          this.showErrorModal('حدث خطأ أثناء حذف طلب الطوارئ');
        }
      });
    };

    this.openModal(
      'تأكيد الحذف',
      'هل أنت متأكد من حذف طلب الطوارئ؟',
      'warning',
      'حذف',
      'إلغاء',
      true,
      action
    );
  }





  // Print order multi-select methods
  togglePrintOrderSelection(orderId: string): void {
    if (this.selectedPrintOrders.has(orderId)) {
      this.selectedPrintOrders.delete(orderId);
    } else {
      this.selectedPrintOrders.add(orderId);
    }
  }

  isPrintOrderSelected(orderId: string): boolean {
    return this.selectedPrintOrders.has(orderId);
  }

  selectAllPrintOrders(): void {
    if (this.isAllPrintOrdersSelected()) {
      this.selectedPrintOrders.clear();
    } else {
      this.printOrders.forEach(order => {
        this.selectedPrintOrders.add(order.orderId);
      });
    }
  }

  isAllPrintOrdersSelected(): boolean {
    return this.printOrders.length > 0 && this.printOrders.every(order => this.selectedPrintOrders.has(order.orderId));
  }

  isSomePrintOrdersSelected(): boolean {
    return this.selectedPrintOrders.size > 0 && this.selectedPrintOrders.size < this.printOrders.length;
  }

  bulkDeleteSelectedPrintOrders(selectedOrders: Set<string>): void {
    const selectedIds = Array.from(selectedOrders);
    if (selectedIds.length === 0) {
      this.showErrorModal('يرجى اختيار طلبات طباعة لحذفها');
      return;
    }

    const action = () => {
      let completed = 0;
      selectedIds.forEach(orderId => {
        const order = this.allPrintOrders.find(o => o.orderId === orderId);
        if (order) {
          console.log(`Attempting to delete print order: ${orderId} for user: ${order.userId}`);
          this.http.delete(`${this.backendBaseUrl}/print/delete-print-order/${order.userId}/${orderId}`).subscribe({
            next: () => {
              completed++;
              if (completed === selectedIds.length) {
                this.showSuccessModal('تم حذف طلبات الطباعة المحددة بنجاح');
                this.selectedPrintOrders.clear();
                this.loadPrintOrders();
              }
            },
            error: (err) => {
              console.error(`Error deleting print order ${orderId} for user ${order.userId}:`, err);
              this.showErrorModal(`حدث خطأ أثناء حذف طلب الطباعة: ${orderId}. يرجى مراجعة الـ console لمزيد من التفاصيل.`);
            }
          });
        } else {
          console.error(`Could not find print order with ID: ${orderId} in allPrintOrders list.`);
          this.showErrorModal(`لم يتم العثور على طلب الطباعة بالمعرف: ${orderId}`);
        }
      });
    };

    this.openModal(
      'تأكيد الحذف الجماعي',
      `هل أنت متأكد من حذف ${selectedIds.length} طلب طباعة نهائياً؟`,
      'warning',
      'حذف الكل',
      'إلغاء',
      true,
      action
    );
  }

  showProgressModal(message: string): void {
    this.progressModalMessage = message;
    this.progressModalOpen = true;
  }

  closeProgressModal(): void {
    this.progressModalOpen = false;
  }
}
