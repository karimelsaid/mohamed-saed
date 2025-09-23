import { Component, OnDestroy, OnInit } from '@angular/core';
import { DataService } from '../services/data.service';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
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
    { id: 'Islamic', name: 'كتب دينية', image: this.uploadsBaseUrl + '/islamic.png' },
    { id: 'Self-development-psychology', name: 'تطوير الذات وعلم النفس', image: this.uploadsBaseUrl + '/tatwer.webp' },
    { id: 'Novels-stories', name: 'روايات وقصص', image: this.uploadsBaseUrl + '/rewayat.jpg' },
    { id: 'Business-Marketing-Finance', name: 'أعمال وتسويق ومالية', image: this.uploadsBaseUrl + '/aamal.png' },
    { id: 'HealthMedicineScience', name: 'صحة وطب وعلوم', image: this.uploadsBaseUrl + '/fit.jpg' },
    { id: 'Dictionaries-References', name: 'قواميس ومراجع', image: this.uploadsBaseUrl + '/qamos.jpg' },
    { id: 'Education-children', name: 'تربية وأطفال', image: this.uploadsBaseUrl + '/child.jpg' },
    { id: 'History-Biographies', name: 'تاريخ وسير ذاتية', image: this.uploadsBaseUrl + '/tarekh.png' },
    { id: 'Arts-crafts', name: 'فنون وحرف', image: this.uploadsBaseUrl + '/fenon.jpg' }
  ];

  books: any[] = [];
  visibleBooks: any[] = [];
  bookCoverTitles: string[] = [];
  currentIndex = 0;
  booksToShow = 5;
  isHovered = false;
  intervalId: any;
  faChevronLeft = faChevronLeft;
  faChevronRight = faChevronRight;

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

  // New properties for touch horizontal scroll on "وصل حديثاً"
  touchStartX: number | null = null;
  touchCurrentX: number | null = null;
  isTouchScrolling: boolean = false;

  constructor(private dataService: DataService) {}

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

    this.dataService.getData().subscribe((data: any) => {
      const lastFiftyBooks = data.slice(-50);
      this.books = this.shuffleArray(lastFiftyBooks);
      this.visibleBooks = [...this.books, ...this.books.slice(0, this.booksToShow)];
      this.bookCoverTitles = this.visibleBooks.map((_, i) => {
        const titles = ['غلاف ورقي سميك', 'غلاف كرتوني', 'غلاف فاخر مدهب'];
        return titles[i % titles.length];
      });
      this.updateTransform();
      this.startAutoScroll();
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
        this.startAutoScroll();
      }, 200);
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.intervalId);
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

    this.visibleBooks = [...this.books, ...this.books.slice(0, this.booksToShow)];
    if (this.currentIndex >= this.books.length) {
      this.currentIndex = 0;
    }

    this.updateTransform();
  }

  startAutoScroll(): void {
    clearInterval(this.intervalId);

    this.intervalId = setInterval(() => {
      if (this.isHovered) return;

      this.currentIndex = (this.currentIndex + 1) % (this.books.length);
      this.updateTransform();
    }, 2000);
  }

  scrollNext(): void {
    clearInterval(this.intervalId);
    this.currentIndex = (this.currentIndex + 1) % (this.books.length);
    this.updateTransform();
    this.startAutoScroll();
  }

  scrollPrev(): void {
    clearInterval(this.intervalId);
    this.currentIndex = (this.currentIndex - 1 + this.books.length) % (this.books.length);
    this.updateTransform();
    this.startAutoScroll();
  }

  updateTransform(): void {
    this.transformStyle = `translateX(-${this.currentIndex * (100 / this.booksToShow)}%)`;
  }

  // Touch event handlers for horizontal scroll on "وصل حديثاً"
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.touchStartX = event.touches[0].clientX;
      this.isTouchScrolling = true;
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.isTouchScrolling || this.touchStartX === null) return;

    this.touchCurrentX = event.touches[0].clientX;
    const deltaX = this.touchStartX - this.touchCurrentX;

    // Stop auto scroll when user is touching and moving
    clearInterval(this.intervalId);

    // Calculate the new scroll position based on deltaX and update currentIndex accordingly
    const containerWidth = window.innerWidth;
    const scrollPercent = (deltaX / containerWidth) * 100;
    const bookWidthPercent = 100 / this.booksToShow;

    let newIndex = this.currentIndex + Math.round(scrollPercent / bookWidthPercent);
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this.books.length) newIndex = this.books.length - 1;

    if (newIndex !== this.currentIndex) {
      this.currentIndex = newIndex;
      this.updateTransform();
    }
  }

  onTouchEnd(): void {
    this.isTouchScrolling = false;
    this.touchStartX = null;
    this.touchCurrentX = null;
    // Restart auto scroll after touch ends
    this.startAutoScroll();
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

  // 3D interaction methods for print images
  // startDrag(event: MouseEvent | TouchEvent, index: number): void {
  //   event.preventDefault();
  //   this.isDragging[index] = true;
  //   // Clear any pending reset timeout when dragging starts
  //   if (this.resetTimeouts[index]) {
  //     clearTimeout(this.resetTimeouts[index]);
  //     this.resetTimeouts[index] = null;
  //   }
  //   if (event instanceof MouseEvent) {
  //     this.lastX[index] = event.clientX;
  //     this.lastY[index] = event.clientY;
  //   } else if (event instanceof TouchEvent) {
  //     this.lastX[index] = event.touches[0].clientX;
  //     this.lastY[index] = event.touches[0].clientY;
  //   }
  // }

  // stopDrag(index: number): void {
  //   this.isDragging[index] = false;
  //   // Reset rotation to default after 2 seconds delay when dragging stops
  //   this.resetTimeouts[index] = setTimeout(() => {
  //     this.rotationX[index] = 0;
  //     this.rotationY[index] = 0;
  //     this.printImageTransforms[index] = 'rotateX(0deg) rotateY(0deg)';
  //     this.resetTimeouts[index] = null;
  //   }, 2000);
  // }

  // onDrag(event: MouseEvent | TouchEvent, index: number): void {
  //   if (!this.isDragging[index]) return;
  //   event.preventDefault();
  //   let currentX: number;
  //   let currentY: number;
  //   if (event instanceof MouseEvent) {
  //     currentX = event.clientX;
  //     currentY = event.clientY;
  //   } else if (event instanceof TouchEvent) {
  //     currentX = event.touches[0].clientX;
  //     currentY = event.touches[0].clientY;
  //   } else {
  //     return;
  //   }
  //   const deltaX = currentX - this.lastX[index];
  //   const deltaY = currentY - this.lastY[index];
  //   this.lastX[index] = currentX;
  //   this.lastY[index] = currentY;

  //   // Update rotation angles with some sensitivity factor
  //   this.rotationY[index] += deltaX * 0.5;
  //   this.rotationX[index] -= deltaY * 0.5;

  //   // Clamp rotationX to avoid flipping too far
  //   this.rotationX[index] = Math.max(Math.min(this.rotationX[index], 30), -30);

  //   this.printImageTransforms[index] = `rotateX(${this.rotationX[index]}deg) rotateY(${this.rotationY[index]}deg)`;
  // }
}
