import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../services/data.service';
import { Book } from '../book';
import { faHeart, faCartPlus, faShareAlt, faSignInAlt, faCoins, faGift } from '@fortawesome/free-solid-svg-icons';
import { faStar } from '@fortawesome/free-solid-svg-icons';
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
  faSignInAlt = faSignInAlt
  faStarRegular = faStarRegular;
  books: Book[] = []; // كل الكتب
  paginatedBooks: Book[] = []; // الكتب المعروضة في الصفحة الحالية
  searchQuery: string = ''; // نص البحث
  currentPage: number = 1; // الصفحة الحالية
  booksPerPage = 12; // عدد الكتب في الصفحة
  totalBooks = 0; // إجمالي الكتب التي تطابق البحث
  totalPages = 1; // إجمالي عدد الصفحات
  showLoginPrompt = false;
  faShareAlt = faShareAlt;
  faCoins = faCoins;
  faGift = faGift;
  showCopySuccess = false;
  copiedBookId: string | null = null;

  // New properties for modal and form
  showRequestModal = false;
  requestedBookName = '';
  requestedAuthorName = '';
  requestSuccessMessage = '';
  isRequestSubmitting = false;
  appliedCoupon: any = null;
  expiredCouponMessage: string | null = null;
  ratings: Record<string, { averageRating: number; ratingCount: number }> = {};

  filterType = 'all';
  showFirst = false; // Flag to show only the first item

  isLoading = false; // Add loading flag

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
    // نحصل على قيمة البحث من الـ queryParams
    this.route.queryParams.subscribe(params => {
      console.log('SearchResults: queryParams:', params);
      this.searchQuery = params['q'] || ''; // تأكد من وجود قيمة
      this.filterType = params['filter'] || 'all';
      console.log('SearchResults: searchQuery:', this.searchQuery, 'filterType:', this.filterType);
      this.currentPage = parseInt(params['page'] || '1', 10); // قراءة رقم الصفحة من الـ URL
      this.showFirst = params['showFirst'] === 'true'; // قراءة قيمة showFirst من الـ URL
      this.searchBooks();
    });
  }
  // دالة نسخ رابط الكتاب
  copyBookLink(book: Book): void {
    if (!book) return;
    // CRITICAL FIX: Use production domain instead of window.location.origin
    const baseUrl = 'https://knoozbook.com';
    const url = baseUrl + '/book/' + book.products_id + '/' + this.getBookSlug(book.product_name);

    // Use Native Share if available (Android/iOS)
    if (navigator.share) {
      const cleanUrl = decodeURIComponent(url);
      navigator.share({
        title: book.product_name,
        text: `تحقق من كتاب "${book.product_name}" على كنوز بوك\n${cleanUrl}`
      }).then(() => {
        console.log('Shared successfully');
      }).catch((error) => {
        console.warn('Share failed or cancelled:', error);
      });
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(url).then(() => {
        this.showCopySuccess = true;
        this.copiedBookId = book.products_id;
        setTimeout(() => {
          this.showCopySuccess = false;
          this.copiedBookId = null;
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy: ', err);
      });
    }
  }

  // Updated method to generate book slug without encoding to keep readable characters in URL
  getBookSlug(bookName: string): string {
    return bookName.trim().replace(/\s+/g, '-');
  }

  getProductRoute(book: Book): any[] {
    const slug = this.getBookSlug(book.product_name || '');
    const category = (book.product_category || '').toLowerCase();

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

    // 1. Try exact or partial match in categoryRoutes
    let route = categoryRoutes[category];
    if (!route) {
      for (const [key, value] of Object.entries(categoryRoutes)) {
        if (category.includes(key.toLowerCase())) {
          route = value;
          break;
        }
      }
    }

    // 2. Broad check for book-related keywords
    if (!route) {
      const bookKeywords = ['كتب', 'روايات', 'قصص', 'تطوير الذات', 'دينية', 'تاريخ', 'أطفال', 'أعمال', 'قواميس', 'صحة', 'فنون'];
      if (bookKeywords.some(key => category.includes(key))) {
        route = 'book';
      }
    }

    if (!route) {
      route = 'others';
    }

    return ['/' + route, book.products_id, slug];
  }

  getMerchantLogoUrl(book: Book): string {
    if (!book.merchantLogo) {
      return ''; // إرجاع قيمة فارغة إذا لم يكن هناك شعار
    }
    const logoUrl = this.uploadsBaseUrl + '/' + book.merchantLogo;
    console.log('Generated Merchant Logo URL:', logoUrl); // تسجيل الرابط في الكونسول
    return logoUrl;
  }
  getBookImageUrl(book: Book): string {
    return this.dataService.getBookImageUrl(book);
  }

  getAverageRating(book: Book): number {
    return this.ratings[book.products_id]?.averageRating ? Math.round(this.ratings[book.products_id].averageRating) : 0;
  }

  fetchRatingsForBooks(): void {
    const bookIds = this.books.map(b => b.products_id).filter(id => !!id);
    if (bookIds.length === 0) return;

    this.http.post<Record<string, { averageRating: number; ratingCount: number }>>(
      `${environment.apiBaseUrl}/users/bulk-average-ratings`,
      { bookIds }
    ).subscribe({
      next: (res) => {
        this.ratings = { ...this.ratings, ...res };
      },
      error: (err) => {
        console.error('Error fetching bulk ratings:', err);
      }
    });
  }

  getRatingCount(book: Book): number {
    return this.ratings[book.products_id]?.ratingCount || 0;
  }

  // Method to open the request modal
  openRequestModal(): void {
    this.requestedBookName = this.searchQuery;
    this.requestedAuthorName = '';
    this.requestSuccessMessage = '';
    this.showRequestModal = true;
  }

  // Method to close the request modal
  closeRequestModal(): void {
    this.showRequestModal = false;
  }

  // Method to submit the book request
  submitBookRequest(): void {
    if (!this.requestedBookName.trim()) {
      this.showErrorModal('يرجى إدخال اسم الكتاب');
      return;
    }

    this.isRequestSubmitting = true;

    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (!userId) {
      this.showErrorModal('يرجى تسجيل الدخول لإرسال الطلب');
      this.isRequestSubmitting = false;
      return;
    }

    this.authService.requestBook(userId, this.requestedBookName.trim(), this.requestedAuthorName.trim()).subscribe({
      next: (res: any) => {
        this.requestSuccessMessage = 'تم الإرسال بنجاح! سيتم توفير الكتاب خلال بضعة أيام وسنخبرك حين إضافته.';
        this.isRequestSubmitting = false;
        // إغلاق النافذة بعد الإرسال بنجاح
        setTimeout(() => {
          this.closeRequestModal();
        }, 2000);
      },
      error: (err: any) => {
        this.showErrorModal('حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى.');
        this.isRequestSubmitting = false;
      }
    });
  }
  addToFavorites(bookId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (userId) {
      if (this.isFavorite(bookId)) {
        this.authService.removeFromFavorites(userId, bookId).subscribe({
          next: res => {
            this.loadUserData(userId);
          },
          error: err => {
            this.showErrorModal('حدث خطأ أثناء إزالة الكتاب من المفضلة');
          }
        });
      } else {
        this.authService.addToFavorites(userId, bookId).subscribe({
          next: res => {
            this.loadUserData(userId);
          },
          error: err => {
            this.showErrorModal('حدث خطأ أثناء إضافة الكتاب إلى المفضلة');
          }
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
  addToCart(bookId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (userId) {
      if (this.isInCart(bookId)) {
        this.authService.removeFromCart(userId, bookId).subscribe({
          next: res => {
            this.loadUserData(userId);
          },
          error: err => {
            this.showErrorModal('حدث خطأ أثناء إزالة الكتاب من السلة');
          }
        });
      } else {
        this.authService.addToCart(userId, bookId).subscribe({
          next: res => {
            this.loadUserData(userId);
          },
          error: err => {
            this.showErrorModal('حدث خطأ أثناء إضافة الكتاب إلى السلة');
          }
        });
      }
    } else {
      this.showLoginPrompt = true;
    }
  }

  buyNow(bookId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (!userId) {
      this.showLoginPrompt = true;
      return;
    }

    if (this.isInCart(bookId)) {
      this.router.navigate(['/basket']);
    } else {
      this.authService.addToCart(userId, bookId).subscribe({
        next: () => {
          this.loadUserData(userId);
          this.router.navigate(['/basket']);
        },
        error: () => this.showErrorModal('حدث خطأ أثناء إضافة الكتاب إلى السلة')
      });
    }
  }

  loadUserData(userId: string) {
    if (!userId) {
      console.warn('⚠️ لا يوجد userId لتحميل البيانات.');
      return;
    }
    this.authService.loadUserData(userId);
  }
  // دالة البحث لحظيًا
  private normalizeArabic(text: string): string {
    return text
      .replace(/[أإآ]/g, 'ا')
      .replace(/[هة]/g, 'ه')
      // Remove special characters except numbers and letters
      .replace(/[^0-9a-zA-Z\u0600-\u06FF\s]/g, '')
      // Remove extra spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Levenshtein distance for fuzzy matching
  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = new Array(n + 1).fill(0).map(() => 0);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const temp = dp[j];
        const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
        prev = temp;
      }
    }
    return dp[n];
  }

  // Similarity score between 0..1
  private similarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const dist = this.levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;
    const sim = 1 - dist / maxLen;
    return Math.max(0, sim);
  }

  // Score a book based on matching query against product fields
  private scoreBook(book: Book, query: string): number {
    const q = this.normalizeArabic(query.toLowerCase());
    if (!q) return 0;

    let bestScore = 0;
    const anyBook = book as any;
    const fields = [
      anyBook.product_name || '',
      anyBook.sku || '',
      anyBook.category || '',
      anyBook.tags ? (Array.isArray(anyBook.tags) ? anyBook.tags.join(' ') : String(anyBook.tags)) : '',
      anyBook.description || ''
    ];

    for (const f of fields) {
      if (!f) continue;
      const nf = this.normalizeArabic(f.toLowerCase());
      if (nf.includes(q)) {
        // exact substring match -> high score
        const pos = nf.indexOf(q);
        // higher score if starts with query
        const score = 1 + (pos === 0 ? 0.5 : 0) + Math.min(0.4, 0.4 / (pos + 1));
        bestScore = Math.max(bestScore, score);
      } else {
        // fallback to fuzzy similarity
        const sim = this.similarity(q, nf);
        bestScore = Math.max(bestScore, sim);
      }
    }
    return bestScore;
  }

  searchBooks(): void {
    this.isLoading = true;
    this.appliedCoupon = null; // Reset
    this.promotionService.setActiveCoupon(null);
    this.expiredCouponMessage = null; // Reset expired message

    const query = this.searchQuery?.trim() || '';

    // Track search query with analytics backend
    if (query && query.length >= 2) {
      if (query.length < 3 || query.length > 15 || !this.isPotentialCoupon(query)) {
        this.analyticsService.trackSearchTerm(query).subscribe();
      }
    }

    // Check if query is a coupon
    if (query && query.length >= 3 && query.length <= 15) {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      this.promotionService.validateCoupon(query, userData.id, 0).subscribe({
        next: (res: any) => {
          this.appliedCoupon = res;
          this.promotionService.setActiveCoupon(res);
          // If it's a coupon, we show all books (or featured) as requested
          this.loadAllBooksForCoupon();
        },
        error: (err: any) => {
          const msg = err?.error?.message || '';
          // Check if the error is specifically about an expired/exhausted coupon
          if (msg.includes('انتهت صلاحية') || msg.includes('استنفدت') || msg.includes('استهلاك')) {
            this.expiredCouponMessage = 'تم انتهاء مدة صلاحية هذا الكوبون\nانتظر الكوبون التالي في الساعات القادمة\nنسعى دائماً لإرضائك 💜';
            this.isLoading = false;
          } else {
            console.error('Coupon validation error, falling back to normal search:', err);
            this.executeNormalSearch();
          }
        }
      });
    } else {
      this.executeNormalSearch();
    }
  }

  // Helper function to loosely verify if query might be a coupon
  private isPotentialCoupon(query: string): boolean {
    const isMainlyEnglishLetters = /^[a-zA-Z0-9\-_]+$/.test(query);
    return isMainlyEnglishLetters;
  }

  private loadAllBooksForCoupon(): void {
    this.dataService.getData().subscribe({
      next: (data) => {
        // Filter by price range if coupon specifies it
        const min = this.appliedCoupon.minPrice;
        const max = this.appliedCoupon.maxPrice;

        this.books = data.filter((book: Book) => {
          const price = book.product_price;
          const matchesMin = min ? price >= min : true;
          const matchesMax = max ? price <= max : true;
          return matchesMin && matchesMax;
        });

        this.finishSearch();
        this.fetchRatingsForBooks();
      },
      error: (err) => {
        console.error('Error loading books for coupon:', err);
        this.isLoading = false;
      }
    });
  }

  private executeNormalSearch(): void {
    if (this.filterType === 'recentlyAdded') {
      this.dataService.getRecentBooks().subscribe({
        next: (data) => {
          if (!this.searchQuery || this.searchQuery.trim() === '') {
            this.books = (data as any);
          } else {
            this.filterBooks((data as any));
          }
          this.finishSearch();
        },
        error: (err) => {
          console.error('Error fetching recent books:', err);
          this.isLoading = false;
        }
      });
    } else {
      this.dataService.getData().subscribe({
        next: (data) => {
          if (!this.searchQuery || this.searchQuery.trim() === '') {
            this.books = data;
          } else {
            this.filterBooks(data);
          }
          this.finishSearch();
        },
        error: (err) => {
          console.error('Error fetching search results:', err);
          this.isLoading = false;
        }
      });
    }
  }

  calculateDiscountedPrice(price: number, bookId?: string, quantity: number = 1): { discountedPrice: number, discountedQty: number } {
    if (!this.appliedCoupon) return { discountedPrice: price, discountedQty: quantity };

    // Check if price is within target range (if range exists)
    const min = this.appliedCoupon.minPrice;
    const max = this.appliedCoupon.maxPrice;
    const isWithinRange = (min ? price >= min : true) && (max ? price <= max : true);

    if (!isWithinRange) return { discountedPrice: price, discountedQty: 0 };

    // Handle Quantity Limit Per Product
    let discountedQty = quantity;
    if (this.appliedCoupon.maxQtyPerProduct > 0) {
      discountedQty = Math.min(quantity, this.appliedCoupon.maxQtyPerProduct);
    }

    let finalDiscountedPrice = price;
    if (this.appliedCoupon.discountType === 'percentage') {
      finalDiscountedPrice = price * (1 - this.appliedCoupon.value / 100);
    } else if (this.appliedCoupon.discountType === 'fixed') {
      finalDiscountedPrice = Math.max(0, price - this.appliedCoupon.value);
    }
    return { discountedPrice: finalDiscountedPrice, discountedQty: discountedQty };
  }

  private filterBooks(data: Book[]): void {
    // Use fuzzy matching with scoring instead of strict substring matching
    const scoredBooks: Array<{ book: Book; score: number }> = [];

    for (const book of data) {
      if (!book || typeof book.product_name !== 'string') continue;
      const score = this.scoreBook(book, this.searchQuery);
      // Accept books with reasonable score (0.45+ threshold)
      if (score >= 0.45) {
        scoredBooks.push({ book, score });
      }
    }

    // Sort by score, then by name starting with query
    const originalQueryLower = this.searchQuery.toLowerCase();
    scoredBooks.sort((a, b) => {
      const aName = a.book.product_name.toLowerCase();
      const bName = b.book.product_name.toLowerCase();
      const aStarts = aName.startsWith(originalQueryLower) ? 1 : 0;
      const bStarts = bName.startsWith(originalQueryLower) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return b.score - a.score;
    });

    this.books = scoredBooks.map(sb => sb.book);
    console.log('SearchResults: filtered books count:', this.books.length);
  }

  private finishSearch(): void {
    console.log('SearchResults: finishSearch called. Current books count:', this.books.length);
    this.totalBooks = this.books.length;
    this.totalPages = Math.ceil(this.totalBooks / this.booksPerPage);
    this.currentPage = Math.min(this.currentPage, this.totalPages || 1);
    this.updatePage();
    console.log('SearchResults: finishSearch completed. PaginatedBooks count:', this.paginatedBooks.length);
    this.isLoading = false;
    this.fetchRatingsForBooks();
  }

  // دالة الانتقال إلى الصفحة التالية
  nextPage(): void {
    if (this.currentPage * this.booksPerPage < this.totalBooks) {
      this.currentPage++;
      this.searchBooks();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // دالة الانتقال إلى الصفحة السابقة
  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.searchBooks();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }



  // دالة تحديث الصفحة الحالية
  updatePage(): void {
    if (this.showFirst && this.books.length > 0) {
      this.paginatedBooks = [this.books[0]];
    } else {
      const startIndex = (this.currentPage - 1) * this.booksPerPage;
      const endIndex = startIndex + this.booksPerPage;
      this.paginatedBooks = this.books.slice(startIndex, endIndex);
    }
  }

  // دالة تغيير الصفحة
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

  // دالة النقر على رقم الصفحة
  onPageClick(page: number | string): void {
    if (typeof page === 'number') {
      this.currentPage = page;
      this.updatePage();
      this.scrollToTop();
      this.updateURL();
    }
  }

  // دالة تحديث الـ URL
  updateURL(): void {
    const queryParams: any = {
      q: this.searchQuery,
      filter: this.filterType
    };

    if (this.currentPage > 1) {
      queryParams.page = this.currentPage;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge'
    });
  }

  // دالة العودة إلى أعلى الصفحة
  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // دالة الحصول على أرقام الصفحات المعروضة
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

  isNumber(val: any): boolean {
    return typeof val === 'number';
  }

  // Helper methods for showing modals
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

  openAccountModal(): void {
    this.closeLoginPrompt();
    this.accountModal?.openModal();
  }
}
