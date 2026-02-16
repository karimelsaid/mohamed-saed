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
import { GamificationService } from '../../services/gamification.service';

@Component({
  selector: 'app-child',
  standalone: false,
  templateUrl: './child.component.html',
  styleUrls: ['./child.component.css']
})
export class ChildComponent implements OnInit, OnDestroy {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  @ViewChild(AccountModalComponent, { static: false }) accountModal?: AccountModalComponent;
  faHeart = faHeart;
  faCartPlus = faCartPlus;
  faStar = faStar;
  faStarRegular = faStarRegular;
  books: Book[] = [];
  paginatedBooks: Book[] = [];
  currentPage = 1;
  booksPerPage = 12;
  totalPages = 1;
  showLoginPrompt = false;

  ratings: { [bookId: string]: any } = {};

  private countdownInterval: any;
  faShareAlt = faShareAlt;
  faCoins = faCoins;
  showCopySuccess: boolean = false;
  copiedBookId: string | null = null;
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

      // Filter books by category 'تربية'
      let filteredBooks = data.filter((book: Book) => book.product_category.includes('تربية'));

      // Debug promotionEndDate values before processing
      filteredBooks.forEach((book: Book) => {
        console.log(`Book: ${book.product_name}, promotionEndDate raw: ${book.promotionEndDate}`);
      });

      // Parse promotionEndDate and update rival flag based on current date
      const now = new Date().getTime();
      filteredBooks = filteredBooks.map((book: Book) => {
        if (book.promotionEndDate) {
          const promoEnd = new Date(book.promotionEndDate).getTime();
          console.log(`Now: ${now}, PromoEnd: ${promoEnd}, PromoEnd > Now: ${promoEnd > now}`);
          book.rival = promoEnd > now;
        } else {
          book.rival = false;
        }
        // Ensure product_discount_percent is a number
        book.product_discount_percent = Number(book.product_discount_percent) || 0;
        return book;
      });

      this.books = filteredBooks;

      console.log('Loaded books with updated rival flags:', this.books);
      this.books.forEach((book: Book) => {
        console.log(`Book: ${book.product_name}, rival: ${book.rival}, discount: ${book.product_discount_percent}, promotionEndDate: ${book.promotionEndDate}`);
      });

      this.totalPages = Math.ceil(this.books.length / this.booksPerPage); // حساب عدد الصفحات
      this.currentPage = Math.min(this.currentPage, this.totalPages); // التأكد من أن الصفحة الحالية صحيحة
      this.updatePage();
      this.startCountdown();
      this.fetchRatingsForBooks();
      this.isLoading = false;
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
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  }
  // Updated method to generate book slug without encoding to keep readable characters in URL
  getBookSlug(bookName: string): string {
    return bookName.trim().replace(/\s+/g, '-');
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  fetchRatingsForBooks(): void {
    this.books.forEach(book => {
      if (book.products_id) {
        this.http.get<{ bookId: string; averageRating: number; ratingCount: number }>(`${environment.apiBaseUrl}/users/average-rating/${book.products_id}`)
          .subscribe({
            next: (res) => {
              this.ratings[book.products_id] = {
                averageRating: res.averageRating,
                ratingCount: res.ratingCount
              };
            },
            error: (err) => {
              console.error('Error fetching average rating for book', book.products_id, err);
              this.ratings[book.products_id] = {
                averageRating: 0,
                ratingCount: 0
              };
            }
          });
      }
    });
  }

  getAverageRating(book: Book): number {
    if (book.products_id && this.ratings[book.products_id]) {
      return Math.round(this.ratings[book.products_id].averageRating);
    }
    return 0;
  }

  getRatingCount(book: Book): number {
    if (book.products_id && this.ratings[book.products_id]) {
      return this.ratings[book.products_id].ratingCount;
    }
    return 0;
  }

  isFavorite(bookId: string): boolean {
    return this.authService.isFavorite(bookId);
  }

  isInCart(bookId: string): boolean {
    return this.authService.isInCart(bookId);
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

  addToFavorites(bookId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (userId) {
      if (this.isFavorite(bookId)) {
        this.authService.removeFromFavorites(userId, bookId).subscribe({
          next: res => {
            console.log('تم الحذف من المفضلة', res);
            this.loadUserData(userId);
          },
          error: err => console.error('خطأ في الحذف من المفضلة', err)
        });
      } else {
        this.authService.addToFavorites(userId, bookId).subscribe({
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

  addToCart(bookId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (userId) {
      if (this.isInCart(bookId)) {
        this.authService.removeFromCart(userId, bookId).subscribe({
          next: res => {
            console.log('تم الحذف من السلة', res);
            this.loadUserData(userId);
          },
          error: err => console.error('خطأ في الحذف من السلة', err)
        });
      } else {
        this.authService.addToCart(userId, bookId).subscribe({
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



  getBookImageUrl(book: any): string {
    let imagePath = book.product_image ? String(book.product_image) : '';
    if (!imagePath) {
      if (book.merchantName) {
        imagePath = 'merchant_' + book.merchantName + '/' + book.products_id + '/' + book.products_id + '.webp';
      } else {
        imagePath = 'admin__karim_mohamed__/' + book.products_id + '/' + book.products_id + '.webp';
      }
    } else {
      if (imagePath.includes('/')) {
        const parts = imagePath.split('/');
        if (imagePath.includes('merchant_')) {
          imagePath = parts.slice(-3).join('/');
        } else if (imagePath.includes('admin__')) {
          imagePath = parts.slice(-3).join('/');
        } else {
          imagePath = parts[parts.length - 1];
        }
      } else {
        if (!imagePath.includes('.') && /^\d+$/.test(imagePath)) {
          if (book.merchantName) {
            imagePath = 'merchant_' + book.merchantName + '/' + imagePath + '/' + imagePath + '.webp';
          } else {
            imagePath = 'admin__karim_mohamed__/' + imagePath + '/' + imagePath + '.webp';
          }
        } else if (!imagePath.includes('.')) {
          imagePath += '.webp';
        }
      }
    }
    return this.uploadsBaseUrl + '/' + imagePath;
  }

  startCountdown() {
    if (this.books.length === 0) {
      return;
    }

    this.books.forEach(book => {
      book.remainingTime = '';
    });

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
          return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        book.remainingTime = `${days} أيام ${hours} ساعة ${minutes} دقيقه ${seconds} ثواني`;
      });
    }, 1000);
  }
}
