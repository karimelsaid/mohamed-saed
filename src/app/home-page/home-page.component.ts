import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { DataService } from '../services/data.service';
import { AuthService } from '../auth/auth.service';
import { faBook, faTools, faLaptop, faTshirt, faSpa, faShoePrints, faCouch, faGamepad, faThLarge, faEllipsisH, faStar, faFileAlt, faHeart } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../environments/environment';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-home-page',
  standalone: false,
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.css']
})
export class HomePageComponent implements OnInit {
  faHeart = faHeart;

  uploadsBaseUrl = environment.uploadsBaseUrl;
  isLoading: boolean = true;
  allProducts: any[] = [];

  // Tab System
  activeTab: string = 'all';

  // Icons
  faStar = faStar;

  categories = [
    { id: 'all', name: 'الكل', icon: null },
    { id: 'books', name: 'كتب', icon: faBook, filter: ['كتب', 'روايات وقصص', 'تطوير الذات وعلم النفس', 'كتب دينية', 'قواميس ومراجع', 'صحة وطب وعلوم', 'أعمال وتسويق ومالية', 'فنون وحرف', 'تاريخ وسير ذاتية', 'تربية وأطفال'] },
    { id: 'print', name: 'طباعة', icon: faFileAlt, filter: ['مستندات'], comingSoon: true },
    { id: 'electronics', name: 'إلكترونيات', icon: faLaptop, filter: ['إلكترونيات'], comingSoon: true },
    { id: 'clothing', name: 'ملابس', icon: faTshirt, filter: ['ملابس'], comingSoon: true },
    { id: 'cosmetics', name: 'تجميل', icon: faSpa, filter: ['تجميل'], comingSoon: true },
    { id: 'office-supplies', name: 'أدوات مكتبية', icon: faTools, filter: ['أدوات مكتبية'], comingSoon: true },
    { id: 'shoes', name: 'أحذية', icon: faShoePrints, filter: ['أحذية'], comingSoon: true },
    { id: 'furniture', name: 'أثاث', icon: faCouch, filter: ['أثاث'], comingSoon: true },
    { id: 'games', name: 'ألعاب', icon: faGamepad, filter: ['ألعاب'], comingSoon: true },
    { id: 'fabrics', name: 'أقمشة', icon: faThLarge, filter: ['أقمشة'], comingSoon: true },
    { id: 'others', name: 'أخرى', icon: faEllipsisH, filter: ['غير مصنف'], comingSoon: true }
  ];

  // Promo Carousel
  promoImages: string[] = [];
  promoCurrentIndex = 0;
  promoIntervalId: any;
  touchStartX: number = 0;
  touchEndX: number = 0;

  constructor(
    private dataService: DataService,
    private router: Router,
    private authService: AuthService,
    private seoService: SeoService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    this.isLoading = true;
    this.setPromoImages();
    if (isPlatformBrowser(this.platformId)) {
      this.startPromoAutoScroll();
    }

    // Set SEO meta tags for the homepage
    this.seoService.updateMetaTags({
      title: 'الصفحة الرئيسية',
      description: 'مكتبة كنوز - مكتبة عربية إلكترونية تقدم مجموعة متنوعة من الكتب والمنتجات. اكتشف أفضل الكتب بأسعار مميزة وخدمة توصيل لجميع المحافظات.',
      keywords: 'مكتبة كنوز, كتب عربية, كتب أونلاين, شراء كتب, مكتبة إلكترونية, توصيل كتب',
      url: 'https://knoozbook.com/Home'
    });

    this.dataService.getData().subscribe((data: any) => {
      this.allProducts = data.sort((a: any, b: any) => b.products_id - a.products_id); // Newest first
      this.isLoading = false;
    });

    window.addEventListener('resize', () => {
      this.setPromoImages();
    });
  }

  get filteredProducts(): any[] {
    if (this.activeTab === 'all') {
      return this.allProducts.slice(0, 20); // Show top 20 new items
    }

    const category = this.categories.find(c => c.id === this.activeTab);
    if (!category || !category.filter) return [];

    return this.allProducts.filter(product =>
      category.filter?.some(f => product.product_category && product.product_category.includes(f))
    ).slice(0, 20);
  }

  setActiveTab(tabId: string): void {
    this.activeTab = tabId;
  }

  // Helper Methods
  getBookSlug(bookName: string): string {
    return bookName.trim().replace(/\s+/g, '-');
  }

  getProductRoute(product: any): string[] {
    const slug = this.getBookSlug(product.product_name);
    // Simple mapping based on category ID logic
    let route = 'others';

    // Find which category this product belongs to
    const cat = this.categories.find(c =>
      c.id !== 'all' && c.filter?.some(f => product.product_category?.includes(f))
    );

    if (cat) {
      route = cat.id === 'books' ? 'book' : cat.id;
    }

    return ['/' + route, product.products_id, slug];
  }

  getBookImageUrl(book: any): string {
    let imagePath = book.product_image ? String(book.product_image) : '';

    // Simplified image path logic
    if (!imagePath) {
      return this.uploadsBaseUrl + '/placeholder.webp'; // Fallback
    }

    // Existing complex logic for path sanitization (kept for compatibility)
    const getSanitizedPath = (merchantName: string, id: string, filename: string) => {
      const sanitizedMerchantName = merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      return 'merchant_' + sanitizedMerchantName + '/' + id + '/' + filename;
    };

    if (imagePath.includes('/')) {
      // Already has path structure, ensure it's correct
      if (!imagePath.startsWith('http')) {
        return this.uploadsBaseUrl + '/' + imagePath;
      }
      return imagePath;
    }

    // If it's just a filename or ID
    if (book.merchantName) {
      imagePath = getSanitizedPath(book.merchantName, book.products_id, imagePath.includes('.') ? imagePath : imagePath + '.webp');
    } else {
      imagePath = 'admin__karim_mohamed__/' + book.products_id + '/' + (imagePath.includes('.') ? imagePath : imagePath + '.webp');
    }

    return this.uploadsBaseUrl + '/' + imagePath;
  }

  // Promo Carousel Logic
  startPromoAutoScroll(): void {
    clearInterval(this.promoIntervalId);
    this.promoIntervalId = setInterval(() => {
      this.promoCurrentIndex = (this.promoCurrentIndex + 1) % this.promoImages.length;
    }, 5000);
  }

  setPromoIndex(index: number): void {
    this.promoCurrentIndex = index;
    this.startPromoAutoScroll();
  }

  nextPromoImage(): void {
    this.promoCurrentIndex = (this.promoCurrentIndex + 1) % this.promoImages.length;
    this.startPromoAutoScroll(); // Reset timer
  }

  prevPromoImage(): void {
    this.promoCurrentIndex = (this.promoCurrentIndex - 1 + this.promoImages.length) % this.promoImages.length;
    this.startPromoAutoScroll(); // Reset timer
  }

  onTouchStart(e: TouchEvent): void {
    this.touchStartX = e.changedTouches[0].screenX;
  }

  onTouchEnd(e: TouchEvent): void {
    this.touchEndX = e.changedTouches[0].screenX;
    this.handleSwipe();
  }

  handleSwipe(): void {
    const threshold = 50; // Minimum distance to be considered a swipe
    const swipeDistance = this.touchEndX - this.touchStartX;

    if (Math.abs(swipeDistance) > threshold) {
      if (swipeDistance > 0) {
        // Swiped Right -> Previous Image
        this.prevPromoImage();
      } else {
        // Swiped Left -> Next Image
        this.nextPromoImage();
      }
    }
  }

  setPromoImages(): void {
    const width = window.innerWidth;
    if (width < 640) {
      this.promoImages = ['spanar1.jpg', 'spanar2.jpg', 'spanar3.jpg'];
    } else {
      this.promoImages = ['panar1.jpg', 'panar2.jpg', 'panar3.jpg'];
    }
  }

  // Favorite functionality
  isFavorite(productId: string): boolean {
    return this.authService.isFavorite(productId);
  }

  toggleFavorite(productId: string): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id;

    if (userId) {
      if (this.isFavorite(productId)) {
        this.authService.removeFromFavorites(userId, productId).subscribe({
          next: () => this.authService.loadUserData(userId),
          error: err => console.error('Error removing from favorites', err)
        });
      } else {
        this.authService.addToFavorites(userId, productId).subscribe({
          next: () => this.authService.loadUserData(userId),
          error: err => console.error('Error adding to favorites', err)
        });
      }
    } else {
      // Redirect to login or show login modal
      this.router.navigate(['/login']);
    }
  }

  navigateToProduct(product: any): void {
    const route = this.getProductRoute(product);
    this.router.navigate(route);
  }
}
