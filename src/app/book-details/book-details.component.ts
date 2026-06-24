import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { GamificationService } from '../services/gamification.service';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { take } from 'rxjs/operators';
import { DataService } from '../services/data.service';
import { Book } from '../book';
import { CommonModule, NgIf, isPlatformBrowser } from '@angular/common';
import { CheckoutModalComponent } from '../checkout-modal/checkout-modal.component';
import { AccountModalComponent } from '../auth/account-modal/account-modal.component';
import { SharedModule } from '../shared/shared.module';
import { AuthService } from '../auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faStar, faShareAlt, faCoins, faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { environment } from '../../environments/environment';
import { SlugService } from '../services/slug.service';
import { PromotionService } from '../services/promotion.service';
import { SeoService } from '../services/seo.service';
import { AnalyticsService } from '../services/analytics.service';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

@Component({
  selector: 'app-book-details',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FontAwesomeModule,
    SharedModule,
    NgxSkeletonLoaderModule,
    CheckoutModalComponent,
    AccountModalComponent,
  ],
  templateUrl: './book-details.component.html',
  styleUrls: ['./book-details.component.css'],
  // ✅ SSR FIX: شيلنا OnPush لأنها بتمنع Angular Universal من رؤية التغييرات وقت SSR render
  // البراوزر هيشتغل عادي مع Default - الفرق في الأداء مش محسوس على صفحة واحدة
})
export class BookDetailsComponent implements OnInit, OnDestroy {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  @ViewChild(AccountModalComponent, { static: false }) accountModal?: AccountModalComponent;
  faStar = faStar;
  faStarRegular = faStarRegular;
  faShareAlt = faShareAlt;
  faCoins = faCoins;
  faChevronUp = faChevronUp;
  faChevronDown = faChevronDown;

  showCopySuccess = false;
  book: Book | undefined;
  loading: boolean = true;
  imagesLoading: boolean = true;
  error: string | null = null;
  showCheckoutModal = false;
  showLoginPrompt = false; // متغير للتحكم في عرض النافذة العائمة
  showAdditionalDetails: boolean = false; // متغير للتحكم في عرض التفاصيل الإضافية

  averageRating: number = 0;
  ratingCount: number = 0;
  selectedImageIndex: number = 0;
  availableImages: string[] = [];
  relatedProducts: Book[] = [];

  private bookId: string | null = null;
  private loadedBookId: string | null = null;
  private allBooks: Book[] = [];
  private static resolvedImagesCache = new Map<string, string[]>();
  appliedCoupon: any = null;
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService,
    private authService: AuthService,
    private http: HttpClient,
    private slugService: SlugService,
    public gamificationService: GamificationService,
    private promotionService: PromotionService,
    private seoService: SeoService,
    private analyticsService: AnalyticsService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    // ✅ SSR FIX: استخدم snapshot مباشرة بدل subscribe عشان Angular Zone تقدر تقفل
    const snapshotParamMap = this.route.snapshot.paramMap;
    const snapshotRawId = snapshotParamMap.get('id');

    if (snapshotRawId !== null) {
      const trimmedId = snapshotRawId.trim();
      this.loadedBookId = trimmedId;
      this.bookId = trimmedId;

      // ✅ SSR: استخدم بيانات الـ Resolver الجاهزة مباشرة بدون HTTP call تاني
      const resolvedBook = this.route.snapshot.data['book'];
      if (resolvedBook) {
        this.book = resolvedBook;
        this.loading = false;
        this.imagesLoading = false;
        this.updateSeoTags(this.book!);

        // ✅ SSR FIX: detectChanges بدل markForCheck عشان Angular Universal يسحب
        // الـ HTML بعد ما الـ view يتحدث فعلاً — markForCheck مش كافي في SSR
        // لأن مفيش change detection cycles تانية بعد ngOnInit في Angular Universal
        this.cdr.detectChanges();

        if (isPlatformBrowser(this.platformId)) {
          this.loadAvailableImages();
          this.handleReferral();
          this.fetchAverageRating(this.book!.products_id.toString());
          this.loadRelatedProductsAsync();
          this.analyticsService.trackProductView(this.book!.products_id.toString()).subscribe();
          this.route.url.subscribe(urlSegments => {
            if (urlSegments.length > 0 && urlSegments[0].path === 'product') {
              const categoryRoute = this.getProductRoute(this.book!);
              this.router.navigate(categoryRoute, { replaceUrl: true });
            }
            this.cdr.markForCheck();
          });
          this.cdr.markForCheck();
        }

        // ✅ Browser only: subscribe للـ paramMap عشان الـ navigation الداخلي يشتغل
        if (isPlatformBrowser(this.platformId)) {
          this.route.paramMap.subscribe(paramMap => {
            const rawId = paramMap.get('id');
            if (rawId !== null) {
              const newId = rawId.trim();
              if (this.loadedBookId === newId) return;
              this.loadedBookId = newId;
              this.bookId = newId;
              this.loading = true;
              this.imagesLoading = true;
              this.error = null;
              this.cdr.markForCheck();
              this.dataService.getBookById(newId).subscribe({
                next: (book: Book | null) => {
                  if (!book) {
                    this.error = 'الكتاب غير موجود';
                    this.loading = false;
                    this.imagesLoading = false;
                  } else {
                    this.book = book;
                    this.loading = false;
                    this.updateSeoTags(this.book);
                    this.loadAvailableImages();
                    this.handleReferral();
                    this.fetchAverageRating(this.book.products_id.toString());
                    this.loadRelatedProductsAsync();
                    this.analyticsService.trackProductView(this.book.products_id.toString()).subscribe();
                  }
                  this.cdr.markForCheck();
                },
                error: () => {
                  this.error = 'حدث خطأ أثناء جلب بيانات الكتاب';
                  this.loading = false;
                  this.imagesLoading = false;
                  this.cdr.markForCheck();
                }
              });
            }
          });
        }
        return;
      }
    }

    // Fallback: لو مفيش resolver data أو id (browser navigation فقط)
    if (isPlatformBrowser(this.platformId)) {
      this.route.paramMap.subscribe(paramMap => {
        const rawId = paramMap.get('id');
        if (rawId !== null) {
          const trimmedId = rawId.trim();
          if (this.loadedBookId === trimmedId) return;
          this.loadedBookId = trimmedId;
          this.bookId = trimmedId;
          this.loading = true;
          this.imagesLoading = true;
          this.error = null;
          this.cdr.markForCheck();
          this.dataService.getBookById(trimmedId).subscribe({
            next: (book: Book | null) => {
              if (!book) {
                console.warn('BookDetailsComponent: book not found for id:', trimmedId);
                this.error = 'الكتاب غير موجود';
                this.loading = false;
                this.imagesLoading = false;
                this.cdr.markForCheck();
              } else {
                this.book = book;
                this.loading = false;
                this.updateSeoTags(this.book);
                this.loadAvailableImages();
                this.handleReferral();
                this.fetchAverageRating(this.book.products_id.toString());
                this.loadRelatedProductsAsync();
                this.analyticsService.trackProductView(this.book.products_id.toString()).subscribe();
                this.route.url.subscribe(urlSegments => {
                  if (urlSegments.length > 0 && urlSegments[0].path === 'product') {
                    const categoryRoute = this.getProductRoute(this.book!);
                    this.router.navigate(categoryRoute, { replaceUrl: true });
                  }
                  this.cdr.markForCheck();
                });
                this.cdr.markForCheck();
              }
            },
            error: () => {
              this.error = 'حدث خطأ أثناء جلب بيانات الكتاب';
              this.loading = false;
              this.imagesLoading = false;
              this.cdr.markForCheck();
            }
          });
        } else {
          this.error = 'معرف الكتاب غير موجود في الرابط';
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
    } else {
      // SSR بدون resolver data
      this.error = 'الكتاب غير موجود';
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private handleReferral(): void {
    this.authService.user$.pipe(take(1)).subscribe(currentUser => {
      this.route.queryParams.pipe(take(1)).subscribe(params => {
        const referralCode = params['ref'];
        if (referralCode && this.bookId) {
          // Prevent user from using their own referral code
          if (currentUser && currentUser.referralCode === referralCode) {
            console.log('[Referral] User is trying to use their own referral link. Ignoring.');
            return;
          }

          localStorage.setItem('referralCode', referralCode);
          localStorage.setItem('referralBookId', this.bookId); // Use products_id
          console.log(`[Referral] Referral code '${referralCode}' and bookId '${this.bookId}' saved to localStorage.`);
        }
      });
    });
  }

  fetchAverageRating(bookId: string): void {
    this.http.get<{ bookId: string; averageRating: number; ratingCount: number }>(`${environment.apiBaseUrl}/users/average-rating/${bookId}`)
      .subscribe({
        next: (res) => {
          this.averageRating = res.averageRating;
          this.ratingCount = res.ratingCount;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error fetching average rating:', err);
          this.cdr.markForCheck();
        }
      });
  }

  getBookImageUrl(book: any): string {
    return this.dataService.getBookImageUrl(book);
  }
  // دالة نسخ الرابط
  toggleAdditionalDetails(): void {
    this.showAdditionalDetails = !this.showAdditionalDetails;
  }

  copyBookLink(): void {
    if (!this.book) return;
    const categoryRoute = this.getProductRoute(this.book);
    // CRITICAL FIX: Use production domain for shared links, not window.location.origin (which is localhost/file on Android)
    const baseUrl = 'https://knoozbook.com';
    let url = baseUrl + '/' + categoryRoute.join('/');
    // Check if there is a referral code in the current URL and append it
    const currentUrl = new URL(window.location.href);
    const refCode = currentUrl.searchParams.get('ref');
    if (refCode) {
      url += `?ref=${refCode}`;
    }

    // AUTOMATIC FEATURE: Try Native Share first (Mobile/Android)
    if (navigator.share) {
      // Decode the URL for cleaner display (Arabic characters instead of %...)
      const cleanUrl = decodeURIComponent(url);

      navigator.share({
        title: this.book.product_name,
        // Append clean URL to text so it appears readable. Removing 'url' param to avoid duplication/encoding by OS.
        text: `تحقق من كتاب "${this.book.product_name}" على كنوز بوك\n${cleanUrl}`
      }).then(() => {
        console.log('Shared successfully');
      }).catch((error) => {
        console.warn('Share failed or cancelled:', error);
      });
    } else {
      // Fallback for Desktop / non-supported browsers
      // Also copy decoded version for better user experience
      const cleanUrl = decodeURIComponent(url);
      navigator.clipboard.writeText(cleanUrl).then(() => {
        this.showCopySuccess = true;
        this.cdr.markForCheck();
        setTimeout(() => {
          this.showCopySuccess = false;
          this.cdr.markForCheck();
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy: ', err);
      });
    }
  }




  closeLoginPrompt(): void {
    this.showLoginPrompt = false; // إغلاق النافذة العائمة
    this.cdr.markForCheck();
  }

  requestUrgency(): void {
    this.authService.isLoggedIn$.subscribe(status => {
      if (status) {
        this.submitUrgencyRequest();
      } else {
        this.showLoginPrompt = true;
        this.cdr.markForCheck();
      }
    });
  }

  submitUrgencyRequest(): void {
    if (!this.book) return;

    this.authService.user$.pipe(take(1)).subscribe(user => {
      if (!user) {
        alert('يجب تسجيل الدخول لإرسال طلب استعجال');
        this.showLoginPrompt = true;
        this.cdr.markForCheck();
        return;
      }

      const urgencyRequest = {
        userId: user!.id,
        bookId: this.book!.products_id,
        bookName: this.book!.product_name,
        merchantId: this.book!.merchantId || null,
        merchantName: this.book!.merchantName || null,
        requestedAt: new Date().toISOString()
      };

      this.http.post(`${environment.apiBaseUrl}/users/urgency-requests`, urgencyRequest).subscribe({
        next: (response: any) => {
          alert('تم إرسال طلب الاستعجال بنجاح. سيتم إشعارك عند توفر الكتاب.');
        },
        error: (error: any) => {
          console.error('Error submitting urgency request:', error);
          const errorMessage = error.error?.message || 'حدث خطأ أثناء إرسال طلب الاستعجال. يرجى المحاولة مرة أخرى.';
          alert(errorMessage);
        }
      });
    });
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
      this.cdr.markForCheck();
    });
  }

  roundedAverageRating(): number {
    return Math.round(this.averageRating);
  }

  private async loadAvailableImages(): Promise<void> {
    if (!this.book) {
      this.imagesLoading = false;
      return;
    }

    const productId = String(this.book.products_id);
    const cacheKey = productId;
    if (BookDetailsComponent.resolvedImagesCache.has(cacheKey)) {
      this.availableImages = BookDetailsComponent.resolvedImagesCache.get(cacheKey) || [];
      this.selectedImageIndex = 0;
      this.imagesLoading = false;
      this.cdr.markForCheck();
      console.log('⚡ Loaded availableImages from static cache:', this.availableImages);
      return;
    }

    // Use the product_image filename as base, or fall back to productId
    let baseFilename = '';
    const rawImage = this.book.product_image || this.book.image_path || '';
    
    if (rawImage && typeof rawImage === 'string') {
      const parts = rawImage.split('/');
      baseFilename = parts[parts.length - 1];
      // Strip extension
      if (baseFilename.includes('.')) {
        baseFilename = baseFilename.substring(0, baseFilename.lastIndexOf('.'));
      }
      // Strip variation suffixes (_1, _2, etc) if they already exist
      baseFilename = baseFilename.replace(/_\d+$/, '');
    }

    if (!baseFilename || baseFilename === 'undefined' || baseFilename === 'null') {
      baseFilename = productId;
    }

    const potentialImages = [];
    
    // 1. If it's an external image, add it as the ABSOLUTE FIRST candidate
    if (this.book.image_path && (this.book.image_path.startsWith('http') || this.book.image_path.includes('darelollaa.com'))) {
      potentialImages.push(this.book.image_path);
      console.log('🌐 Adding external image_path to gallery:', this.book.image_path);
    }

    // 2. Add local primary image if not external or as a fallback
    if (!this.book.image_path || !this.book.image_path.startsWith('http')) {
      potentialImages.push(this.getImageUrl(baseFilename + '.webp', this.book));
    }

    // 3. Add potential variations (always local candidates, will be checked if they exist)
    potentialImages.push(
      this.getImageUrl(baseFilename + '_1.webp', this.book),
      this.getImageUrl(baseFilename + '_2.webp', this.book),
      this.getImageUrl(baseFilename + '_3.webp', this.book)
    );

    console.log(`🔍 Checking available images for baseFilename: ${baseFilename}`);
    
    const results = await Promise.all(potentialImages.map(async (url) => {
      // If it's an external URL, trust it exists (to avoid CORS/HEAD request issues)
      if (url.startsWith('http')) {
        return url;
      }
      
      const exists = await this.checkImageExists(url);
      console.log(`📸 Image ${url} exists: ${exists}`);
      return exists ? url : null;
    }));

    // Filter out nulls and duplicates
    this.availableImages = [...new Set(results.filter((url): url is string => url !== null))];
    BookDetailsComponent.resolvedImagesCache.set(cacheKey, this.availableImages);
    this.selectedImageIndex = 0;
    this.imagesLoading = false;
    this.cdr.markForCheck();
    
    console.log(`✅ Final availableImages array:`, this.availableImages);
  }

  private checkImageExists(url: string): Promise<boolean> {
    return fetch(url, { method: 'HEAD' })
      .then(res => res.ok)
      .catch(() => {
        // Fallback to Image object if fetch fails (e.g. CORS)
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
        });
      });
  }

  // Helper to get URL for a specific image path
  private getImageUrl(imagePath: string, book: Book): string {
    // Create a temporary book object with the variation image path to reuse DataService logic
    const tempBook = { ...book, product_image: imagePath };
    return this.dataService.getBookImageUrl(tempBook);
  }

  private loadRelatedProductsAsync(): void {
    if (!this.book || !this.book.product_category) {
      return;
    }
    this.dataService.search({ category: this.book.product_category, limit: 12 }).subscribe({
      next: (response: any) => {
        if (response && response.success && Array.isArray(response.items)) {
          this.allBooks = response.items;
          this.loadRelatedProducts();
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.warn('Error loading related products pool:', err);
      }
    });
  }

  // Load related products based on category and merchant
  private loadRelatedProducts(): void {
    if (!this.book) return;
    const currentProductId = this.book.products_id;
    const currentCategory = this.book.product_category;
    const currentMerchant = this.book.merchantName;

    // Find related products: same category, different product
    let relatedPool = this.allBooks.filter(p => {
      const isSameCategory = p.product_category === currentCategory;
      const isDifferentProduct = p.products_id !== currentProductId;

      // Prioritize same merchant and category, fallback to just same category
      return isSameCategory && isDifferentProduct;
    });

    // Shuffle the candidates to provide variety
    relatedPool = this.dataService.shuffleArray(relatedPool);

    // Now sort by priority (same merchant first) and take top 8
    this.relatedProducts = relatedPool.sort((a, b) => {
      // Sort: same merchant first, then by discount
      const aSameMerchant = a.merchantName === currentMerchant ? 1 : 0;
      const bSameMerchant = b.merchantName === currentMerchant ? 1 : 0;
      if (aSameMerchant !== bSameMerchant) return bSameMerchant - aSameMerchant;

      const aDiscount = a.product_discount_percent || 0;
      const bDiscount = b.product_discount_percent || 0;
      if (aDiscount !== bDiscount) return bDiscount - aDiscount;

      return 0;
    }).slice(0, 8);
  }

  // Navigate to a related product's details page
  navigateToProduct(product: Book): void {
    const categoryRoute = this.getProductRoute(product);
    this.router.navigate(categoryRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Helper method to get the correct route based on product category
  getProductRoute(product: Book): string[] {
    const slug = this.slugService.getBookSlug(product.product_name);
    const categoryRoutes: { [key: string]: string } = {
      'أدوات مكتبية': 'office-supplies',
      'كتب': 'book',
      'روايات وقصص': 'book',
      'تطوير الذات وعلم النفس': 'book',
      'كتب دينية': 'book',
      'أعمال وتسويق ومالية': 'book',
      'صحة وطب وعلوم': 'book',
      'تاريخ وسير ذاتية': 'book',
      'تربية وأطفال': 'book',
      'فنون وحرف': 'book',
      'قواميس ومراجع': 'book'
    };
    const route = categoryRoutes[product.product_category] || 'book';
    return [route, product.products_id, slug];
  }

  // Check if product is a book category
  isBookCategory(category: string): boolean {
    const bookCategories = [
      'كتب', 'روايات وقصص', 'تطوير الذات وعلم النفس', 'كتب دينية', 'أعمال وتسويق ومالية',
      'صحة وطب وعلوم', 'تاريخ وسير ذاتية', 'تربية وأطفال', 'فنون وحرف', 'قواميس ومراجع',
      'رواية', 'تنمية', 'ديني', 'اعمال', 'تربية'
    ];
    return bookCategories.some(c => category && category.includes(c));
  }

  // Check if text is Arabic (for RTL book styling)
  isArabicText(text: string): boolean {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text);
  }

  calculateDiscountedPrice(price: number, bookId?: string, quantity: number = 1): { discountedPrice: number, discountedQty: number } {
    if (!this.appliedCoupon) return { discountedPrice: price, discountedQty: quantity };

    const min = this.appliedCoupon.minPrice;
    const max = this.appliedCoupon.maxPrice;
    const isWithinRange = (min ? price >= min : true) && (max ? price <= max : true);

    if (!isWithinRange) return { discountedPrice: price, discountedQty: 0 };

    // Handle Quantity Limit Per Product
    let discountedQty = quantity;
    if (this.appliedCoupon.maxQtyPerProduct > 0) {
      discountedQty = Math.min(quantity, this.appliedCoupon.maxQtyPerProduct);
    }

    let finalDiscountedPrice = price;
    if (this.appliedCoupon.discountType === 'percentage') {
      finalDiscountedPrice = price * (1 - this.appliedCoupon.value / 100);
    } else if (this.appliedCoupon.discountType === 'fixed') {
      finalDiscountedPrice = Math.max(0, price - this.appliedCoupon.value);
    }

    return { discountedPrice: finalDiscountedPrice, discountedQty: discountedQty };
  }

  /**
   * Update SEO meta tags and JSON-LD for the current product.
   */
  private updateSeoTags(book: Book): void {
    const categoryRoute = this.getProductRoute(book);
    const productUrl = `https://knoozbook.com/${categoryRoute.join('/')}`;
    const imageUrl = this.getBookImageUrl(book);
    const description = book.product_description
      ? book.product_description.substring(0, 160)
      : `${book.product_name} - متوفر الآن في knoozbook بسعر ${book.product_price} جنيه. ${book.product_category}. اطلب الآن مع خدمة توصيل لجميع المحافظات.`;

    // Update meta tags
    this.seoService.updateMetaTags({
      title: book.product_name,
      description: description,
      keywords: `${book.product_name}, ${book.product_category}, knoozbook, شراء ${book.product_name}${book.author ? ', ' + book.author : ''}`,
      image: imageUrl,
      url: productUrl,
      type: 'product',
      price: book.product_price,
      currency: 'EGP',
      availability: (book.product_quantity > 0) ? 'in_stock' : 'out_of_stock'
    });

    // Set JSON-LD structured data
    this.seoService.setProductJsonLd({
      name: book.product_name,
      description: description,
      image: imageUrl,
      price: book.product_price,
      priceBefore: book.product_price_before_discount,
      currency: 'EGP',
      availability: (book.product_quantity > 0) ? 'in_stock' : 'out_of_stock',
      category: book.product_category,
      brand: book.author || book.publisher || book.brand || 'knoozbook',
      url: productUrl,
      rating: this.averageRating,
      ratingCount: this.ratingCount
    });

    // Set Breadcrumb JSON-LD (Home → Category → Book)
    const categoryUrl = book.product_category
      ? `https://knoozbook.com/category/${encodeURIComponent(book.product_category)}`
      : 'https://knoozbook.com/books';

    this.seoService.setBreadcrumbJsonLd([
      { name: 'الرئيسية', url: 'https://knoozbook.com/Home' },
      { name: book.product_category || 'كتب', url: categoryUrl },
      { name: book.product_name, url: productUrl }
    ]);
  }

  ngOnDestroy(): void {
    // Reset to defaults when leaving the page
    this.seoService.resetToDefaults();
    // Only access DOM in browser — document is not defined in Node.js SSR
    if (isPlatformBrowser(this.platformId)) {
      const breadcrumb = document.querySelector('script[data-type="breadcrumb"]');
      if (breadcrumb) breadcrumb.remove();
    }
  }
}