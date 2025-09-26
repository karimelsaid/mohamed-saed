import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../services/data.service';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-favorites',
  standalone : false,
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.css']
})
export class FavoritesComponent implements OnInit {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  favoriteBooks: any[] = [];
  isLoading = true;
  showLoginPrompt = false;
  constructor(
    private authService: AuthService,
    private dataService: DataService
  ) {}

  ngOnInit(): void {
    this.loadFavoriteBooks();
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
  loadFavoriteBooks() {
    this.authService.favoriteBookIds.subscribe(bookIds => {
      if (bookIds.length > 0) {
        this.dataService.getData().pipe(
          map((books: any[]) => books.filter(book => bookIds.includes(book.products_id)))
        ).subscribe({
          next: (filteredBooks) => {
            this.favoriteBooks = filteredBooks;
            this.isLoading = false;
          },
          error: (err) => {
            console.error('Error loading favorite books:', err);
            this.isLoading = false;
          }
        });
      } else {
        this.favoriteBooks = [];
        this.isLoading = false;
      }
    });
  }

  removeFromFavorites(bookId: string) {
    // Store original state in case we need to revert
    const originalFavorites = [...this.favoriteBooks];

    // Immediately update UI
    this.favoriteBooks = this.favoriteBooks.filter(book => book.products_id !== bookId);

    this.authService.user$.subscribe(user => {
      const userId = user?.id;
      if (userId) {
        this.authService.removeFromFavorites(userId, bookId).subscribe({
          next: () => {
            // Update favorite IDs in auth service
            const currentFavoriteIds = this.authService.favoriteBookIds.getValue();
            this.authService.favoriteBookIds.next(currentFavoriteIds.filter(id => id !== bookId));
          },
          error: (err) => {
            console.error('Error removing from favorites:', err);
            // Revert to original state if API call fails
            this.favoriteBooks = originalFavorites;
          }
        });
      }
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
        imageElement.src = this.uploadsBaseUrl + '/default.webp';
        break;
    }
  }
}
