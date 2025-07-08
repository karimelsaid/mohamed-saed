import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DataService } from '../services/data.service';
import { Book } from '../book';
import { faHeart, faCartPlus, faShareAlt } from '@fortawesome/free-solid-svg-icons';
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { AuthService } from '../auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
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
  books: Book[] = []; // كل الكتب
  searchQuery: string = ''; // نص البحث
  currentPage: number = 1; // الصفحة الحالية
  booksPerPage = 10; // عدد الكتب في الصفحة
  totalBooks = 0; // إجمالي الكتب التي تطابق البحث
  showLoginPrompt = false;
  faShareAlt = faShareAlt;
  showCopySuccess = false;
  copiedBookId: string | null = null;

  // New properties for modal and form
  showRequestModal = false;
  requestedBookName = '';
  requestedAuthorName = '';
  requestSuccessMessage = '';
  isRequestSubmitting = false;
  ratings: { [bookId: string]: any } = {};

  filterType = 'all';

  isLoading = false; // Add loading flag

  constructor(private dataService: DataService, private route: ActivatedRoute, private authService: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    this.fetchRatingsForBooks();
    // نحصل على قيمة البحث من الـ queryParams
    this.route.queryParams.subscribe(params => {
      this.searchQuery = params['q'] || ''; // تأكد من وجود قيمة
      this.filterType = params['filter'] || 'all';
      this.searchBooks();
    });
  }
  // دالة نسخ رابط الكتاب
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
      alert('يرجى إدخال اسم الكتاب');
      return;
    }

    this.isRequestSubmitting = true;

    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (!userId) {
      alert('يرجى تسجيل الدخول لإرسال الطلب');
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
        alert('حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى.');
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

  searchBooks(): void {
    this.isLoading = true; // Set loading true before data fetch
    if (this.filterType === 'recentlyAdded') {
      this.dataService.getRecentBooks().subscribe(data => {
        this.totalBooks = data.length;
        this.currentPage = Math.min(this.currentPage, Math.ceil(this.totalBooks / this.booksPerPage));
        const startIndex = (this.currentPage - 1) * this.booksPerPage;
        const endIndex = this.currentPage * this.booksPerPage;
        this.books = data.slice(startIndex, endIndex);
        this.fetchRatingsForBooks();
        this.isLoading = false; // Set loading false after data fetch
      });
    } else {
      this.dataService.getData().subscribe(data => {
        const normalizedQuery = this.normalizeArabic(this.searchQuery.toLowerCase());
        const filteredBooks = data.filter((book: Book) => {
          if (!book.product_name || typeof book.product_name !== 'string') {
            return false;
          }
          const normalizedProductName = this.normalizeArabic(book.product_name.toLowerCase());
          return normalizedProductName.includes(normalizedQuery);
        });
        // Sort filteredBooks to prioritize books starting with the exact original query
        const originalQueryLower = this.searchQuery.toLowerCase();
        filteredBooks.sort((a: Book, b: Book) => {
          const aStarts = a.product_name.toLowerCase().startsWith(originalQueryLower);
          const bStarts = b.product_name.toLowerCase().startsWith(originalQueryLower);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return 0;
        });
        this.totalBooks = filteredBooks.length;
        this.books = filteredBooks.slice((this.currentPage - 1) * this.booksPerPage, this.currentPage * this.booksPerPage);
        this.fetchRatingsForBooks(); // Fetch ratings after books are loaded
        this.isLoading = false; // Set loading false after data fetch
      });
    }
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

  // دالة التعامل مع الخطأ في تحميل الصورة
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
}
