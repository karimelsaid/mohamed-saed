import { Component, ViewChild, OnInit, OnDestroy, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../services/data.service';
import { Book } from '../../book';
import { faHeart, faCartPlus, faShareAlt, faStar, faCoins } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { AuthService } from '../../auth/auth.service';
import { AccountModalComponent } from '../../auth/account-modal/account-modal.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { GamificationService } from '../../services/gamification.service';
import { SeoService } from '../../services/seo.service';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import { Meta } from '@angular/platform-browser';
import { AnalyticsTrackingService } from '../../services/analytics-tracking.service';

@Component({
    selector: 'app-books',
    templateUrl: './books.component.html',
    styleUrls: ['./books.component.css'],
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, FontAwesomeModule, AccountModalComponent]
})
export class BooksComponent implements OnInit, OnDestroy {
    uploadsBaseUrl = environment.uploadsBaseUrl;
    @ViewChild(AccountModalComponent, { static: false }) accountModal?: AccountModalComponent;

    faHeart = faHeart;
    faCartPlus = faCartPlus;
    faStar = faStar;
    faStarRegular = faStarRegular;
    faShareAlt = faShareAlt;
    faCoins = faCoins;

    books: Book[] = [];
    paginatedBooks: Book[] = [];
    currentPage = 1;
    booksPerPage = 12;
    totalPages = 1;
    showLoginPrompt = false;

    ratings: { [bookId: string]: any } = {};
    private countdownInterval: any;
    showCopySuccess: boolean = false;
    copiedBookId: string | null = null;
    isLoading: boolean = true;

    // Analytics tracking
    private trackedProducts = new Set<string>();
    private intersectionObserver: IntersectionObserver | null = null;

    // Filters
    selectedCategory: string = 'الكل';
    maxPrice: number = 2000;
    minPrice: number = 0;
    siteMaxPrice: number = 5000;
    sortOrder: string = 'random'; // Default to random

    // Book categories to filter by
    bookCategories: string[] = [
        'كتب', 'روايات وقصص', 'تطوير الذات وعلم النفس', 'كتب دينية',
        'قواميس ومراجع', 'صحة وطب وعلوم', 'أعمال وتسويق ومالية',
        'فنون وحرف', 'تاريخ وسير ذاتية', 'تربية وأطفال', 'أدوات مكتبية'
    ];

    allBooks: Book[] = []; // Store all fetched books

    constructor(
        private dataService: DataService,
        private route: ActivatedRoute,
        private router: Router,
        private authService: AuthService,
        private http: HttpClient,
        public gamificationService: GamificationService,
        private seoService: SeoService,
        private meta: Meta,
        private analyticsTrackingService: AnalyticsTrackingService,
        @Inject(PLATFORM_ID) private platformId: Object,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.isLoading = true;

        // SSR CRITICAL: forkJoin on route.params + route.queryParams on the server
        // never completes because ActivatedRoute hot observables don't emit on SSR,
        // which blocks Zone.js stabilization and causes 30s timeout / 504 errors.
        // Solution: read snapshot synchronously on SSR (instant, no async needed),
        // and use the full async forkJoin only in the browser.
        if (!isPlatformBrowser(this.platformId)) {
            const params = this.route.snapshot.params;
            const queryParams = this.route.snapshot.queryParams;
            if (params['name']) this.selectedCategory = params['name'];
            else if (queryParams['category']) this.selectedCategory = queryParams['category'];
            this.currentPage = parseInt(queryParams['page'] || '1', 10);
            if (queryParams['maxPrice']) this.maxPrice = parseInt(queryParams['maxPrice'], 10);
            if (queryParams['sort']) this.sortOrder = queryParams['sort'] || 'random';
            this.loadBooks(); // will bail out immediately via isPlatformBrowser guard inside
            return;
        }

        // Browser: use forkJoin for reactivity
        forkJoin({
            params: this.route.params.pipe(take(1)),
            queryParams: this.route.queryParams.pipe(take(1))
        }).subscribe(({ params, queryParams }: { params: any, queryParams: any }) => {
            if (params['name']) {
                this.selectedCategory = params['name'];
            } else if (queryParams['category']) {
                this.selectedCategory = queryParams['category'];
            }

            this.currentPage = parseInt(queryParams['page'] || '1', 10);
            if (queryParams['maxPrice']) this.maxPrice = parseInt(queryParams['maxPrice'], 10);
            if (queryParams['sort']) this.sortOrder = params['sort'] || queryParams['sort'] || 'random';
            
            this.loadBooks();
        });

        // Also subscribe to changes for subsequent navigations
        this.route.params.subscribe(params => {
            if (params['name']) {
                this.selectedCategory = params['name'];
                this.applyFiltersAndSort();
            }
        });

        if (isPlatformBrowser(this.platformId)) {
            this.loadDynamicCategories();
        }
    }

    loadDynamicCategories(): void {
        this.dataService.getAdminCategories().subscribe({
            next: (res: any) => {
                if (res && res.success) {
                    const activeCategories = res.categories.filter((c: any) => c.isActive !== false && c.type === 'book');
                    if (activeCategories.length > 0) {
                        this.bookCategories = activeCategories.map((c: any) => c.name);
                        this.cdr.markForCheck();
                    }
                }
            },
            error: (err) => {
                console.error('Error loading dynamic categories:', err);
            }
        });
    }

    loadBooks(): void {
        this.isLoading = true;

        // SSR optimization: set SEO tags immediately and skip fetching 13MB file
        if (!isPlatformBrowser(this.platformId)) {
            this.updateSeoForCategory();
            this.isLoading = false;
            return;
        }

        this.dataService.getData().subscribe(data => {
            this.allBooks = data.map((b: any) => ({
                ...b,
                products_id: b.products_id || b.product_id || b._id
            }));
            
            // Calculate site-wide max price
            if (this.allBooks.length > 0) {
              const prices = this.allBooks.map(b => Number(b.product_price) || 0);
              this.siteMaxPrice = Math.max(...prices);
              this.maxPrice = this.siteMaxPrice; // Initialize filter to max
            }

            this.applyFiltersAndSort();
            this.updateSeoForCategory();
            this.isLoading = false;

            // Setup intersection observer for impression tracking
            this.setupIntersectionObserver();
        });
    }

    /**
     * Sets category-specific SEO meta tags and handles pagination noindex.
     * Called after books load so we know the category and page number.
     */
    private updateSeoForCategory(): void {
        const category = this.selectedCategory;
        const page = this.currentPage;
        const isAllBooks = category === 'الكل';

        // Canonical always points to page 1 (no ?page= param)
        const canonicalUrl = isAllBooks
            ? 'https://knoozbook.com/books'
            : `https://knoozbook.com/category/${encodeURIComponent(category)}`;

        // For paginated pages beyond page 1: noindex, follow to save Crawl Budget
        if (page > 1) {
            this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });
        } else {
            this.meta.updateTag({ name: 'robots', content: 'index, follow' });
        }

        // Category-specific descriptions
        const categoryDescriptions: { [key: string]: string } = {
            'روايات وقصص':             'تصفح أفضل الروايات والقصص العربية والمترجمة. اشتر كتابك المفضل بأسعار مميزة مع توصيل لجميع المحافظات.',
            'تطوير الذات وعلم النفس':  'اكتشف كتب تطوير الذات وعلم النفس. مجموعة متنوعة من أفضل الكتب العربية والمترجمة في التنمية البشرية.',
            'كتب دينية':               'كتب دينية إسلامية متنوعة: تفسير، فقه، سيرة، حديث، وعلوم القرآن. اطلب الآن مع توصيل سريع.',
            'أعمال وتسويق ومالية':    'كتب الأعمال والتسويق والمالية الشخصية. طوّر مسيرتك المهنية واقرأ من أفضل المراجع العربية والعالمية.',
            'تاريخ وسير ذاتية':       'كتب التاريخ والسير الذاتية: اكتشف قصص العظماء وحوادث التاريخ بأقلام أفضل المؤلفين العرب والأجانب.',
            'تربية وأطفال':           'كتب الأطفال وتربية الأبناء: قصص تعليمية وترفيهية ومراجع في التربية الحديثة. مناسبة لجميع الأعمار.',
            'صحة وطب وعلوم':         'كتب الصحة والطب والعلوم. ثقّف نفسك بأحدث المعرفة الطبية والعلمية بأسعار مناسبة.',
            'فنون وحرف':              'كتب الفنون والحرف اليدوية. تعلّم مهارات جديدة واستكشف عالم الإبداع مع مجموعتنا المتميزة.',
            'قواميس ومراجع':          'قواميس ومعاجم ومراجع علمية وأدبية. مجموعة شاملة من المراجع العربية والثنائية اللغة.',
        };

        const categoryKeywords: { [key: string]: string } = {
            'روايات وقصص':             'روايات عربية, روايات مترجمة, قصص قصيرة, شراء روايات أونلاين, knoozbook',
            'تطوير الذات وعلم النفس':  'كتب تطوير ذات, تنمية بشرية, علم النفس, كتب نفسية, knoozbook',
            'كتب دينية':               'كتب إسلامية, كتب دينية, تفسير قرآن, سيرة نبوية, كتب فقه, knoozbook',
            'أعمال وتسويق ومالية':    'كتب أعمال, تسويق, مالية شخصية, ريادة أعمال, knoozbook',
            'تاريخ وسير ذاتية':       'كتب تاريخ, سير ذاتية, تراجم, حضارة إسلامية, knoozbook',
            'تربية وأطفال':           'قصص أطفال, كتب تربية, تعليم الأطفال, كتب للأطفال, knoozbook',
            'صحة وطب وعلوم':         'كتب طبية, صحة وتغذية, كتب علوم, طب بشري, knoozbook',
            'فنون وحرف':              'كتب فنون, حرف يدوية, رسم, تصوير فوتوغرافي, knoozbook',
            'قواميس ومراجع':          'قواميس عربية, معاجم, قاموس عربي إنجليزي, مراجع علمية, knoozbook',
        };

        const title = isAllBooks
            ? 'كل الكتب | knoozbook'
            : `${category} | knoozbook`;

        const description = isAllBooks
            ? 'تصفح مجموعة knoozbook الكاملة من الكتب العربية والمترجمة بأسعار مميزة وتوصيل لجميع المحافظات.'
            : (categoryDescriptions[category] || `تصفح أفضل ${category} في knoozbook. مجموعة متنوعة من الكتب بأسعار مميزة مع توصيل لجميع المحافظات.`);

        const keywords = isAllBooks
            ? 'knoozbook, شراء كتب أونلاين, كتب عربية, مكتبة إلكترونية'
            : (categoryKeywords[category] || `${category}, كتب عربية, knoozbook, شراء كتب`);

        this.seoService.updateMetaTags({
            title: isAllBooks ? 'كل الكتب' : category,
            description,
            keywords,
            url: canonicalUrl,
            type: 'website'
        });
    }

    applyFiltersAndSort(): void {
        let filtered = this.allBooks.filter((book: Book) => {
            const categoryMatch = this.selectedCategory === 'الكل' || 
                                 (book.product_category && book.product_category.includes(this.selectedCategory)) ||
                                 (this.selectedCategory === 'كتب' && (!book.product_category || book.product_category.includes('كتب')));
            
            const price = Number(book.product_price) || 0;
            const priceMatch = price >= this.minPrice && price <= this.maxPrice;

            // In dynamic mode, we trust the category match primarily
            return categoryMatch && priceMatch;
        });

        // Process books (rival flag, discount, etc.)
        const now = new Date().getTime();
        filtered = filtered.map((book: Book) => {
            if (book.promotionEndDate) {
                const promoEnd = new Date(book.promotionEndDate).getTime();
                book.rival = book.rival || promoEnd > now;
            } else if (book.rival === undefined) {
                book.rival = false;
            }
            book.product_discount_percent = Number(book.product_discount_percent) || 0;
            return book;
        });

        // Sorting / Randomization
        if (this.sortOrder === 'random') {
            filtered = this.shuffleArray(filtered);
        } else if (this.sortOrder === 'price_asc') {
            filtered.sort((a, b) => (Number(a.product_price) || 0) - (Number(b.product_price) || 0));
        } else if (this.sortOrder === 'price_desc') {
            filtered.sort((a, b) => (Number(b.product_price) || 0) - (Number(a.product_price) || 0));
        }

        this.books = filtered;
        this.totalPages = Math.ceil(this.books.length / this.booksPerPage);
        this.currentPage = Math.min(this.currentPage, this.totalPages) || 1;

        this.updatePage();
        this.startCountdown();
        this.fetchRatingsForBooks();
    }

    shuffleArray(array: any[]): any[] {
        const newArr = [...array];
        for (let i = newArr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
        }
        return newArr;
    }

    trackByBook(index: number, item: any): string {
        return item.products_id || item._id || index.toString();
    }

    onFilterChange(): void {
        this.currentPage = 1;
        this.applyFiltersAndSort();
        this.updateURL();
    }

    updatePage(): void {
        const startIndex = (this.currentPage - 1) * this.booksPerPage;
        const endIndex = startIndex + this.booksPerPage;
        this.paginatedBooks = this.books.slice(startIndex, endIndex);
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

    scrollToTop(): void {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    navigateToProduct(book: any): void {
        const slug = this.getBookSlug(book.product_name);
        // Track click event
        this.analyticsTrackingService.trackClick(book.products_id, 'books_page');
        this.router.navigate(['/book', book.products_id, slug]);
    }

    // Helper methods
    getBookSlug(bookName: string): string {
        return bookName.trim().replace(/\s+/g, '-');
    }

    getBookImageUrl(book: any): string {
        return this.dataService.getBookImageUrl(book);
    }

    // Auth & Cart methods
    isFavorite(bookId: string): boolean {
        return this.authService.isFavorite(bookId);
    }

    isInCart(bookId: string): boolean {
        return this.authService.isInCart(bookId);
    }

    addToFavorites(bookId: string): void {
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        if (userData.id) {
            if (this.isFavorite(bookId)) {
                this.authService.removeFromFavorites(userData.id, bookId).subscribe(() => this.authService.loadUserData(userData.id));
            } else {
                this.authService.addToFavorites(userData.id, bookId).subscribe(() => this.authService.loadUserData(userData.id));
            }
        } else {
            this.showLoginPrompt = true;
        }
    }

    addToCart(bookId: string): void {
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        if (userData.id) {
            if (this.isInCart(bookId)) {
                this.authService.removeFromCart(userData.id, bookId).subscribe(() => this.authService.loadUserData(userData.id));
            } else {
                this.authService.addToCart(userData.id, bookId).subscribe(() => this.authService.loadUserData(userData.id));
            }
        } else {
            this.showLoginPrompt = true;
        }
    }

    copyBookLink(book: Book): void {
        if (!book) return;
        const url = window.location.origin + '/book/' + book.products_id + '/' + this.getBookSlug(book.product_name);
        navigator.clipboard.writeText(url).then(() => {
            this.showCopySuccess = true;
            this.copiedBookId = book.products_id;
            setTimeout(() => {
                this.showCopySuccess = false;
                this.copiedBookId = null;
            }, 2000);
        });
    }

    closeLoginPrompt(): void {
        this.showLoginPrompt = false;
    }

    openAccountModal() {
        if (this.accountModal) {
            this.accountModal.openModal();
        }
    }

    // Ratings & Countdown
    fetchRatingsForBooks(): void {
        const bookIds = this.books
            .map(b => b.products_id)
            .filter(id => !!id);

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

    getAverageRating(book: Book): number {
        return this.ratings[book.products_id] ? Math.round(this.ratings[book.products_id].averageRating) : 0;
    }

    getRatingCount(book: Book): number {
        return this.ratings[book.products_id] ? this.ratings[book.products_id].ratingCount : 0;
    }

    startCountdown() {
        if (this.books.length === 0) return;
        this.countdownInterval = setInterval(() => {
            const now = new Date().getTime();
            this.books.forEach(book => {
                if (!book.promotionEndDate) {
                    book.remainingTime = '';
                    return;
                }
                const promoEndDate = new Date(book.promotionEndDate).getTime();
                const distance = promoEndDate - now;
                if (distance < 0) {
                    book.remainingTime = '';
                } else {
                    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                    book.remainingTime = `${days} أيام ${hours} ساعة ${minutes} دقيقه ${seconds} ثواني`;
                }
            });
        }, 1000);
    }

    ngOnDestroy(): void {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        if (this.intersectionObserver) this.intersectionObserver.disconnect();
    }

    // Analytics: Setup intersection observer for impression tracking
    private setupIntersectionObserver(): void {
        if (!isPlatformBrowser(this.platformId) || typeof IntersectionObserver === 'undefined') {
            return;
        }

        this.intersectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const productId = entry.target.getAttribute('data-product-id');
                        if (productId && !this.trackedProducts.has(productId)) {
                            this.trackedProducts.add(productId);
                            this.analyticsTrackingService.trackImpression(productId, 'books_page');
                            // Stop observing after tracking once
                            this.intersectionObserver?.unobserve(entry.target);
                        }
                    }
                });
            },
            {
                threshold: 0.5, // Track when 50% of the element is visible
                rootMargin: '0px'
            }
        );

        // Observe product cards after a short delay to ensure DOM is ready
        setTimeout(() => {
            const productCards = document.querySelectorAll('[data-product-id]');
            productCards.forEach(card => {
                this.intersectionObserver?.observe(card);
            });
        }, 500);
    }

    getDisplayedPages(): (number | string)[] {
        const totalPages = this.totalPages || 1;
        const currentPage = this.currentPage || 1;
        const maxPagesToShow = 5;

        if (totalPages <= maxPagesToShow) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }

        const pages: (number | string)[] = [1];
        const leftOffset = Math.floor(maxPagesToShow / 2);
        const rightOffset = maxPagesToShow - leftOffset - 1;

        let startPage = Math.max(2, currentPage - leftOffset);
        let endPage = Math.min(totalPages - 1, currentPage + rightOffset);

        if (startPage > 2) pages.push('...');
        for (let i = startPage; i <= endPage; i++) pages.push(i);
        if (endPage < totalPages - 1) pages.push('...');
        if (totalPages > 1) pages.push(totalPages);

        return pages;
    }

    isAffiliateProduct(product: Book): boolean {
        if (!product) return false;
        return product.productType === 'affiliate' || !!(product.amazonAsin && product.amazonAsin.trim());
    }

    openAmazonAffiliateLink(product: Book, event?: MouseEvent): void {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        if (!product) return;
        const asin = (product.amazonAsin || '').trim();
        const sellerId = product.merchantId || '';
        const productId = product.products_id;

        const trackPayload = {
            productId: productId,
            amazonAsin: asin,
            sellerId: sellerId
        };

        const backendUrl = environment.apiBaseUrl || '/api';
        this.http.post(`${backendUrl}/affiliate/track-click`, trackPayload).subscribe({
            next: (res: any) => {
                const affiliateUrl = res?.affiliateUrl || `https://www.amazon.eg/dp/${asin}/?tag=knoozbook-21`;
                if (isPlatformBrowser(this.platformId)) {
                    window.open(affiliateUrl, '_blank', 'noopener,noreferrer,sponsored');
                }
            },
            error: (err) => {
                const fallbackUrl = `https://www.amazon.eg/dp/${asin}/?tag=knoozbook-21`;
                if (isPlatformBrowser(this.platformId)) {
                    window.open(fallbackUrl, '_blank', 'noopener,noreferrer,sponsored');
                }
            }
        });
    }
}