import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../services/data.service';
import { Book } from '../book';
import { faHeart, faCartPlus, faShareAlt, faSignInAlt, faCoins, faGift, faStar, faStarHalfAlt, faFilter, faSearch, faSyncAlt, faTimes, faChevronRight, faChevronLeft, faAngleRight, faAngleLeft } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { AuthService } from '../auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ModalService } from '../services/modal.service';
import { AccountModalComponent } from '../auth/account-modal/account-modal.component';
import { GamificationService } from '../services/gamification.service';
import { PromotionService } from '../services/promotion.service';
import { AnalyticsService } from '../services/analytics.service';

@Component({
  selector: 'app-search-results',
  templateUrl: './search-results.component.html',
  styleUrls: ['./search-results.component.css'],
  standalone: false,
})
export class SearchResultsComponent implements OnInit {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  faHeart = faHeart;
  faCartPlus = faCartPlus;
  faStar = faStar;
  faStarRegular = faStarRegular;
  faSignInAlt = faSignInAlt;
  faShareAlt = faShareAlt;
  faCoins = faCoins;
  faGift = faGift;
  
  books: Book[] = [];
  paginatedBooks: Book[] = [];
  searchQuery: string = '';
  currentPage: number = 1;
  booksPerPage = 12;
  totalBooks = 0;
  totalPages = 1;
  isLoading = false;
  isSidebarOpen = false;
  availableCategories: string[] = [];
  
  // Advanced Filters
  authorFilter = '';
  publisherFilter = '';
  categoryFilter = '';
  minPriceFilter: number | null = null;
  maxPriceFilter: number | null = null;
  sortBy = 'relevance';
  
  showLoginPrompt = false;
  showRequestModal = false;
  requestedBookName = '';
  requestedAuthorName = '';
  requestSuccessMessage = '';
  isRequestSubmitting = false;
  appliedCoupon: any = null;
  expiredCouponMessage: string | null = null;
  ratings: Record<string, { averageRating: number; ratingCount: number }> = {};

  @ViewChild(AccountModalComponent, { static: false }) accountModal?: AccountModalComponent;

  constructor(
    private dataService: DataService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private modalService: ModalService,
    public gamificationService: GamificationService,
    private promotionService: PromotionService,
    private analyticsService: AnalyticsService
  ) { }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.searchQuery = params['q'] || '';
      this.currentPage = parseInt(params['page'] || '1', 10);
      this.authorFilter = params['author'] || '';
      this.publisherFilter = params['publisher'] || '';
      this.categoryFilter = params['category'] || '';
      this.minPriceFilter = params['minPrice'] ? Number(params['minPrice']) : null;
      this.maxPriceFilter = params['maxPrice'] ? Number(params['maxPrice']) : null;
      this.sortBy = params['sortBy'] || 'relevance';

      this.searchBooks();
    });
  }

  searchBooks(): void {
    if (this.isLoading) return;
    this.isLoading = true;
    this.appliedCoupon = null;
    this.expiredCouponMessage = null;

    const query = this.searchQuery?.trim() || '';

    // Check for coupon first
    if (query && query.length >= 3 && query.length <= 15 && this.isPotentialCoupon(query)) {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      this.promotionService.validateCoupon(query, userData.id, 0).subscribe({
        next: (res: any) => {
          this.appliedCoupon = res;
          this.promotionService.setActiveCoupon(res);
          this.loadAllBooksForCoupon();
        },
        error: (err: any) => {
          const msg = err?.error?.message || '';
          if (msg.includes('انتهت صلاحية') || msg.includes('استنفدت')) {
            this.expiredCouponMessage = 'تم انتهاء مدة صلاحية هذا الكوبون';
            this.isLoading = false;
          } else {
            this.executeNormalSearch();
          }
        }
      });
    } else {
      this.executeNormalSearch();
    }
  }

  private executeNormalSearch(): void {
    const searchParams = {
      q: this.searchQuery,
      page: this.currentPage,
      limit: this.booksPerPage,
      author: this.authorFilter,
      publisher: this.publisherFilter,
      category: this.categoryFilter,
      minPrice: this.minPriceFilter,
      maxPrice: this.maxPriceFilter,
      sortBy: this.sortBy
    };

    this.dataService.search(searchParams).subscribe({
      next: (response) => {
        if (response.success) {
          this.books = (response.items || []).map((book: any) => {
            const rawMerchantName = book.merchantName || '';
            const isKenouz = !rawMerchantName || rawMerchantName === 'كنوز' || rawMerchantName === 'تاجر كنوز' || rawMerchantName === 'Kenouz' || book.merchantRole === 'admin';
            return {
              ...book,
              merchantRole: isKenouz ? 'admin' : (book.merchantRole || 'merchant'),
              merchantName: isKenouz ? null : rawMerchantName
            };
          });
          this.totalBooks = response.totalCount;
          this.totalPages = response.totalPages;
          this.paginatedBooks = this.books;
          this.availableCategories = response.availableCategories || [];
          this.fetchRatingsForBooks();
        } else {
          this.books = [];
          this.totalBooks = 0;
          this.totalPages = 1;
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Search error:', err);
        this.isLoading = false;
        this.books = [];
      }
    });
  }

  private loadAllBooksForCoupon(): void {
    this.dataService.getData().subscribe({
      next: (data) => {
        const min = this.appliedCoupon.minPrice;
        const max = this.appliedCoupon.maxPrice;
        this.books = data.filter((book: Book) => {
          const price = book.product_price;
          return (min ? price >= min : true) && (max ? price <= max : true);
        });
        this.totalBooks = this.books.length;
        this.totalPages = Math.ceil(this.totalBooks / this.booksPerPage);
        this.updatePage();
        this.isLoading = false;
        this.fetchRatingsForBooks();
      },
      error: () => this.isLoading = false
    });
  }

  applyFilter(): void {
    this.currentPage = 1;
    this.updateUrl();
  }

  onPageClick(page: number | string): void {
    if (typeof page === 'number') {
      this.currentPage = page;
      this.updateUrl();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  changePage(direction: 'next' | 'previous'): void {
    if (direction === 'next' && this.currentPage < this.totalPages) {
      this.onPageClick(this.currentPage + 1);
    } else if (direction === 'previous' && this.currentPage > 1) {
      this.onPageClick(this.currentPage - 1);
    }
  }

  private updateUrl(): void {
    const queryParams: any = {
      q: this.searchQuery || null,
      page: this.currentPage > 1 ? this.currentPage : null,
      author: this.authorFilter || null,
      publisher: this.publisherFilter || null,
      category: this.categoryFilter || null,
      minPrice: this.minPriceFilter || null,
      maxPrice: this.maxPriceFilter || null,
      sortBy: this.sortBy !== 'relevance' ? this.sortBy : null
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge'
    });
  }

  private updatePage(): void {
    const startIndex = (this.currentPage - 1) * this.booksPerPage;
    this.paginatedBooks = this.books.slice(startIndex, startIndex + this.booksPerPage);
  }

  private isPotentialCoupon(query: string): boolean {
    return /^[a-zA-Z0-9\-_]+$/.test(query);
  }

  // --- UI Helpers ---
  getBookImageUrl(book: Book): string {
    return this.dataService.getBookImageUrl(book);
  }

  getAverageRating(book: Book): number {
    return this.ratings[book.products_id]?.averageRating ? Math.round(this.ratings[book.products_id].averageRating) : 0;
  }

  getRatingCount(book: Book): number {
    return this.ratings[book.products_id]?.ratingCount || 0;
  }

  fetchRatingsForBooks(): void {
    const bookIds = this.paginatedBooks.map(b => b.products_id).filter(id => !!id);
    if (bookIds.length === 0) return;

    this.http.post<Record<string, { averageRating: number; ratingCount: number }>>(
      `${environment.apiBaseUrl}/users/bulk-average-ratings`,
      { bookIds }
    ).subscribe({
      next: (res) => this.ratings = { ...this.ratings, ...res },
      error: (err) => console.error('Ratings error:', err)
    });
  }

  getProductRoute(book: Book): any[] {
    const slug = (book.product_name || '').trim().replace(/\s+/g, '-');
    return ['/book', book.products_id, slug];
  }

  getMerchantLogoUrl(book: Book): string {
    return book.merchantLogo ? `${this.uploadsBaseUrl}/${book.merchantLogo}` : '';
  }

  calculateDiscountedPrice(price: number, bookId?: string, quantity: number = 1): { discountedPrice: number, discountedQty: number } {
    if (!this.appliedCoupon) return { discountedPrice: price, discountedQty: quantity };
    const min = this.appliedCoupon.minPrice;
    const max = this.appliedCoupon.maxPrice;
    if ((min && price < min) || (max && price > max)) return { discountedPrice: price, discountedQty: 0 };
    
    let discountedQty = this.appliedCoupon.maxQtyPerProduct > 0 ? Math.min(quantity, this.appliedCoupon.maxQtyPerProduct) : quantity;
    let finalPrice = price;
    if (this.appliedCoupon.discountType === 'percentage') finalPrice = price * (1 - this.appliedCoupon.value / 100);
    else if (this.appliedCoupon.discountType === 'fixed') finalPrice = Math.max(0, price - this.appliedCoupon.value);
    
    return { discountedPrice: finalPrice, discountedQty };
  }

  // --- Auth & Cart ---
  addToFavorites(bookId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    if (!userData.id) { this.showLoginPrompt = true; return; }
    
    if (this.isFavorite(bookId)) {
      this.authService.removeFromFavorites(userData.id, bookId).subscribe(() => this.authService.loadUserData(userData.id));
    } else {
      this.authService.addToFavorites(userData.id, bookId).subscribe(() => this.authService.loadUserData(userData.id));
    }
  }

  isFavorite(bookId: string): boolean { return this.authService.isFavorite(bookId); }
  isInCart(bookId: string): boolean { return this.authService.isInCart(bookId); }

  addToCart(bookId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    if (!userData.id) { this.showLoginPrompt = true; return; }
    
    if (this.isInCart(bookId)) {
      this.authService.removeFromCart(userData.id, bookId).subscribe(() => this.authService.loadUserData(userData.id));
    } else {
      this.authService.addToCart(userData.id, bookId).subscribe(() => this.authService.loadUserData(userData.id));
    }
  }

  copyBookLink(book: Book): void {
    if (!book) return;
    const slug = (book.product_name || '').trim().replace(/\s+/g, '-');
    const url = `https://knoozbook.com/book/${book.products_id}/${slug}`;

    if (navigator.share) {
      navigator.share({
        title: book.product_name,
        text: `تحقق من كتاب "${book.product_name}" على كنوز بوك`,
        url: url
      }).catch(err => console.log('Share failed:', err));
    } else {
      navigator.clipboard.writeText(url).then(() => {
        this.modalService.openModal({
          title: 'نجاح',
          message: 'تم نسخ الرابط بنجاح',
          type: 'success',
          confirmText: 'موافق'
        });
      });
    }
  }

  // --- Modals ---
  openRequestModal(): void { this.requestedBookName = this.searchQuery; this.showRequestModal = true; }
  closeRequestModal(): void { this.showRequestModal = false; }
  submitBookRequest(): void {
    if (!this.requestedBookName.trim()) return;
    const userId = JSON.parse(localStorage.getItem('user') || '{}').id;
    if (!userId) { this.showLoginPrompt = true; return; }
    
    this.isRequestSubmitting = true;
    this.authService.requestBook(userId, this.requestedBookName, this.requestedAuthorName).subscribe({
      next: () => { this.requestSuccessMessage = 'تم الإرسال بنجاح'; setTimeout(() => this.closeRequestModal(), 2000); },
      complete: () => this.isRequestSubmitting = false
    });
  }

  closeLoginPrompt(): void { this.showLoginPrompt = false; }
  openAccountModal(): void { this.closeLoginPrompt(); this.accountModal?.openModal(); }

  getDisplayedPages(): (number | string)[] {
    const total = this.totalPages || 1;
    const current = this.currentPage || 1;
    const pages: (number | string)[] = [];
    if (total <= 5) { for (let i = 1; i <= total; i++) pages.push(i); return pages; }
    
    pages.push(1);
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  }

  isNumber(val: any): boolean { return typeof val === 'number'; }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }
}
