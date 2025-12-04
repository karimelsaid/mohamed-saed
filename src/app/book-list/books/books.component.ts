import { Component, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../services/data.service';
import { Book } from '../../book';
import { faHeart, faCartPlus, faShareAlt, faStar } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { AuthService } from '../../auth/auth.service';
import { AccountModalComponent } from '../../auth/account-modal/account-modal.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

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

    // Book categories to filter by
    bookCategories = [
        'كتب', 'روايات وقصص', 'تطوير الذات وعلم النفس', 'كتب دينية',
        'قواميس ومراجع', 'صحة وطب وعلوم', 'أعمال وتسويق ومالية',
        'فنون وحرف', 'تاريخ وسير ذاتية', 'تربية وأطفال'
    ];

    constructor(
        private dataService: DataService,
        private route: ActivatedRoute,
        private router: Router,
        private authService: AuthService,
        private http: HttpClient
    ) { }

    ngOnInit(): void {
        this.isLoading = true;
        this.route.queryParams.subscribe(params => {
            this.currentPage = parseInt(params['page'] || '1', 10);
        });

        this.dataService.getData().subscribe(data => {
            // Filter for any book category
            let filteredBooks = data.filter((book: Book) =>
                this.bookCategories.some(cat => book.product_category.includes(cat))
            );

            // Process books (rival flag, discount, etc.)
            const now = new Date().getTime();
            filteredBooks = filteredBooks.map((book: Book) => {
                if (book.promotionEndDate) {
                    const promoEnd = new Date(book.promotionEndDate).getTime();
                    book.rival = promoEnd > now;
                } else {
                    book.rival = false;
                }
                book.product_discount_percent = Number(book.product_discount_percent) || 0;
                return book;
            });

            this.books = filteredBooks;
            this.totalPages = Math.ceil(this.books.length / this.booksPerPage);
            this.currentPage = Math.min(this.currentPage, this.totalPages) || 1;

            this.updatePage();
            this.startCountdown();
            this.fetchRatingsForBooks();
            this.isLoading = false;
        });
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

    // Helper methods
    getBookSlug(bookName: string): string {
        return bookName.trim().replace(/\s+/g, '-');
    }

    getBookImageUrl(book: any): string {
        // Simplified image logic similar to home page
        let imagePath = book.product_image ? String(book.product_image) : '';
        if (!imagePath) return this.uploadsBaseUrl + '/placeholder.webp';

        if (imagePath.includes('/')) {
            if (!imagePath.startsWith('http')) {
                return this.uploadsBaseUrl + '/' + imagePath;
            }
            return imagePath;
        }

        if (book.merchantName) {
            imagePath = 'merchant_' + book.merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_') + '/' + book.products_id + '/' + (imagePath.includes('.') ? imagePath : imagePath + '.webp');
        } else {
            imagePath = 'admin__karim_mohamed__/' + book.products_id + '/' + (imagePath.includes('.') ? imagePath : imagePath + '.webp');
        }
        return this.uploadsBaseUrl + '/' + imagePath;
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
        this.books.forEach(book => {
            if (book.products_id) {
                this.http.get<{ bookId: string; averageRating: number; ratingCount: number }>(`${environment.apiBaseUrl}/users/average-rating/${book.products_id}`)
                    .subscribe({
                        next: (res) => {
                            this.ratings[book.products_id] = { averageRating: res.averageRating, ratingCount: res.ratingCount };
                        },
                        error: () => {
                            this.ratings[book.products_id] = { averageRating: 0, ratingCount: 0 };
                        }
                    });
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
                    book.remainingTime = 'انتهى العرض';
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
