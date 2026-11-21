import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export interface AmazonOrderProduct {
  product_id?: string;
  product_name: string;
  product_price: number;
  product_quantity: number;
  product_image?: string;
  sellerSku?: string;
  asin?: string;
  orderItemId?: string;
}

export interface AmazonOrder {
  _id: string;
  amazonOrderId: string;
  amazonOrderStatus: string; // 'Unshipped' | 'PartiallyShipped' | 'Shipped' | 'Canceled' | 'Pending'
  fulfillmentChannel: string; // 'MFN' | 'AFN'
  easyShipStatus?: string; // 'PendingSchedule' | 'ScheduledForPickup' | 'PickedUp' | 'OutForDelivery' | 'Delivered'
  scheduledPackageId?: string;
  trackingNumber?: string;
  customerName: string;
  email?: string;
  phone?: string;
  address?: string;
  shippingAddressDetails?: {
    name?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    stateOrRegion?: string;
    postalCode?: string;
    countryCode?: string;
    phone?: string;
  };
  products: AmazonOrderProduct[];
  totalAmount: number;
  orderDate: string;
  earliestShipDate?: string;
  latestShipDate?: string;
  handoverSlot?: {
    slotId: string;
    startTime: string;
    endTime: string;
    handoverMethod: string;
  };
  packageDetails?: {
    weight: number;
    weightUnit: string;
    length: number;
    width: number;
    height: number;
    dimensionUnit: string;
  };
  status?: string;
  source: string;
  createdAt?: string;
}

export interface HandoverSlot {
  slotId: string;
  startTime: string;
  endTime: string;
  handoverMethod: string;
  label?: string;
}

@Component({
  selector: 'app-amazon-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './amazon-orders.component.html',
  styleUrls: ['./amazon-orders.component.css']
})
export class AmazonOrdersComponent implements OnInit, OnDestroy {
  orders: AmazonOrder[] = [];
  filteredOrders: AmazonOrder[] = [];
  
  loading = false;
  syncing = false;
  searchQuery = '';
  selectedStatus = 'all'; // 'all', 'unshipped', 'scheduled', 'shipped', 'canceled'

  // KPIs
  kpis = {
    totalOrders: 0,
    unshipped: 0,
    scheduled: 0,
    shipped: 0,
    totalRevenue: 0
  };

  // Pagination
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;
  pageSize = 20;

  // Modals state
  selectedOrder: AmazonOrder | null = null;
  showDetailsModal = false;
  showScheduleModal = false;
  showLabelModal = false;

  // Scheduling Form State
  schedulingLoading = false;
  loadingSlots = false;
  availableSlots: HandoverSlot[] = [];
  selectedSlotId = '';
  schedulePackage = {
    length: 25,
    width: 18,
    height: 5,
    weight: 0.5
  };
  scheduleError: string | null = null;
  scheduleSuccessMsg: string | null = null;

  // Label Print State
  labelData: any = null;
  loadingLabel = false;
  labelFormat: 'a4' | 'thermal' = 'thermal';

  // Alerts
  toastMessage: string | null = null;
  toastType: 'success' | 'error' | 'info' = 'info';

  private destroy$ = new Subject<void>();

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadOrders(page: number = 1): void {
    this.loading = true;
    this.currentPage = page;

    const filters = {
      status: this.selectedStatus,
      search: this.searchQuery,
      page: this.currentPage,
      limit: this.pageSize
    };

    this.adminService.getAmazonOrders(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.loading = false;
          if (res && res.success) {
            this.orders = res.orders || [];
            this.filteredOrders = [...this.orders];
            if (res.kpis) {
              this.kpis = res.kpis;
            }
            if (res.pagination) {
              this.totalPages = res.pagination.totalPages || 1;
              this.totalCount = res.pagination.total || this.orders.length;
            }
          }
        },
        error: (err: any) => {
          this.loading = false;
          this.showToast('تعذر تحميل طلبات أمازون: ' + (err.error?.message || err.message), 'error');
        }
      });
  }

  syncOrdersFromAmazon(): void {
    if (this.syncing) return;
    this.syncing = true;
    this.showToast('جاري الاتصال بـ Amazon SP-API ومزامنة أحدث الطلبات...', 'info');

    this.adminService.syncAmazonOrders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.syncing = false;
          if (res && res.success) {
            this.showToast(res.message || 'تمت المزامنة بنجاح!', 'success');
            this.loadOrders(1);
          } else {
            this.showToast(res.message || 'حدث خطأ أثناء المزامنة', 'error');
          }
        },
        error: (err: any) => {
          this.syncing = false;
          this.showToast('فشل المزامنة مع أمازون: ' + (err.error?.message || err.message), 'error');
        }
      });
  }

  onStatusChange(status: string): void {
    this.selectedStatus = status;
    this.loadOrders(1);
  }

  onSearch(): void {
    this.loadOrders(1);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.loadOrders(1);
  }

  // --- DETAILS MODAL ---
  openDetails(order: AmazonOrder): void {
    this.selectedOrder = order;
    this.showDetailsModal = true;
  }

  closeDetails(): void {
    this.showDetailsModal = false;
    this.selectedOrder = null;
  }

  // --- SCHEDULING MODAL ---
  openScheduleModal(order: AmazonOrder): void {
    this.selectedOrder = order;
    this.selectedSlotId = '';
    this.scheduleError = null;
    this.scheduleSuccessMsg = null;
    this.availableSlots = [];

    // Pre-fill dimensions from order if available
    if (order.packageDetails) {
      this.schedulePackage = {
        length: order.packageDetails.length || 25,
        width: order.packageDetails.width || 18,
        height: order.packageDetails.height || 5,
        weight: order.packageDetails.weight || 0.5
      };
    } else {
      this.schedulePackage = { length: 25, width: 18, height: 5, weight: 0.5 };
    }

    this.showScheduleModal = true;
    this.fetchHandoverSlots();
  }

  closeScheduleModal(): void {
    this.showScheduleModal = false;
    this.selectedOrder = null;
  }

  fetchHandoverSlots(): void {
    if (!this.selectedOrder) return;
    this.loadingSlots = true;
    this.scheduleError = null;

    this.adminService.getAmazonHandoverSlots(this.selectedOrder.amazonOrderId, this.schedulePackage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.loadingSlots = false;
          if (res && res.success && res.timeSlots && res.timeSlots.length > 0) {
            this.availableSlots = res.timeSlots.map((slot: any) => {
              let label = slot.label;
              if (!label && slot.startTime && slot.endTime) {
                const start = new Date(slot.startTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                const end = new Date(slot.endTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                const date = new Date(slot.startTime).toLocaleDateString('ar-EG', { weekday: 'short', month: 'short', day: 'numeric' });
                label = `${date} (${start} - ${end})`;
              }
              return {
                ...slot,
                label: label || slot.slotId
              };
            });
            this.selectedSlotId = this.availableSlots[0].slotId;
          } else {
            this.availableSlots = [];
            this.scheduleError = 'لم يتم العثور على فترات استلام متاحة حالياً.';
          }
        },
        error: (err: any) => {
          this.loadingSlots = false;
          this.scheduleError = 'تعذر استدعاء مواعيد الاستلام: ' + (err.error?.message || err.message);
        }
      });
  }

  confirmSchedule(): void {
    if (!this.selectedOrder || !this.selectedSlotId) return;

    const chosenSlot = this.availableSlots.find(s => s.slotId === this.selectedSlotId);
    if (!chosenSlot) {
      this.scheduleError = 'يرجى اختيار موعد استلام من القائمة.';
      return;
    }

    this.schedulingLoading = true;
    this.scheduleError = null;

    const payload = {
      slotId: chosenSlot.slotId,
      startTime: chosenSlot.startTime,
      endTime: chosenSlot.endTime,
      handoverMethod: chosenSlot.handoverMethod || 'Pickup',
      packageDetails: this.schedulePackage
    };

    this.adminService.scheduleAmazonOrder(this.selectedOrder.amazonOrderId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.schedulingLoading = false;
          if (res && res.success) {
            this.showToast('تمت جدولة الشحنة بنجاح وحجز موعد المندوب!', 'success');
            // Update order locally
            if (this.selectedOrder) {
              this.selectedOrder.easyShipStatus = 'ScheduledForPickup';
              this.selectedOrder.scheduledPackageId = res.scheduledPackageId;
              this.selectedOrder.trackingNumber = res.trackingNumber;
            }
            this.closeScheduleModal();
            this.loadOrders(this.currentPage);
          } else {
            this.scheduleError = res.message || 'فشلت عملية الجدولة';
          }
        },
        error: (err: any) => {
          this.schedulingLoading = false;
          this.scheduleError = 'خطأ أثناء الجدولة: ' + (err.error?.message || err.message);
        }
      });
  }

  // --- LABEL PRINT MODAL ---
  openLabelModal(order: AmazonOrder): void {
    this.selectedOrder = order;
    this.loadingLabel = true;
    this.labelData = null;
    this.showLabelModal = true;

    this.adminService.getAmazonOrderLabel(order.amazonOrderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.loadingLabel = false;
          if (res && res.success) {
            this.labelData = res;
          } else {
            this.showToast('تعذر تحضير بيانات بوليصة الشحن', 'error');
          }
        },
        error: (err: any) => {
          this.loadingLabel = false;
          this.showToast('خطأ في جلب بيانات البوليصة: ' + (err.error?.message || err.message), 'error');
        }
      });
  }

  closeLabelModal(): void {
    this.showLabelModal = false;
    this.selectedOrder = null;
    this.labelData = null;
  }

  openSellerCentralOrder(orderId?: string): void {
    const id = orderId || this.selectedOrder?.amazonOrderId;
    if (!id) return;
    window.open(`https://sellercentral.amazon.eg/orders-v3/order/${id}`, '_blank');
  }

  printCurrentLabel(): void {
    window.print();
  }

  copyToClipboard(text: string, label: string = 'النص'): void {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`تم نسخ ${label} إلى الحافظة`, 'success');
    }).catch(() => {
      this.showToast('تعذر النسخ', 'error');
    });
  }

  // Helper formatting methods

  /** Fallback: hide broken image and show placeholder icon */
  onProductImageError(event: Event, item: any): void {
    item.product_image = '';  // triggers *ngIf to show 📖 fallback
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  getStatusBadgeClass(status?: string): string {
    switch (status?.toLowerCase()) {
      case 'unshipped':
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300';
      case 'partiallyshipped':
        return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300';
      case 'shipped':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300';
      case 'canceled':
      case 'cancelled':
        return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300';
      case 'pending':
        return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300';
    }
  }

  getStatusArabic(status?: string): string {
    switch (status?.toLowerCase()) {
      case 'unshipped': return 'بانتظار الشحن';
      case 'partiallyshipped': return 'شحن جزئي';
      case 'shipped': return 'تم الشحن';
      case 'canceled':
      case 'cancelled': return 'ملغي';
      case 'pending': return 'معلق';
      default: return status || 'غير معروف';
    }
  }

  getEasyShipBadgeClass(status?: string): string {
    switch (status) {
      case 'ScheduledForPickup':
      case 'Scheduled':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300';
      case 'PickedUp':
      case 'OutForDelivery':
        return 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300';
      case 'Delivered':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300';
      case 'PendingSchedule':
      default:
        return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300';
    }
  }

  getEasyShipArabic(status?: string): string {
    switch (status) {
      case 'PendingSchedule': return 'يحتاج جدولة استلام';
      case 'ScheduledForPickup':
      case 'Scheduled': return 'مجدول لاستلام المندوب';
      case 'PickedUp': return 'تم استلامه من المندوب';
      case 'OutForDelivery': return 'خرج للتوصيل';
      case 'Delivered': return 'تم التوصيل للعميل';
      default: return status || 'بانتظار الجدولة';
    }
  }

  showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.toastMessage = msg;
    this.toastType = type;
    setTimeout(() => {
      this.toastMessage = null;
    }, 4500);
  }
}
