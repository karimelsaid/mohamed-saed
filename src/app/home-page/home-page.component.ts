import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { DataService } from '../services/data.service';
import { AuthService } from '../auth/auth.service';
import { faBook, faLaptop, faTshirt, faSpa, faShoePrints, faCouch, faGamepad, faThLarge, faEllipsisH, faStar, faFileAlt, faHeart, faPenNib } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../environments/environment';
import { SeoService } from '../services/seo.service';
import { PromotionService } from '../services/promotion.service';
import { MerchantAuthService } from '../services/merchant-auth.service';

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

  // Sections & Categories
  mainSections = [
    { id: 'books', name: 'الكتب والمؤلفات', icon: faBook, filter: ['كتب'] },
    { id: 'print', name: 'خدمات الطباعة', icon: faFileAlt, filter: ['مستندات', 'طباعة'] },
    { id: 'office-supplies', name: 'أدوات مكتبية', icon: faPenNib, filter: ['أدوات مكتبية'] }
  ];

  bookGenres = [
    { id: 'all', name: 'الكل' },
    { id: 'novels', name: 'روايات وقصص', filter: ['روايات وقصص'] },
    { id: 'islamic', name: 'كتب دينية', filter: ['كتب دينية'] },
    { id: 'development', name: 'تطوير الذات', filter: ['تطوير الذات وعلم النفس'] },
    { id: 'children', name: 'أطفال وتربية', filter: ['تربية وأطفال'] },
    { id: 'history', name: 'تاريخ وسير', filter: ['تاريخ وسير ذاتية'] },
    { id: 'business', name: 'أعمال ومالية', filter: ['أعمال وتسويق ومالية'] },
    { id: 'reference', name: 'قواميس ومراجع', filter: ['قواميس ومراجع'] },
    { id: 'health', name: 'صحة وعلوم', filter: ['صحة وطب وعلوم'] },
    { id: 'arts', name: 'فنون وحرف', filter: ['فنون وحرف'] }
  ];

  // Promo Carousel
  promoImages: string[] = [];
  dynamicSlides: any[] = [];
  promoCurrentIndex = 0;
  promoIntervalId: any;
  backgroundColumns: any[][] = [];
  touchStartX: number = 0;
  touchEndX: number = 0;

  // New Hero Configuration
  heroConfig = {
    mode: 'slider',
    columnCount: 4,
    scrollingSpeed: 'fast'
  };
  heroBooks: any[] = [];
  heroColumns: any[][] = [];

  // Newsletter
  newsletterEmail: string = '';
  isSubscribing: boolean = false;
  newsletterMessage: string = '';
  newsletterMessageType: 'success' | 'error' = 'success';

  // Merchants / Publishers
  merchants: any[] = [];

  constructor(
    private dataService: DataService,
    private router: Router,
    private authService: AuthService,
    private seoService: SeoService,
    private promotionService: PromotionService,
    private http: HttpClient,
    private merchantAuthService: MerchantAuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    this.initHero();

    // Set SEO meta tags for the homepage
    this.seoService.updateMetaTags({
      title: 'الصفحة الرئيسية',
      description: 'knoozbook - مكتبة عربية إلكترونية تقدم مجموعة متنوعة من الكتب والمنتجات. اكتشف أفضل الكتب بأسعار مميزة وخدمة توصيل لجميع المحافظات.',
      keywords: 'knoozbook, كتب عربية, كتب أونلاين, شراء كتب, مكتبة إلكترونية, توصيل كتب',
      url: 'https://knoozbook.com/Home'
    });

    this.dataService.getData().subscribe((data: any) => {
      // First sort by ID to get the newest ones
      const sorted = data.sort((a: any, b: any) => b.products_id - a.products_id);
      
      // Take the top 200 newest and shuffle them for variety
      const newestPool = sorted.slice(0, 200);
      const rest = sorted.slice(200);
      
      this.allProducts = [...this.dataService.shuffleArray(newestPool), ...rest];
      this.generateBackgroundColumns();
      this.isLoading = false;
    }, error => {
      console.error('Error fetching data for home page:', error);
      this.isLoading = false;
    });

    this.loadMerchants();

    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('resize', () => {
        this.setPromoImages();
      });
    }
  }

  generateBackgroundColumns() {
    if (!this.allProducts || this.allProducts.length === 0) {
      this.backgroundColumns = [];
      return;
    }
    
    // We want 5 columns with unique-ish products
    const colSize = 10;
    const shuffled = [...this.allProducts].sort(() => 0.5 - Math.random());
    
    this.backgroundColumns = [
      shuffled.slice(0, colSize),
      shuffled.slice(colSize, colSize * 2),
      shuffled.slice(colSize * 2, colSize * 3),
      shuffled.slice(colSize * 3, colSize * 4),
      shuffled.slice(colSize * 4, colSize * 5)
    ];
  }

  get filteredProducts(): any[] {
    // New Arrivals section should only show BOOKS
    const books = this.allProducts.filter(p =>
      p.product_category && (
        p.product_category.includes('كتب') ||
        p.product_category.includes('روايات') ||
        p.product_category.includes('قصص') ||
        p.product_category.includes('تطوير الذات') ||
        p.product_category.includes('ديني') ||
        p.product_category.includes('تاريخ') ||
        p.product_category.includes('أطفال') ||
        p.product_category.includes('أعمال') ||
        p.product_category.includes('قواميس') ||
        p.product_category.includes('صحة') ||
        p.product_category.includes('فنون') ||
        ['رواية', 'تنمية', 'ديني', 'اعمال', 'تربية'].includes(p.product_category)
      )
    );

    if (this.activeTab === 'all') {
      return books.slice(0, 20);
    }

    const genre = this.bookGenres.find(c => c.id === this.activeTab);
    if (!genre || !genre.filter) return books.slice(0, 20);

    return books.filter(product =>
      genre.filter?.some(f => product.product_category && product.product_category.includes(f))
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
    const slug = this.getBookSlug(product.product_name || '');
    const category = (product.product_category || '').toLowerCase();

    // 1. Try to find a match in mainSections
    const cat = this.mainSections.find(c =>
      c.id !== 'all' && c.filter?.some(f => category.includes(f.toLowerCase()))
    );

    if (cat) {
      return ['/' + (cat.id === 'books' ? 'book' : cat.id), product.products_id, slug];
    }

    // 2. Broad check for book-related keywords if no specific match
    const bookKeywords = ['كتب', 'روايات', 'قصص', 'تطوير الذات', 'دينية', 'تاريخ', 'أطفال', 'أعمال', 'قواميس', 'صحة', 'فنون'];
    const isBook = bookKeywords.some(key => category.includes(key));

    const route = isBook ? 'book' : 'others';
    return ['/' + route, product.products_id, slug];
  }

  getBookImageUrl(book: any): string {
    return this.dataService.getBookImageUrl(book);
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

  // New Hero Initialization
  initHero(): void {
    this.promotionService.getHeroConfig().subscribe({
      next: (config) => {
        if (config) this.heroConfig = { ...this.heroConfig, ...config };

        if (this.heroConfig.mode === 'scrolling') {
          this.loadHeroBooks();
        } else {
          this.setPromoImages();
        }
      },
      error: () => this.setPromoImages()
    });
  }

  loadHeroBooks(): void {
    this.promotionService.getHeroBooks().subscribe({
      next: (res: any) => {
        if (res && res.success && res.products && res.products.length > 0) {
          this.heroBooks = res.products;
          this.prepareHeroColumns();
          this.isLoading = false;
          // Trigger change detection implicitly via property update
        } else {
          console.warn('Hero books response unsuccessful', res);
          this.fallbackToSlider();
        }
      },
      error: (err) => {
        console.error('Error loading hero books', err);
        this.fallbackToSlider();
      }
    });
  }

  private fallbackToSlider(): void {
    this.heroConfig.mode = 'slider';
    this.setPromoImages();
    this.isLoading = false;
  }

  prepareHeroColumns(): void {
    const count = this.heroConfig.columnCount || 4;
    this.heroColumns = Array.from({ length: count }, () => []);

    // Distribute books among columns randomly or sequentially
    this.heroBooks.forEach((book, index) => {
      this.heroColumns[index % count].push(book);
    });

    // Mirror books to ensure seamless infinite scroll if needed, 
    // but the CSS marquee usually handles this by doubling the content.
  }

  setPromoImages(): void {
    this.promotionService.getHeroSlides().subscribe({
      next: (res: any) => {
        if (res.success && res.slides && res.slides.length > 0) {
          this.dynamicSlides = res.slides;
          this.updateHeroImages();
        } else {
          this.setDefaultHeroImages();
        }

        if (isPlatformBrowser(this.platformId)) {
          this.startPromoAutoScroll();
        }
      },
      error: () => {
        this.setDefaultHeroImages();
        if (isPlatformBrowser(this.platformId)) {
          this.startPromoAutoScroll();
        }
      }
    });
  }

  updateHeroImages(): void {
    if (isPlatformBrowser(this.platformId)) {
      const isMobile = window.innerWidth < 768;
      this.promoImages = this.dynamicSlides
        .filter(s => s.isActive)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(s => isMobile ? s.mobilePath : s.desktopPath);
    } else {
      // SSR fallback to desktop
      this.promoImages = this.dynamicSlides.map(s => s.desktopPath);
    }
  }

  setDefaultHeroImages(): void {
    if (isPlatformBrowser(this.platformId)) {
      const width = window.innerWidth;
      if (width < 640) {
        this.promoImages = ['spanar1.png', 'spanar2.png', 'spanar3.png'];
      } else {
        this.promoImages = ['panar1.png', 'panar2.png', 'panar3.png'];
      }
    } else {
      this.promoImages = ['panar1.png', 'panar2.png', 'panar3.png'];
    }
  }

  // Favorite functionality
  isFavorite(productId: string): boolean {
    return this.authService.isFavorite(productId);
  }

  toggleFavorite(productId: string): void {
    let userId = null;
    if (isPlatformBrowser(this.platformId)) {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      userId = userData.id;
    }

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
      this.router.navigate(['/login']);
    }
  }

  // Cart functionality
  isInCart(productId: string): boolean {
    return this.authService.isInCart(productId);
  }

  toggleCart(productId: string): void {
    let userId = null;
    if (isPlatformBrowser(this.platformId)) {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      userId = userData.id;
    }

    if (userId) {
      if (this.isInCart(productId)) {
        this.authService.removeFromCart(userId, productId).subscribe({
          next: () => this.authService.loadUserData(userId),
          error: err => console.error('Error removing from cart', err)
        });
      } else {
        this.authService.addToCart(userId, productId).subscribe({
          next: () => this.authService.loadUserData(userId),
          error: err => console.error('Error adding to cart', err)
        });
      }
    } else {
      this.router.navigate(['/login']);
    }
  }

  navigateToProduct(product: any): void {
    const route = this.getProductRoute(product);
    this.router.navigate(route);
  }

  subscribeNewsletter(): void {
    if (!this.newsletterEmail || !this.newsletterEmail.includes('@')) {
      this.newsletterMessage = 'يرجى إدخال بريد إلكتروني صحيح';
      this.newsletterMessageType = 'error';
      return;
    }

    this.isSubscribing = true;
    this.newsletterMessage = '';

    this.http.post(`${environment.apiBaseUrl}/newsletter/subscribe`, { email: this.newsletterEmail })
      .subscribe({
        next: (res: any) => {
          this.isSubscribing = false;
          this.newsletterMessage = res.message || 'تم الاشتراك بنجاح!';
          this.newsletterMessageType = 'success';
          this.newsletterEmail = '';
        },
        error: (err: any) => {
          this.isSubscribing = false;
          this.newsletterMessage = err.error?.message || 'حدث خطأ أثناء الاشتراك';
          this.newsletterMessageType = 'error';
        }
      });
  }

  loadMerchants(): void {
    this.merchantAuthService.getPublicMerchants().subscribe({
      next: (res: any) => {
        if (res.success && res.merchants && res.merchants.length > 0) {
          this.merchants = res.merchants;
          // Ensure we have enough items for a smooth marquee loop
          this.prepareMarqueeMerchants();
        }
      },
      error: (err) => {
        console.error('Error loading merchants:', err);
      }
    });
  }

  isMarqueeActive: boolean = false;
  marqueeMerchants: any[] = [];
  prepareMarqueeMerchants(): void {
    if (!this.merchants || this.merchants.length === 0) {
      this.marqueeMerchants = [];
      this.isMarqueeActive = false;
      return;
    }
    
    // Detect if we should use marquee or just center items
    // If we have 6 or more items, activate marquee
    this.isMarqueeActive = this.merchants.length >= 6;

    // Just use the original list. Duplication for the loop is handled in the HTML template.
    this.marqueeMerchants = [...this.merchants];
  }


  getMerchantLogoUrl(merchant: any): string {
    if (!merchant) return 'assets/images/merchant-placeholder.png';
    
    // Case 1: Registered Merchant with a defined logo path in DB
    if (merchant.logo) {
      return `${environment.uploadsBaseUrl}/${merchant.logo}`;
    }

    // Case 2: Auto-extracted publisher or mock - look for logo in /uploads/books/publishers/[name].webp
    // Sanitize name for filename
    const sanitizedName = merchant.name.trim().replace(/\s+/g, '_');
    return `${environment.uploadsBaseUrl}/publishers/${sanitizedName}.webp`;
  }
}
