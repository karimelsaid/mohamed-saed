import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FormsModule } from '@angular/forms';
import { faHeart, faCartPlus, faSignInAlt, faStar, faUser, faSearch, faTimes, faFilter } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { AuthService } from '../../auth/auth.service';
import { ModalService } from '../../services/modal.service';
import { AnalyticsService } from '../../services/analytics.service';

@Component({
  selector: 'app-merchant-profile',
  templateUrl: './merchant-profile.component.html',
  styleUrls: ['./merchant-profile.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule, FontAwesomeModule, FormsModule]
})
export class MerchantProfileComponent implements OnInit {
  username: string | null = null;
  merchant: any = null;
  products: any[] = [];
  filteredProducts: any[] = [];
  loadingMerchant = false;
  loadingProducts = false;
  error: string | null = null;
  uploadsBaseUrl = environment.uploadsBaseUrl;

  // Filter & Search state
  searchQuery = '';
  selectedCategory = '';
  categories: string[] = [];

  // Icons
  faHeart = faHeart;
  faCartPlus = faCartPlus;
  faSignInAlt = faSignInAlt;
  faStar = faStar;
  faStarRegular = faStarRegular;
  faUser = faUser;
  faSearch = faSearch;
  faTimes = faTimes;
  faFilter = faFilter;

  showLoginPrompt = false;

  constructor(
    private route: ActivatedRoute,
    private merchantAuthService: MerchantAuthService,
    private authService: AuthService,
    private modalService: ModalService,
    private router: Router,
    private analyticsService: AnalyticsService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    if (this.platformId !== 'browser') {
      return;
    }

    this.route.paramMap.subscribe(params => {
      const usernameParam = params.get('username');

      this.error = null;
      this.loadingMerchant = false;
      this.merchant = null;
      this.products = [];
      this.filteredProducts = [];
      this.searchQuery = '';
      this.selectedCategory = '';
      this.categories = [];

      if (usernameParam) {
        console.log(`[MerchantProfile] Activated for username: ${usernameParam}`);
        const reservedKeywords = ['favorites', 'basket', 'login', 'register', 'Home', 'Home-page', 'profile', 'requests', 'referrals', 'library', 'mushaf', 'search', 'research', 'undefined', 'null'];

        if (reservedKeywords.includes(usernameParam.toLowerCase())) {
          console.warn(`[MerchantProfile] Skipping reserved route or invalid username: ${usernameParam}`);
          return;
        }

        this.username = usernameParam.trim();
        const fileExtensions = /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|map|ttf|woff|woff2)$/i;
        if (fileExtensions.test(this.username)) {
          console.warn(`[MerchantProfile] Skipping static asset request: ${this.username}`);
          return;
        }

        this.loadMerchantData(this.username);
      }
    });
  }

  loadMerchantData(username: string) {
    this.loadingMerchant = true;
    this.error = null;
    this.merchantAuthService.getMerchantByUsername(username).subscribe({
      next: (data: any) => {
        if (data.success && data.merchant) {
          this.merchant = data.merchant;
          this.loadingMerchant = false;
          this.loadMerchantProducts(data.merchant._id);
          this.analyticsService.trackStoreVisit(data.merchant._id).subscribe();
        } else {
          this.error = data.message || 'لا يمكن العثور على التاجر.';
          this.loadingMerchant = false;
        }
      },
      error: (err: any) => {
        console.error('Error fetching merchant:', err);
        this.error = 'عذراً، حدث خطأ أثناء تحميل بيانات التاجر.';
        this.loadingMerchant = false;
      }
    });
  }

  loadMerchantProducts(id: string) {
    this.loadingProducts = true;
    this.merchantAuthService.getProductsByMerchantId(id).subscribe({
      next: (res: any) => {
        // Sort newest first
        const raw: any[] = res.products || res || [];
        this.products = raw.sort((a, b) => {
          const getTimestamp = (obj: any) => {
            if (obj.createdAt) return new Date(obj.createdAt).getTime();
            if (obj._id) {
              const hex = obj._id.toString().substring(0, 8);
              return parseInt(hex, 16) * 1000;
            }
            return 0;
          };
          return getTimestamp(b) - getTimestamp(a);
        });

        // Extract unique categories
        const cats = new Set<string>();
        this.products.forEach(p => {
          if (p.product_category && p.product_category.trim()) {
            cats.add(p.product_category.trim());
          }
        });
        this.categories = Array.from(cats);

        this.applyFilters();
        this.loadingProducts = false;
      },
      error: (err: any) => {
        this.error = 'فشل في تحميل منتجات التاجر.';
        this.loadingProducts = false;
      }
    });
  }

  applyFilters() {
    let result = [...this.products];

    if (this.selectedCategory) {
      result = result.filter(p => p.product_category === this.selectedCategory);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      result = result.filter(p =>
        (p.product_name || '').toLowerCase().includes(q) ||
        (p.product_description || '').toLowerCase().includes(q)
      );
    }

    this.filteredProducts = result;
  }

  onSearchChange() {
    this.applyFilters();
  }

  onCategoryChange(cat: string) {
    this.selectedCategory = cat;
    this.applyFilters();
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.applyFilters();
  }

  getProductImageUrl(product: any): string {
    let imagePath = product.image_path || product.product_image || '';
    const merchantName = product.merchantName || (this.merchant ? (this.merchant.merchantName || this.merchant.name) : null);

    if (imagePath && (imagePath.startsWith('http') || imagePath.startsWith('/uploads/'))) {
      return imagePath;
    }

    const imageId = product.products_id || product.product_image;
    if (!imageId) {
      return '/assets/placeholder-book.jpg';
    }

    let finalPath = String(imageId);

    if (!finalPath.includes('/') && !finalPath.includes('.')) {
      if (merchantName) {
        const sanitizedMerchantName = merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        if (this.merchant && (this.merchant.role === 'admin' || this.merchant.merchantName === 'Kenouz')) {
          finalPath = `admin__karim_mohamed__/${finalPath}/${finalPath}.webp`;
        } else {
          finalPath = `merchant_${sanitizedMerchantName}/${finalPath}/${finalPath}.webp`;
        }
      } else {
        finalPath = `admin__karim_mohamed__/${finalPath}/${finalPath}.webp`;
      }
    } else if (!finalPath.includes('/')) {
      const id = finalPath.split('.')[0].split('_')[0];
      const filename = finalPath.includes('.') ? finalPath : finalPath + '.webp';
      if (merchantName) {
        const sanitizedMerchantName = merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        if (this.merchant && (this.merchant.role === 'admin' || this.merchant.merchantName === 'Kenouz')) {
          finalPath = `admin__karim_mohamed__/${id}/${filename}`;
        } else {
          finalPath = `merchant_${sanitizedMerchantName}/${id}/${filename}`;
        }
      } else {
        finalPath = `admin__karim_mohamed__/${id}/${filename}`;
      }
    }

    return `${this.uploadsBaseUrl}/${finalPath}`.replace(/\/\//g, '/').replace('https:/', 'https://');
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

  getBookSlug(bookName: string): string {
    return bookName.trim().replace(/\s+/g, '-');
  }

  getProductRoute(product: any): any[] {
    const slug = this.getBookSlug(product.product_name || '');
    const category = (product.product_category || '').toLowerCase();

    const categoryRoutes: { [key: string]: string } = {
      'أدوات مكتبية': 'office-supplies',
      'إلكترونيات': 'electronics',
      'ملابس': 'clothing',
      'التجميل والعناية الشخصية': 'cosmetics',
      'الأحذية': 'shoes',
      'أثاث': 'furniture',
      'ألعاب': 'games',
      'أقمشة': 'fabrics',
      'كتب': 'book',
      'روايات وقصص': 'book',
      'تطوير الذات وعلم النفس': 'book',
      'كتب دينية': 'book',
      'أعمال وتسويق ومالية': 'book',
      'صحة وطب وعلوم': 'book',
      'تاريخ وسير ذاتية': 'book',
      'تربية وأطفال': 'book',
      'فنون وحرف': 'book',
      'قواميس ومراجع': 'book'
    };

    let route = categoryRoutes[category];
    if (!route) {
      for (const [key, value] of Object.entries(categoryRoutes)) {
        if (category.includes(key.toLowerCase())) {
          route = value;
          break;
        }
      }
    }

    if (!route) {
      const bookKeywords = ['كتب', 'روايات', 'قصص', 'تطوير الذات', 'دينية', 'تاريخ', 'أطفال', 'أعمال', 'قواميس', 'صحة', 'فنون'];
      if (bookKeywords.some(key => category.includes(key))) {
        route = 'book';
      }
    }

    if (!route) {
      route = 'book';
    }

    const productId = product.products_id || product.product_image || product._id || product.id;
    return ['/' + route, productId, slug];
  }

  // Shopping Actions
  addToFavorites(bookId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id || userData._id;

    if (userId) {
      if (this.isFavorite(bookId)) {
        this.authService.removeFromFavorites(userId, bookId).subscribe({
          next: res => this.loadUserData(userId),
          error: err => this.showErrorModal('حدث خطأ أثناء إزالة المادة من المفضلة')
        });
      } else {
        this.authService.addToFavorites(userId, bookId).subscribe({
          next: res => this.loadUserData(userId),
          error: err => this.showErrorModal('حدث خطأ أثناء إضافة المادة إلى المفضلة')
        });
      }
    } else {
      this.showLoginPrompt = true;
    }
  }

  addToCart(bookId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id || userData._id;

    if (userId) {
      if (this.isInCart(bookId)) {
        this.authService.removeFromCart(userId, bookId).subscribe({
          next: res => this.loadUserData(userId),
          error: err => this.showErrorModal('حدث خطأ أثناء إزالة المادة من السلة')
        });
      } else {
        this.authService.addToCart(userId, bookId).subscribe({
          next: res => this.loadUserData(userId),
          error: err => this.showErrorModal('حدث خطأ أثناء إضافة المادة إلى السلة')
        });
      }
    } else {
      this.showLoginPrompt = true;
    }
  }

  isFavorite(bookId: string): boolean {
    return this.authService.isFavorite(bookId);
  }

  isInCart(bookId: string): boolean {
    return this.authService.isInCart(bookId);
  }

  loadUserData(userId: string) {
    this.authService.loadUserData(userId);
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

  closeLoginPrompt(): void {
    this.showLoginPrompt = false;
  }
}