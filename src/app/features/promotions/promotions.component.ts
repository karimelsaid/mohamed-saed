import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { LuckyWheelComponent } from './lucky-wheel/lucky-wheel.component';
import { PrizeRevealComponent } from './lucky-wheel/prize-reveal.component';
import { PromotionService } from '../../services/promotion.service';
import { AuthService } from '../../auth/auth.service';
import { DataService } from '../../services/data.service';
import { CheckoutModalComponent } from '../../checkout-modal/checkout-modal.component';
import { FormsModule } from '@angular/forms';
import { faGift, faBoxOpen, faStar, faChevronLeft, faArrowRight, faCopy, faClock } from '@fortawesome/free-solid-svg-icons';
import { interval, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-promotions',
    templateUrl: './promotions.component.html',
    styleUrls: ['./promotions.component.css'],
    standalone: true,
    imports: [CommonModule, FontAwesomeModule, LuckyWheelComponent, PrizeRevealComponent, CheckoutModalComponent, FormsModule]
})
export class PromotionsComponent implements OnInit, OnDestroy, AfterViewInit {
    @ViewChild('packagesContainer') packagesContainer?: ElementRef;
    uploadsBaseUrl = environment.uploadsBaseUrl;
    private timerSubscription?: Subscription;
    theme: any;
    packages: any[] = [];
    loading = true;
    user: any = null;
    winningPrize: any = null;

    // Package Purchase
    showDetailsModal = false;
    selectedPackage: any = null;

    // Checkout
    showCheckoutModal = false;
    checkoutPackageData: any = null;

    // Custom Bundle Builder
    showCustomBuilder = false;
    allProducts: any[] = [];
    searchQuery = '';
    customBundleItems: any[] = [];
    dynamicOffer: any = null;
    isCalculatingOffer = false;

    faGift = faGift;
    faBoxOpen = faBoxOpen;
    faStar = faStar;
    faChevronLeft = faChevronLeft;
    faArrowRight = faArrowRight;
    faCopy = faCopy;
    faClock = faClock;

    constructor(
        private promotionService: PromotionService,
        private authService: AuthService,
        private dataService: DataService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    ngOnInit(): void {
        this.loadInitialData();
        this.loadProductsForBuilder();
        this.authService.user$.subscribe(user => this.user = user);

        // Timer to refresh coupon countdowns every second
        this.timerSubscription = interval(1000).subscribe(() => {
            // Nothing needed here, subscription just triggers change detection
        });
    }

    ngAfterViewInit(): void {
        if (isPlatformBrowser(this.platformId)) {
            this.initDragToScroll();
        }
    }

    private initDragToScroll(): void {
        const slider = this.packagesContainer?.nativeElement;
        if (!slider) return;

        let isDown = false;
        let startX: number;
        let scrollLeft: number;

        slider.addEventListener('mousedown', (e: MouseEvent) => {
            isDown = true;
            slider.classList.add('active');
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        });

        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.classList.remove('active');
        });

        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.classList.remove('active');
        });

        slider.addEventListener('mousemove', (e: MouseEvent) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 2; // scroll-fast factor
            slider.scrollLeft = scrollLeft - walk;
        });
    }

    loadInitialData() {
        this.loading = true;
        // Fetch theme
        this.promotionService.getActiveTheme().subscribe({
            next: (res: any) => {
                this.theme = res.theme;
                if (this.theme) {
                    this.applyTheme(this.theme.themeConfig);
                }
            },
            error: (err: any) => console.error(err)
        });

        // Fetch packages
        this.promotionService.getAllPackages().subscribe({
            next: (res: any) => {
                this.packages = Array.isArray(res) ? res : (res.packages || []);
                // Pre-compute image URLs to avoid recalculation on every change detection
                this.packages.forEach(pkg => {
                    if (pkg.products) {
                        pkg.products.forEach((p: any) => {
                            p._imageUrl = this.getProductImageUrl(p);
                        });
                    }
                });
                this.loading = false;
            },
            error: (err: any) => {
                console.error(err);
                this.loading = false;
            }
        });
    }

    private applyTheme(config: any) {
        this.promotionService.applyThemeGlobal(config);
    }

    getThemeIcon(propName: string, fallback: any): any {
        if (!this.theme?.themeConfig?.icons) return fallback;
        const iconName = this.theme.themeConfig.icons[propName];
        if (!iconName) return fallback;

        // Map string names from DB to FontAwesome objects
        switch (iconName) {
            case 'gift': return faGift;
            case 'box': return faBoxOpen;
            case 'star': return faStar;
            case 'arrow-right': return faArrowRight;
            case 'clock': return faClock;
            default: return fallback;
        }
    }

    copyCode(code: string) {
        navigator.clipboard.writeText(code).then(() => {
            alert('تم نسخ الكود بنجاح! 🎉');
        });
    }

    getRemainingTime(coupon: any): string {
        if (!coupon.couponId || !coupon.couponId.durationValue) return '';

        const earnedAt = new Date(coupon.earnedAt || coupon.createdAt);
        const durationValue = coupon.couponId.durationValue;
        const durationUnit = coupon.couponId.durationUnit || 'days';

        const expiryDate = new Date(earnedAt);
        if (durationUnit === 'hours') {
            expiryDate.setHours(expiryDate.getHours() + durationValue);
        } else {
            expiryDate.setDate(expiryDate.getDate() + durationValue);
        }

        const now = new Date();
        const diff = expiryDate.getTime() - now.getTime();

        if (diff <= 0) return 'منتهي';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        if (hours >= 24) {
            const days = Math.floor(hours / 24);
            const remainingHours = hours % 24;
            return `${days} يوم و ${remainingHours} ساعة`;
        }

        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    isNearExpiry(coupon: any): boolean {
        if (!coupon.couponId || !coupon.couponId.durationValue) return false;

        const earnedAt = new Date(coupon.earnedAt || coupon.createdAt);
        const durationValue = coupon.couponId.durationValue;
        const durationUnit = coupon.couponId.durationUnit || 'days';

        const expiryDate = new Date(earnedAt);
        if (durationUnit === 'hours') {
            expiryDate.setHours(expiryDate.getHours() + durationValue);
        } else {
            expiryDate.setDate(expiryDate.getDate() + durationValue);
        }

        const now = new Date();
        const diff = expiryDate.getTime() - now.getTime();

        // Critical if less than 1 hour remains
        return diff > 0 && diff < (1000 * 60 * 60);
    }

    calculateDiscount(original: number, promo: number): number {
        if (!original || original <= 0) return 0;
        return Math.round(((original - promo) / original) * 100);
    }

    // Package Actions
    viewPackageDetails(pkg: any) {
        this.selectedPackage = pkg;
        this.showDetailsModal = true;
    }

    purchasePackage(pkg: any) {
        this.checkoutPackageData = {
            products: pkg.products,
            totalPrice: pkg.promoPrice || pkg.fixedPrice,
            name: pkg.name
        };
        this.showDetailsModal = false;
        this.showCheckoutModal = true;
    }

    // Smart Bundle Builder
    loadProductsForBuilder() {
        this.dataService.getData().subscribe(res => {
            const internalIds = ['Kenouz', 'admin', 'admin__karim_mohamed__'];
            const all = res || [];

            this.allProducts = all.filter((p: any) => {
                if (!p.merchantId) return true;
                const mId = typeof p.merchantId === 'string' ? p.merchantId : (p.merchantId._id || p.merchantId.id || '').toString();
                const role = typeof p.merchantId === 'object' ? p.merchantId.role : '';

                return role === 'admin' || internalIds.some(id => id.toLowerCase() === mId.toLowerCase());
            });
            console.log(`[SmartOffer] Loaded ${this.allProducts.length} internal products for builder`);
        });
    }

    toggleCustomBuilder() {
        this.showCustomBuilder = !this.showCustomBuilder;
        if (this.showCustomBuilder) {
            setTimeout(() => {
                document.getElementById('customBuilderSection')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }

    getFilteredProducts() {
        if (!this.searchQuery) return [];
        const q = this.searchQuery.toLowerCase();
        return this.allProducts.filter(p =>
            (p.product_name || p.bookName || '').toLowerCase().includes(q)
        ).slice(0, 10);
    }

    addToCustomBundle(p: any) {
        const existing = this.customBundleItems.find(item => item.products_id === p.products_id);
        if (existing) {
            existing.quantity = (existing.quantity || 1) + 1;
        } else {
            this.customBundleItems.push({ ...p, quantity: 1 });
        }
        this.searchQuery = '';
        this.updateDynamicOffer();
    }

    updateQuantity(id: string, delta: number) {
        const item = this.customBundleItems.find(p => (p.products_id || p._id) === id);
        if (item) {
            item.quantity = Math.max(1, (item.quantity || 1) + delta);
            this.updateDynamicOffer();
        }
    }

    removeFromCustomBundle(id: string) {
        this.customBundleItems = this.customBundleItems.filter(p => (p.products_id || p._id) !== id);
        this.updateDynamicOffer();
    }

    updateDynamicOffer() {
        const totalItemsCount = this.customBundleItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

        if (totalItemsCount < 2) {
            this.dynamicOffer = null;
            return;
        }
        this.isCalculatingOffer = true;

        // Prepare a expanded list of IDs if the backend expects individual IDs per unit, 
        // OR send counts if the backend supports it. 
        // Looking at promotion.controller.js: getDynamicOffer expects { productIds: [] }
        const ids: string[] = [];
        this.customBundleItems.forEach(item => {
            for (let i = 0; i < (item.quantity || 1); i++) {
                ids.push(item._id || item.products_id);
            }
        });

        this.promotionService.calculateOffer(ids).subscribe({
            next: (res) => {
                console.log('[SmartOffer] Backend Result:', res);
                this.dynamicOffer = res;
                this.isCalculatingOffer = false;
            },
            error: (err) => {
                console.error('[SmartOffer] Backend ERROR:', err);
                this.isCalculatingOffer = false;
            }
        });
    }

    purchaseCustomBundle() {
        if (!this.dynamicOffer) return;

        // We need to pass the items with their specific quantities to the checkout modal
        const productsForCheckout = this.customBundleItems.map(item => ({
            ...item,
            // The checkout modal expects 'product_price' but we want to show the original price 
            // per item so it can show the breakdown if it needs to, 
            // although the modal usually uses 'totalPrice' for custom packages.
            quantity: item.quantity || 1
        }));

        this.checkoutPackageData = {
            products: productsForCheckout,
            totalPrice: this.dynamicOffer.discountedPrice,
            name: 'باقة مخصصة'
        };
        this.showCheckoutModal = true;
    }

    getProductImageUrl(book: any): string {
        if (!book) return this.uploadsBaseUrl + '/placeholder.webp';

        let imageId = book.product_image ? String(book.product_image) : '';
        const pid = book.products_id || book._id;

        // If imageId is empty, use pid as fallback
        if (!imageId) imageId = String(pid);

        // If it's already a full URL
        if (imageId.startsWith('http')) return imageId;

        const merchant = book.merchantId;
        // Logic to determine if it's an admin product
        const isAdmin = merchant?.role === 'admin' || (!merchant && !book.merchantName);

        let finalPath: string;
        if (isAdmin) {
            // Fixed pattern for admin: admin__karim_mohamed__/{id}/{id}.webp
            const id = /^\d+$/.test(imageId) ? imageId : pid;
            finalPath = `admin__karim_mohamed__/${id}/${id}.webp`;
        } else {
            // Pattern for merchants: merchant_{username}/{id}/{id}.webp
            const username = merchant?.username || book.merchantName || 'unknown';
            const sanitized = String(username).replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
            const id = /^\d+$/.test(imageId) ? imageId : pid;
            finalPath = `merchant_${sanitized}/${id}/${id}.webp`;
        }

        const fullUrl = `${this.uploadsBaseUrl}/${finalPath}`;
        return fullUrl;
    }

    ngOnDestroy(): void {
        this.timerSubscription?.unsubscribe();
    }
}
