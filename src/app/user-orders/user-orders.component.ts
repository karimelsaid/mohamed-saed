import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { CommonModule, NgForOf } from '@angular/common';
import { take } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';
import { PaymentService } from '../services/payment.service';
import { ModalService } from '../services/modal.service';
import { PaymentModalComponent } from '../payment-modal/payment-modal.component';
import { Browser } from '@capacitor/browser';
import { AnalyticsTrackingService } from '../services/analytics-tracking.service';

interface RatedBook {
  bookId: string;
  rating: number;
}

interface Product {
  book: string;
  quantity: number;
  bookId?: string;
  rating?: number;
  selectedRating?: number;
}

interface PrintProject {
  filename: string;
  filepath: string;
  size: string;
  coverType: string;
  printColor: string;
  pages: number;
  copies: number;
  notes?: string;
  projectTitle: string;
  estimatedPrice: number;
  finalPrice?: number | null;
  createdAt: string;
}

interface Order {
  _id: string;
  products: Product[];
  printProjects?: PrintProject[];
  status: string;
  orderDate: string;
  address: string;
  totalAmount: number;
  paymentStatus?: string;
  isCommunityItem?: boolean;
  communityItemId?: string;
}

@Component({
  selector: 'app-user-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, PaymentModalComponent],
  templateUrl: './user-orders.component.html',
  styleUrls: ['./user-orders.component.css']
})
export class UserOrdersComponent implements OnInit {
  orders: Order[] = [];
  allOrders: Order[] = []; // Store all orders for client-side pagination
  loading: boolean = false;
  error: string = '';

  currentPage: number = 1;
  pageSize: number = 5;
  totalOrders: number = 0;

  userId: string = '';
  ratedBooks: RatedBook[] = [];
  showArchived: boolean = false;

  // Payment Modal State
  showPaymentModal: boolean = false;
  paymentUrl: string = '';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private paymentService: PaymentService,
    private modalService: ModalService,
    private analyticsTrackingService: AnalyticsTrackingService
  ) { }

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      if (user && user.id) {
        this.userId = user.id;
        this.loadOrders(this.userId);
        this.loadRatedBooks(this.userId);
      }
    });
  }

  loadOrders(userId: string): void {
    this.loading = true;
    let httpParams = new HttpParams();
    if (this.showArchived) {
      httpParams = httpParams.set('includeArchived', 'true');
    }
    this.http.get<Order[]>(`${environment.apiBaseUrl}/orders/user-orders/${userId}`, { params: httpParams }).subscribe({
      next: (data) => {
        this.allOrders = data; // Store all orders
        this.totalOrders = data.length;
        this.updateOrdersPage(); // Update displayed orders for current page
        this.loading = false;
      },
      error: (err) => {
        this.error = 'حدث خطأ أثناء تحميل الطلبات.';
        this.loading = false;
        console.error('Error loading user orders:', err);
      }
    });
  }

  updateOrdersPage(): void {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.orders = this.allOrders.slice(startIndex, endIndex);
  }

  totalPages(): number {
    return Math.ceil(this.totalOrders / this.pageSize);
  }

  loadRatedBooks(userId: string): void {
    this.http.get<RatedBook[]>(`${environment.apiBaseUrl}/users/rated-books/${userId}`).subscribe({
      next: (data) => {
        this.ratedBooks = data;
        this.applyRatingsToOrders();
      },
      error: (err) => {
        console.error('Error loading rated books:', err);
      }
    });
  }

  applyRatingsToOrders(): void {
    this.allOrders.forEach(order => {
      order.products.forEach(product => {
        const ratedBook = this.ratedBooks.find(rb => rb.bookId === product.bookId);
        if (ratedBook) {
          product.rating = ratedBook.rating;
        }
      });
    });
    // Re-apply to current page orders
    this.updateOrdersPage();
  }

  submitRating(bookId: string, rating: number): void {
    if (!this.userId) return;
    this.http.post(`${environment.apiBaseUrl}/users/submit-rating`, { userId: this.userId, bookId, rating }).subscribe({
      next: () => {
        // Track comment event
        const commentId = `rating_${this.userId}_${bookId}_${Date.now()}`;
        this.analyticsTrackingService.trackComment(bookId, commentId, 'user_orders');
        // Update local rating
        const ratedBookIndex = this.ratedBooks.findIndex(rb => rb.bookId === bookId);
        if (ratedBookIndex !== -1) {
          this.ratedBooks[ratedBookIndex].rating = rating;
        } else {
          this.ratedBooks.push({ bookId, rating });
        }
        this.applyRatingsToOrders();
        this.showSuccessModal('تم إرسال التقييم بنجاح');
      },
      error: (err) => {
        console.error('Error submitting rating:', err);
        this.showErrorModal('فشل في إرسال التقييم. يرجى المحاولة مرة أخرى');
      }
    });
  }

  onRatingChange(bookId: string, event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const rating = Number(selectElement.value);
    if (rating >= 1 && rating <= 5) {
      this.submitRating(bookId, rating);
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages()) {
      this.currentPage++;
      this.updateOrdersPage();
      this.scrollToTop();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updateOrdersPage();
      this.scrollToTop();
    }
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelOrder(orderId: string): void {
    console.log(`Cancelling order with ID: ${orderId}`); // Log the order ID
    this.http.patch(`${environment.apiBaseUrl}/orders/update-status/${orderId}`, { status: 'تم الإلغاء' }).subscribe({
      next: () => {
        // Update the status in allOrders and refresh current page
        const order = this.allOrders.find(order => order._id === orderId);
        if (order) {
          order.status = 'تم الإلغاء'; // Update the status locally
          this.updateOrdersPage(); // Refresh current page display
        }
      },
      error: (err) => {
        console.error('Error cancelling order:', err);
      }
    });
  }

  archiveOrder(orderId: string): void {
    console.log(`Archiving order with ID: ${orderId}`); // Log the order ID
    this.http.patch(`${environment.apiBaseUrl}/orders/update-status/${orderId}`, { status: 'مؤرشف' }).subscribe({
      next: () => {
        // Reload orders to filter out archived
        this.loadOrders(this.userId);
        this.showSuccessModal('تم أرشفة الطلب بنجاح');
      },
      error: (err) => {
        console.error('Error archiving order:', err);
        this.showErrorModal('فشل في أرشفة الطلب. يرجى المحاولة مرة أخرى');
      }
    });
  }

  restoreOrder(orderId: string): void {
    console.log(`Restoring order with ID: ${orderId}`); // Log the order ID
    this.http.patch(`${environment.apiBaseUrl}/orders/update-status/${orderId}`, { status: 'تم التسليم' }).subscribe({
      next: () => {
        // Reload orders
        this.loadOrders(this.userId);
        this.showSuccessModal('تم استعادة الطلب بنجاح');
      },
      error: (err) => {
        console.error('Error restoring order:', err);
        this.showErrorModal('فشل في استعادة الطلب. يرجى المحاولة مرة أخرى');
      }
    });
  }

  calculateExpectedDeliveryDate(orderDate: string): string {
    const date = new Date(orderDate);
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() + 3); // Add 3 days
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 5); // Add 5 days
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' };
    return `من ${new Intl.DateTimeFormat('ar-EG', options).format(startDate)} إلى ${new Intl.DateTimeFormat('ar-EG', options).format(endDate)}`;
  }

  calculatePrintProjectExpectedDeliveryDate(createdAt: string): string {
    const date = new Date(createdAt);
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() + 5); // Add 5 days for print projects
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 7); // Add 7 days for print projects
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' };
    return `من ${new Intl.DateTimeFormat('ar-EG', options).format(startDate)} إلى ${new Intl.DateTimeFormat('ar-EG', options).format(endDate)}`;
  }

  // Check if a print order has all final prices set
  hasFinalPrice(order: Order): boolean {
    // Regular book orders always show price
    if (!order.printProjects || order.printProjects.length === 0) {
      return true;
    }
    // For print orders, check if at least one project has a finalPrice
    return order.printProjects.some(p => p.finalPrice != null && p.finalPrice > 0);
  }

  resumePayment(order: Order): void {
    if (!this.userId) {
      this.showErrorModal('يجب تسجيل الدخول لإتمام الدفع');
      return;
    }

    const currency = 'EGP'; // Adjust currency as needed
    const merchantRedirect = window.location.origin + '/order/callback'; // Redirect to custom callback handler

    this.authService.user$.pipe(take(1)).subscribe(user => {
      const customerEmail = user?.email || '';
      // Use existing order ID to create payment session without re-submitting order
      this.paymentService.createPayment(order._id, order.totalAmount, currency, customerEmail, merchantRedirect, 'ar').subscribe({
        next: (paymentResponse: any) => {
          if (paymentResponse.sessionUrl) {
            this.paymentUrl = paymentResponse.sessionUrl;
            this.showPaymentModal = true;
          } else {
            this.showErrorModal('فشل في الحصول على رابط الدفع');
          }
        },
        error: (paymentError) => {
          console.error('خطأ في إنشاء طلب الدفع:', paymentError);
          this.showErrorModal('حدث خطأ أثناء إنشاء طلب الدفع، يرجى المحاولة مرة أخرى');
        }
      });
    });
  }

  onPaymentModalClose(): void {
    this.showPaymentModal = false;
    this.paymentUrl = '';
  }

  onPaymentComplete(success: boolean): void {
    if (success) {
      // Payment successful, reload orders to update status
      this.loadOrders(this.userId);
    }
  }

  // Helper methods for showing modals
  showSuccessModal(message: string): void {
    this.modalService.openModal({
      title: 'نجح العملية',
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

  deleteOrder(orderId: string): void {
    this.modalService.openModal({
      title: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف هذا الطلب نهائياً؟ لا يمكن التراجع عن هذا الإجراء.',
      type: 'warning',
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      showCancel: true,
      action: () => {
        this.http.delete(`${environment.apiBaseUrl}/orders/delete/${orderId}`).subscribe({
          next: () => {
            this.loadOrders(this.userId);
            this.showSuccessModal('تم حذف الطلب بنجاح');
          },
          error: (err) => {
            console.error('Error deleting order:', err);
            this.showErrorModal('فشل في حذف الطلب. يرجى المحاولة مرة أخرى');
          }
        });
      }
    });
  }



  toggleArchived(): void {
    this.showArchived = !this.showArchived;
    this.loadOrders(this.userId);
  }

  async openFile(url: string) {
    if (!url) return;

    // Ensure absolute URL
    let fullUrl = url;
    if (!url.startsWith('http')) {
      fullUrl = `${environment.apiBaseUrl.replace('/api', '')}/${url.startsWith('/') ? url.substring(1) : url}`;
    }

    try {
      await Browser.open({ url: fullUrl });
    } catch (e) {
      console.error('Browser open failed', e);
      // Fallback for web
      window.open(fullUrl, '_blank');
    }
  }
}
