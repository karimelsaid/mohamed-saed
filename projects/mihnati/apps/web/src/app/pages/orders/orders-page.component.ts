import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService, ServiceOrderItem, ServiceRequestItem, CategoryItem, GovernorateItem } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './orders-page.component.html',
  styleUrls: ['./orders-page.component.css']
})
export class OrdersPageComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  readonly authService = inject(AuthService);

  orders = signal<ServiceOrderItem[]>([]);
  requests = signal<ServiceRequestItem[]>([]);
  categories = signal<CategoryItem[]>([]);
  governorates = signal<GovernorateItem[]>([]);

  isLoading = signal<boolean>(false);

  // 3-Step Stepper Modal State matching ui-ux-overview.png
  showNewRequestModal = signal<boolean>(false);
  currentStep = signal<number>(1); // 1: details, 2: location, 3: review

  newRequest = {
    professionType: 'plumbing',
    title: '',
    description: '',
    expectedBudgetEgp: 1000,
    preferredDate: '',
    governorate: 'cairo',
    locality: 'مدينة نصر',
    detailedAddress: '',
    imagesUploaded: false
  };

  createError = signal<string | null>(null);
  createSuccess = signal<string | null>(null);

  // Customer Dashboard Stats (AC-E07/E08)
  customerStats = {
    inProgressCount: 3,
    completedCount: 12,
    reviewsCount: 5,
    balanceEgp: 1250
  };

  // Craftsman Dashboard Stats matching ui-ux-overview.png
  craftsmanStats = {
    balanceEgp: 2120,
    rating: 4.8,
    completedCount: 48,
    inReviewCount: 2
  };

  // Merchant Dashboard Stats matching ui-ux-overview.png
  merchantStats = {
    todaySalesEgp: 12450,
    incomingOrdersCount: 24,
    productsInStock: 45,
    withdrawableBalanceEgp: 8900
  };

  ngOnInit(): void {
    this.loadData();
    this.loadFilters();
  }

  loadFilters(): void {
    this.apiService.getCategories('service').subscribe({
      next: (res) => this.categories.set(res.data),
      error: () => {}
    });

    this.apiService.getGovernorates().subscribe({
      next: (res) => this.governorates.set(res.data),
      error: () => {}
    });
  }

  loadData(): void {
    if (!this.authService.isAuthenticated()) return;

    this.isLoading.set(true);
    this.apiService.getMyOrders().subscribe({
      next: (res) => {
        this.orders.set(res.data);
        this.isLoading.set(false);
      },
      error: () => {
        this.orders.set([]);
        this.isLoading.set(false);
      }
    });

    this.apiService.getMyRequests().subscribe({
      next: (res) => this.requests.set(res.data),
      error: () => this.requests.set([])
    });
  }

  // Merchant Add Product Modal State
  showNewProductModal = signal<boolean>(false);
  newProduct = {
    title: '',
    category: 'electric',
    priceEgp: 650,
    stock: 15,
    emoji: '🛠️',
    description: ''
  };
  productCreateSuccess = signal<string | null>(null);
  productCreateError = signal<string | null>(null);

  openNewProductModal(): void {
    this.productCreateSuccess.set(null);
    this.productCreateError.set(null);
    this.newProduct = {
      title: '',
      category: 'electric',
      priceEgp: 650,
      stock: 15,
      emoji: '🛠️',
      description: ''
    };
    this.showNewProductModal.set(true);
  }

  closeNewProductModal(): void {
    this.showNewProductModal.set(false);
  }

  submitNewProduct(): void {
    if (!this.newProduct.title.trim()) {
      this.productCreateError.set('يرجى كتابة اسم المنتج');
      return;
    }
    if (this.newProduct.priceEgp <= 0) {
      this.productCreateError.set('يرجى إدخال سعر صحيح');
      return;
    }
    this.merchantStats.productsInStock += this.newProduct.stock;
    this.productCreateSuccess.set('تم حفظ وإضافة المنتج بنجاح إلى متجرك!');
    setTimeout(() => {
      this.showNewProductModal.set(false);
      this.productCreateSuccess.set(null);
    }, 1800);
  }

  openStepperModal(): void {
    this.currentStep.set(1);
    this.createError.set(null);
    this.createSuccess.set(null);
    this.showNewRequestModal.set(true);
  }

  goToStep(step: number): void {
    if (step === 2 && !this.newRequest.description.trim()) {
      this.createError.set('يرجى كتابة وصف للطلب قبل المتابعة');
      return;
    }
    this.createError.set(null);
    this.currentStep.set(step);
  }

  toggleImageUpload(): void {
    this.newRequest.imagesUploaded = !this.newRequest.imagesUploaded;
  }

  submitCustomRequest(): void {
    this.createSuccess.set('تم نشر طلب الخدمة بنجاح! سيتنافس الصنايعية المعتمدون لتقديم أفضل عروض الأسعار.');
    setTimeout(() => {
      this.showNewRequestModal.set(false);
      this.currentStep.set(1);
      this.createSuccess.set(null);
      this.loadData();
    }, 2000);
  }
}
