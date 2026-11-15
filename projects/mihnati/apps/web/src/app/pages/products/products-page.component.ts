import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { ApiService, ProductItem, CategoryItem, StoreItem } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

export interface StoreCatalogProduct {
  id: string;
  title: string;
  category: string;
  priceEgp: number;
  emoji: string;
  badge?: string;
  stock: number;
  description?: string;
}

export interface CartItem {
  product: StoreCatalogProduct;
  quantity: number;
}

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './products-page.component.html',
  styleUrls: ['./products-page.component.css']
})
export class ProductsPageComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly authService = inject(AuthService);

  // Store Categories matching ui-ux-overview.png
  storeCategories = [
    { id: 'all', nameAr: 'كل الأقسام' },
    { id: 'electric', nameAr: 'أدوات كهربائية' },
    { id: 'plumbing', nameAr: 'أدوات سباكة' },
    { id: 'carpentry', nameAr: 'أدوات نجارة' },
    { id: 'building', nameAr: 'دهانات ومواد بناء' },
    { id: 'safety', nameAr: 'معدات السلامة' },
    { id: 'other', nameAr: 'أخرى' }
  ];

  selectedCategory = signal<string>('all');
  searchQuery = signal<string>('');

  // Catalog Products matching ui-ux-overview.png
  catalogProducts: StoreCatalogProduct[] = [
    {
      id: 'p1',
      title: 'مثقاب كهربائي لاسلكي 18V',
      category: 'electric',
      priceEgp: 1250,
      emoji: '🛠️',
      badge: 'الأكثر مبيعاً',
      stock: 14,
      description: 'مثقاب احترافي بقوة 18 فولت مع بطاريتين ليثيوم وشاحن سريع'
    },
    {
      id: 'p2',
      title: 'طقم أدوات سباكة ومحابس نحاس',
      category: 'plumbing',
      priceEgp: 350,
      emoji: '🔩',
      stock: 28,
      description: 'طقم محابس وبكر تفلون ومفاتيح ربط إيطالية أصلية'
    },
    {
      id: 'p3',
      title: 'دهان جوتن ممتاز قابل للغسيل',
      category: 'building',
      priceEgp: 620,
      emoji: '🪣',
      stock: 45,
      description: 'بستلة دهان بلاستيك نصف لامع قابل للغسيل عالي التغطية'
    },
    {
      id: 'p4',
      title: 'صندوق أدوات نجارة متكامل 45 قطعة',
      category: 'carpentry',
      priceEgp: 450,
      emoji: '🧰',
      stock: 12,
      description: 'شاكوش ومنشار وفارات ومفكات صلب مقاومة للصدأ'
    },
    {
      id: 'p5',
      title: 'نظارات وخوذة أمان للموقع',
      category: 'safety',
      priceEgp: 180,
      emoji: '🥽',
      stock: 60,
      description: 'خوذة أمان معتمدة مطابقة للمواصفات ونظارة حماية ضد الشظايا'
    },
    {
      id: 'p6',
      title: 'مفك فحص كهرباء ديجيتال',
      category: 'electric',
      priceEgp: 120,
      emoji: '⚡',
      stock: 35,
      description: 'مفك كشف جهد وتوصيل مع شاشة ديجيتال وإضاءة LED'
    }
  ];

  filteredProducts = signal<StoreCatalogProduct[]>([]);

  // Cart & Checkout State matching ui-ux-overview.png
  showCheckoutModal = signal<boolean>(false);
  cart = signal<CartItem[]>([
    {
      product: {
        id: 'p1',
        title: 'مثقاب كهربائي لاسلكي 18V',
        category: 'electric',
        priceEgp: 1250,
        emoji: '🛠️',
        stock: 14
      },
      quantity: 1
    },
    {
      product: {
        id: 'p2',
        title: 'طقم أدوات سباكة ومحابس نحاس',
        category: 'plumbing',
        priceEgp: 350,
        emoji: '🔩',
        stock: 28
      },
      quantity: 1
    }
  ]);

  // Add Product Modal State (for Merchant)
  showNewProductModal = signal<boolean>(false);
  newProduct = {
    title: '',
    category: 'electric',
    priceEgp: 500,
    stock: 10,
    emoji: '🛠️',
    description: ''
  };
  productCreateSuccess = signal<string | null>(null);
  productCreateError = signal<string | null>(null);

  // Checkout Form
  paymentMethod = signal<'card' | 'wallet' | 'cod'>('cod');
  customerName = signal<string>('أحمد محمد');
  customerPhone = signal<string>('01012345678');
  customerAddress = signal<string>('القاهرة - مدينة نصر');
  checkoutSuccess = signal<boolean>(false);

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['openCart'] === 'true') {
        this.showCheckoutModal.set(true);
      }
      if (params['action'] === 'new-product') {
        this.openNewProductModal();
      }
    });
    this.filterCatalog();
  }

  filterCatalog(): void {
    let list = [...this.catalogProducts];
    if (this.selectedCategory() !== 'all') {
      list = list.filter((p) => p.category === this.selectedCategory());
    }
    if (this.searchQuery().trim()) {
      const q = this.searchQuery().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q));
    }
    this.filteredProducts.set(list);
  }

  onSelectCategory(catId: string): void {
    this.selectedCategory.set(catId);
    this.filterCatalog();
  }

  addToCart(product: StoreCatalogProduct): void {
    const current = [...this.cart()];
    const index = current.findIndex((item) => item.product.id === product.id);
    if (index > -1) {
      current[index].quantity += 1;
    } else {
      current.push({ product, quantity: 1 });
    }
    this.cart.set(current);
    this.showCheckoutModal.set(true);
  }

  updateQuantity(index: number, delta: number): void {
    const current = [...this.cart()];
    current[index].quantity += delta;
    if (current[index].quantity <= 0) {
      current.splice(index, 1);
    }
    this.cart.set(current);
  }

  get totalCartPriceEgp(): number {
    return this.cart().reduce((sum, item) => sum + item.product.priceEgp * item.quantity, 0);
  }

  get cartItemsCount(): number {
    return this.cart().reduce((sum, item) => sum + item.quantity, 0);
  }

  openCheckout(): void {
    this.checkoutSuccess.set(false);
    this.showCheckoutModal.set(true);
  }

  closeCheckout(): void {
    this.showCheckoutModal.set(false);
  }

  submitCheckout(): void {
    this.checkoutSuccess.set(true);
    setTimeout(() => {
      this.cart.set([]);
      this.showCheckoutModal.set(false);
    }, 2500);
  }

  // Merchant Add Product Methods
  openNewProductModal(): void {
    this.productCreateSuccess.set(null);
    this.productCreateError.set(null);
    this.newProduct = {
      title: '',
      category: 'electric',
      priceEgp: 500,
      stock: 10,
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
      this.productCreateError.set('يرجى إدخال اسم المنتج');
      return;
    }
    if (this.newProduct.priceEgp <= 0) {
      this.productCreateError.set('يرجى إدخال سعر صحيح');
      return;
    }

    const created: StoreCatalogProduct = {
      id: 'p_' + Date.now(),
      title: this.newProduct.title.trim(),
      category: this.newProduct.category,
      priceEgp: this.newProduct.priceEgp,
      emoji: this.newProduct.emoji || '📦',
      badge: 'جديد',
      stock: this.newProduct.stock,
      description: this.newProduct.description
    };

    this.catalogProducts.unshift(created);
    this.filterCatalog();
    this.productCreateSuccess.set('تمت إضافة المنتج بنجاح إلى متجرك!');
    setTimeout(() => {
      this.showNewProductModal.set(false);
      this.productCreateSuccess.set(null);
    }, 1800);
  }
}
