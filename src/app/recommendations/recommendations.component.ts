import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faHeart, faCartPlus, faBook, faStar, faTrash, faTimes } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-recommendations',
  standalone: true,
  imports: [CommonModule, RouterModule, FontAwesomeModule],
  templateUrl: './recommendations.component.html',
  styleUrls: ['./recommendations.component.css']
})
export class RecommendationsComponent implements OnInit {
  faHeart = faHeart;
  faCartPlus = faCartPlus;
  faBook = faBook;
  faStar = faStar;
  faTrash = faTrash;
  faTimes = faTimes;

  recommendations: any[] = [];
  loading = true;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadRecommendations();
  }

  loadRecommendations(): void {
    // Try to get recommendations from route params (from notification)
    const recommendationsData = this.route.snapshot.queryParamMap.get('data');
    
    if (recommendationsData) {
      try {
        const parsed = JSON.parse(recommendationsData);
        this.recommendations = Array.isArray(parsed) ? parsed : [];
        this.loading = false;
      } catch (e) {
        this.error = 'خطأ في تحميل التوصيات';
        this.loading = false;
      }
    } else {
      // If no data in params, get from user's recommendations via API
      this.authService.user$.subscribe(user => {
        if (user && user.id) {
          this.http.get<any>(`${environment.apiBaseUrl}/analytics/recommendations/user/${user.id}`)
            .subscribe({
              next: (response) => {
                this.recommendations = response.recommendations || [];
                this.loading = false;
              },
              error: (err) => {
                console.error('Error loading recommendations:', err);
                this.error = 'فشل تحميل التوصيات';
                this.loading = false;
              }
            });
        } else {
          this.error = 'يجب تسجيل الدخول لعرض التوصيات';
          this.loading = false;
        }
      });
    }
  }

  addToCart(bookId: string): void {
    // Implement add to cart logic
    console.log('Add to cart:', bookId);
  }

  addToFavorites(bookId: string): void {
    // Implement add to favorites logic
    console.log('Add to favorites:', bookId);
  }

  buyNow(bookId: string): void {
    // Implement buy now logic
    console.log('Buy now:', bookId);
  }

  deleteRecommendations(): void {
    if (!confirm('هل أنت متأكد من حذف جميع التوصيات؟')) {
      return;
    }

    this.authService.user$.subscribe(user => {
      if (user && user.id) {
        this.http.delete(`${environment.apiBaseUrl}/analytics/recommendations/user/${user.id}`)
          .subscribe({
            next: () => {
              this.recommendations = [];
            },
            error: (err) => {
              console.error('Error deleting recommendations:', err);
              alert('فشل حذف التوصيات');
            }
          });
      }
    });
  }

  goToBook(bookId: string): void {
    this.router.navigate(['/book', bookId]);
  }
}
