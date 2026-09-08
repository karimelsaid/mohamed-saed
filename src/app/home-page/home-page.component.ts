import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { DataService } from '../services/data.service';
import { AuthService } from '../auth/auth.service';
import { faBook, faLaptop, faTshirt, faSpa, faShoePrints, faCouch, faGamepad, faThLarge, faEllipsisH, faStar, faFileAlt, faHeart, faPenNib, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../environments/environment';
import { SeoService } from '../services/seo.service';
import { PromotionService } from '../services/promotion.service';
import { MerchantAuthService } from '../services/merchant-auth.service';
import { FormsModule } from '@angular/forms';
import { AnalyticsTrackingService } from '../services/analytics-tracking.service';
import { PremiumAchievementsComponent } from '../shared/premium-achievements/premium-achievements.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FontAwesomeModule, FormsModule, PremiumAchievementsComponent],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.css']
})
export class HomePageComponent implements OnInit, OnDestroy {
  faHeart = faHeart;

  uploadsBaseUrl = environment.uploadsBaseUrl;
  isLoading: boolean = true;
  allProducts: any[] = [];

  // Tab System
  activeTab: string = 'all';

  // Icons
  faStar = faStar;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;
  isServicesExpanded: boolean = true;

  // Sections & Categories
  mainSections = [
    { id: 'books', name: 'الكتب والمؤلفات', icon: faBook, filter: ['كتب'] },
    { id: 'print', name: 'خدمات الطباعة', icon: faFileAlt, filter: ['مستندات', 'طباعة'] },
    { id: 'office-supplies', name: 'أدوات مكتبية', icon: faPenNib, filter: ['أدوات مكتبية'] }
  ];

  bookGenres = [
    { id: 'all', name: 'الكل' },
    { id: 'bestsellers', name: '🔥 الأكثر مبيعاً' },
    { id: 'new-arrivals', name: '✨ وصل حديثاً' },
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
    mode: 'scrolling',
    columnCount: 5,
    scrollingSpeed: 'slow'
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

  // Bourse variables
  bourseOffer: any = null;
  bourseBooks: any[] = [];
  bourseCountdownStr: string = '00:00:00';
  private bourseTimer: any;

  // Featured Promotion Packages
  featuredPackages: any[] = [];

  // Subscription pricing (dynamic)
  subscriptionMonthlyPrice: number = 0;
  subscriptionYearlyPrice: number = 0;
  subscriptionYearlySaving: number = 0;

  // Analytics tracking
  private trackedProducts = new Set<string>();
  private intersectionObserver: IntersectionObserver | null = null;

  constructor(
    private dataService: DataService,
    private router: Router,
    private authService: AuthService,
    private seoService: SeoService,
    private promotionService: PromotionService,
    private http: HttpClient,
    private merchantAuthService: MerchantAuthService,
    private analyticsTrackingService: AnalyticsTrackingService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    // initHero() triggers 3 HTTP calls (getHeroConfig/getHeroSlides/getHeroBooks)
    // — only needed in the browser for visual rendering
    if (isPlatformBrowser(this.platformId)) {
      this.initHero();
    }
    // Load dynamic categories in browser only — HTTP call not needed during SSR
    if (isPlatformBrowser(this.platformId)) {
      this.loadDynamicCategories();
    }

    // Set SEO meta tags for the homepage
    this.seoService.updateMetaTags({
      title: 'الصفحة الرئيسية',
      description: 'knoozbook - مكتبة عربية إلكترونية تقدم مجموعة متنوعة من الكتب والمنتجات. اكتشف أفضل الكتب بأسعار مميزة وخدمة توصيل لجميع المحافظات.',
      keywords: 'knoozbook, كتب عربية, كتب أونلاين, شراء كتب, مكتبة إلكترونية, توصيل كتب',
      url: 'https://knoozbook.com/Home'
    });

    if (isPlatformBrowser(this.platformId)) {
      this.dataService.getData().subscribe((data: any) => {
        // Normalize IDs
        const normalizedData = data.map((b: any) => ({
          ...b,
          products_id: b.products_id || b.product_id || b._id
        }));

        // Log detailed info
        const merchantProducts = normalizedData.filter((p: any) => p.merchantId && p.merchantId.toString() !== '69d11b07df78621a8d7b1559');
        console.log(`📊 [HomePage] Total products: ${normalizedData.length}, Merchant products: ${merchantProducts.length}`);
        if (merchantProducts.length > 0) {
          console.log(`📊 [HomePage] Sample merchant products:`, merchantProducts.slice(0, 3).map((p: any) => ({
            id: p.products_id,
            name: p.product_name,
            merchantId: p.merchantId,
            merchantName: p.merchantName,
            category: p.product_category
          })));
        }

        // Shuffle to show random products (including merchant products)
        // This ensures fair display without prioritizing any specific products
        const sorted = this.shuffleArray(normalizedData);

        this.allProducts = sorted;
        this.generateBackgroundColumns();

        // Fallback: If we are in scrolling mode and haven't loaded specific hero books yet, use allProducts
        if (this.heroConfig.mode === 'scrolling' && (!this.heroBooks || this.heroBooks.length === 0)) {
          this.heroBooks = this.allProducts.slice(0, 32);
          this.prepareHeroColumns();
        }

        this.isLoading = false;

        // Setup intersection observer for impression tracking
        this.setupIntersectionObserver();
      }, error => {
        console.error('Error fetching data for home page:', error);
        this.isLoading = false;
      });
    }

    // SSR CRITICAL: loadMerchants() makes an HTTP call that never completes during SSR,
    // preventing Zone.js from stabilizing and causing 30s timeout / 504 errors.
    if (isPlatformBrowser(this.platformId)) {
      this.loadMerchants();
    }

    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('resize', () => {
        this.setPromoImages();
      });
      
      // Fetch active bourse offer for homepage preview
      this.fetchBourseOffer();

      // Fetch featured promotion packages
      this.loadFeaturedPackages();

      // Fetch subscription prices
      this.fetchSubscriptionPrices();

      // Check hasVisitedBefore for Collapsible Services
      const hasVisited = localStorage.getItem('hasVisitedBefore');
      if (hasVisited === 'true') {
        this.isServicesExpanded = false;
      } else {
        localStorage.setItem('hasVisitedBefore', 'true');
        this.isServicesExpanded = true;
      }
    }
  }

  toggleServices(): void {
    this.isServicesExpanded = !this.isServicesExpanded;
  }

  loadFeaturedPackages(): void {
    this.promotionService.getAllPackages().subscribe({
      next: (res: any) => {
        let pkgs = Array.isArray(res) ? res : (res.packages || []);
        // Filter packages that have products
        pkgs = pkgs.filter((p: any) => p.isActive !== false);
        // Fix pricing
        pkgs.forEach((pkg: any) => {
          let calcOrigPrice = 0;
          if (pkg.products) {
            pkg.products.forEach((p: any) => {
              p._imageUrl = this.getPackageProductImageUrl(p);
              calcOrigPrice += Number(p.product_price || p.price || 0) || 0;
            });
          }
          if (!pkg.totalOriginalPrice || pkg.totalOriginalPrice <= 0) pkg.totalOriginalPrice = calcOrigPrice;
          if (!pkg.promoPrice || pkg.promoPrice <= 0) pkg.promoPrice = pkg.fixedPrice || pkg.price || 0;
          if (pkg.totalOriginalPrice <= pkg.promoPrice) pkg.totalOriginalPrice = Math.round(pkg.promoPrice * 1.35);
        });
        // Shuffle and pick 5
        this.featuredPackages = this.shuffleArray([...pkgs]).slice(0, 5);
      },
      error: () => { /* silent */ }
    });
  }

  getPackageProductImageUrl(book: any): string {
    if (!book) return this.uploadsBaseUrl + '/placeholder.webp';
    let imageId = book.product_image ? String(book.product_image) : '';
    const pid = book.products_id || book._id;
    if (!imageId) imageId = String(pid);
    if (imageId.startsWith('http')) return imageId;
    if (imageId.startsWith('/uploads/')) return `https://knoozbook.com${imageId}`;
    const merchant = book.merchantId;
    const isAdmin = merchant?.role === 'admin' || (!merchant && !book.merchantName);
    if (isAdmin) {
      const id = /^\d+$/.test(imageId) ? imageId : pid;
      return `${this.uploadsBaseUrl}/admin__karim_mohamed__/${id}/${id}.webp`;
    } else {
      const username = merchant?.username || book.merchantName || 'unknown';
      const sanitized = String(username).replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      const id = /^\d+$/.test(imageId) ? imageId : pid;
      return `${this.uploadsBaseUrl}/merchant_${sanitized}/${id}/${id}.webp`;
    }
  }

  calculateDiscount(original: number, promo: number): number {
    if (!original || original <= 0) return 0;
    return Math.round(((original - promo) / original) * 100);
  }

  fetchSubscriptionPrices(): void {
    this.http.get<{success: boolean; data: {monthly: number; yearly: number}}>(`${environment.apiBaseUrl}/subscriptions/prices`)
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.subscriptionMonthlyPrice = res.data.monthly;
            this.subscriptionYearlyPrice = res.data.yearly;
            // Calculate saving percentage: (monthly*12 - yearly) / (monthly*12) * 100
            const yearlyIfMonthly = this.subscriptionMonthlyPrice * 12;
            if (yearlyIfMonthly > 0) {
              this.subscriptionYearlySaving = Math.round(((yearlyIfMonthly - this.subscriptionYearlyPrice) / yearlyIfMonthly) * 100);
            }
          }
        },
        error: (err) => {
          console.error('Error fetching subscription prices:', err);
          // Fallback defaults
          this.subscriptionMonthlyPrice = 49;
          this.subscriptionYearlyPrice = 299;
          this.subscriptionYearlySaving = 49;
        }
      });
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
    const allProducts = this.allProducts;

    if (this.activeTab === 'all') {
      return allProducts.slice(0, 20);
    }

    if (this.activeTab === 'bestsellers') {
      return [...allProducts].sort((a, b) => {
        const viewsA = a.views || 0;
        const viewsB = b.views || 0;
        if (viewsB !== viewsA) return viewsB - viewsA;
        const discA = a.product_discount_percent || 0;
        const discB = b.product_discount_percent || 0;
        return discB - discA;
      }).slice(0, 20);
    }

    if (this.activeTab === 'new-arrivals') {
      return [...allProducts].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        const idA = parseInt(a.products_id) || 0;
        const idB = parseInt(b.products_id) || 0;
        return idB - idA;
      }).slice(0, 20);
    }

    const genre = this.bookGenres.find(c => c.id === this.activeTab);
    if (!genre || !genre.filter) return allProducts.slice(0, 20);

    return allProducts.filter(product =>
      genre.filter?.some(f => product.product_category && product.product_category.includes(f))
    ).slice(0, 20);
  }

  isBestseller(product: any): boolean {
    if (!product) return false;
    return (product.views > 15) || (product.product_discount_percent >= 25);
  }

  setActiveTab(tabId: string): void {
    this.activeTab = tabId;
  }

  trackByProduct(index: number, item: any): string {
    return item.products_id || item._id || index.toString();
  }

  shuffleArray(array: any[]): any[] {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  }

  // Helper Methods
  getBookSlug(bookName: string): string {
    return bookName.trim().replace(/\s+/g, '-');
  }

  navigateToProduct(product: any) {
    const slug = this.getBookSlug(product.product_name);
    // Track click event
    this.analyticsTrackingService.trackClick(product.products_id, 'home_page');
    // Use /book for all products to ensure they open in BookDetailsComponent
    this.router.navigate(['/book', product.products_id, slug]);
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
        } else {
          console.warn('Hero books response unsuccessful or empty, falling back to allProducts');
          if (this.allProducts && this.allProducts.length > 0) {
            this.heroBooks = this.allProducts.slice(0, 32);
            this.prepareHeroColumns();
            this.isLoading = false;
          } else {
            this.fallbackToSlider();
          }
        }
      },
      error: (err) => {
        console.error('Error loading hero books', err);
        if (this.allProducts && this.allProducts.length > 0) {
          this.heroBooks = this.allProducts.slice(0, 32);
          this.prepareHeroColumns();
          this.isLoading = false;
        } else {
          this.fallbackToSlider();
        }
      }
    });
  }

  private fallbackToSlider(): void {
    this.heroConfig.mode = 'slider';
    this.setPromoImages();
    this.isLoading = false;
  }

  prepareHeroColumns(): void {
    let count = this.heroConfig.columnCount || 5;
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      count = 3; // Ensure books are only distributed to visible columns on mobile
    }
    this.heroColumns = Array.from({ length: count }, () => []);

    // Distribute books among columns randomly or sequentially
    this.heroBooks.forEach((book, index) => {
      this.heroColumns[index % count].push(book);
    });

    // Mirror books to ensure seamless infinite scroll if needed
    // and prevent empty gaps if the list is too short.
    this.heroColumns.forEach(col => {
      if (col.length > 0) {
        const original = [...col];
        // Ensure at least 6 items per column to cover screen height safely
        while (col.length < 6) {
          col.push(...original);
        }
      }
    });
  }

  getAnimationDuration(itemCount: number, speed: string = 'slow'): string {
    // Determine seconds to spend per item to maintain constant physical speed
    let secondsPerItem = 8; // slow
    if (speed === 'medium' || speed === 'متوسطة') secondsPerItem = 5;
    if (speed === 'fast' || speed === 'سريعة') secondsPerItem = 2.5;
    
    // Total duration = items * time per item
    // Since translateY(-50%) scrolls exactly 'itemCount' items, this makes the visual speed constant
    return `${itemCount * secondsPerItem}s`;
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
          this.newsletterMessage = res.message ? res.message + ' - كود الخصم: KNOOZ10' : 'تم الاشتراك بنجاح! كود الخصم الخاص بك هو: KNOOZ10';
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
    
    // Activate marquee if we have any items to show
    this.isMarqueeActive = this.merchants.length > 0;

    // Just use the original list. Duplication for the loop is handled in the HTML template.
    this.marqueeMerchants = [...this.merchants];
  }


  getMerchantLogoUrl(merchant: any): string {
    if (!merchant) return 'assets/images/merchant-placeholder.png';
    
    // Case 1: Registered Merchant with a defined logo path in DB
    if (merchant.logo) {
      return `${environment.uploadsBaseUrl}/${merchant.logo}`;
    }

    // Case 2: Auto-extracted publisher or mock - use backend endpoint to get correct image
    const sanitizedName = merchant.name.trim().replace(/\s+/g, '_');
    return `${environment.apiBaseUrl}/books/publisher-logo/${encodeURIComponent(sanitizedName)}`;
  }

  loadDynamicCategories(): void {
    this.dataService.getCategories().subscribe({
      next: (res) => {
        if (res && res.success && res.categories.length > 0) {
          const dynamicGenres = res.categories.map((cat: string) => ({
            id: cat,
            name: cat,
            filter: [cat]
          }));
          // Merge with unique logic to keep "All" and potentially some hardcoded ones if needed
          this.bookGenres = [{ id: 'all', name: 'الكل' }, ...dynamicGenres];
        }
      },
      error: (err) => console.error('Error loading dynamic categories:', err)
    });
  }

  // Bourse Preview Logic
  fetchBourseOffer() {
    this.http.get<{active: boolean; offer?: any; freeGiftThreshold: number; message?: string}>(`${environment.apiBaseUrl}/bourse/active`)
      .subscribe({
        next: (res) => {
          if (res.active && res.offer) {
            this.bourseOffer = res.offer;
            this.enrichBourseBooks();
            this.startBourseCountdown();
          } else {
            this.bourseOffer = null;
            this.bourseBooks = [];
            this.calculateNextOfferTime();
          }
        },
        error: (err) => {
          console.error('Error fetching bourse offer for home page', err);
        }
      });
  }

  enrichBourseBooks() {
    if (!this.allProducts || this.allProducts.length === 0) {
      setTimeout(() => this.enrichBourseBooks(), 500);
      return;
    }
    
    const mapped = this.bourseOffer.books.map((b: any) => {
      const product = this.allProducts.find(p => p.products_id === b.bookId) || {};
      return {
        ...b,
        product_image: product.product_image,
        bookName: product.product_name || b.bookName,
        merchantName: product.merchantName,
        products_id: b.bookId
      };
    });
    this.bourseBooks = mapped;
  }

  startBourseCountdown() {
    if (this.bourseTimer) clearInterval(this.bourseTimer);
    
    const updateTimer = () => {
      if (!this.bourseOffer) return;
      const end = new Date(this.bourseOffer.endTime).getTime();
      const now = new Date().getTime();
      const diff = end - now;

      if (diff <= 0) {
        clearInterval(this.bourseTimer);
        this.bourseCountdownStr = 'انتهى العرض!';
        setTimeout(() => this.fetchBourseOffer(), 3000);
        return;
      }

      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      this.bourseCountdownStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    updateTimer();
    this.bourseTimer = setInterval(updateTimer, 1000);
  }

  calculateNextOfferTime() {
    const now = new Date();
    const minutesSinceMidnight = (now.getHours() * 60) + now.getMinutes();
    
    const currentSlotIndex = Math.floor(minutesSinceMidnight / 45);
    const nextSlotMinutes = (currentSlotIndex + 1) * 45;
    
    const nextOffer = new Date();
    nextOffer.setHours(0, nextSlotMinutes, 0, 0);
    
    if (this.bourseTimer) clearInterval(this.bourseTimer);
    
    const updateTimer = () => {
      const end = nextOffer.getTime();
      const nowTime = new Date().getTime();
      const diff = end - nowTime;

      if (diff <= 0) {
        clearInterval(this.bourseTimer);
        this.fetchBourseOffer();
        return;
      }

      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      this.bourseCountdownStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    updateTimer();
    this.bourseTimer = setInterval(updateTimer, 1000);
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
              this.analyticsTrackingService.trackImpression(productId, 'home_page');
              // Stop observing after tracking once
              this.intersectionObserver?.unobserve(entry.target);
            }
          }
        });
      },
      {
        threshold: 0.5, // Track when 50% of the element is visible
        rootMargin: '0px'
      }
    );

    // Observe product cards after a short delay to ensure DOM is ready
    setTimeout(() => {
      const productCards = document.querySelectorAll('[data-product-id]');
      productCards.forEach(card => {
        this.intersectionObserver?.observe(card);
      });
    }, 500);
  }

  ngOnDestroy(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

}