import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MerchantService } from '../services/merchant.service';
import { MerchantAuthService } from '../services/merchant-auth.service';

interface Product {
  products_id: string;
  product_name: string;
  product_quantity: number;
  product_category: string;
  product_description: string;
  product_price: number;
  price_cost: number;
  product_image?: string;
  merchantLogo?: string;
}

interface Order {
  _id: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  products: { product_name: string; product_quantity: number }[];
  status: string;
  orderDate: string;
  totalAmount: number;
}

@Component({
  selector: 'app-merchant-dashboard',
  standalone: true,
  imports: [DatePipe, FormsModule, CommonModule],
  templateUrl: './merchant-dashboard.component.html',
  styleUrls: ['./merchant-dashboard.component.css']
})
export class MerchantDashboardComponent implements OnInit {
  products: Product[] = [];
  orders: Order[] = [];

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

  newProduct: Partial<Product> = {
    product_name: '',
    product_quantity: 1,
    product_category: '',
    product_description: '',
    product_price: 0,
    price_cost: 0,
    product_image: undefined,
  };

  selectedFile: File | null = null;
  merchantId: string = '';
  isLoading = false;
  errorMessage = '';

  constructor(
    private merchantService: MerchantService,
    private merchantAuthService: MerchantAuthService
  ) {}

  ngOnInit(): void {
    if (!this.merchantAuthService.isAuthenticated()) {
      this.errorMessage = 'يرجى تسجيل الدخول كتاجر للوصول إلى لوحة التحكم';
      return;
    }

    this.loadMerchantData();
    this.loadProducts();
    this.loadOrders();
  }
  private loadMerchantData(): void {
    this.merchantService.getCurrentMerchant().subscribe({
      next: (merchant) => {
        this.merchantId = merchant._id;
        console.log('Loaded merchant data:', merchant);
        this.errorMessage = ''; // Clear any previous errors
      },
      error: (err) => {
        console.error('Error loading merchant data:', err);
        this.handleMerchantError(err);
      }
    });
  }

  private handleMerchantError(error: any): void {
    if (error.status === 401) {
      this.errorMessage = 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.';
      this.merchantAuthService.logout().subscribe();
    } else if (error.status === 404) {
      this.errorMessage = 'لم يتم العثور على بيانات التاجر. يرجى التحقق من حسابك.';
    } else if (error.status === 403) {
      this.errorMessage = 'حساب التاجر غير مفعل. يرجى انتظار موافقة الإدارة.';
    } else if (error.status === 500) {
      this.errorMessage = 'حدث خطأ في الخادم. يرجى المحاولة مرة أخرى لاحقًا.';
    } else {
      this.errorMessage = 'حدث خطأ أثناء تحميل بيانات التاجر. يرجى المحاولة مرة أخرى.';
    }
  }

  loadProducts(): void {
    this.isLoading = true;
    this.merchantService.getMerchantProducts().subscribe({
      next: (products) => {
        this.isLoading = false;
        this.products = products;
      },
      error: (err) => {
        this.isLoading = false;
        console.error('Error loading merchant products:', err);
        if (err.status === 401) {
          this.errorMessage = 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.';
        }
      }
    });
  }

  loadOrders(): void {
    this.merchantService.getMerchantOrders().subscribe({
      next: (orders) => {
        this.orders = orders;
      },
      error: (err) => {
        console.error('Error loading merchant orders:', err);
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    } else {
      this.selectedFile = null;
    }
  }

  submitNewProduct(): void {
    if (!this.validateProduct()) {
      return;
    }

    if (!this.merchantId) {
      alert('خطأ: لم يتم تحميل بيانات التاجر. يرجى تسجيل الدخول مرة أخرى.');
      return;
    }

    const formData = this.createFormData();

    this.merchantService.addProduct(formData).subscribe({
      next: (response) => {
        if (response.success) {
          alert('تم إضافة المنتج بنجاح، في انتظار موافقة الإدارة.');
          this.resetProductForm();
          this.loadProducts();
        } else {
          alert('حدث خطأ أثناء إضافة المنتج: ' + response.message);
        }
      },
      error: (err) => {
        console.error('Error adding new product:', err);
        alert('حدث خطأ أثناء إضافة المنتج.');
      }
    });
  }

  private validateProduct(): boolean {
    if (!this.newProduct.product_name || !this.newProduct.product_quantity ||
        !this.newProduct.product_category || !this.newProduct.product_description ||
        this.newProduct.product_price === undefined || this.newProduct.price_cost === undefined) {
      alert('يرجى ملء جميع الحقول المطلوبة بشكل صحيح.');
      return false;
    }
    return true;
  }

  private createFormData(): FormData {
    const formData = new FormData();
    formData.append('product_name', this.newProduct.product_name!);
    formData.append('product_quantity', this.newProduct.product_quantity!.toString());
    formData.append('product_category', this.newProduct.product_category!);
    formData.append('product_description', this.newProduct.product_description!);
    formData.append('product_price', this.newProduct.product_price!.toString());
    formData.append('price_cost', this.newProduct.price_cost!.toString());
    formData.append('merchantId', this.merchantId);

    if (this.selectedFile) {
      formData.append('product_image', this.selectedFile);
    }

    return formData;
  }

  private resetProductForm(): void {
    this.newProduct = {
      product_name: '',
      product_quantity: 1,
      product_category: '',
      product_description: '',
      product_price: 0,
      price_cost: 0,
      product_image: undefined,
    };
    this.selectedFile = null;
  }
}
