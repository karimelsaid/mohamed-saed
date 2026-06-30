import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../services/data.service';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';
import { AnalyticsTrackingService } from '../services/analytics-tracking.service';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [CommonModule, RouterModule, NgxSkeletonLoaderModule],
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.css']
})
export class FavoritesComponent implements OnInit, OnDestroy {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  favoriteBooks: any[] = [];
  isLoading = false;
  showLoginPrompt = false;

  // Analytics tracking
  private trackedProducts = new Set<string>();
  private intersectionObserver: IntersectionObserver | null = null;

  constructor(
    private authService: AuthService,
    private dataService: DataService,
    private router: Router,
    private analyticsTrackingService: AnalyticsTrackingService,
    @Inject(PLATFORM_ID) private platformId: Object
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

            // Setup intersection observer for impression tracking
            this.setupIntersectionObserver();
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

  navigateToProduct(book: any): void {
    const slug = book.product_name.trim().replace(/\s+/g, '-');
    // Track click event
    this.analyticsTrackingService.trackClick(book.products_id, 'favorites_page');
    this.router.navigate(['/book', book.products_id, slug]);
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

  ngOnDestroy(): void {
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
              this.analyticsTrackingService.trackImpression(productId, 'favorites_page');
              // Stop observing after tracking once
              this.intersectionObserver?.unobserve(entry.target);
            }
          }
        });
      },
      {
        threshold: 0.5,
        rootMargin: '0px'
      }
    );

    setTimeout(() => {
      const productCards = document.querySelectorAll('[data-product-id]');
      productCards.forEach(card => {
        this.intersectionObserver?.observe(card);
      });
    }, 500);
  }

}
