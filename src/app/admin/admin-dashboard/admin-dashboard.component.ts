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
import { ProductManagementComponent } from '../product-management/product-management.component';
import Chart from 'chart.js/auto';
import * as XLSX from 'xlsx';
import { FreeShippingRulesComponent } from './free-shipping/free-shipping-rules.component';
import { Subscription } from 'rxjs';
import { FaIconLibrary, FontAwesomeModule, FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faShoppingCart, faStore, faBook, faPrint, faPlus, faEdit, faTrash, faTruck, faUsers, faCheckCircle, faMoneyBillWave, faSitemap, faPlusCircle, faImage, faTag, faHashtag, faList, faDollarSign, faAlignLeft, faExclamationTriangle, faCartPlus, faHeart, faMobileAlt, faCamera, faTimes, faHome, faChartLine, faCog, faBars, faUserClock, faCoins, faUserPlus, faChartBar, faBell, faSearch, faSlidersH, faGift, faSyncAlt, faSpinner, faCloudUploadAlt, faGavel, faPaperPlane, faFileExcel, faStethoscope } from '@fortawesome/free-solid-svg-icons';
import { faWhatsapp, faAmazon } from '@fortawesome/free-brands-svg-icons';
import { PaymentRequestsComponent } from '../payment-requests/payment-requests.component';
import { UserHierarchyComponent } from '../user-hierarchy/user-hierarchy.component';
import { AmazonPriceCalculatorComponent } from '../amazon-price-calculator/amazon-price-calculator.component';
import { AdminEbooksComponent } from '../admin-ebooks/admin-ebooks.component';
import { AdminNotificationsComponent } from '../admin-notifications/admin-notifications.component';
import { SubscriptionSettingsComponent } from '../subscription-settings/subscription-settings.component';
import { PromotionsManagerComponent } from '../promotions-manager/promotions-manager.component';
import { AdminPrintingComponent } from '../admin-printing/admin-printing.component';
import { SalesRegistrationComponent } from '../sales-registration/sales-registration.component';
import { ShortagesReportComponent } from '../shortages-report/shortages-report.component';
import { SalesHistoryComponent } from '../sales-history/sales-history.component';
import { PromotionDatesComponent } from '../promotion-dates/promotion-dates.component';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminBourseSettingsComponent } from '../admin-bourse-settings/admin-bourse-settings.component';
import { AdminAutomationComponent } from '../admin-automation/admin-automation.component';
import { AdminService } from '../../services/admin.service';
import { MarketerManagementComponent } from '../marketer-management/marketer-management.component';
import { SpecialOffersManagerComponent } from '../special-offers-manager/special-offers-manager.component';
import { AiControlCenterComponent } from '../ai-control-center/ai-control-center.component';
import { AmazonDiagnosticsComponent } from '../amazon-diagnostics/amazon-diagnostics.component';
import { AmazonCatalogComponent } from '../amazon-catalog/amazon-catalog.component';
import { AmazonAccountsComponent } from '../amazon-accounts/amazon-accounts.component';
import { MerchantAmazonLinkComponent } from '../merchant-amazon-link/merchant-amazon-link.component';
import { ShippingSettingsComponent } from '../shipping-settings/shipping-settings.component';

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
  paymentStatus?: string;
  isCommunityItem?: boolean;
  communityItemId?: string;
  communityOwnerId?: string;
  communityOwnerName?: string;
  communityOwnerPhone?: string;
  communityOwnerAddress?: string;
  shippingMethod?: string;
  statusLog?: {
    status: string;
    timestamp: string;
    actor: string;
    role: string;
    note?: string;
  }[];
  source?: 'website' | 'amazon';
  amazonOrderId?: string;
  hasStockIssues?: boolean;
  stockIssueDetails?: Array<{
    productId: string;
    requestedQty: number;
    reason: string;
  }>;
}

interface RequestedBook {
  _id: string;
  userId: string;
  username?: string;
  bookName: string;
  authorName: string;
  phoneNumber?: string;
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
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  product_image?: string;
  image_path?: string;
  copyType?: string;
  condition?: string;
  promotionEndDate?: string;
  product_price_before_discount?: number;
  product_discount_percent?: number;
  createdAt?: string; // Added creation date for sorting by recently added
  editMode?: boolean; // For toggling edit mode on product cards
  detailsOpen?: boolean; // For toggling details visibility on product cards
  isSaving?: boolean; // To show saving progress
  fileOrder?: number; // Added to track order in file for sorting
  merchantName?: string; // Added for merchant products
  lastStockUpdate?: string; // Last time stock/quantity was changed
  [key: string]: any; // Allow any string as a key
}

interface OrderProduct {
  product_name: string;
  product_quantity: number;
  isMerchantOrder?: boolean;
  isCommunityItem?: boolean;
  communityItemId?: string;
  communityOwnerId?: string;
  communityOwnerName?: string;
  communityOwnerPhone?: string;
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
  paymentStatus?: string;
  isCommunityItem?: boolean;
  communityItemId?: string;
  communityOwnerId?: string;
  communityOwnerName?: string;
  communityOwnerPhone?: string;
  communityOwnerAddress?: string;
  shippingMethod?: string;
  statusLog?: {
    status: string;
    timestamp: string;
    actor: string;
    role: string;
    note?: string;
  }[];
  source?: 'website' | 'amazon';
  amazonOrderId?: string;
  hasStockIssues?: boolean;
  stockIssueDetails?: Array<{
    productId: string;
    requestedQty: number;
    reason: string;
  }>;
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
    fromPage?: number;
    toPage?: number;
    copies: number;
    notes: string;
    projectTitle: string;
    estimatedPrice: number;
    finalPrice?: number | null;
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

interface ReaderFeedback {
  _id: string;
  userId?: string;
  username?: string;
  email?: string;
  content: string;
  page?: number;
  createdAt: string;
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
  quranPoints: {
    VERSE_MEMORIZED: number;
    PAGE_COMPLETE: number;
    HIZB_COMPLETE: number;
    JUZ_COMPLETE: number;
    DAILY_STREAK: number;
    KHATMA_COMPLETE: number;
    REVISION_PAGE_COMPLETE: number;
    REVISION_VERSE_COMPLETE: number;
  };
  economy: {
    coinExchangeRate: number;
    quranPointsPerEGP: number;
    quranMinConversionPoints: number;
    minimumWithdrawal: number;
  };
  maintenanceMode: boolean;
  bourseConfig: {
    isActive: boolean;
    netProfitMargin: number;
    freeGiftThreshold: number;
    allowedCategories: string[];
    booksPerSlot: number;
    includeMerchantProducts: boolean;
    allowPublisherUpload: boolean;
  };
}

export type AdminView = 'dashboard' | 'userIntelligence' | 'orders' | 'requestedBooks' | 'printOrders' | 'printingSettings' | 'addProduct' | 'products' | 'newPage' | 'freeShippingRules' | 'merchants' | 'staff' | 'productApproval' | 'productManagement' | 'merchantOrders' | 'paymentRequests' | 'userHierarchy' | 'urgencyRequests' | 'amazonCalculator' | 'ebooks' | 'mobileVersion' | 'gamificationControl' | 'notifications' | 'subscriptionControl' | 'readerFeedback' | 'promotions' | 'salesRegistration' | 'shortagesReport' | 'promotionDates' | 'salesHistory' | 'community' | 'bourseSettings' | 'automation' | 'aiControlCenter' | 'newsletter' | 'marketers' | 'specialOffers' | 'amazonDiagnostics' | 'amazonCatalog' | 'amazonAccounts' | 'merchantAmazonLink' | 'shippingSettings';

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
    ProductManagementComponent,
    PaymentRequestsComponent,
    UserHierarchyComponent,
    AmazonPriceCalculatorComponent,
    AdminEbooksComponent,
    AdminNotificationsComponent,
    SubscriptionSettingsComponent,
    PromotionsManagerComponent,
    AdminPrintingComponent,
    SalesRegistrationComponent,
    ShortagesReportComponent,
    PromotionDatesComponent,
    SalesHistoryComponent,
    AdminBourseSettingsComponent,
    AdminAutomationComponent,
    MarketerManagementComponent,
    SpecialOffersManagerComponent,
    AiControlCenterComponent,
    AmazonDiagnosticsComponent,
    AmazonCatalogComponent,
    AmazonAccountsComponent,
    MerchantAmazonLinkComponent,
    ShippingSettingsComponent
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  orders: GroupedOrder[] = [];
  allOrders: GroupedOrder[] = [];
  requestedBooks: RequestedBook[] = [];
  allRequestedBooks: RequestedBook[] = [];
  feedbacks: ReaderFeedback[] = [];
  staffMembers: any[] = [];
  staffSearchEmail: string = '';
  isPromotingStaff: boolean = false;
  
  get allViewsList(): {id: string, title: string}[] {
    return Object.keys(this.viewTitles).map(id => ({ id, title: this.viewTitles[id as AdminView] }));
  }

  permissionGroups = [
    {
      name: 'المخزون والمنتجات',
      icon: 'box',
      views: ['addProduct', 'products', 'productApproval', 'amazonCalculator', 'ebooks']
    },
    {
      name: 'المبيعات والطلبات',
      icon: 'shopping-cart',
      views: ['orders', 'merchantOrders', 'requestedBooks', 'printOrders', 'salesRegistration', 'salesHistory', 'urgencyRequests']
    },
    {
      name: 'إعدادات المنصة والأسعار',
      icon: 'cog',
      views: ['printingSettings', 'freeShippingRules', 'mobileVersion', 'gamificationControl', 'notifications', 'subscriptionControl', 'promotionDates', 'bourseSettings', 'automation', 'specialOffers', 'shippingSettings']
    },
    {
      name: 'المستخدمين والتجار والمسوقين',
      icon: 'users',
      views: ['userIntelligence', 'merchants', 'staff', 'userHierarchy', 'paymentRequests', 'newsletter', 'marketers']
    },
    {
      name: 'المحتوى والمجتمع',
      icon: 'comments',
      views: ['newPage', 'readerFeedback', 'community']
    }
  ];

  toggleGroupPermissions(staff: any, groupViews: string[]): void {
    const currentPermissions = [...(staff.permissions || [])];
    const allSelected = groupViews.every(v => currentPermissions.includes(v));
    
    let newPermissions: string[];
    if (allSelected) {
      // Deselect all in group
      newPermissions = currentPermissions.filter(v => !groupViews.includes(v));
    } else {
      // Select all in group
      newPermissions = Array.from(new Set([...currentPermissions, ...groupViews]));
    }

    this.http.patch<any>(`${this.backendBaseUrl}/admin/staff/permissions`, { userId: staff._id, permissions: newPermissions }).subscribe({
      next: res => {
        if (res.success) {
          staff.permissions = newPermissions;
        }
      }
    });
  }

  isAdmin: boolean = false; 

  showSidebar: boolean = true;
  currentView: AdminView = 'userIntelligence'; 

  // Amazon tracking
  publishingToAmazon = new Set<string>();
  syncingAmazon = new Set<string>();

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
    quranPoints: {
      VERSE_MEMORIZED: 5,
      PAGE_COMPLETE: 10,
      HIZB_COMPLETE: 50,
      JUZ_COMPLETE: 100,
      DAILY_STREAK: 20,
      KHATMA_COMPLETE: 1000,
      REVISION_PAGE_COMPLETE: 5,
      REVISION_VERSE_COMPLETE: 2
    },
    economy: {
      coinExchangeRate: 50,
      quranPointsPerEGP: 500,
      quranMinConversionPoints: 5,
      minimumWithdrawal: 500
    },
    maintenanceMode: false,
    bourseConfig: {
      isActive: false,
      netProfitMargin: 10,
      freeGiftThreshold: 1000,
      allowedCategories: [],
      booksPerSlot: 8,
      includeMerchantProducts: false,
      allowPublisherUpload: true
    }
  };
  isSavingSettings: boolean = false;
  originalSettings: SystemSettings | null = null;

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
  totalProductsCount: number = 0;
  availablePublishers: string[] = [];
  availableMerchants: string[] = [];
  searchTerm: string = '';
  amazonProfitPercent: number = 80;

  getAmazonPrice(costPrice: any): number {
    const cost = Number(costPrice);
    if (isNaN(cost) || cost <= 0) return 0;
    const profitPercent = Number(this.amazonProfitPercent) || 80;
    const targetNetPayout = cost + (cost * (profitPercent / 100));

    const R = 13 / 100; // amazonCommissionRate (13%)
    const T = 14 / 100; // taxRate (14%)
    const Fc = 30; // customerShippingFee (30)
    const S = 34; // sellerShippingFee (34)

    const commissionTaxFactor = R * (1 + T);
    const denominator = 1 - commissionTaxFactor;

    if (denominator <= 0) {
      return 0;
    }

    const numerator = targetNetPayout + S;
    const P = (numerator / denominator) - Fc;

    return Math.ceil(P);
  }

  // --- Community Management State ---
  communityStats: { swaps: any[], auctions: any[] } = { swaps: [], auctions: [] };
  isLoadingCommunity: boolean = false;

  fetchCommunityStats(): void {
    this.isLoadingCommunity = true;
    this.http.get<{ success: boolean; stats: any }>(`${this.backendBaseUrl}/community/admin/stats`)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.communityStats = response.stats;
          }
          this.isLoadingCommunity = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error fetching community stats:', err);
          this.isLoadingCommunity = false;
          this.cdr.detectChanges();
        }
      });
  }

  deleteSwap(id: string): void {
    const currentUserId = this.authService.currentUserValue?.id;
    if (confirm('هل أنت متأكد من حذف هذا العرض؟')) {
      this.http.delete(`${this.backendBaseUrl}/community/posts/${id}`, { body: { userId: currentUserId } })
        .subscribe({
          next: () => {
            this.fetchCommunityStats();
          },
          error: (err) => console.error('Error deleting swap:', err)
        });
    }
  }

  finalizeAuction(id: string): void {
    if (confirm('هل أنت متأكد من إنهاء هذا المزاد الآن؟')) {
      this.http.post(`${this.backendBaseUrl}/community/auctions/${id}/finalize`, {})
        .subscribe({
          next: () => {
             this.fetchCommunityStats();
          },
          error: (err) => console.error('Error finalizing auction:', err)
        });
    }
  }

  updateCommunityStatus(id: string, type: 'swap' | 'auction', field: string, value: string): void {
    const confirmMsg = 'هل أنت متأكد من تحديث الحالة؟';
    if (confirm(confirmMsg)) {
        this.http.post(`${this.backendBaseUrl}/community/community/update-status`, { id, type, field, value })
            .subscribe({
                next: () => {
                    this.fetchCommunityStats();
                },
                error: (err) => console.error('Error updating status:', err)
            });
    }
  }

  // --- User Intelligence Analytics State ---
  analyticsData: any = null;
  isLoadingAnalytics: boolean = false;
  analyticsError: string = '';
  usersChart: Chart | null = null;
  segmentsChart: Chart | null = null;
  ordersChart: Chart | null = null;
  viewsChart: Chart | null = null;
  
  fetchUserIntelligenceData(): void {
    this.isLoadingAnalytics = true;
    this.analyticsError = '';
    this.http.get<{ success: boolean; analytics: any }>(`${this.backendBaseUrl}/admin/analytics`)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.analyticsData = response.analytics;
            // Delay chart initialization slightly to ensure DOM is ready
            setTimeout(() => this.initIntelligenceCharts(), 100);
          } else {
            this.analyticsError = 'فشل في تحميل التحليلات المتقدمة';
          }
          this.isLoadingAnalytics = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error fetching admin analytics:', err);
          this.analyticsError = 'حدث خطأ أثناء تحميل البيانات';
          this.isLoadingAnalytics = false;
          this.cdr.detectChanges();
        }
      });
  }

  initIntelligenceCharts(): void {
    if (!this.analyticsData) return;

    // Destroy existing charts to prevent memory leaks and overlapping
    if (this.usersChart) this.usersChart.destroy();
    if (this.segmentsChart) this.segmentsChart.destroy();
    if (this.ordersChart) this.ordersChart.destroy();
    if (this.viewsChart) this.viewsChart.destroy();

    // Common styling
    const isDarkMode = document.documentElement.classList.contains('dark');
    const textColor = isDarkMode ? '#cbd5e1' : '#475569';
    const gridColor = isDarkMode ? '#334155' : '#e2e8f0';

    // 1. User Growth Chart
    const growthCtx = document.getElementById('usersGrowthChart') as HTMLCanvasElement;
    if (growthCtx) {
      const labels = this.analyticsData.registrationsTrend.map((t: any) => t.date);
      const data = this.analyticsData.registrationsTrend.map((t: any) => t.count);

      this.usersChart = new Chart(growthCtx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'مستخدمين جدد',
            data: data,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            fill: true,
            borderWidth: 2,
            pointBackgroundColor: '#3b82f6'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
            x: { grid: { display: false }, ticks: { color: textColor } }
          }
        }
      });
    }

    // 2. Platform Segments Chart (Doughnut)
    const segmentsCtx = document.getElementById('userSegmentsChart') as HTMLCanvasElement;
    if (segmentsCtx) {
      const { users, merchants, admins } = this.analyticsData.demographics;
      this.segmentsChart = new Chart(segmentsCtx, {
        type: 'doughnut',
        data: {
          labels: ['مستخدمين', 'تجار', 'مدراء'],
          datasets: [{
            data: [users, merchants, admins],
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '75%',
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, padding: 20 } }
          }
        }
      });
    }

    // 3. Order Trends Chart
    const ordersCtx = document.getElementById('adminOrdersChart') as HTMLCanvasElement;
    if (ordersCtx) {
      const labels = this.analyticsData.orderTrends.map((t: any) => t.date);
      const data = this.analyticsData.orderTrends.map((t: any) => t.count);

      this.ordersChart = new Chart(ordersCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'عدد الطلبات',
            data: data,
            backgroundColor: '#8b5cf6',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
            x: { grid: { display: false }, ticks: { color: textColor } }
          }
        }
      });
    }

    // 4. Platform Views Chart (30 Days)
    const viewsCtx = document.getElementById('adminViewsChart') as HTMLCanvasElement;
    if (viewsCtx && this.analyticsData.viewsTrend) {
      const labels = this.analyticsData.viewsTrend.map((t: any) => t.date);
      const data = this.analyticsData.viewsTrend.map((t: any) => t.count);

      this.viewsChart = new Chart(viewsCtx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'حركة الزيارات',
            data: data,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            fill: true,
            borderWidth: 2,
            pointBackgroundColor: '#10b981'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
            x: { grid: { display: false }, ticks: { color: textColor } }
          }
        }
      });
    }
  }
  // ----------------------------------------

  // Bulk Adjustment Properties
  showBulkAdjustModal: boolean = false;
  bulkAdjustData = {
    category: ['جميع الفئات'] as string[],
    combinedFilter: 'all',
    sortBy: 'none', // 'none', 'price_asc', 'price_desc', 'newest'
    minPrice: 0,
    maxPrice: 100000,
    adjustmentType: 'percentage' as 'percentage' | 'fixed' | 'sync_cost',
    adjustmentValue: 0,
    direction: 'increase' as 'increase' | 'decrease'
  };
  isBulkAdjusting: boolean = false;

  // New properties for sorting
  sortField: keyof Product | '' = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Ebook filter property
  ebookFilter: 'all' | 'withEbook' | 'withoutEbook' = 'all';

  // New Merchant and Publisher filters for the main table
  merchantFilter: string = 'all';
  publisherFilter: string = 'all';

  // --- Newsletter Management ---
  newsletterSubscribers: any[] = [];
  isLoadingNewsletter: boolean = false;

  fetchNewsletterSubscribers(): void {
    this.isLoadingNewsletter = true;
    this.http.get<{ success: boolean; subscribers: any[] }>(`${this.backendBaseUrl}/newsletter/subscribers`)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.newsletterSubscribers = response.subscribers;
          }
          this.isLoadingNewsletter = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error fetching newsletter subscribers:', err);
          this.isLoadingNewsletter = false;
          this.cdr.detectChanges();
        }
      });
  }

  exportNewsletterToExcel(): void {
    if (this.newsletterSubscribers.length === 0) return;
    
    const data = this.newsletterSubscribers.map(s => ({
      'البريد الإلكتروني': s.email,
      'تاريخ الاشتراك': new Date(s.subscribedAt).toLocaleString('ar-EG'),
      'الحالة': s.status === 'active' ? 'نشط' : 'ملغى'
    }));
    
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المشتركين');
    XLSX.writeFile(wb, `newsletter_subscribers_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  // Inventory Mode properties
  inventoryMode: boolean = false;
  inventoryBarcodeSearch: string = '';

  // Multi-select properties
  selectedProducts: Set<string> = new Set();
  selectedOrders: Set<string> = new Set();
  selectedPrintOrders: Set<string> = new Set();

  // Export Filter Properties
  showExportModal: boolean = false;
  exportOptions = {
    categories: [] as string[],
    maxQuantity: null as number | null,
    lowStockThreshold: 5
  };

  // Wholesale Price Excel Modal Properties
  showWholesalePriceModal: boolean = false;
  wholesaleOptions = {
    columns: {
      product_name: true,
      product_category: true,
      price_cost: true,
      product_price: true,
      product_quantity: false,
      author: false,
      publisher: false,
      merchantName: false,
      wholesale_price: true,
      copyType: false,
      condition: false,
      barcode: false,
      product_description: false,
      weight: false,
      dimensions: false,
      product_price_before_discount: false,
      product_discount_percent: false
    },
    priceMethod: 'same' as 'same' | 'percentage',
    adminPercentage: 0,
    merchantPercentage: 0,
    scope: 'all' as 'all' | 'category' | 'admin' | 'merchants' | 'specific_merchant',
    selectedCategory: '',
    selectedMerchant: ''
  };

  // Bulk Edit Properties
  showBulkEditModalFlag: boolean = false;
  bulkEditData: any = {
    copyType: '',
    condition: '',
    category: '',
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
    brand: ''
  };

  toggleExportCategorySelection(cat: string): void {
    if (cat === 'جميع الفئات') {
      this.exportOptions.categories = ['جميع الفئات'];
    } else {
      // Remove "All" if a specific category is selected
      this.exportOptions.categories = this.exportOptions.categories.filter(c => c !== 'جميع الفئات');
      const idx = this.exportOptions.categories.indexOf(cat);
      if (idx > -1) {
        this.exportOptions.categories.splice(idx, 1);
      } else {
        this.exportOptions.categories.push(cat);
      }
      // If empty, default back to all
      if (this.exportOptions.categories.length === 0) {
        this.exportOptions.categories = ['جميع الفئات'];
      }
    }
  }

  isExportCategorySelected(cat: string): boolean {
    return this.exportOptions.categories.includes(cat);
  }

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
  faTrash = faTrash;
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
  faSlidersH = faSlidersH;
  faGift = faGift;
  faSyncAlt = faSyncAlt;
  faSpinner = faSpinner;
  faCloudUploadAlt = faCloudUploadAlt;
  faGavel = faGavel;
  faFileExcel = faFileExcel;

  // Navigation Titles Mapping
  viewTitles: Record<string, string> = {
    'dashboard': 'لوحة التحكم الرئيسية',
    'userIntelligence': 'ذكاء المستخدمين',
    'orders': 'إدارة الطلبات',
    'merchantOrders': 'طلبات التجار',
    'requestedBooks': 'الكتب المطلوبة',
    'printOrders': 'طلبات الطباعة',
    'printingSettings': 'إعدادات الطباعة وتحكم السعر',
    'addProduct': 'إضافة منتج جديد',
    'products': 'إدارة المنتجات',
    'newPage': 'إنشاء صفحة مقالية',
    'freeShippingRules': 'مصاريف الشحن',
    'merchants': 'إدارة التجار',
    'staff': 'إدارة الموظفين',
    'productApproval': 'اعتماد المنتجات',
    'paymentRequests': 'سحب الأرباح',
    'userHierarchy': 'شجرة العائلة (المسوقين)',
    'urgencyRequests': 'طلبات الاستعجال',
    'amazonCalculator': 'حاسبة أمازون',
    'ebooks': 'إدارة الكتب الإلكترونية',
    'mobileVersion': 'إعدادات التطبيق',
    'gamificationControl': 'نظام النقاط والمكافآت',
    'notifications': 'الإشعارات والعروض',
    'subscriptionControl': 'إدارة الاشتراكات',
    'readerFeedback': 'ملاحظات القراء',
    'promotions': 'إدارة العروض والخصومات',
    'salesRegistration': 'تسجيل مبيعات خارجية',
    'salesHistory': 'سجل المبيعات والعملاء',
    'shortagesReport': 'تقرير النواقص',
    'community': 'إدارة التبادلات والمزادات',
    'bourseSettings': 'إعدادات بورصة الكتب',
    'automation': 'نظام الأتمتة والذكاء',
    'aiControlCenter': 'AI Control Center',
    'newsletter': 'القائمة البريدية',
    'marketers': 'إدارة المسوقين العملاء',
    'specialOffers': 'إدارة العروض الخاصة (Emails)',
    'amazonAccounts': 'إدارة حسابات أمازون'
  };

  // Global Navigation Search
  navSearchTerm: string = '';
  showNavResults: boolean = false;

  get currentUserRole(): string {
    return this.authService.currentUserValue?.role || 'user';
  }

  hasPermission(view: string): boolean {
    const user = this.authService.currentUserValue;
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'staff') {
      return user.permissions?.includes(view) || false;
    }
    return false;
  }

  get filteredNavViews() {
    if (!this.navSearchTerm.trim()) return [];
    const term = this.navSearchTerm.toLowerCase();
    return Object.entries(this.viewTitles)
      .filter(([id, title]) => title.toLowerCase().includes(term) || id.toLowerCase().includes(term))
      .map(([id, title]) => ({ id, title }));
  }

  selectNavResult(viewId: any): void {
    this.switchView(viewId);
    this.navSearchTerm = '';
    this.showNavResults = false;
  }

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
    copyType: '',
    condition: '',
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
    suggestedCategory: '',
    weight: 0,
    length: '',
    width: '',
    height: '',
    productType: 'physical',
    amazonAsin: ''
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

  private normalizeExternalImageUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const searchParams = parsed.searchParams;

      if (parsed.hostname.includes('google.com')) {
        const imgUrl = searchParams.get('imgurl') || searchParams.get('url');
        if (imgUrl) {
          return decodeURIComponent(imgUrl);
        }
      }

      if (parsed.hostname.includes('bing.com')) {
        const imgUrl = searchParams.get('q') || searchParams.get('mediaurl') || searchParams.get('imgurl');
        if (imgUrl) {
          return decodeURIComponent(imgUrl);
        }
      }

      return url;
    } catch {
      return url;
    }
  }

  addImageFromUrlDirect(url: string): void {
    if (this.imageUrls.length >= 3) {
      this.imageError = 'يمكنك إضافة حتى 3 روابط صور فقط.';
      return;
    }

    const normalizedUrl = this.normalizeExternalImageUrl(url);

    try {
      new URL(normalizedUrl);
      if (!this.imageUrls.includes(normalizedUrl)) {
        this.imageUrls.push(normalizedUrl);
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

    const normalizedUrl = this.normalizeExternalImageUrl(this.imageUrl);

    try {
      new URL(normalizedUrl);
      if (!this.imageUrls.includes(normalizedUrl)) {
        this.imageUrls.push(normalizedUrl);
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
  private modalServiceSubscription: any;

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
    'غير مصنف'
  ];

  mainCategories: string[] = [
    'كتب',
    'أدوات مكتبية',
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
    'غير مصنف': 'غير مصنف'
  };

  // Reverse map from full category name to short key
  allCategories: string[] = [];
  isAddingNewCategory: boolean = false;
  newCategoryName: string = '';

  loadCategories(): void {
    // Initial merge of hardcoded categories
    const initialCategories = [...this.categories, ...this.bookSubCategories, ...this.mainCategories];
    this.allCategories = [...new Set(initialCategories)];

    this.dataService.getCategories().subscribe({
      next: (res: any) => {
        if (res && res.success) {
          // Merge with API categories and ensure uniqueness
          const combined = [...this.allCategories, ...res.categories];
          this.allCategories = [...new Set(combined)].sort();
        }
      },
      error: (err) => console.error('Error loading categories:', err)
    });
  }

  onCategoryChange(event: any): void {
    const value = event.target.value;
    if (value === 'NEW_CATEGORY') {
      this.isAddingNewCategory = true;
      this.product.product_category = '';
    } else if (value === 'كتب') {
      // When 'كتب' is selected as main category, clear product_category
      // so the sub-category dropdown can set it
      this.isAddingNewCategory = false;
      this.product.product_category = '';
    } else {
      // For non-book categories (أدوات مكتبية, غير مصنف), set product_category directly
      this.isAddingNewCategory = false;
      this.product.product_category = value;
    }
  }

  onSubCategoryChange(event: any): void {
    const value = event.target.value;
    if (value === 'NEW_CATEGORY') {
      this.isAddingNewCategory = true;
      this.product.product_category = '';
    } else {
      this.isAddingNewCategory = false;
      this.product.product_category = value;
    }
  }


  onBulkDefaultCategoryChange(event: any): void {
    const value = event.target.value;
    if (value === 'NEW_CATEGORY') {
      this.isBulkAddingNewCategory = true;
      this.bulkDefaultCategory = '';
    } else {
      this.isBulkAddingNewCategory = false;
      this.bulkDefaultCategory = value;
    }
  }

  cancelBulkNewCategory(): void {
    this.isBulkAddingNewCategory = false;
    this.bulkNewCategoryName = '';
    this.bulkDefaultCategory = 'كتب';
  }

  confirmBulkNewCategory(): void {
    if (this.bulkNewCategoryName.trim()) {
      const newCat = this.bulkNewCategoryName.trim();
      if (!this.allCategories.includes(newCat)) {
        this.allCategories.push(newCat);
      }
      this.bulkDefaultCategory = newCat;
      this.isBulkAddingNewCategory = false;
      this.bulkNewCategoryName = '';
    }
  }

  cancelNewCategory(): void {
    this.isAddingNewCategory = false;
    this.newCategoryName = '';
    this.product.product_category = '';
  }

  confirmNewCategory(): void {
    if (this.newCategoryName.trim()) {
      const newCat = this.newCategoryName.trim();
      if (!this.allCategories.includes(newCat)) {
        this.allCategories.push(newCat);
      }
      this.product.product_category = newCat;
      this.isAddingNewCategory = false;
      this.newCategoryName = '';
    }
  }
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
    'غير مصنف': ['suggestedCategory']
  };

  isBookCategory(category: string): boolean {
    if (!category) return false;
    const lowerCategory = category.toLowerCase();
    // In this pivoted version, almost everything is a book except stationery
    if (category === 'أدوات مكتبية') return false;
    return true; // Assume all other categories are books
  }

  // Bulk Import Properties
  isBulkImportMode = false;
  bulkFile: File | null = null;
  publisherImageFile: File | null = null;
  excelHeaders: string[] = [];
  fieldMapping: { [key: string]: string } = {};
  merchantsList: any[] = [];
  selectedMerchantId: string = '';
  selectedPublisher: string = '';
  bulkDefaultCategory: string = 'كتب';
  isBulkAddingNewCategory: boolean = false;
  bulkNewCategoryName: string = '';
  bulkImportType: 'admin' | 'merchant' | 'publisher' = 'admin';
  importingBulk = false;
  bulkImportProgress = 0;
  bulkImportSuccess = false;
  parsedBulkData: any[] = [];
  bulkDefaultCopyType: string = '';
  bulkDefaultCondition: string = '';
  
  // Category Mapping from Excel values to System categories
  detectedExcelCategories: string[] = [];
  categoryValueMapping: { [key: string]: string } = {};
  
  // Available system fields for mapping
  systemFields = [
    { key: 'product_name', label: 'اسم المنتج' },
    { key: 'product_quantity', label: 'الكمية' },
    { key: 'product_category', label: 'التصنيف' },
    { key: 'product_description', label: 'الوصف' },
    { key: 'product_price', label: 'السعر (البيع)' },
    { key: 'price_cost', label: 'سعر التكلفة' },
    { key: 'weight', label: 'الوزن (جرام)' },
    { key: 'author', label: 'المؤلف' },
    { key: 'publisher', label: 'دار النشر' },
    { key: 'barcode', label: 'الباركود' },
    { key: 'products_id', label: 'كود المنتج' },
    { key: 'pages', label: 'عدد الصفحات' },
    { key: 'coverType', label: 'نوع الغلاف' },
    { key: 'language', label: 'اللغة' },
    { key: 'publishYear', label: 'سنة النشر' },
    { key: 'image_path', label: 'رابط الصورة (URL)' },
    { key: 'length', label: 'الطول (سم)' },
    { key: 'width', label: 'العرض (سم)' },
    { key: 'height', label: 'الارتفاع (سم)' }
  ];

  get uniquePublishers(): string[] {
    return (this.availablePublishers as string[] || []).sort();
  }

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private dataService: DataService,
    private notificationService: NotificationService,
    private modalService: ModalService,
    private cdr: ChangeDetectorRef,
    private adminService: AdminService,
    library: FaIconLibrary
  ) {
    library.addIcons(
      faShoppingCart, faStore, faBook, faPrint, faPlus, faEdit, faTrash, faTruck, faUsers, faCheckCircle, faMoneyBillWave, faSitemap, faPlusCircle, faImage, faTag, faHashtag, faList, faDollarSign, faAlignLeft, faExclamationTriangle, faCartPlus, faHeart, faMobileAlt, faCamera, faTimes, faHome, faChartLine, faCog, faBars, faUserClock, faCoins, faUserPlus, faChartBar, faBell, faSearch, faSlidersH, faPaperPlane, faWhatsapp, faAmazon, faStethoscope
    );
  }

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      console.log('🏁 [AdminDashboard] User state updated:', user?.role);
      if (user && (user.role === 'admin' || user.role === 'staff')) {
        console.log('🚀 [AdminDashboard] Access approved for role:', user.role);
        this.isAdmin = true;
        this.loadOrders();
        this.loadNotifications();
        this.loadStats();
        this.loadSystemSettings(); // Load settings on init
        this.loadCategories();
        this.loadMerchantsList();
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

    // Merge hardcoded categories into allCategories initially
    this.allCategories = [...new Set([...this.categories, ...this.bookSubCategories])];

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

  switchView(view: AdminView): void {
    if (!this.hasPermission(view)) {
      this.modalService.openModal({
        title: 'وصول مرفوض',
        message: 'ليس لديك الصلاحية للوصول لهذه الصفحة.',
        type: 'error'
      });
      return;
    }
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
      this.loadFilterOptions();
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
    } else if (view === 'newsletter') {
      this.fetchNewsletterSubscribers();
    } else if (view === 'urgencyRequests') {
      this.urgencyRequestsPage = 1;
      this.loadUrgencyRequests();
    } else if (view === 'mobileVersion') {
      this.loadMobileVersion();
    } else if (view === 'subscriptionControl') {
      // No data loading needed as the component handles it
    } else if (view === 'readerFeedback') {
      this.loadFeedbacks();
    } else if (view === 'promotionDates') {
      // PromotionDatesComponent handles its own loading
    } else if (view === 'community') {
      this.fetchCommunityStats();
    } else if (view === 'staff') {
      this.loadStaff();
    }
  }

  loadStaff(): void {
    this.http.get<any>(`${this.backendBaseUrl}/admin/staff`).subscribe({
      next: res => {
        if (res.success) {
          this.staffMembers = res.staff;
        }
      },
      error: err => console.error('Error loading staff:', err)
    });
  }

  promoteToStaff(): void {
    if (!this.staffSearchEmail) return;
    this.isPromotingStaff = true;
    this.http.post<any>(`${this.backendBaseUrl}/admin/staff/promote`, { email: this.staffSearchEmail }).subscribe({
      next: res => {
        this.isPromotingStaff = false;
        if (res.success) {
          this.loadStaff();
          this.staffSearchEmail = '';
          this.modalService.openModal({ title: 'نجاح', message: res.message, type: 'success' });
        } else {
          this.modalService.openModal({ title: 'خطأ', message: res.message, type: 'error' });
        }
      },
      error: err => {
        this.isPromotingStaff = false;
        this.modalService.openModal({ title: 'خطأ', message: err.error?.message || 'فشل في ترقية المستخدم', type: 'error' });
      }
    });
  }

  demoteFromStaff(userId: string): void {
    if (!confirm('هل أنت متأكد من سحب صلاحيات الموظف من هذا المستخدم؟')) return;
    this.http.post<any>(`${this.backendBaseUrl}/admin/staff/demote`, { userId }).subscribe({
      next: res => {
        if (res.success) {
          this.loadStaff();
          this.modalService.openModal({ title: 'نجاح', message: res.message, type: 'success' });
        }
      }
    });
  }

  togglePermission(staff: any, viewId: string): void {
    const permissions = [...(staff.permissions || [])];
    const index = permissions.indexOf(viewId);
    if (index > -1) {
      permissions.splice(index, 1);
    } else {
      permissions.push(viewId);
    }
    
    this.http.patch<any>(`${this.backendBaseUrl}/admin/staff/permissions`, { userId: staff._id, permissions }).subscribe({
      next: res => {
        if (res.success) {
          staff.permissions = permissions;
        }
      }
    });
  }

  // --- Mobile Version Control ---
  mobileVersionConfig: any = {};
  selectedAppForVersion = 'kenouz';

  onAppForVersionChange(app: string): void {
    this.selectedAppForVersion = app;
    this.loadMobileVersion();
  }

  loadMobileVersion(): void {
    this.http.get(`${this.backendBaseUrl}/mobile-version?app=${this.selectedAppForVersion}`).subscribe({
      next: (config: any) => {
        this.mobileVersionConfig = config;
        if (!this.mobileVersionConfig.liveUpdate) {
          this.mobileVersionConfig.liveUpdate = {
            version: '1.0.0',
            enabled: false,
            zipUrl: this.selectedAppForVersion === 'mushaf' ? 'https://knoozbook.com/mushaf-bundle.zip' : 'https://knoozbook.com/bundle.zip'
          };
        }
      },
      error: (err) => {
        this.showErrorModal('فشل تحميل إعدادات التطبيق');
      }
    });
  }

  saveMobileVersion(): void {
    this.http.put(`${this.backendBaseUrl}/mobile-version?app=${this.selectedAppForVersion}`, this.mobileVersionConfig).subscribe({
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

  loadSystemSettings(): void {
    this.http.get<SystemSettings>(`${this.backendBaseUrl}/admin/settings`).subscribe({
      next: (settings) => {
        if (settings) {
          // Update top-level properties
          if (typeof settings.maintenanceMode !== 'undefined') this.systemSettings.maintenanceMode = settings.maintenanceMode;

          // Deep merge sub-objects to preserve local defaults for new fields
          if (settings.gamification) {
            this.systemSettings.gamification = { ...this.systemSettings.gamification, ...settings.gamification };
          }
          if (settings.quranPoints) {
            this.systemSettings.quranPoints = { ...this.systemSettings.quranPoints, ...settings.quranPoints };
          }
          if (settings.economy) {
            this.systemSettings.economy = { ...this.systemSettings.economy, ...settings.economy };
          }

          this.originalSettings = JSON.parse(JSON.stringify(this.systemSettings));
          console.log('System settings loaded:', this.systemSettings);
        }
      },
      error: (err) => {
        console.error('Error loading settings', err);
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

  loadFeedbacks(): void {
    console.log('Loading reader feedback...');
    this.http.get<any>(`${this.backendBaseUrl}/feedback/all`).subscribe({
      next: (res) => {
        if (res.success) {
          this.feedbacks = res.feedback;
        }
      },
      error: (err) => console.error('Error loading feedback', err)
    });
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
        quranPoints: {
          VERSE_MEMORIZED: 5,
          PAGE_COMPLETE: 10,
          HIZB_COMPLETE: 50,
          JUZ_COMPLETE: 100,
          DAILY_STREAK: 20,
          KHATMA_COMPLETE: 1000,
          REVISION_PAGE_COMPLETE: 5,
          REVISION_VERSE_COMPLETE: 2
        },
        economy: {
          coinExchangeRate: 50,
          quranPointsPerEGP: 500,
          quranMinConversionPoints: 5,
          minimumWithdrawal: 500
        },
        maintenanceMode: false,
        bourseConfig: {
          isActive: true,
          netProfitMargin: 10,
          freeGiftThreshold: 1000,
          allowedCategories: [],
          booksPerSlot: 8,
          includeMerchantProducts: true,
          allowPublisherUpload: true
        }
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



  loadFilterOptions(): void {
    this.http.get<{ success: boolean; availablePublishers: string[]; availableCategories: string[]; availableMerchants: string[] }>(
      `${this.backendBaseUrl}/admin/filter-options`
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.availablePublishers = response.availablePublishers || [];
          this.availableMerchants = response.availableMerchants || [];
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Failed to load filter options:', err);
      }
    });
  }

  loadProducts(): void {
    const params = `?page=${this.productsPage}&limit=${this.productsPageSize}` +
                   `&searchTerm=${encodeURIComponent(this.searchTerm || '')}` +
                   `&category=${encodeURIComponent(this.currentFilter || '')}` +
                   `&ebookFilter=${this.ebookFilter || ''}` +
                   `&merchantFilter=${this.merchantFilter || ''}` +
                   `&publisherFilter=${encodeURIComponent(this.publisherFilter || '')}` +
                   `&sortField=${this.sortField || ''}` +
                   `&sortDirection=${this.sortDirection || 'asc'}`;

    this.http.get<{ success: boolean; products: Product[]; totalCount: number; availablePublishers: string[]; availableMerchants: string[] }>(`${this.backendBaseUrl}/admin/products${params}`).subscribe({
      next: (response) => {
        if (response.success) {
          response.products.forEach((p, index) => {
            if (p.product_category && typeof p.product_category === 'string') {
              p.product_category = p.product_category.trim();
              if (this.categoryMap[p.product_category]) {
                p.product_category = this.categoryMap[p.product_category];
              }
            }
            if (!p.product_category || !this.categories.includes(p.product_category)) {
              p.product_category = this.categories[0];
            }
            p.fileOrder = index + (this.productsPage - 1) * this.productsPageSize;
            p.editMode = false;
            p.isSaving = false;
            p.detailsOpen = false;
          });
          this.products = response.products;
          this.originalProducts = JSON.parse(JSON.stringify(response.products));
          this.totalProductsCount = response.totalCount ?? response.products.length;
          if (response.availablePublishers && response.availablePublishers.length > 0) {
            this.availablePublishers = response.availablePublishers;
          }
          if (response.availableMerchants && response.availableMerchants.length > 0) {
            this.availableMerchants = response.availableMerchants;
          }
          this.cdr.detectChanges();
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

  openBulkAdjustModal(): void {
    this.showBulkAdjustModal = true;
    if (this.merchantsList.length === 0) {
      this.loadMerchantsList();
    }
  }

  closeBulkAdjustModal(): void {
    this.showBulkAdjustModal = false;
  }

  onBulkAdjust() {
    console.log('--- Starting Bulk Adjustment ---');
    console.log('Adjustment Data:', this.bulkAdjustData);

    if (this.bulkAdjustData.adjustmentType !== 'sync_cost' && !this.bulkAdjustData.adjustmentValue) {
      this.showErrorModal('يرجى إدخال قيمة التعديل');
      return;
    }

    this.isBulkAdjusting = true;
    this.http.post(`${this.backendBaseUrl}/admin/products/bulk-adjust`, this.bulkAdjustData).subscribe({
      next: (res: any) => {
        console.log('Bulk adjustment response:', res);
        this.showSuccessModal('تم تطبيق التعديلات بنجاح');
        this.showBulkAdjustModal = false;
        this.isBulkAdjusting = false;
        this.loadProducts();
      },
      error: (err) => {
        console.error('Bulk adjustment failed:', err);
        this.showErrorModal('فشل تطبيق التعديلات');
        this.isBulkAdjusting = false;
      }
    });
  }

  toggleCategorySelection(cat: string): void {
    if (cat === 'جميع الفئات') {
      this.bulkAdjustData.category = ['جميع الفئات'];
      return;
    }

    // Remove "All" if it's there and we're picking a specific one
    const allIndex = this.bulkAdjustData.category.indexOf('جميع الفئات');
    if (allIndex !== -1) {
      this.bulkAdjustData.category.splice(allIndex, 1);
    }

    const index = this.bulkAdjustData.category.indexOf(cat);
    if (index === -1) {
      this.bulkAdjustData.category.push(cat);
    } else {
      this.bulkAdjustData.category.splice(index, 1);
      // If none selected, default back to All
      if (this.bulkAdjustData.category.length === 0) {
        this.bulkAdjustData.category = ['جميع الفئات'];
      }
    }
  }

  focusProductByBarcode(barcode: string): void {
    if (!barcode) return;

    // Find product by barcode or products_id
    const trimmed = barcode.trim();
    const product = this.allProducts.find(p => p['barcode'] === trimmed || p.products_id === trimmed);

    if (product) {
      // Clear search to show the target product if it was filtered out
      if (this.searchTerm) {
        this.searchTerm = '';
        this.onSearchTermChange();
      }

      // Small delay to ensure view is updated if search was cleared
      setTimeout(() => {
        const element = document.getElementById('product-row-' + product.products_id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Flash effect
          element.classList.add('bg-purple-100', 'dark:bg-purple-900/40');
          setTimeout(() => element.classList.remove('bg-purple-100', 'dark:bg-purple-900/40'), 1500);

          // Focus quantity input
          const qtyInput = document.getElementById('input-qty-' + product.products_id) as HTMLInputElement;
          if (qtyInput) {
            qtyInput.focus();
            qtyInput.select();
          }
        }
      }, 100);

      this.inventoryBarcodeSearch = ''; // Clear the input
    } else {
      // Not found alert
      alert('لم يتم العثور على منتج بهذا الباركود: ' + trimmed);
      this.inventoryBarcodeSearch = '';
    }
  }

  isCategorySelected(cat: string): boolean {
    return this.bulkAdjustData.category.includes(cat);
  }

  // Cached filtered+sorted product array — rebuilt on any filter/sort change
  private _filteredProducts: Product[] = [];

  rebuildFilteredProducts(): void {
    this.productsPage = 1;
    this.loadProducts();
  }

  get filteredProducts(): Product[] {
    return this.products;
  }

  updateProductsPage(): void {
    // Handled on server-side
  }

  nextProductsPage(): void {
    if (this.productsPage < this.totalProductsPages()) {
      this.productsPage++;
      this.loadProducts();
      this.scrollToTop();
    }
  }

  onSearchTermChange(): void {
    this.rebuildFilteredProducts();
  }

  onEbookFilterChange(): void {
    this.rebuildFilteredProducts();
  }

  onCategoryFilterChange(): void {
    this.rebuildFilteredProducts();
  }

  onPageSizeChange(): void {
    this.productsPage = 1;
    this.loadProducts();
  }

  onSortFieldChange(newValue: string): void {
    const value = newValue as keyof Product | '';
    if (value === this.sortField) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = value;
      this.sortDirection = 'asc';
    }
    this.rebuildFilteredProducts();
  }

  toggleSortDirection(): void {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.loadProducts();
  }

  prevProductsPage(): void {
    if (this.productsPage > 1) {
      this.productsPage--;
      this.loadProducts();
      this.scrollToTop();
    }
  }

  totalProductsPages(): number {
    return Math.ceil(this.totalProductsCount / this.productsPageSize) || 1;
  }

  updateProduct(product: Product): void {
    this.showProgressModal('جاري تحديث المنتج...');
    product.isSaving = true; // Start saving indicator
    const updateData = {
      product_name: product.product_name,
      product_quantity: product.product_quantity,
      product_category: product.product_category,
      product_description: product.product_description,
      copyType: product.copyType || '',
      condition: product.condition || '',
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
    console.log('--- Starting Save All Products ---');
    const changedProducts = this.products.filter(p => this.hasProductChanged(p));
    console.log(`Found ${changedProducts.length} changed products out of ${this.products.length}`);

    if (changedProducts.length === 0) {
      this.showErrorModal('لم يتم اكتشاف أي تغييرات لحفظها');
      return;
    }

    const payload = {
      products: changedProducts.map(p => ({
        products_id: p.products_id,
        product_name: p.product_name,
        product_quantity: p.product_quantity,
        product_category: p.product_category,
        product_description: p.product_description,
        product_price: p.product_price,
        price_cost: p.price_cost,
        publisher: p['publisher'] || '',
        author: p['author'] || '',
        publishYear: p['publishYear'] || '',
        pages: p['pages'] || 0,
        coverType: p['coverType'] || '',
        language: p['language'] || '',
        stationeryType: p['stationeryType'] || '',
        material: p['material'] || '',
        color: p['color'] || '',
        size: p['size'] || '',
        brand: p['brand'] || ''
      }))
    };

    console.log('Sending payload to batch-update:', payload);

    this.http.post(`${this.backendBaseUrl}/admin/products/batch-update`, payload).subscribe({
      next: (res: any) => {
        console.log('Batch update response:', res);
        this.showSuccessModal('تم حفظ جميع التغييرات بنجاح');

        // Refresh products to reset originalProducts and update UI
        this.loadProducts();

        // Trigger background sync to Excel just in case
        this.http.post(`${this.backendBaseUrl}/admin/sync-to-excel`, {}).subscribe({
          next: () => console.log('Background Excel sync triggered'),
          error: (err) => console.warn('Background Excel sync failed:', err)
        });

        // Trigger background sync to Google Sheets
        this.http.post(`${this.backendBaseUrl}/admin/sync-json-to-google-sheets`, {}).subscribe({
          next: () => console.log('Background Google Sheets sync triggered'),
          error: (err) => console.warn('Background Google Sheets sync failed:', err)
        });
      },
      error: (err) => {
        this.closeProgressModal();
        console.error('Batch update failed:', err);
        this.showErrorModal('فشل حفظ التغييرات');
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
      product.copyType !== original.copyType ||
      product.condition !== original.condition ||
      product.product_price !== original.product_price ||
      product.price_cost !== original.price_cost ||
      product['publisher'] !== original['publisher'] ||
      product['author'] !== original['author'] ||
      product['publishYear'] !== original['publishYear'] ||
      product['pages'] !== original['pages'] ||
      product['coverType'] !== original['coverType'] ||
      product['language'] !== original['language']
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

  showBulkEditModal(): void {
    // Reset bulk edit data
    this.bulkEditData = {
      copyType: '',
      condition: '',
      category: '',
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
      brand: ''
    };
    this.showBulkEditModalFlag = true;
  }

  applyBulkEdit(): void {
    const selectedProductIds = Array.from(this.selectedProducts);
    if (selectedProductIds.length === 0) {
      this.showErrorModal('لم يتم تحديد أي منتجات');
      return;
    }

    // Build update data with only non-empty fields
    const updateData: any = {};
    if (this.bulkEditData.copyType) updateData.copyType = this.bulkEditData.copyType;
    if (this.bulkEditData.condition) updateData.condition = this.bulkEditData.condition;
    if (this.bulkEditData.category) updateData.product_category = this.bulkEditData.category;
    
    // Add category-specific fields
    if (this.bulkEditData.category && this.categoryFieldsMap[this.bulkEditData.category]) {
      this.categoryFieldsMap[this.bulkEditData.category].forEach(field => {
        if (this.bulkEditData[field]) {
          updateData[field] = this.bulkEditData[field];
        }
      });
    }

    if (Object.keys(updateData).length === 0) {
      this.showErrorModal('لم يتم تحديد أي حقول للتعديل');
      return;
    }

    this.showProgressModal('جاري تطبيق التعديل الجماعي...');

    this.http.patch(`${this.backendBaseUrl}/admin/products/bulk-update`, {
      productIds: selectedProductIds,
      updates: updateData
    }).subscribe({
      next: () => {
        this.closeProgressModal();
        this.showSuccessModal('تم تطبيق التعديل الجماعي بنجاح');
        this.showBulkEditModalFlag = false;
        this.selectedProducts.clear();
        this.loadProducts();
      },
      error: (err) => {
        this.closeProgressModal();
        console.error('Bulk edit error:', err);
        const errorMessage = err.error?.message || err.message || 'حدث خطأ أثناء تطبيق التعديل الجماعي';
        this.showErrorModal(errorMessage);
      }
    });
  }

  getFieldLabel(field: string): string {
    const labels: { [key: string]: string } = {
      author: 'المؤلف',
      publisher: 'دار النشر',
      pages: 'عدد الصفحات',
      coverType: 'نوع الغلاف',
      language: 'اللغة',
      publishYear: 'سنة النشر',
      stationeryType: 'نوع الأداة',
      material: 'الخامة',
      color: 'اللون',
      size: 'المقاس/السعة',
      brand: 'الماركة'
    };
    return labels[field] || field;
  }

  getWhatsAppUrl(phone: string | undefined): string {
    if (!phone) return '';
    // Clean phone number - remove spaces, dashes, and ensure it starts with country code
    let cleanedPhone = phone.replace(/[\s\-\(\)]/g, '');
    // If it doesn't start with +, add Egypt country code
    if (!cleanedPhone.startsWith('+')) {
      // If it starts with 0 (e.g., 01000000000), replace leading 0 with +20
      if (cleanedPhone.startsWith('0')) {
        cleanedPhone = '+20' + cleanedPhone.substring(1);
      }
      // If it starts with 20 (e.g., 201000000000), add + at the beginning
      else if (cleanedPhone.startsWith('20')) {
        cleanedPhone = '+' + cleanedPhone;
      }
      // Otherwise, add full +20 prefix
      else {
        cleanedPhone = '+20' + cleanedPhone;
      }
    }
    return `https://wa.me/${cleanedPhone.replace('+', '')}`;
  }



  exportProductsToExcel(): void {
    this.http.get<{ success: boolean; products: Product[] }>(`${this.backendBaseUrl}/admin/products?all=true`).subscribe({
      next: (response) => {
        if (response.success) {
          let filtered = [...response.products];

          // 1. Filter by categories
          if (this.exportOptions.categories.length > 0 && !this.exportOptions.categories.includes('جميع الفئات')) {
            filtered = filtered.filter(p => this.exportOptions.categories.includes(p.product_category));
          }

          // 2. Filter by max quantity
          if (this.exportOptions.maxQuantity !== null) {
            filtered = filtered.filter(p => p.product_quantity <= (this.exportOptions.maxQuantity || 0));
          }

          if (filtered.length === 0) {
            this.showErrorModal('لا توجد منتجات تطابق هذه الفلاتر للتصدير.');
            return;
          }

          const worksheet = XLSX.utils.json_to_sheet(filtered.map(p => ({
            'المعرف': p.products_id,
            'الباركود': p['barcode'] || '',
            'اسم المنتج': p.product_name,
            'الفئة': p.product_category,
            'الكمية': p.product_quantity,
            'سعر التكلفة': p.price_cost,
            'سعر البيع': p.product_price,
            'الوصف': p.product_description
          })));

          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtered Products');
          XLSX.writeFile(workbook, `products_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
          this.showExportModal = false;
        } else {
          this.showErrorModal('فشل في جلب المنتجات للتصدير');
        }
      },
      error: () => {
        this.showErrorModal('خطأ في الاتصال بالخادم أثناء تصدير المنتجات');
      }
    });
  }

  openWholesalePriceModal(): void {
    this.showWholesalePriceModal = true;
  }

  generateWholesaleExcel(): void {
    this.http.get<{ success: boolean; products: Product[] }>(`${this.backendBaseUrl}/admin/products?all=true`).subscribe({
      next: (response) => {
        if (response.success) {
          let filtered = [...response.products];

          // Filter by scope
          if (this.wholesaleOptions.scope === 'category' && this.wholesaleOptions.selectedCategory) {
            filtered = filtered.filter(p => p.product_category === this.wholesaleOptions.selectedCategory);
          } else if (this.wholesaleOptions.scope === 'admin') {
            filtered = filtered.filter(p => !p.merchantName || p.merchantName === 'admin');
          } else if (this.wholesaleOptions.scope === 'merchants') {
            filtered = filtered.filter(p => p.merchantName && p.merchantName !== 'admin');
          } else if (this.wholesaleOptions.scope === 'specific_merchant' && this.wholesaleOptions.selectedMerchant) {
            filtered = filtered.filter(p => p.merchantName === this.wholesaleOptions.selectedMerchant);
          }

          if (filtered.length === 0) {
            this.showErrorModal('لا توجد منتجات تطابق هذه الفلاتر للتصدير.');
            return;
          }

          // Build the data array based on selected columns
          const data = filtered.map(product => {
            const row: any = {};

            if (this.wholesaleOptions.columns.product_name) {
              row['اسم المنتج'] = product.product_name;
            }
            if (this.wholesaleOptions.columns.product_category) {
              row['الفئة'] = product.product_category;
            }
            if (this.wholesaleOptions.columns.price_cost) {
              row['سعر الشراء'] = Math.ceil(product.price_cost || 0);
            }
            if (this.wholesaleOptions.columns.product_price) {
              row['سعر البيع'] = Math.ceil(product.product_price || 0);
            }
            if (this.wholesaleOptions.columns.product_quantity) {
              row['الكمية'] = product.product_quantity || 0;
            }
            if (this.wholesaleOptions.columns.author) {
              row['المؤلف'] = product['author'] || '';
            }
            if (this.wholesaleOptions.columns.publisher) {
              row['الناشر'] = product['publisher'] || '';
            }
            if (this.wholesaleOptions.columns.merchantName) {
              row['المصدر'] = product.merchantName || 'admin';
            }
            if (this.wholesaleOptions.columns.copyType) {
              row['نوع النسخة'] = product.copyType || '';
            }
            if (this.wholesaleOptions.columns.condition) {
              row['الحالة'] = product.condition || '';
            }
            if (this.wholesaleOptions.columns.barcode) {
              row['الباركود'] = product['barcode'] || '';
            }
            if (this.wholesaleOptions.columns.product_description) {
              row['الوصف'] = product.product_description || '';
            }
            if (this.wholesaleOptions.columns.weight) {
              row['الوزن'] = product.weight || 0;
            }
            if (this.wholesaleOptions.columns.dimensions) {
              const length = product.length || 0;
              const width = product.width || 0;
              const height = product.height || 0;
              row['الأبعاد'] = length && width && height ? `${length}×${width}×${height}` : '';
            }
            if (this.wholesaleOptions.columns.product_price_before_discount) {
              row['السعر قبل الخصم'] = Math.ceil(product.product_price_before_discount || 0);
            }
            if (this.wholesaleOptions.columns.product_discount_percent) {
              row['نسبة الخصم'] = product.product_discount_percent || 0;
            }
            if (this.wholesaleOptions.columns.wholesale_price) {
              // Calculate wholesale price based on method
              if (this.wholesaleOptions.priceMethod === 'same') {
                row['سعر الجملة'] = Math.ceil(product.product_price || 0);
              } else if (this.wholesaleOptions.priceMethod === 'percentage') {
                const costPrice = product.price_cost || 0;
                const percentage = product.merchantName && product.merchantName !== 'admin' 
                  ? (this.wholesaleOptions.merchantPercentage || 0) 
                  : (this.wholesaleOptions.adminPercentage || 0);
                const calculatedPrice = costPrice + (costPrice * (percentage / 100));
                row['سعر الجملة'] = Math.ceil(calculatedPrice);
              }
            }

            return row;
          });

          const worksheet = XLSX.utils.json_to_sheet(data);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'أسعار الجملة');
          
          const fileName = `wholesale_prices_${new Date().toISOString().slice(0, 10)}.xlsx`;
          XLSX.writeFile(workbook, fileName);
          
          this.showWholesalePriceModal = false;
          this.showSuccessModal('تم إنشاء ملف إكسل أسعار الجملة بنجاح! ✅');
        } else {
          this.showErrorModal('فشل في جلب المنتجات للتصدير');
        }
      },
      error: () => {
        this.showErrorModal('خطأ في الاتصال بالخادم أثناء تصدير أسعار الجملة');
      }
    });
  }

  exportAllDataToExcel(): void {
    this.http.get<{ success: boolean; products: Product[] }>(`${this.backendBaseUrl}/admin/products?all=true`).subscribe({
      next: (response) => {
        if (response.success) {
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
          const productsWorksheet = XLSX.utils.json_to_sheet(response.products.map(product => ({
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
        } else {
          this.showErrorModal('فشل في جلب المنتجات لتصدير كافة البيانات');
        }
      },
      error: () => {
        this.showErrorModal('خطأ في الاتصال بالخادم لتصدير كافة البيانات');
      }
    });
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

  toggleBulkImportMode(): void {
    this.isBulkImportMode = !this.isBulkImportMode;
    if (this.isBulkImportMode && this.merchantsList.length === 0) {
      this.loadMerchantsList();
    }
  }

  loadMerchantsList(): void {
    this.adminService.getMerchants().subscribe({
      next: (res: any) => {
        this.merchantsList = res.merchants || [];
      },
      error: (error) => {
        console.error('Error loading merchants:', error);
      }
    });
  }

  onBulkFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    this.bulkFile = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      if (jsonData.length > 0) {
        this.excelHeaders = jsonData[0] as string[];
        this.parsedBulkData = XLSX.utils.sheet_to_json(sheet);
        // Auto-mapping based on similarity
        this.autoMapFields();
        // Analyze categories
        this.detectCategoriesFromExcel();
      }
    };
    reader.readAsBinaryString(this.bulkFile);
  }

  onPublisherImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.publisherImageFile = input.files[0];
    }
  }

  autoMapFields(): void {
    this.fieldMapping = {};
    const commonMappings: { [key: string]: string[] } = {
      'product_name': ['اسم المنتج', 'الاسم', 'Name', 'Title', 'product_name', 'اسم'],
      'product_quantity': ['الكمية', 'العدد', 'Quantity', 'Qty', 'Stock', 'المخزن'],
      'product_category': ['التصنيف', 'القسم', 'Category', 'Section', 'الفئة'],
      'product_description': ['الوصف', 'التفاصيل', 'Description', 'Details'],
      'product_price': ['السعر', 'سعر البيع', 'Price', 'Sale Price'],
      'price_cost': ['التكلفة', 'سعر التكلفة', 'Cost', 'Cost Price'],
      'weight': ['الوزن', 'Weight'],
      'author': ['المؤلف', 'الكاتب', 'Author'],
      'publisher': ['الناشر', 'دار النشر', 'Publisher'],
      'barcode': ['الباركود', 'Barcode', 'رمز'],
      'products_id': ['كود', 'رقم', 'ID', 'Code'],
      'image_path': ['الصورة', 'رابط الصورة', 'Image', 'Image URL'],
      'length': ['الطول', 'Length', 'L'],
      'width': ['العرض', 'Width', 'W'],
      'height': ['الارتفاع', 'Height', 'H']
    };

    this.systemFields.forEach(field => {
      const possibleNames = commonMappings[field.key] || [];
      const match = this.excelHeaders.find(h => 
        possibleNames.some(p => h.toLowerCase().includes(p.toLowerCase()))
      );
      if (match) {
        this.fieldMapping[field.key] = match;
      }
    });
  }

  detectCategoriesFromExcel(): void {
    const categoryField = this.fieldMapping['product_category'];
    if (!categoryField) {
      this.detectedExcelCategories = [];
      return;
    }

    const excelCategories = [...new Set(this.parsedBulkData.map((row: any) => row[categoryField]).filter(Boolean))];
    this.detectedExcelCategories = excelCategories.map(c => String(c).trim());
    
    // Auto-map existing categories if they match exactly
    this.detectedExcelCategories.forEach(excelCat => {
      if (!this.categoryValueMapping[excelCat]) {
        const match = this.allCategories.find(c => c.toLowerCase() === excelCat.toLowerCase());
        if (match) {
          this.categoryValueMapping[excelCat] = match;
        } else {
          // Default to current default or leave for user
          this.categoryValueMapping[excelCat] = '';
        }
      }
    });
  }

  startBulkImport(): void {
    if (!this.parsedBulkData.length) {
      this.showErrorModal('يرجى اختيار ملف Excel يحتوي على بيانات.');
      return;
    }

    if (this.bulkImportType === 'merchant' && !this.selectedMerchantId) {
      this.showErrorModal('يرجى اختيار التاجر أولاً.');
      return;
    }

    if (this.bulkImportType === 'publisher' && !this.selectedPublisher) {
      this.showErrorModal('يرجى كتابة اسم دار النشر.');
      return;
    }

    // Check if required fields are mapped
    const requiredFields = ['product_name', 'product_price'];
    const missingFields = requiredFields.filter(f => !this.fieldMapping[f]);
    if (missingFields.length > 0) {
      const fieldLabels = missingFields.map(f => this.systemFields.find(sf => sf.key === f)?.label).join(', ');
      this.showErrorModal(`يرجى ربط الحقول المطلوبة التالية: ${fieldLabels}`);
      return;
    }

    this.importingBulk = true;
    this.bulkImportProgress = 0;

    // Prepare data
    const formattedProducts = this.parsedBulkData.map(row => {
      const product: any = {};
      Object.keys(this.fieldMapping).forEach(key => {
        const excelCol = this.fieldMapping[key];
        if (excelCol) {
          product[key] = row[excelCol];
        }
      });
      // Set default quantity to 2 if missing or zero
      if (!product.product_quantity || parseInt(product.product_quantity) <= 0) {
        product.product_quantity = 2;
      }
      
      // Map category from Excel value to System category
      if (product.product_category) {
        const excelVal = String(product.product_category).trim();
        if (this.categoryValueMapping[excelVal]) {
          product.product_category = this.categoryValueMapping[excelVal];
        } else {
          // Fuzzy match if no explicit mapping
          const providedCat = excelVal.toLowerCase();
          const foundMatch = [...this.allCategories, ...this.categories].find(c => 
            c.toLowerCase() === providedCat || 
            providedCat.includes(c.toLowerCase()) || 
            c.toLowerCase().includes(providedCat)
          );
          if (foundMatch) {
            product.product_category = foundMatch;
          }
        }
      }

      // Final fallback to default category if missing or still not in our lists
      const currentAvailableCats = [...this.allCategories, ...this.categories, ...this.bookSubCategories];
      if (!product.product_category || !currentAvailableCats.includes(product.product_category)) {
        product.product_category = this.bulkDefaultCategory;
      }

      // Apply default copyType and condition (admin-selected values override Excel)
      if (this.bulkDefaultCopyType) {
        product.copyType = this.bulkDefaultCopyType;
      }
      if (this.bulkDefaultCondition) {
        product.condition = this.bulkDefaultCondition;
      }
      
      return product;
    });

    const formData = new FormData();
    formData.append('products', JSON.stringify(formattedProducts));
    formData.append('merchantId', (this.bulkImportType === 'merchant' ? this.selectedMerchantId : null) || '');
    formData.append('publisher', (this.bulkImportType === 'publisher' ? this.selectedPublisher : null) || '');
    
    if (this.publisherImageFile) {
      formData.append('publisherImage', this.publisherImageFile);
    }

    // Use fetch API for streaming response to avoid timeout
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const token = user?.token || localStorage.getItem('token');
    
    fetch(`${this.backendBaseUrl}/admin/bulk-add-products`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).then(async (response) => {
      console.log('Response received:', response.status, response.ok);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        console.log('Starting to read streaming response...');
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('Stream reading completed');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          console.log(`Received ${lines.length} lines from stream`);
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                console.log('Parsed data:', data);
                
                if (data.type === 'progress') {
                  this.bulkImportProgress = data.progress;
                  console.log(`Progress: ${data.progress}% - ${data.message}`);
                  this.cdr.detectChanges();
                } else if (data.type === 'complete') {
                  this.importingBulk = false;
                  this.bulkImportSuccess = true;
                  this.bulkImportProgress = 100;
                  const message = data.message || `تم استيراد ${formattedProducts.length} منتج بنجاح.`;
                  this.showSuccessModal(message);
                  this.resetBulkImport();
                  this.loadProducts();
                  return;
                } else if (data.type === 'error') {
                  this.importingBulk = false;
                  this.bulkImportProgress = 0;
                  this.showErrorModal(data.message || 'حدث خطأ أثناء الاستيراد');
                  return;
                } else if (data.type === 'info') {
                  console.log('Info:', data.message);
                }
              } catch (parseErr) {
                console.warn('Failed to parse streaming line:', line);
              }
            }
          }
        }
      }
    }).catch((err) => {
      this.importingBulk = false;
      this.bulkImportProgress = 0;
      console.error('Bulk Import Error:', err);
      let userMessage = 'حدث خطأ أثناء الاستيراد الجماعي.';
      
      if (err.message.includes('timeout') || err.message.includes('Timeout')) {
        userMessage = 'انتهت مهلة الطلب بسبب كثرة المنتجات. جاري معالجتها في الخلفية...';
      } else if (err.message.includes('Failed to fetch')) {
        userMessage = 'فشل الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
      }
      
      this.showErrorModal(userMessage);
    });
  }

  resetBulkImport(): void {
    this.bulkFile = null;
    this.publisherImageFile = null;
    this.excelHeaders = [];
    this.fieldMapping = {};
    this.parsedBulkData = [];
    this.isBulkImportMode = false;
  }

  syncToGoogleSheets(): void {
    const confirmSync = confirm('هل أنت متأكد من رغبتك في مزامنة جميع البيانات مع Google Sheets؟ سيتم استبدال البيانات الحالية هناك.');
    if (!confirmSync) return;

    this.showSuccessModal('جاري بدء المزامنة مع Google Sheets في الخلفية...');
    this.http.post(`${this.backendBaseUrl}/admin/sync-json-to-google-sheets`, {}).subscribe({
      next: (res: any) => {
        this.showSuccessModal(res.message || 'تمت المزامنة بنجاح');
      },
      error: (err) => {
        console.error('Google Sheets sync failed:', err);
        this.showErrorModal('فشلت المزامنة مع Google Sheets');
      }
    });
  }

  getMappedPreview(): any[] {
    if (!this.parsedBulkData.length || Object.keys(this.fieldMapping).length === 0) {
      return [];
    }
    return this.parsedBulkData.slice(0, 5).map(row => {
      const preview: any = {};
      Object.keys(this.fieldMapping).forEach(key => {
        const excelCol = this.fieldMapping[key];
        if (excelCol) {
          preview[key] = row[excelCol];
        }
      });
      return preview;
    });
  }

  downloadTemplate(): void {
    const templateData = [
      {
        'اسم المنتج': 'مثال: كتاب مقدمة في الفلسفة',
        'الكمية': 10,
        'التصنيف': 'رواية',
        'الوصف': 'وصف تجريبي للمنتج',
        'السعر (البيع)': 150,
        'سعر التكلفة': 100,
        'الوزن (جرام)': 500,
        'المؤلف': 'اسم المؤلف',
        'دار النشر': 'اسم الدار',
        'الباركود': '123456789012',
        'كود المنتج': 'PRD-001',
        'عدد الصفحات': 200,
        'نوع الغلاف': 'غلاف ورقي',
        'اللغة': 'العربية',
        'سنة النشر': 2024,
        'الطول': 20,
        'العرض': 14,
        'الارتفاع': 2,
        'نوع النسخة': 'هاي كوبي',
        'الحالة': 'جديد'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'kenouz_bulk_import_template.xlsx');
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

  formatOrderShortDate(dateString: string): string {
    const date = new Date(dateString || new Date());
    return new Intl.DateTimeFormat('ar-EG', { 
      month: 'numeric', 
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    }).format(date);
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
                isMerchantOrder: order.isMerchantOrder || false,
                paymentStatus: order.paymentStatus,
                isCommunityItem: order.isCommunityItem,
                communityItemId: order.communityItemId,
                communityOwnerId: order.communityOwnerId,
                communityOwnerName: order.communityOwnerName,
                communityOwnerPhone: order.communityOwnerPhone,
                communityOwnerAddress: order.communityOwnerAddress,
                statusLog: order.statusLog,
                shippingMethod: order.shippingMethod,
                source: order.source || 'website',
                amazonOrderId: order.amazonOrderId || undefined,
                hasStockIssues: order.hasStockIssues || false,
                stockIssueDetails: order.stockIssueDetails || []
              };
            }
            groupedOrdersMap[order._id].products.push({
              product_name: order.book,
              product_quantity: order.quantity,
              isMerchantOrder: order.isMerchantOrder || false
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

  autoShipOrder(orderId: string): void {
    const action = () => {
      this.showInfoModal('جاري الشحن', 'جاري معالجة الشحن آلياً مع شركة الشحن...');
      this.http.post(`${environment.apiBaseUrl}/orders/ship/${orderId}`, {}).subscribe({
        next: (res: any) => {
          if (res.success) {
            this.showSuccessModal('تم إنشاء الشحنة بنجاح! رقم التتبع: ' + res.data.trackingNumber);
            this.loadOrders();
          } else {
            this.showErrorModal(res.message || 'فشل إنشاء الشحنة');
          }
        },
        error: (err) => {
          console.error('Shipment Error:', err);
          this.showErrorModal(err.error?.message || 'حدث خطأ أثناء الاتصال بشركة الشحن');
        }
      });
    };

    this.openModal(
      'تأكيد الشحن الآلي',
      'هل تريد شحن هذا الطلب آلياً عبر شركة الشحن المتعاقد معها؟',
      'info',
      'شحن الآن',
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

  updateFinalPrice(userId: string, orderId: string, projectIndex: number, finalPrice: number): void {
    if (finalPrice === null || finalPrice === undefined || isNaN(finalPrice) || finalPrice < 0) {
      this.showErrorModal('يرجى إدخال سعر نهائي صحيح');
      return;
    }
    this.http.patch(`${this.backendBaseUrl}/print/update-final-price/${userId}/${orderId}/${projectIndex}`, { finalPrice }).subscribe({
      next: () => {
        this.showSuccessModal('تم تحديث السعر النهائي بنجاح');
        this.loadPrintOrders();
      },
      error: (err) => {
        this.showErrorModal('حدث خطأ أثناء تحديث السعر النهائي');
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
      case 'ارسال الاستلام':
        confirmMessage = 'هل أنت متأكد من البدء في استلام المنتج من صاحبه؟ سيتم إرسال تنبيه للطرفين.';
        successMessage = 'تم تحديث حالة الطلب إلى ارسال الاستلام.';
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
            'تم الإلغاء': 'إلغاء',
            'ارسال الاستلام': 'طلب استلام'
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

  onUpdateImageDragOver(event: DragEvent, product: Product): void {
    event.preventDefault();
    event.stopPropagation();
    product['isDragOver'] = true;
  }

  onUpdateImageDragLeave(event: DragEvent, product: Product): void {
    event.preventDefault();
    event.stopPropagation();
    product['isDragOver'] = false;
  }

  onUpdateImageDrop(event: DragEvent, product: Product): void {
    event.preventDefault();
    event.stopPropagation();
    product['isDragOver'] = false;

    // Case 1: actual file(s) dropped from file manager / desktop
    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      this.processImageUpdate(file, product);
      return;
    }

    // Case 2: content dragged from a browser (URL or image element)
    // Priority: img src in HTML > direct image URL in uri-list > any URL in plain text
    const imageExtRe = /\.(jpg|jpeg|png|gif|webp|bmp|avif|svg)(\?.*)?$/i;
    let imageUrl = '';

    // 2a. Extract actual image src from HTML drag data (most reliable)
    const htmlData = event.dataTransfer?.getData('text/html') || '';
    if (htmlData) {
      const srcMatch = htmlData.match(/src=["']([^"']+)["']/i);
      if (srcMatch && srcMatch[1] && srcMatch[1].startsWith('http')) {
        imageUrl = srcMatch[1];
      }
    }

    // 2b. uri-list: prefer URLs that end with an image extension
    if (!imageUrl) {
      const uriList = event.dataTransfer?.getData('text/uri-list') || '';
      const urls = uriList.split('\n').map((u: string) => u.trim()).filter((u: string) => u && !u.startsWith('#'));
      const directImg = urls.find((u: string) => imageExtRe.test(u));
      if (directImg) {
        imageUrl = directImg;
      } else if (urls.length > 0 && urls[0].startsWith('http')) {
        imageUrl = urls[0];
      }
    }

    // 2c. plain text fallback
    if (!imageUrl) {
      const plain = (event.dataTransfer?.getData('text/plain') || '').trim();
      if (plain.startsWith('http')) imageUrl = plain;
    }

    if (imageUrl) {
      this.processImageUrlUpdate(imageUrl, product);
    } else {
      this.showErrorModal('لم يتم التعرف على صورة في المحتوى المسحوب.\nتأكد من سحب الصورة مباشرة من المتصفح، أو استخدم زر تحميل الصورة.');
    }
  }

  processImageUrlUpdate(imageUrl: string, product: Product): void {
    this.showProgressModal('جاري تحميل الصورة من الرابط...');
    this.http.post(
      `${this.backendBaseUrl}/admin/products/${product.products_id}/image`,
      { imageUrl },
      { headers: { 'Content-Type': 'application/json' } }
    ).subscribe({
      next: (_res: any) => {
        this.closeProgressModal();
        this.showSuccessModal('تم تحديث صورة المنتج بنجاح');
        this.loadProducts();
      },
      error: (err) => {
        this.closeProgressModal();
        const errMsg = err?.error?.message || 'حدث خطأ أثناء تحديث صورة المنتج من الرابط';
        this.showErrorModal(errMsg);
        console.error('[AdminDashboard] Image URL upload error:', err);
      }
    });
  }

  onImageSelectedForUpdate(event: Event, product: Product): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.processImageUpdate(file, product);
      input.value = '';
    }
  }

  processImageUpdate(file: File, product: Product): void {
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
    
    if (!validImageTypes.includes(file.type)) {
      this.showErrorModal('يرجى تحميل ملف صورة صالح (JPEG, PNG, GIF, WEBP, BMP, SVG).');
      return;
    }
    // @ts-ignore
    if (this.MAX_IMAGE_SIZE_BYTES && file.size > this.MAX_IMAGE_SIZE_BYTES) {
      this.showErrorModal('حجم الصورة أكبر من 3 ميجابايت. يرجى تحميل صورة أصغر.');
      return;
    }

    this.showProgressModal('جاري تحديث صورة المنتج...');
    const formData = new FormData();
    formData.append('image', file);

    this.http.post(`${this.backendBaseUrl}/admin/products/${product.products_id}/image`, formData).subscribe({
      next: (res: any) => {
        this.closeProgressModal();
        this.showSuccessModal('تم تحديث صورة المنتج بنجاح');
        // Reload all products from server so the new image path is fetched fresh
        this.loadProducts();
      },
      error: (err) => {
        this.closeProgressModal();
        const errMsg = (err?.error?.message) || 'حدث خطأ أثناء تحديث صورة المنتج';
        this.showErrorModal(errMsg);
        console.error('[AdminDashboard] Image upload error:', err);
      }
    });
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
    // Don't auto-remove the URL — it may fail to preview due to CORS but still be
    // a perfectly valid image URL that the backend can use as image_path.
    console.warn(`⚠️ Image URL preview failed for index ${index}: ${this.imageUrls[index]}. This may be a CORS issue, the URL is kept.`);
  }

  submitAddProduct(): void {
    // Prevent multiple simultaneous submissions
    if (this.uploading) {
      return;
    }

    // Check network status before attempting upload
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.showErrorModal('لا يوجد اتصال بالإنترنت. يرجى التحقق من الاتصال والمحاولة مرة أخرى.');
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

    console.log('Starting upload to:', `${this.backendBaseUrl}/admin/add-product`);
    console.log('Network status:', typeof navigator !== 'undefined' ? navigator.onLine : 'unknown');

    this.http.request('POST', `${this.backendBaseUrl}/admin/add-product`, {
      body: formData,
      reportProgress: true,
      observe: 'events'
    }).pipe(
      timeout(300000), // Timeout after 5 minutes for large file uploads
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
        console.error('Error details:', {
          status: error?.status,
          statusText: error?.statusText,
          message: error?.message,
          error: error?.error,
          name: error?.name,
          ok: error?.ok,
          url: `${this.backendBaseUrl}/admin/add-product`
        });
        
        // Extract server-provided message when possible
        let errorMessage = 'حدث خطأ أثناء إضافة المنتج.';
        
        if (error?.status === 0) {
          errorMessage = 'فشل الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
          console.error('Network connection failed. Possible causes: CORS, server down, or network issue.');
        } else if (error?.status === 401) {
          errorMessage = 'انتهت جلسة العمل. يرجى تسجيل الدخول مرة أخرى.';
        } else if (error?.status === 403) {
          errorMessage = 'ليس لديك صلاحية لإضافة منتجات.';
        } else if (error?.status === 413) {
          errorMessage = 'حجم الملفات كبير جداً. يرجى تقليل حجم الصور.';
        } else if (error?.status === 500) {
          errorMessage = 'خطأ في الخادم. يرجى المحاولة مرة أخرى لاحقاً.';
        } else if (error?.error?.message) {
          errorMessage = error.error.message;
        } else if (error?.message) {
          errorMessage = error.message;
        }
        
        const statusInfo = error && error.status ? ` (HTTP ${error.status})` : '';
        this.showErrorModal(errorMessage + statusInfo);
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
      copyType: '',
      condition: '',
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
      suggestedCategory: '',
      weight: 0,
      length: '',
      width: '',
      height: ''
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

  // Amazon Methods
  publishProductToAmazon(productId: string): void {
    if (this.publishingToAmazon.has(productId)) return;
    
    this.publishingToAmazon.add(productId);
    
    this.http.post(`${environment.apiBaseUrl}/amazon/products/${productId}/amazon/publish`, {}).subscribe({
      next: (res) => {
        this.publishingToAmazon.delete(productId);
        this.showSuccessModal('تم بدء النشر على أمازون');
        this.pollAmazonStatus(productId);
      },
      error: (err) => {
        this.publishingToAmazon.delete(productId);
        if (err.status === 503) {
          this.showErrorModal('خدمة قائمة انتظار أمازون غير متاحة حالياً. Redis غير متصل.');
        } else {
          this.showErrorModal('فشل في بدء النشر على أمازون');
        }
      }
    });
  }

  syncProductAmazon(productId: string): void {
    if (this.syncingAmazon.has(productId)) return;
    
    this.syncingAmazon.add(productId);
    
    this.http.post(`${environment.apiBaseUrl}/amazon/products/${productId}/amazon/sync`, {}).subscribe({
      next: (res) => {
        this.syncingAmazon.delete(productId);
        this.showSuccessModal('تم بدء المزامنة مع أمازون');
        this.pollAmazonStatus(productId);
      },
      error: (err) => {
        this.syncingAmazon.delete(productId);
        if (err.status === 503) {
          this.showErrorModal('خدمة قائمة انتظار أمازون غير متاحة حالياً. Redis غير متصل.');
        } else {
          this.showErrorModal('فشل في المزامنة مع أمازون');
        }
      }
    });
  }

  isPublishingToAmazon(productId: string): boolean {
    return this.publishingToAmazon.has(productId);
  }

  isSyncingAmazon(productId: string): boolean {
    return this.syncingAmazon.has(productId);
  }

  pollAmazonStatus(productId: string): void {
    const pollInterval = setInterval(() => {
      this.http.get(`${environment.apiBaseUrl}/amazon/products/${productId}/amazon/status`).subscribe({
        next: (res: any) => {
          const product = this.products.find((p: any) => p['_id'] === productId || p['products_id'] === productId);
          if (product) {
            product['amazonStatus'] = res.data.status;
            product['amazonSku'] = res.data.sku;
            product['amazonAsin'] = res.data.asin;
            product['amazonLastError'] = res.data.lastError;
            product['amazonSyncedAt'] = res.data.syncedAt;
            product['amazonPrice'] = res.data.price;

            // Update progress message based on status
            if (res.data.status === 'publishing') {
              if (res.data.inProgress) {
                product['amazonProgress'] = 'جاري النشر على أمازون...';
              } else {
                product['amazonProgress'] = 'في انتظار المعالجة...';
              }
            } else if (res.data.status === 'published') {
              product['amazonProgress'] = 'تم النشر بنجاح';
              this.publishingToAmazon.delete(productId);
              this.syncingAmazon.delete(productId);
              clearInterval(pollInterval);
            } else if (res.data.status === 'failed') {
              product['amazonProgress'] = 'فشل النشر';
              this.publishingToAmazon.delete(productId);
              this.syncingAmazon.delete(productId);
              clearInterval(pollInterval);
            } else if (res.data.status === 'suppressed') {
              product['amazonProgress'] = 'تم كبت المنتج';
              this.publishingToAmazon.delete(productId);
              this.syncingAmazon.delete(productId);
              clearInterval(pollInterval);
            }

            if (res.data.status === 'published' || res.data.status === 'failed' || res.data.status === 'suppressed') {
              clearInterval(pollInterval);
            }
          }
        },
        error: (err) => {
          console.error('Error polling Amazon status:', err);
          const product = this.products.find((p: any) => p['_id'] === productId || p['products_id'] === productId);
          if (product) {
            product['amazonProgress'] = 'خطأ في الاتصال';
          }
          clearInterval(pollInterval);
        }
      });
    }, 5000);

    setTimeout(() => {
      clearInterval(pollInterval);
    }, 15 * 60 * 1000);
  }

  
  bulkPublishAmazonSelectedProducts(): void {
    const selectedIds = Array.from(this.selectedProducts);
    
    // Filter out products that are already published or being published
    const eligibleIds = selectedIds.filter(id => {
      const product = this.products.find(p => p.products_id === id || p['_id'] === id);
      return product && product['amazonStatus'] !== 'published' && product['amazonStatus'] !== 'queued' && product['amazonStatus'] !== 'publishing' && !product['amazonAsin'] && product['status'] !== 'rejected';
    });

    if (eligibleIds.length === 0) {
      this.showErrorModal('جميع المنتجات المحددة منشورة بالفعل على أمازون أو لا يمكن نشرها (يجب أن تكون مقبولة).');
      return;
    }

    const action = () => {
      this.showProgressModal(`جاري بدء النشر لـ ${eligibleIds.length} منتجات على أمازون...`);
      
      let completed = 0;
      let failed = 0;
      
      // Process products sequentially with delay to avoid SKU conflicts
      eligibleIds.forEach((productId, index) => {
        // Add delay between each request (2 seconds)
        setTimeout(() => {
          this.publishingToAmazon.add(productId);
          
          this.http.post(`${this.backendBaseUrl.replace('/api/admin', '/api')}/amazon/products/${productId}/amazon/publish`, {}).subscribe({
            next: (res) => {
              this.publishingToAmazon.delete(productId);
              this.pollAmazonStatus(productId);
              completed++;
              this.checkBulkAmazonComplete(completed, failed, eligibleIds.length);
            },
            error: (err) => {
              this.publishingToAmazon.delete(productId);
              failed++;
              this.checkBulkAmazonComplete(completed, failed, eligibleIds.length);
            }
          });
        }, index * 2000); // 2 second delay between each product
      });
    };

    this.openModal(
      'تأكيد النشر على أمازون',
      `هل أنت متأكد من نشر ${eligibleIds.length} منتج على أمازون؟ سيتم إرسالها إلى طابور الانتظار للعمل عليها.`,
      'warning',
      'تأكيد النشر',
      'إلغاء',
      true,
      action
    );
  }

  private checkBulkAmazonComplete(completed: number, failed: number, total: number) {
    if (completed + failed === total) {
      setTimeout(() => {
        this.closeProgressModal();
        if (failed === 0) {
          this.showSuccessModal(`تم إرسال ${completed} منتجات إلى أمازون بنجاح.`);
        } else {
          this.showErrorModal(`تم إرسال ${completed} منتجات، وفشل إرسال ${failed} منتجات.`);
        }
      }, 500);
    }
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

  openWhatsApp(phoneNumber: string, bookName: string): void {
    const message = `مرحباً، بخصوص اقتراحك لكتاب "${bookName}"`;
    const whatsappUrl = `${this.getWhatsAppUrl(phoneNumber)}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
    return this.dataService.getBookImageUrl(product);
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
