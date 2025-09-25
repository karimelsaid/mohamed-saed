import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DataService } from '../services/data.service';
import { Book } from '../book';
import { CommonModule, NgIf } from '@angular/common';
import { CheckoutModalComponent } from '../checkout-modal/checkout-modal.component';
import { AccountModalComponent } from '../auth/account-modal/account-modal.component';
import { SharedModule } from '../shared/shared.module';
import { AuthService } from '../auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faStar, faShareAlt } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-book-details',
  standalone: true,
  imports: [CommonModule, NgIf, CheckoutModalComponent, SharedModule, FontAwesomeModule, RouterModule],
  templateUrl: './book-details.component.html',
  styleUrls: ['./book-details.component.css']
})
export class BookDetailsComponent implements OnInit {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  @ViewChild(AccountModalComponent, { static: false }) accountModal?: AccountModalComponent;
  faStar = faStar;
  faStarRegular = faStarRegular;
  faShareAlt = faShareAlt;

  showCopySuccess = false;
  book: Book | undefined;
  loading: boolean = true;
  error: string | null = null;
  showCheckoutModal = false;
  showLoginPrompt = false; // متغير للتحكم في عرض النافذة العائمة

  averageRating: number = 0;
  ratingCount: number = 0;

  constructor(
    private route: ActivatedRoute,
    private dataService: DataService,
    private authService: AuthService,
    private http: HttpClient
  ) { }

  // Add method to generate slug same as tatwer component
  getBookSlug(bookName: string | undefined | null): string {
    if (!bookName) return '';
    return bookName.trim().replace(/\s+/g, '-');
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(paramMap => {
      let id = paramMap.get('id');
      if (id !== null) {
        const trimmedId = id.trim();
        console.log('BookDetailsComponent: id from URL:', trimmedId);
        this.loading = true;
        this.error = null;
        this.dataService.getData().subscribe({
          next: (books: Book[]) => {
            console.log('BookDetailsComponent: number of books fetched:', books.length);
            console.log('BookDetailsComponent: searching for book with id:', trimmedId);
            this.book = books.find(b => b.products_id.toString() === trimmedId);
            if (!this.book) {
              console.warn('BookDetailsComponent: book not found for id:', trimmedId);
              this.error = 'الكتاب غير موجود';
              this.loading = false;
            } else {
              this.fetchAverageRating(this.book.products_id.toString());
            }
          },
          error: (err) => {
            this.error = 'حدث خطأ أثناء جلب بيانات الكتاب';
            this.loading = false;
          }
        });
      } else {
        this.error = 'معرف الكتاب غير موجود في الرابط';
        this.loading = false;
      }
    });
  }

  fetchAverageRating(bookId: string): void {
    this.http.get<{ bookId: string; averageRating: number; ratingCount: number }>(`http://localhost:3000/api/users/average-rating/${bookId}`)
      .subscribe({
        next: (res) => {
          this.averageRating = res.averageRating;
          this.ratingCount = res.ratingCount;
          this.loading = false;
        },
        error: (err) => {
          console.error('Error fetching average rating:', err);
          this.loading = false;
        }
      });
  }

  getImageUrl(imageName: string): string {
    // Assuming images are stored in assets/images or public folder
    return imageName ? '/books/' + imageName + '.webp' : '/books/default-book.png';
  }
  // دالة نسخ الرابط
  copyBookLink(): void {
    if (!this.book) return;
    const url = window.location.origin + '/book/' + this.book.products_id + '/' + this.getBookSlug(this.book.product_name);
    navigator.clipboard.writeText(url).then(() => {
      this.showCopySuccess = true;
      setTimeout(() => this.showCopySuccess = false, 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
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

  closeLoginPrompt(): void {
    this.showLoginPrompt = false; // إغلاق النافذة العائمة
  }

  openAccountModal() {
    if (this.accountModal) {
      this.accountModal.openModal();
    } else {
      console.warn('Account modal is not available yet.');
    }
  }

  onBuyNowClick() {
    this.authService.isLoggedIn$.subscribe(status => {
      if (status) {
        this.showCheckoutModal = true;
      } else {
        this.showLoginPrompt = true;
      }
    });
  }

  roundedAverageRating(): number {
    return Math.round(this.averageRating);
  }
}
