import { Component, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { DataService } from '../../services/data.service';
import { Book } from '../../book';
import { faHeart, faCartPlus, faShareAlt } from '@fortawesome/free-solid-svg-icons';
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { AuthService } from '../../auth/auth.service';
import { AccountModalComponent } from '../../auth/account-modal/account-modal.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
@Component({
  selector: 'app-fenon',
  standalone: false,
  templateUrl: './fenon.component.html',
  styleUrls: ['./fenon.component.css']
})
export class FenonComponent implements OnInit, OnDestroy {
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
  showCopySuccess: boolean = false;
  copiedBookId: string | null = null;
  isLoading: boolean = true;

  constructor(private dataService: DataService, private authService: AuthService, private http: HttpClient) { }

  ngOnInit(): void {
    this.isLoading = true;
    this.dataService.getData().subscribe(data => {
      this.books = data.filter((book: Book) => book.product_category.includes('فن'));
      this.totalPages = Math.ceil(this.books.length / this.booksPerPage);
      this.updatePage();
      this.startCountdown();
      this.fetchRatingsForBooks();
      this.isLoading = false;
    });
  }
  copyBookLink(book: Book): void {
    if (!book) return;
    const url = window.location.origin + '/book/' + this.getBookSlug(book.product_name);
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

  changePage(direction: string): void {
    if (direction === 'previous' && this.currentPage > 1) {
      this.currentPage--;
    } else if (direction === 'next' && this.currentPage < this.totalPages) {
      this.currentPage++;
    }
    this.updatePage();
    this.scrollToTop();
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  handleImageError(event: any) {
    const imageElement = event.target;

    if (!imageElement.errorStep) {
      imageElement.errorStep = 1;
    } else {
      imageElement.errorStep++;
    }

    const imageName = imageElement.src.split('/').pop().split('.')[0];

switch (imageElement.errorStep) {
      case 1:
        imageElement.src = this.uploadsBaseUrl + `/${imageName}.webp`;
        break;
      case 2:
        imageElement.src = this.uploadsBaseUrl + `/${imageName}.png`;
        break;
      case 3:
        imageElement.src = this.uploadsBaseUrl + `/${imageName}.jpg`;
        break;
      default:
        imageElement.src = this.uploadsBaseUrl + '/default.png';
        break;
    }
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
