import { Component, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../services/data.service';
import { Book } from '../../book';
import { faHeart, faCartPlus, faShareAlt, faCoins } from '@fortawesome/free-solid-svg-icons';
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { AuthService } from '../../auth/auth.service';
import { AccountModalComponent } from '../../auth/account-modal/account-modal.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// Category mapping
const CATEGORY_ROUTES: { [key: string]: string } = {
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
  'قواامس ومراجع': 'book'
};

import { GamificationService } from '../../services/gamification.service';

@Component({
  selector: 'app-electronics',
  standalone: false,
  templateUrl: './electronics.component.html',
  styleUrls: ['./electronics.component.css']
})
export class ElectronicsComponent implements OnInit, OnDestroy {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  @ViewChild(AccountModalComponent, { static: false }) accountModal?: AccountModalComponent;
  faHeart = faHeart;
  faCartPlus = faCartPlus;
  faStar = faStar;
  faStarRegular = faStarRegular;
  products: Book[] = [];
  paginatedProducts: Book[] = [];
  currentPage = 1;
  productsPerPage = 12;
  totalPages = 1;
  showLoginPrompt = false;
  ratings: { [productId: string]: any } = {};
  private countdownInterval: any;
  faShareAlt = faShareAlt;
  faCoins = faCoins;
  showCopySuccess: boolean = false;
  copiedProductId: string | null = null;
  isLoading: boolean = true;

  constructor(
    private dataService: DataService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private http: HttpClient,
    public gamificationService: GamificationService
  ) { }

  ngOnInit(): void {
    this.isLoading = true;

    // قراءة رقم الصفحة من الـ URL
    this.route.queryParams.subscribe(params => {
      this.currentPage = parseInt(params['page'] || '1', 10);
    });

    this.dataService.getData().subscribe(data => {
      console.log('Raw data received:', data); // Debug raw data

      // Filter products by category 'إلكترونيات'
      let filteredProducts = data.filter((product: Book) => product.product_category.includes('إلكترونيات'));

      // Debug promotionEndDate values before processing
      filteredProducts.forEach((product: Book) => {
        console.log(`Product: ${product.product_name}, promotionEndDate raw: ${product.promotionEndDate}`);
      });

      // Parse promotionEndDate and update rival flag based on current date
      const now = new Date().getTime();
      filteredProducts = filteredProducts.map((product: Book) => {
        if (product.promotionEndDate) {
          const promoEnd = new Date(product.promotionEndDate).getTime();
          console.log(`Now: ${now}, PromoEnd: ${promoEnd}, PromoEnd > Now: ${promoEnd > now}`);
          product.rival = promoEnd > now;
        } else {
          product.rival = false;
        }
        // Ensure product_discount_percent is a number
        product.product_discount_percent = Number(product.product_discount_percent) || 0;
        return product;
      });

      this.products = filteredProducts;

      console.log('Loaded products with updated rival flags:', this.products);
      this.products.forEach((product: Book) => {
        console.log(`Product: ${product.product_name}, rival: ${product.rival}, discount: ${product.product_discount_percent}, promotionEndDate: ${product.promotionEndDate}`);
      });

      this.totalPages = Math.ceil(this.products.length / this.productsPerPage); // حساب عدد الصفحات
      this.currentPage = Math.min(this.currentPage, this.totalPages); // التأكد من أن الصفحة الحالية صحيحة
      this.updatePage();
      this.startCountdown();
      this.fetchRatingsForProducts();
      this.isLoading = false;
    });
  }

  copyProductLink(product: Book): void {
    if (!product) return;
    const url = window.location.origin + '/' + this.getProductRoute(product).join('/');

    navigator.clipboard.writeText(url).then(() => {
      this.showCopySuccess = true;
      this.copiedProductId = product.products_id;
      setTimeout(() => {
        this.showCopySuccess = false;
        this.copiedProductId = null;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  }

  getProductRoute(product: Book): string[] {
    const slug = this.getProductSlug(product.product_name);
    const rawCategory = (product.product_category || '').trim();

    // Try exact map first
    let route = CATEGORY_ROUTES[rawCategory];

    // Normalize and try fuzzy matching if exact not found
    if (!route && rawCategory) {
      const norm = rawCategory.replace(/\s+/g, '').toLowerCase();
      for (const key of Object.keys(CATEGORY_ROUTES)) {
        const kNorm = key.replace(/\s+/g, '').toLowerCase();
        if (norm.includes(kNorm) || kNorm.includes(norm) || rawCategory.includes(key) || key.includes(rawCategory)) {
          route = CATEGORY_ROUTES[key];
          break;
        }
      }
    }

    if (!route) route = 'others';

    console.log('getProductRoute - Product:', product.product_name, 'RawCategory:', rawCategory, 'ResolvedRoute:', route);
    return ['/', route, product.products_id, slug];
  }

  // Updated method to generate product slug without encoding to keep readable characters in URL
  getProductSlug(productName: string): string {
    return productName.trim().replace(/\s+/g, '-');
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  fetchRatingsForProducts(): void {
    const productIds = this.products.map(p => p.products_id).filter(id => !!id);
    if (productIds.length === 0) return;

    this.http.post<Record<string, { averageRating: number; ratingCount: number }>>(
      `${environment.apiBaseUrl}/users/bulk-average-ratings`,
      { bookIds: productIds }
    ).subscribe({
      next: (res) => {
        this.ratings = { ...this.ratings, ...res };
      },
      error: (err) => {
        console.error('Error fetching bulk ratings:', err);
      }
    });
  }

  getAverageRating(product: Book): number {
    if (product.products_id && this.ratings[product.products_id]) {
      return Math.round(this.ratings[product.products_id].averageRating);
    }
    return 0;
  }

  getRatingCount(product: Book): number {
    if (product.products_id && this.ratings[product.products_id]) {
      return this.ratings[product.products_id].ratingCount;
    }
    return 0;
  }

  isFavorite(productId: string): boolean {
    return this.authService.isFavorite(productId);
  }

  isInCart(productId: string): boolean {
    return this.authService.isInCart(productId);
  }

  updatePage(): void {
    const startIndex = (this.currentPage - 1) * this.productsPerPage;
    const endIndex = startIndex + this.productsPerPage;
    this.paginatedProducts = this.products.slice(startIndex, endIndex);
  }

  onPageClick(page: number | string): void {
    if (typeof page === 'number') {
      this.currentPage = page;
      this.updatePage();
      this.scrollToTop();
      this.updateURL();
    }
  }

  changePage(direction: string): void {
    if (direction === 'previous' && this.currentPage > 1) {
      this.currentPage--;
    } else if (direction === 'next' && this.currentPage < this.totalPages) {
      this.currentPage++;
    }
    this.updatePage();
    this.scrollToTop();
    this.updateURL();
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // دالة تحديث الـ URL
  updateURL(): void {
    const queryParams: any = {};

    if (this.currentPage > 1) {
      queryParams.page = this.currentPage;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge'
    });
  }

  getDisplayedPages(): (number | string)[] {
    const totalPages = this.totalPages || 1;
    const currentPage = this.currentPage || 1;
    const maxPagesToShow = 5;

    // If total pages is less than or equal to max pages to show, return all pages
    if (totalPages <= maxPagesToShow) {
      const pages: (number | string)[] = [];
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    const pages: (number | string)[] = [];
    const leftOffset = Math.floor(maxPagesToShow / 2);
    const rightOffset = maxPagesToShow - leftOffset - 1;

    // Always show first page
    pages.push(1);

    // Calculate start and end of middle section
    let startPage = Math.max(2, currentPage - leftOffset);
    let endPage = Math.min(totalPages - 1, currentPage + rightOffset);

    // Add ellipsis after first page if there's a gap
    if (startPage > 2) {
      pages.push('...');
    }

    // Add middle pages
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    // Add ellipsis before last page if there's a gap
    if (endPage < totalPages - 1) {
      pages.push('...');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  }

  addToFavorites(productId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (userId) {
      if (this.isFavorite(productId)) {
        this.authService.removeFromFavorites(userId, productId).subscribe({
          next: res => {
            console.log('تم الحذف من المفضلة', res);
            this.loadUserData(userId);
          },
          error: err => console.error('خطأ في الحذف من المفضلة', err)
        });
      } else {
        this.authService.addToFavorites(userId, productId).subscribe({
          next: res => {
            console.log('تمت الإضافة إلى المفضلة', res);
            this.loadUserData(userId);
          },
          error: err => console.error('خطأ في الإضافة إلى المفضلة', err)
        });
      }
    } else {
      this.showLoginPrompt = true;
    }
  }

  addToCart(productId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (userId) {
      if (this.isInCart(productId)) {
        this.authService.removeFromCart(userId, productId).subscribe({
          next: res => {
            console.log('تم الحذف من السلة', res);
            this.loadUserData(userId);
          },
          error: err => console.error('خطأ في الحذف من السلة', err)
        });
      } else {
        this.authService.addToCart(userId, productId).subscribe({
          next: res => {
            console.log('تمت الإضافة إلى السلة', res);
            this.loadUserData(userId);
          },
          error: err => console.error('خطأ في الإضافة إلى السلة', err)
        });
      }
    } else {
      this.showLoginPrompt = true;
    }
  }

  loadUserData(userId: string) {
    if (!userId) {
      console.warn('⚠️ لا يوجد userId لتحميل البيانات.');
      return;
    }
    this.authService.loadUserData(userId);
  }

  logout(): void {
    localStorage.removeItem('user');
    this.authService.clearFavoritesAndCart();
    this.loadUserData('');
  }

  closeLoginPrompt(): void {
    this.showLoginPrompt = false;
  }

  openAccountModal() {
    if (this.accountModal) {
      this.accountModal.openModal();
    } else {
      console.warn('Account modal is not available yet.');
    }
  }

  getBookImageUrl(product: any): string {
    return this.dataService.getBookImageUrl(product);
  }

  startCountdown() {
    if (this.products.length === 0) {
      return;
    }

    this.products.forEach(product => {
      product.remainingTime = '';
    });

    this.countdownInterval = setInterval(() => {
      const now = new Date().getTime();

      this.products.forEach(product => {
        if (!product.promotionEndDate) {
          product.remainingTime = '';
          return;
        }

        const promoEndDate = new Date(product.promotionEndDate).getTime();
        const distance = promoEndDate - now;

        if (distance < 0) {
          product.remainingTime = 'انتهى العرض';
          return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        product.remainingTime = `${days} أيام ${hours} ساعة ${minutes} دقيقه ${seconds} ثواني`;
      });
    }, 1000);
  }
}
