import { Component, ViewChild, OnInit, OnDestroy } from '@angular/core';
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
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
    selector: 'app-books',
    templateUrl: './books.component.html',
    styleUrls: ['./books.component.css'],
    standalone: false
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

    // Filters
    selectedCategory: string = 'الكل';
    maxPrice: number = 2000;
    minPrice: number = 0;
    siteMaxPrice: number = 5000;
    sortOrder: string = 'random'; // Default to random

    // Book categories to filter by
    bookCategories = [
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
        public gamificationService: GamificationService
    ) { }

    ngOnInit(): void {
        this.isLoading = true;

        // Subscribe to both params (for /category/:name) and queryParams
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
    }

    loadBooks(): void {
        this.isLoading = true;
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
            this.isLoading = false;
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
}
