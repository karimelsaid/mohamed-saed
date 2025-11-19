import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DataService } from '../services/data.service';
import { faChevronLeft, faChevronRight, faBook, faTools, faLaptop, faTshirt, faSpa, faShoePrints, faCouch, faGamepad, faThLarge, faEllipsisH } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../environments/environment';


@Component({
  selector: 'app-home-page',
  standalone: false,
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.css']
})
export class HomePageComponent implements OnInit, OnDestroy {

  resetTimeouts: any[] = [];
  uploadsBaseUrl = environment.uploadsBaseUrl;
  isLoading: boolean = true;

  // Add getBookSlug method for use in template
  getBookSlug(bookName: string): string {
    return bookName.trim().replace(/\s+/g, '-');
  }

  getProductRoute(product: any): string[] {
    const slug = this.getBookSlug(product.product_name);
    const categoryRoutes: { [key: string]: string } = {
      'أدوات مكتبية': 'office-supplies',
      'إلكترونيات': 'electronics',
      'ملابس': 'clothing',
      'التجميل والعناية الشخصية': 'cosmetics',
      'الأحذية': 'shoes',
      'أثاث': 'furniture',
      'ألعاب': 'games',
      'أقمشة': 'fabrics',
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
    const category = (product.product_category || '').trim();
    let route = categoryRoutes[category];
    if (!route && product.product_category) {
      route = categoryRoutes[product.product_category];
    }

    // If still no match, try matching by category filter from newCategories
    if (!route) {
      const foundCategory = this.newCategories.find(cat =>
        cat.categoryFilter.some(filter =>
          category.includes(filter) || product.product_category?.includes(filter)
        )
      );
      if (foundCategory) {
        route = foundCategory.id;
      }
    }

    if (!route) {
      route = 'others';
    }

    // Debug logging
    console.log('getProductRoute - Product:', product.product_name, 'Category:', product.product_category, 'Route:', route);
    return ['/' + route, product.products_id, slug];
  }

  getBookImageUrl(book: any): string {
    let imagePath = book.product_image ? String(book.product_image) : '';
    if (!imagePath) {
      if (book.merchantName) {
        imagePath = 'merchant_' + book.merchantName + '/' + book.products_id + '/' + book.products_id + '.webp';
      } else {
        imagePath = 'admin__karim_mohamed__/' + book.products_id + '/' + book.products_id + '.webp';
      }
    } else {
      if (imagePath.includes('/')) {
        const parts = imagePath.split('/');
        if (imagePath.includes('merchant_')) {
          imagePath = parts.slice(-3).join('/');
        } else if (imagePath.includes('admin__')) {
          imagePath = parts.slice(-3).join('/');
        } else {
          imagePath = parts[parts.length - 1];
        }
      } else {
        if (!imagePath.includes('.') && /^\d+$/.test(imagePath)) {
          if (book.merchantName) {
            imagePath = 'merchant_' + book.merchantName + '/' + imagePath + '/' + imagePath + '.webp';
          } else {
            imagePath = 'admin__karim_mohamed__/' + imagePath + '/' + imagePath + '.webp';
          }
        } else if (!imagePath.includes('.')) {
          imagePath += '.webp';
        }
      }
    }
    return this.uploadsBaseUrl + '/' + imagePath;
  }

  isBookCategory(category?: string): boolean {
    if (!category) return false;
    const bookCats = [
      'كتب', 'روايات وقصص', 'تطوير الذات وعلم النفس', 'كتب دينية',
      'أعمال وتسويق ومالية', 'صحة وطب وعلوم', 'تاريخ وسير ذاتية',
      'تربية وأطفال', 'فنون وحرف', 'قواميس ومراجع'
    ];
    return bookCats.includes((category || '').trim());
  }

  isArabicText(text?: string): boolean {
    if (!text) return false;
    // Arabic Unicode blocks: \u0600-\u06FF, \u0750-\u077F, \u08A0-\u08FF, \uFB50-\uFDFF, \uFE70-\uFEFF
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicRegex.test(text);
  }

  // Methods for print service examples
  getPrintDescription(index: number): string {
    const descriptions = [
      'غلاف ورقي عالي الجودة مع لمعان فاخر ومتانة استثنائية',
      'غلاف كرتوني قوي مقاوم للتلف والرطوبة مع تصميم أنيق',
      'غلاف فاخر مدهب بطباعة ذهبية ولمسات فنية راقية'
    ];
    return descriptions[index] || '';
  }

  getPrintFeature(index: number, featureIndex: number): string {
    const features = [
      ['جودة عالية', 'متين', 'لامع'],
      ['مقاوم للرطوبة', 'قوي', 'أنيق'],
      ['فاخر', 'مذهب', 'فني']
    ];
    return features[index]?.[featureIndex] || '';
  }

  categories = [
    { id: 'Islamic', name: 'كتب دينية', image: this.uploadsBaseUrl + '/islamic.webp' },
    { id: 'Self-development-psychology', name: 'تطوير الذات وعلم النفس', image: this.uploadsBaseUrl + '/tatwer.webp' },
    { id: 'Novels-stories', name: 'روايات وقصص', image: this.uploadsBaseUrl + '/rewayat.webp' },
    { id: 'Business-Marketing-Finance', name: 'أعمال وتسويق ومالية', image: this.uploadsBaseUrl + '/aamal.webp' },
    { id: 'HealthMedicineScience', name: 'صحة وطب وعلوم', image: this.uploadsBaseUrl + '/fit.webp' },
    { id: 'Dictionaries-References', name: 'قواميس ومراجع', image: this.uploadsBaseUrl + '/qamos.webp' },
    { id: 'Education-children', name: 'تربية وأطفال', image: this.uploadsBaseUrl + '/child.webp' },
    { id: 'History-Biographies', name: 'تاريخ وسير ذاتية', image: this.uploadsBaseUrl + '/tarekh.webp' },
    { id: 'Arts-crafts', name: 'فنون وحرف', image: this.uploadsBaseUrl + '/fenon.webp' }
  ];

  // Books section
  books: any[] = [];
  visibleBooks: any[] = [];
  bookCoverTitles: string[] = [];
  booksCurrentIndex = 0;
  booksToShow = 5;
  booksIsHovered = false;
  booksIntervalId: any;
  booksTransformStyle = '';
  booksTouchStartX: number | null = null;
  booksTouchCurrentX: number | null = null;
  booksIsTouchScrolling: boolean = false;

  // Office Supplies section
  recentOfficeSupplies: any[] = [];
  officeVisibleBooks: any[] = [];
  officeCurrentIndex = 0;
  officeIsHovered = false;
  officeIntervalId: any;
  officeTransformStyle = '';
  officeTouchStartX: number | null = null;
  officeTouchCurrentX: number | null = null;
  officeIsTouchScrolling: boolean = false;

  // Books Category section (for "وصل حديثاً - الكتب")
  recentBooks: any[] = [];
  booksCategoryVisibleBooks: any[] = [];
  booksCategoryCurrentIndex = 0;
  booksCategoryIsHovered = false;
  booksCategoryIntervalId: any;
  booksCategoryTransformStyle = '';
  booksCategoryTouchStartX: number | null = null;
  booksCategoryTouchCurrentX: number | null = null;
  booksCategoryIsTouchScrolling: boolean = false;

  // Electronics section
  recentElectronics: any[] = [];
  electronicsVisibleBooks: any[] = [];
  electronicsCurrentIndex = 0;
  electronicsIsHovered = false;
  electronicsIntervalId: any;
  electronicsTransformStyle = '';
  electronicsTouchStartX: number | null = null;
  electronicsTouchCurrentX: number | null = null;
  electronicsIsTouchScrolling: boolean = false;

  // Clothing section
  recentClothing: any[] = [];
  clothingVisibleBooks: any[] = [];
  clothingCurrentIndex = 0;
  clothingIsHovered = false;
  clothingIntervalId: any;
  clothingTransformStyle = '';
  clothingTouchStartX: number | null = null;
  clothingTouchCurrentX: number | null = null;
  clothingIsTouchScrolling: boolean = false;

  // Cosmetics section
  recentCosmetics: any[] = [];
  cosmeticsVisibleBooks: any[] = [];
  cosmeticsCurrentIndex = 0;
  cosmeticsIsHovered = false;
  cosmeticsIntervalId: any;
  cosmeticsTransformStyle = '';
  cosmeticsTouchStartX: number | null = null;
  cosmeticsTouchCurrentX: number | null = null;
  cosmeticsIsTouchScrolling: boolean = false;

  // Shoes section
  recentShoes: any[] = [];
  shoesVisibleBooks: any[] = [];
  shoesCurrentIndex = 0;
  shoesIsHovered = false;
  shoesIntervalId: any;
  shoesTransformStyle = '';
  shoesTouchStartX: number | null = null;
  shoesTouchCurrentX: number | null = null;
  shoesIsTouchScrolling: boolean = false;

  // Furniture section
  recentFurniture: any[] = [];
  furnitureVisibleBooks: any[] = [];
  furnitureCurrentIndex = 0;
  furnitureIsHovered = false;
  furnitureIntervalId: any;
  furnitureTransformStyle = '';
  furnitureTouchStartX: number | null = null;
  furnitureTouchCurrentX: number | null = null;
  furnitureIsTouchScrolling: boolean = false;

  // Games section
  recentGames: any[] = [];
  gamesVisibleBooks: any[] = [];
  gamesCurrentIndex = 0;
  gamesIsHovered = false;
  gamesIntervalId: any;
  gamesTransformStyle = '';
  gamesTouchStartX: number | null = null;
  gamesTouchCurrentX: number | null = null;
  gamesIsTouchScrolling: boolean = false;

  // Fabrics section
  recentFabrics: any[] = [];
  fabricsVisibleBooks: any[] = [];
  fabricsCurrentIndex = 0;
  fabricsIsHovered = false;
  fabricsIntervalId: any;
  fabricsTransformStyle = '';
  fabricsTouchStartX: number | null = null;
  fabricsTouchCurrentX: number | null = null;
  fabricsIsTouchScrolling: boolean = false;

  // Others section
  recentOthers: any[] = [];
  othersVisibleBooks: any[] = [];
  othersCurrentIndex = 0;
  othersIsHovered = false;
  othersIntervalId: any;
  othersTransformStyle = '';
  othersTouchStartX: number | null = null;
  othersTouchCurrentX: number | null = null;
  othersIsTouchScrolling: boolean = false;
  faChevronLeft = faChevronLeft;
  faChevronRight = faChevronRight;
  faBook = faBook;
  faTools = faTools;
  faLaptop = faLaptop;
  faTshirt = faTshirt;
  faSpa = faSpa;
  faShoePrints = faShoePrints;
  faCouch = faCouch;
  faGamepad = faGamepad;
  faThLarge = faThLarge;
  faEllipsisH = faEllipsisH;

  // New categories for "تصفح حسب الفئة" section
  newCategories = [
    { id: 'books', name: 'كتب', icon: faBook, hasProducts: false, categoryFilter: ['روايات وقصص', 'تطوير الذات وعلم النفس', 'كتب دينية', 'قواميس ومراجع', 'صحة وطب وعلوم', 'أعمال وتسويق ومالية', 'فنون وحرف', 'تاريخ وسير ذاتية', 'تربية وأطفال'] },
    { id: 'office-supplies', name: 'أدوات مكتبية', icon: faTools, hasProducts: false, categoryFilter: ['أدوات مكتبية'] },
    { id: 'electronics', name: 'إلكترونيات', icon: faLaptop, hasProducts: false, categoryFilter: ['إلكترونيات'] },
    { id: 'clothing', name: 'ملابس', icon: faTshirt, hasProducts: false, categoryFilter: ['ملابس'] },
    { id: 'cosmetics', name: 'تجميل', icon: faSpa, hasProducts: false, categoryFilter: ['تجميل'] },
    { id: 'shoes', name: 'أحذية', icon: faShoePrints, hasProducts: false, categoryFilter: ['أحذية'] },
    { id: 'furniture', name: 'أثاث', icon: faCouch, hasProducts: false, categoryFilter: ['أثاث'] },
    { id: 'games', name: 'ألعاب', icon: faGamepad, hasProducts: false, categoryFilter: ['ألعاب'] },
    { id: 'fabrics', name: 'أقمشة', icon: faThLarge, hasProducts: false, categoryFilter: ['أقمشة'] },
    { id: 'others', name: 'أخرى', icon: faEllipsisH, hasProducts: false, categoryFilter: ['غير مصنف'] }
  ];

  // New property for binding transform style
  transformStyle = '';

  // New properties for promo carousel
  promoImages: string[] = [];
  promoCurrentIndex = 0;
  promoIntervalId: any;

  // New properties for print images 3D interaction
  printImages: string[] = ['print1.png', 'print2.png', 'print3.png'];
  printImageTitles: string[] = ['غلاف ورقي سميك', 'غلاف كرتوني', 'غلاف فاخر مدهب'];
  printImageTransforms: string[] = ['rotateX(0deg) rotateY(0deg)', 'rotateX(0deg) rotateY(0deg)', 'rotateX(0deg) rotateY(0deg)'];
  isDragging: boolean[] = [false, false, false];
  lastX: number[] = [0, 0, 0];
  lastY: number[] = [0, 0, 0];
  rotationX: number[] = [0, 0, 0];
  rotationY: number[] = [0, 0, 0];

  // Selected books for the new section
  selectedBooks: any[] = [];

  // New properties for touch horizontal scroll on "وصل حديثاً"
  touchStartX: number | null = null;
  touchCurrentX: number | null = null;
  isTouchScrolling: boolean = false;

  constructor(private dataService: DataService, private router: Router) {}

  private shuffleArray(array: any[]): any[] {
    const shuffled = array.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  ngOnInit(): void {
    this.isLoading = true;
    this.updateBooksToShow();

    // Load all products to process categories
    this.dataService.getData().subscribe((allProducts: any) => {
      // Process all products for the main "وصل حديثاً" section (all categories)
      this.books = this.shuffleArray(
        allProducts
          .sort((a: any, b: any) => b.products_id - a.products_id)
          .slice(0, 50)
          .map((product: any) => ({ ...product, loaded: false }))
      );
      this.visibleBooks = [...this.books];
      this.updateBooksTransform();
      this.startBooksAutoScroll();



      // Process other categories
      this.processCategoryProducts(allProducts, 'books', this.recentBooks, this.booksCategoryVisibleBooks, this.startBooksCategoryAutoScroll.bind(this));
      this.processCategoryProducts(allProducts, 'office-supplies', this.recentOfficeSupplies, this.officeVisibleBooks, this.startOfficeAutoScroll.bind(this));
      this.processCategoryProducts(allProducts, 'electronics', this.recentElectronics, this.electronicsVisibleBooks, this.startElectronicsAutoScroll.bind(this));
      this.processCategoryProducts(allProducts, 'clothing', this.recentClothing, this.clothingVisibleBooks, this.startClothingAutoScroll.bind(this));
      this.processCategoryProducts(allProducts, 'cosmetics', this.recentCosmetics, this.cosmeticsVisibleBooks, this.startCosmeticsAutoScroll.bind(this));
      this.processCategoryProducts(allProducts, 'shoes', this.recentShoes, this.shoesVisibleBooks, this.startShoesAutoScroll.bind(this));
      this.processCategoryProducts(allProducts, 'furniture', this.recentFurniture, this.furnitureVisibleBooks, this.startFurnitureAutoScroll.bind(this));
      this.processCategoryProducts(allProducts, 'games', this.recentGames, this.gamesVisibleBooks, this.startGamesAutoScroll.bind(this));
      this.processCategoryProducts(allProducts, 'fabrics', this.recentFabrics, this.fabricsVisibleBooks, this.startFabricsAutoScroll.bind(this));
      this.processCategoryProducts(allProducts, 'others', this.recentOthers, this.othersVisibleBooks, this.startOthersAutoScroll.bind(this));

      this.updateCategoryAvailability(allProducts);
      this.isLoading = false;
    });

    // Set promo images based on screen width
    this.setPromoImages();

    // Start promo carousel auto scroll
    this.startPromoAutoScroll();

    // Debounce resize event to avoid rapid firing
    let resizeTimeout: any;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.updateBooksToShow();
        this.setPromoImages();
        this.startBooksAutoScroll();
        this.startOfficeAutoScroll();
        this.startElectronicsAutoScroll();
        this.startClothingAutoScroll();
        this.startCosmeticsAutoScroll();
        this.startShoesAutoScroll();
        this.startFurnitureAutoScroll();
        this.startGamesAutoScroll();
        this.startFabricsAutoScroll();
        this.startOthersAutoScroll();
      }, 200);
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.booksIntervalId);
    clearInterval(this.officeIntervalId);
    clearInterval(this.electronicsIntervalId);
    clearInterval(this.clothingIntervalId);
    clearInterval(this.cosmeticsIntervalId);
    clearInterval(this.shoesIntervalId);
    clearInterval(this.furnitureIntervalId);
    clearInterval(this.gamesIntervalId);
    clearInterval(this.fabricsIntervalId);
    clearInterval(this.othersIntervalId);
    clearInterval(this.promoIntervalId);
  }

  updateBooksToShow(): void {
    const width = window.innerWidth;

    if (width < 640) {
      this.booksToShow = 2;
    } else if (width < 768) {
      this.booksToShow = 3;
    } else if (width < 1024) {
      this.booksToShow = 4;
    } else {
      this.booksToShow = 5;
    }

    this.visibleBooks = [...this.books];
    this.booksCategoryVisibleBooks = [...this.recentBooks];
    this.officeVisibleBooks = [...this.recentOfficeSupplies];
    this.electronicsVisibleBooks = [...this.recentElectronics];
    this.clothingVisibleBooks = [...this.recentClothing];
    this.cosmeticsVisibleBooks = [...this.recentCosmetics];
    this.shoesVisibleBooks = [...this.recentShoes];
    this.furnitureVisibleBooks = [...this.recentFurniture];
    this.gamesVisibleBooks = [...this.recentGames];
    this.fabricsVisibleBooks = [...this.recentFabrics];
    this.othersVisibleBooks = [...this.recentOthers];

    if (this.booksCurrentIndex >= this.books.length) {
      this.booksCurrentIndex = 0;
    }
    if (this.booksCategoryCurrentIndex >= this.recentBooks.length) {
      this.booksCategoryCurrentIndex = 0;
    }
    if (this.officeCurrentIndex >= this.recentOfficeSupplies.length) {
      this.officeCurrentIndex = 0;
    }
    if (this.electronicsCurrentIndex >= this.recentElectronics.length) {
      this.electronicsCurrentIndex = 0;
    }
    if (this.clothingCurrentIndex >= this.recentClothing.length) {
      this.clothingCurrentIndex = 0;
    }
    if (this.cosmeticsCurrentIndex >= this.recentCosmetics.length) {
      this.cosmeticsCurrentIndex = 0;
    }
    if (this.shoesCurrentIndex >= this.recentShoes.length) {
      this.shoesCurrentIndex = 0;
    }
    if (this.furnitureCurrentIndex >= this.recentFurniture.length) {
      this.furnitureCurrentIndex = 0;
    }
    if (this.gamesCurrentIndex >= this.recentGames.length) {
      this.gamesCurrentIndex = 0;
    }
    if (this.fabricsCurrentIndex >= this.recentFabrics.length) {
      this.fabricsCurrentIndex = 0;
    }
    if (this.othersCurrentIndex >= this.recentOthers.length) {
      this.othersCurrentIndex = 0;
    }

    this.updateBooksTransform();
    this.updateBooksCategoryTransform();
    this.updateOfficeTransform();
    this.updateElectronicsTransform();
    this.updateClothingTransform();
    this.updateCosmeticsTransform();
    this.updateShoesTransform();
    this.updateFurnitureTransform();
    this.updateGamesTransform();
    this.updateFabricsTransform();
    this.updateOthersTransform();
  }



  // Promo carousel methods
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

  setPromoImages(): void {
    const width = window.innerWidth;
    if (width < 640) {
      this.promoImages = ['smpanar1.jpg', 'smpanar2.jpg','smpanar3.jpg'];
    } else {
      this.promoImages = ['panar1.jpg', 'panar4.jpg','panar3.jpg'];
    }
  }




  //  <div
  //   class="print-image-container"
  //   *ngFor="let img of printImages; let i = index"
  // (mousedown)="startDrag($event, i)"
  //   (mouseup)="stopDrag(i)"
  //   (mouseleave)="stopDrag(i)"
  //   (mousemove)="onDrag($event, i)"
  //   (touchstart)="startDrag($event, i)"
  //   (touchend)="stopDrag(i)"
  //   (touchcancel)="stopDrag(i)"
  //   (touchmove)="onDrag($event, i)"

  updateCategoryAvailability(allProducts: any[]): void {
    this.newCategories.forEach(category => {
      const hasProducts = allProducts.some((product: any) =>
        category.categoryFilter.some((filter: string) =>
          product.product_category && product.product_category.includes(filter)
        )
      );
      category.hasProducts = hasProducts;
    });
  }

  onCategoryClick(category: any): void {
    if (category.hasProducts) {
      // Navigate to category page
      this.router.navigate(['/', category.id]);
    }
  }

  scrollToLibrarySections(): void {
    const element = document.getElementById('library-sections');
    if (element) {
      const offset = 200; // مسافة إضافية بالأعلى (بالبكسل)
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  }

  private processCategoryProducts(allProducts: any[], categoryId: string, productsArray: any[], visibleArray: any[], startAutoScrollFn: () => void): void {
    const category = this.newCategories.find(cat => cat.id === categoryId);
    if (!category) return;

    const filteredProducts = allProducts
      .filter((product: any) => category.categoryFilter.some((filter: string) => product.product_category && product.product_category.includes(filter)))
      .sort((a: any, b: any) => b.products_id - a.products_id)
      .slice(0, 50);

    productsArray.length = 0;
    productsArray.push(...this.shuffleArray(filteredProducts.map((product: any) => ({ ...product, loaded: false }))));

    visibleArray.length = 0;
    visibleArray.push(...productsArray);

    startAutoScrollFn();
  }

  // Books methods
  updateBooksTransform(): void {
    this.booksTransformStyle = `translateX(-${this.booksCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startBooksAutoScroll(): void {
    clearInterval(this.booksIntervalId);
    this.booksIntervalId = setInterval(() => {
      if (this.booksIsHovered) return;
      this.booksCurrentIndex = (this.booksCurrentIndex + 1) % (this.books.length);
      this.updateBooksTransform();
    }, 2000);
  }

  scrollBooksNext(): void {
    clearInterval(this.booksIntervalId);
    this.booksCurrentIndex = (this.booksCurrentIndex + 1) % (this.books.length);
    this.updateBooksTransform();
    this.startBooksAutoScroll();
  }

  scrollBooksPrev(): void {
    clearInterval(this.booksIntervalId);
    this.booksCurrentIndex = (this.booksCurrentIndex - 1 + this.books.length) % (this.books.length);
    this.updateBooksTransform();
    this.startBooksAutoScroll();
  }

  onBooksTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.booksTouchStartX = event.touches[0].clientX;
      this.booksIsTouchScrolling = true;
    }
  }

  onBooksTouchMove(event: TouchEvent): void {
    if (!this.booksIsTouchScrolling || this.booksTouchStartX === null) return;
    this.booksTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.booksTouchStartX - this.booksTouchCurrentX;
    clearInterval(this.booksIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.booksCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.books.length) newIndex = this.books.length - 1;
    if (newIndex !== this.booksCurrentIndex) {
      this.booksCurrentIndex = newIndex;
      this.updateBooksTransform();
    }
  }

  onBooksTouchEnd(): void {
    this.booksIsTouchScrolling = false;
    this.booksTouchStartX = null;
    this.booksTouchCurrentX = null;
    this.startBooksAutoScroll();
  }

  // Office Supplies methods
  updateOfficeTransform(): void {
    this.officeTransformStyle = `translateX(-${this.officeCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startOfficeAutoScroll(): void {
    clearInterval(this.officeIntervalId);
    this.officeIntervalId = setInterval(() => {
      if (this.officeIsHovered) return;
      this.officeCurrentIndex = (this.officeCurrentIndex + 1) % (this.recentOfficeSupplies.length);
      this.updateOfficeTransform();
    }, 2000);
  }

  // Books Category methods (for "وصل حديثاً - الكتب")
  updateBooksCategoryTransform(): void {
    this.booksCategoryTransformStyle = `translateX(-${this.booksCategoryCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startBooksCategoryAutoScroll(): void {
    clearInterval(this.booksCategoryIntervalId);
    this.booksCategoryIntervalId = setInterval(() => {
      if (this.booksCategoryIsHovered) return;
      this.booksCategoryCurrentIndex = (this.booksCategoryCurrentIndex + 1) % (this.recentBooks.length);
      this.updateBooksCategoryTransform();
    }, 2000);
  }

  scrollBooksCategoryNext(): void {
    clearInterval(this.booksCategoryIntervalId);
    this.booksCategoryCurrentIndex = (this.booksCategoryCurrentIndex + 1) % (this.recentBooks.length);
    this.updateBooksCategoryTransform();
    this.startBooksCategoryAutoScroll();
  }

  scrollBooksCategoryPrev(): void {
    clearInterval(this.booksCategoryIntervalId);
    this.booksCategoryCurrentIndex = (this.booksCategoryCurrentIndex - 1 + this.recentBooks.length) % (this.recentBooks.length);
    this.updateBooksCategoryTransform();
    this.startBooksCategoryAutoScroll();
  }

  onBooksCategoryTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.booksCategoryTouchStartX = event.touches[0].clientX;
      this.booksCategoryIsTouchScrolling = true;
    }
  }

  onBooksCategoryTouchMove(event: TouchEvent): void {
    if (!this.booksCategoryIsTouchScrolling || this.booksCategoryTouchStartX === null) return;
    this.booksCategoryTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.booksCategoryTouchStartX - this.booksCategoryTouchCurrentX;
    clearInterval(this.booksCategoryIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.booksCategoryCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentBooks.length) newIndex = this.recentBooks.length - 1;
    if (newIndex !== this.booksCategoryCurrentIndex) {
      this.booksCategoryCurrentIndex = newIndex;
      this.updateBooksCategoryTransform();
    }
  }

  onBooksCategoryTouchEnd(): void {
    this.booksCategoryIsTouchScrolling = false;
    this.booksCategoryTouchStartX = null;
    this.booksCategoryTouchCurrentX = null;
    this.startBooksCategoryAutoScroll();
  }

  scrollOfficeNext(): void {
    clearInterval(this.officeIntervalId);
    this.officeCurrentIndex = (this.officeCurrentIndex + 1) % (this.recentOfficeSupplies.length);
    this.updateOfficeTransform();
    this.startOfficeAutoScroll();
  }

  scrollOfficePrev(): void {
    clearInterval(this.officeIntervalId);
    this.officeCurrentIndex = (this.officeCurrentIndex - 1 + this.recentOfficeSupplies.length) % (this.recentOfficeSupplies.length);
    this.updateOfficeTransform();
    this.startOfficeAutoScroll();
  }

  onOfficeTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.officeTouchStartX = event.touches[0].clientX;
      this.officeIsTouchScrolling = true;
    }
  }

  onOfficeTouchMove(event: TouchEvent): void {
    if (!this.officeIsTouchScrolling || this.officeTouchStartX === null) return;
    this.officeTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.officeTouchStartX - this.officeTouchCurrentX;
    clearInterval(this.officeIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.officeCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentOfficeSupplies.length) newIndex = this.recentOfficeSupplies.length - 1;
    if (newIndex !== this.officeCurrentIndex) {
      this.officeCurrentIndex = newIndex;
      this.updateOfficeTransform();
    }
  }

  onOfficeTouchEnd(): void {
    this.officeIsTouchScrolling = false;
    this.officeTouchStartX = null;
    this.officeTouchCurrentX = null;
    this.startOfficeAutoScroll();
  }

  // Electronics methods
  updateElectronicsTransform(): void {
    this.electronicsTransformStyle = `translateX(-${this.electronicsCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startElectronicsAutoScroll(): void {
    clearInterval(this.electronicsIntervalId);
    this.electronicsIntervalId = setInterval(() => {
      if (this.electronicsIsHovered) return;
      this.electronicsCurrentIndex = (this.electronicsCurrentIndex + 1) % (this.recentElectronics.length);
      this.updateElectronicsTransform();
    }, 2000);
  }

  scrollElectronicsNext(): void {
    clearInterval(this.electronicsIntervalId);
    this.electronicsCurrentIndex = (this.electronicsCurrentIndex + 1) % (this.recentElectronics.length);
    this.updateElectronicsTransform();
    this.startElectronicsAutoScroll();
  }

  scrollElectronicsPrev(): void {
    clearInterval(this.electronicsIntervalId);
    this.electronicsCurrentIndex = (this.electronicsCurrentIndex - 1 + this.recentElectronics.length) % (this.recentElectronics.length);
    this.updateElectronicsTransform();
    this.startElectronicsAutoScroll();
  }

  onElectronicsTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.electronicsTouchStartX = event.touches[0].clientX;
      this.electronicsIsTouchScrolling = true;
    }
  }

  onElectronicsTouchMove(event: TouchEvent): void {
    if (!this.electronicsIsTouchScrolling || this.electronicsTouchStartX === null) return;
    this.electronicsTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.electronicsTouchStartX - this.electronicsTouchCurrentX;
    clearInterval(this.electronicsIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.electronicsCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentElectronics.length) newIndex = this.recentElectronics.length - 1;
    if (newIndex !== this.electronicsCurrentIndex) {
      this.electronicsCurrentIndex = newIndex;
      this.updateElectronicsTransform();
    }
  }

  onElectronicsTouchEnd(): void {
    this.electronicsIsTouchScrolling = false;
    this.electronicsTouchStartX = null;
    this.electronicsTouchCurrentX = null;
    this.startElectronicsAutoScroll();
  }

  // Clothing methods
  updateClothingTransform(): void {
    this.clothingTransformStyle = `translateX(-${this.clothingCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startClothingAutoScroll(): void {
    clearInterval(this.clothingIntervalId);
    this.clothingIntervalId = setInterval(() => {
      if (this.clothingIsHovered) return;
      this.clothingCurrentIndex = (this.clothingCurrentIndex + 1) % (this.recentClothing.length);
      this.updateClothingTransform();
    }, 2000);
  }

  scrollClothingNext(): void {
    clearInterval(this.clothingIntervalId);
    this.clothingCurrentIndex = (this.clothingCurrentIndex + 1) % (this.recentClothing.length);
    this.updateClothingTransform();
    this.startClothingAutoScroll();
  }

  scrollClothingPrev(): void {
    clearInterval(this.clothingIntervalId);
    this.clothingCurrentIndex = (this.clothingCurrentIndex - 1 + this.recentClothing.length) % (this.recentClothing.length);
    this.updateClothingTransform();
    this.startClothingAutoScroll();
  }

  onClothingTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.clothingTouchStartX = event.touches[0].clientX;
      this.clothingIsTouchScrolling = true;
    }
  }

  onClothingTouchMove(event: TouchEvent): void {
    if (!this.clothingIsTouchScrolling || this.clothingTouchStartX === null) return;
    this.clothingTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.clothingTouchStartX - this.clothingTouchCurrentX;
    clearInterval(this.clothingIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.clothingCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentClothing.length) newIndex = this.recentClothing.length - 1;
    if (newIndex !== this.clothingCurrentIndex) {
      this.clothingCurrentIndex = newIndex;
      this.updateClothingTransform();
    }
  }

  onClothingTouchEnd(): void {
    this.clothingIsTouchScrolling = false;
    this.clothingTouchStartX = null;
    this.clothingTouchCurrentX = null;
    this.startClothingAutoScroll();
  }

  // Cosmetics methods
  updateCosmeticsTransform(): void {
    this.cosmeticsTransformStyle = `translateX(-${this.cosmeticsCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startCosmeticsAutoScroll(): void {
    clearInterval(this.cosmeticsIntervalId);
    this.cosmeticsIntervalId = setInterval(() => {
      if (this.cosmeticsIsHovered) return;
      this.cosmeticsCurrentIndex = (this.cosmeticsCurrentIndex + 1) % (this.recentCosmetics.length);
      this.updateCosmeticsTransform();
    }, 2000);
  }

  scrollCosmeticsNext(): void {
    clearInterval(this.cosmeticsIntervalId);
    this.cosmeticsCurrentIndex = (this.cosmeticsCurrentIndex + 1) % (this.recentCosmetics.length);
    this.updateCosmeticsTransform();
    this.startCosmeticsAutoScroll();
  }

  scrollCosmeticsPrev(): void {
    clearInterval(this.cosmeticsIntervalId);
    this.cosmeticsCurrentIndex = (this.cosmeticsCurrentIndex - 1 + this.recentCosmetics.length) % (this.recentCosmetics.length);
    this.updateCosmeticsTransform();
    this.startCosmeticsAutoScroll();
  }

  onCosmeticsTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.cosmeticsTouchStartX = event.touches[0].clientX;
      this.cosmeticsIsTouchScrolling = true;
    }
  }

  onCosmeticsTouchMove(event: TouchEvent): void {
    if (!this.cosmeticsIsTouchScrolling || this.cosmeticsTouchStartX === null) return;
    this.cosmeticsTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.cosmeticsTouchStartX - this.cosmeticsTouchCurrentX;
    clearInterval(this.cosmeticsIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.cosmeticsCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentCosmetics.length) newIndex = this.recentCosmetics.length - 1;
    if (newIndex !== this.cosmeticsCurrentIndex) {
      this.cosmeticsCurrentIndex = newIndex;
      this.updateCosmeticsTransform();
    }
  }

  onCosmeticsTouchEnd(): void {
    this.cosmeticsIsTouchScrolling = false;
    this.cosmeticsTouchStartX = null;
    this.cosmeticsTouchCurrentX = null;
    this.startCosmeticsAutoScroll();
  }

  // Shoes methods
  updateShoesTransform(): void {
    this.shoesTransformStyle = `translateX(-${this.shoesCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startShoesAutoScroll(): void {
    clearInterval(this.shoesIntervalId);
    this.shoesIntervalId = setInterval(() => {
      if (this.shoesIsHovered) return;
      this.shoesCurrentIndex = (this.shoesCurrentIndex + 1) % (this.recentShoes.length);
      this.updateShoesTransform();
    }, 2000);
  }

  scrollShoesNext(): void {
    clearInterval(this.shoesIntervalId);
    this.shoesCurrentIndex = (this.shoesCurrentIndex + 1) % (this.recentShoes.length);
    this.updateShoesTransform();
    this.startShoesAutoScroll();
  }

  scrollShoesPrev(): void {
    clearInterval(this.shoesIntervalId);
    this.shoesCurrentIndex = (this.shoesCurrentIndex - 1 + this.recentShoes.length) % (this.recentShoes.length);
    this.updateShoesTransform();
    this.startShoesAutoScroll();
  }

  onShoesTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.shoesTouchStartX = event.touches[0].clientX;
      this.shoesIsTouchScrolling = true;
    }
  }

  onShoesTouchMove(event: TouchEvent): void {
    if (!this.shoesIsTouchScrolling || this.shoesTouchStartX === null) return;
    this.shoesTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.shoesTouchStartX - this.shoesTouchCurrentX;
    clearInterval(this.shoesIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.shoesCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentShoes.length) newIndex = this.recentShoes.length - 1;
    if (newIndex !== this.shoesCurrentIndex) {
      this.shoesCurrentIndex = newIndex;
      this.updateShoesTransform();
    }
  }

  onShoesTouchEnd(): void {
    this.shoesIsTouchScrolling = false;
    this.shoesTouchStartX = null;
    this.shoesTouchCurrentX = null;
    this.startShoesAutoScroll();
  }

  // Furniture methods
  updateFurnitureTransform(): void {
    this.furnitureTransformStyle = `translateX(-${this.furnitureCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startFurnitureAutoScroll(): void {
    clearInterval(this.furnitureIntervalId);
    this.furnitureIntervalId = setInterval(() => {
      if (this.furnitureIsHovered) return;
      this.furnitureCurrentIndex = (this.furnitureCurrentIndex + 1) % (this.recentFurniture.length);
      this.updateFurnitureTransform();
    }, 2000);
  }

  scrollFurnitureNext(): void {
    clearInterval(this.furnitureIntervalId);
    this.furnitureCurrentIndex = (this.furnitureCurrentIndex + 1) % (this.recentFurniture.length);
    this.updateFurnitureTransform();
    this.startFurnitureAutoScroll();
  }

  scrollFurniturePrev(): void {
    clearInterval(this.furnitureIntervalId);
    this.furnitureCurrentIndex = (this.furnitureCurrentIndex - 1 + this.recentFurniture.length) % (this.recentFurniture.length);
    this.updateFurnitureTransform();
    this.startFurnitureAutoScroll();
  }

  onFurnitureTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.furnitureTouchStartX = event.touches[0].clientX;
      this.furnitureIsTouchScrolling = true;
    }
  }

  onFurnitureTouchMove(event: TouchEvent): void {
    if (!this.furnitureIsTouchScrolling || this.furnitureTouchStartX === null) return;
    this.furnitureTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.furnitureTouchStartX - this.furnitureTouchCurrentX;
    clearInterval(this.furnitureIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.furnitureCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentFurniture.length) newIndex = this.recentFurniture.length - 1;
    if (newIndex !== this.furnitureCurrentIndex) {
      this.furnitureCurrentIndex = newIndex;
      this.updateFurnitureTransform();
    }
  }

  onFurnitureTouchEnd(): void {
    this.furnitureIsTouchScrolling = false;
    this.furnitureTouchStartX = null;
    this.furnitureTouchCurrentX = null;
    this.startFurnitureAutoScroll();
  }

  // Games methods
  updateGamesTransform(): void {
    this.gamesTransformStyle = `translateX(-${this.gamesCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startGamesAutoScroll(): void {
    clearInterval(this.gamesIntervalId);
    this.gamesIntervalId = setInterval(() => {
      if (this.gamesIsHovered) return;
      this.gamesCurrentIndex = (this.gamesCurrentIndex + 1) % (this.recentGames.length);
      this.updateGamesTransform();
    }, 2000);
  }

  scrollGamesNext(): void {
    clearInterval(this.gamesIntervalId);
    this.gamesCurrentIndex = (this.gamesCurrentIndex + 1) % (this.recentGames.length);
    this.updateGamesTransform();
    this.startGamesAutoScroll();
  }

  scrollGamesPrev(): void {
    clearInterval(this.gamesIntervalId);
    this.gamesCurrentIndex = (this.gamesCurrentIndex - 1 + this.recentGames.length) % (this.recentGames.length);
    this.updateGamesTransform();
    this.startGamesAutoScroll();
  }

  onGamesTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.gamesTouchStartX = event.touches[0].clientX;
      this.gamesIsTouchScrolling = true;
    }
  }

  onGamesTouchMove(event: TouchEvent): void {
    if (!this.gamesIsTouchScrolling || this.gamesTouchStartX === null) return;
    this.gamesTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.gamesTouchStartX - this.gamesTouchCurrentX;
    clearInterval(this.gamesIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.gamesCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentGames.length) newIndex = this.recentGames.length - 1;
    if (newIndex !== this.gamesCurrentIndex) {
      this.gamesCurrentIndex = newIndex;
      this.updateGamesTransform();
    }
  }

  onGamesTouchEnd(): void {
    this.gamesIsTouchScrolling = false;
    this.gamesTouchStartX = null;
    this.gamesTouchCurrentX = null;
    this.startGamesAutoScroll();
  }

  // Fabrics methods
  updateFabricsTransform(): void {
    this.fabricsTransformStyle = `translateX(-${this.fabricsCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startFabricsAutoScroll(): void {
    clearInterval(this.fabricsIntervalId);
    this.fabricsIntervalId = setInterval(() => {
      if (this.fabricsIsHovered) return;
      this.fabricsCurrentIndex = (this.fabricsCurrentIndex + 1) % (this.recentFabrics.length);
      this.updateFabricsTransform();
    }, 2000);
  }

  scrollFabricsNext(): void {
    clearInterval(this.fabricsIntervalId);
    this.fabricsCurrentIndex = (this.fabricsCurrentIndex + 1) % (this.recentFabrics.length);
    this.updateFabricsTransform();
    this.startFabricsAutoScroll();
  }

  scrollFabricsPrev(): void {
    clearInterval(this.fabricsIntervalId);
    this.fabricsCurrentIndex = (this.fabricsCurrentIndex - 1 + this.recentFabrics.length) % (this.recentFabrics.length);
    this.updateFabricsTransform();
    this.startFabricsAutoScroll();
  }

  onFabricsTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.fabricsTouchStartX = event.touches[0].clientX;
      this.fabricsIsTouchScrolling = true;
    }
  }

  onFabricsTouchMove(event: TouchEvent): void {
    if (!this.fabricsIsTouchScrolling || this.fabricsTouchStartX === null) return;
    this.fabricsTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.fabricsTouchStartX - this.fabricsTouchCurrentX;
    clearInterval(this.fabricsIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.fabricsCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentFabrics.length) newIndex = this.recentFabrics.length - 1;
    if (newIndex !== this.fabricsCurrentIndex) {
      this.fabricsCurrentIndex = newIndex;
      this.updateFabricsTransform();
    }
  }

  onFabricsTouchEnd(): void {
    this.fabricsIsTouchScrolling = false;
    this.fabricsTouchStartX = null;
    this.fabricsTouchCurrentX = null;
    this.startFabricsAutoScroll();
  }

  // Others methods
  updateOthersTransform(): void {
    this.othersTransformStyle = `translateX(-${this.othersCurrentIndex * (100 / this.booksToShow)}%)`;
  }

  startOthersAutoScroll(): void {
    clearInterval(this.othersIntervalId);
    this.othersIntervalId = setInterval(() => {
      if (this.othersIsHovered) return;
      this.othersCurrentIndex = (this.othersCurrentIndex + 1) % (this.recentOthers.length);
      this.updateOthersTransform();
    }, 2000);
  }

  scrollOthersNext(): void {
    clearInterval(this.othersIntervalId);
    this.othersCurrentIndex = (this.othersCurrentIndex + 1) % (this.recentOthers.length);
    this.updateOthersTransform();
    this.startOthersAutoScroll();
  }

  scrollOthersPrev(): void {
    clearInterval(this.othersIntervalId);
    this.othersCurrentIndex = (this.othersCurrentIndex - 1 + this.recentOthers.length) % (this.recentOthers.length);
    this.updateOthersTransform();
    this.startOthersAutoScroll();
  }

  onOthersTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.othersTouchStartX = event.touches[0].clientX;
      this.othersIsTouchScrolling = true;
    }
  }

  onOthersTouchMove(event: TouchEvent): void {
    if (!this.othersIsTouchScrolling || this.othersTouchStartX === null) return;
    this.othersTouchCurrentX = event.touches[0].clientX;
    const deltaX = this.othersTouchStartX - this.othersTouchCurrentX;
    clearInterval(this.othersIntervalId);
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;
    let newIndex = this.othersCurrentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.recentOthers.length) newIndex = this.recentOthers.length - 1;
    if (newIndex !== this.othersCurrentIndex) {
      this.othersCurrentIndex = newIndex;
      this.updateOthersTransform();
    }
  }

  onOthersTouchEnd(): void {
    this.othersIsTouchScrolling = false;
    this.othersTouchStartX = null;
    this.othersTouchCurrentX = null;
    this.startOthersAutoScroll();
  }
}
