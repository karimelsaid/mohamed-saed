import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../services/data.service';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [CommonModule, RouterModule, NgxSkeletonLoaderModule],
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.css']
})
export class FavoritesComponent implements OnInit {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  favoriteBooks: any[] = [];
  isLoading = false;
  showLoginPrompt = false;
  constructor(
    private authService: AuthService,
    private dataService: DataService
  ) { }

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
            this.loadUserData(userId);
          },
          error: err => { }
        });
      } else {
        this.authService.addToCart(userId, bookId).subscribe({
          next: res => {
            this.loadUserData(userId);
          },
          error: err => { }
        });
      }
    } else {
      this.showLoginPrompt = true;
    }
  }
  loadUserData(userId: string) {
    if (!userId) {
      return;
    }
    this.authService.loadUserData(userId);
  }
  loadFavoriteBooks() {
    this.authService.favoriteBookIds.subscribe(bookIds => {
      if (bookIds.length > 0) {
        this.isLoading = true;
        this.dataService.getData().pipe(
          map((books: any[]) => {
            const filtered = books.filter(book => {
              const bookPid = String(book.products_id);
              const bookId = String(book._id);
              return bookIds.includes(bookPid) || bookIds.includes(bookId);
            });
            return filtered;
          })
        ).subscribe({
          next: (filteredBooks) => {
            this.favoriteBooks = filteredBooks;
            this.isLoading = false;
          },
          error: (err) => {
            this.isLoading = false;
          }
        });
      } else {
        this.favoriteBooks = [];
        this.isLoading = false;
      }
    });
  }

  getBookImageUrl(book: any): string {
    return this.dataService.getBookImageUrl(book);
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


}
