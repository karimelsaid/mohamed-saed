import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../services/data.service';
import { map, take } from 'rxjs/operators';
import { CommonModule, NgIf } from '@angular/common';
import { CheckoutModalComponent } from '../checkout-modal/checkout-modal.component';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { PromotionService } from '../services/promotion.service';
import { HttpClient } from '@angular/common/http';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, NgIf, CheckoutModalComponent, NgxSkeletonLoaderModule, FontAwesomeModule],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css']
})
export class CartComponent implements OnInit {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  cartBooks: any[] = [];
  isLoading = false;
  totalPrice = 0;
  appliedCoupon: any = null;
  showCheckoutModal = false;

  // Bourse Config
  freeGiftThreshold = 1000;
  activeBourseOffer: any = null;
  hasExpiredBourseItems = false;
  hasActiveBourseItems = false;
  hasNormalItems = false;

  constructor(
    private authService: AuthService,
    private dataService: DataService,
    private router: Router,
    private promotionService: PromotionService,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.promotionService.activeCoupon$.subscribe(coupon => {
      this.appliedCoupon = coupon;
      this.calculateTotal();
    });
    this.loadBourseConfig();
  }

  calculateDiscountedPrice(price: number, bookId?: string, quantity: number = 1): { discountedPrice: number, discountedQty: number } {
    if (!this.appliedCoupon) return { discountedPrice: price, discountedQty: quantity };

    // Check price range
    const min = this.appliedCoupon.minPrice;
    const max = this.appliedCoupon.maxPrice;
    if ((min && price < min) || (max && price > max)) {
      return { discountedPrice: price, discountedQty: 0 };
    }

    // Handle Quantity Limit Per Product
    let discountedQty = quantity;
    if (this.appliedCoupon.maxQtyPerProduct > 0) {
      discountedQty = Math.min(quantity, this.appliedCoupon.maxQtyPerProduct);
    }

    let finalDiscountedPrice = price;
    if (this.appliedCoupon.discountType === 'percentage') {
      finalDiscountedPrice = price * (1 - this.appliedCoupon.value / 100);
    } else {
      finalDiscountedPrice = Math.max(0, price - this.appliedCoupon.value);
    }

    return { discountedPrice: finalDiscountedPrice, discountedQty: discountedQty };
  }
  navigateHome() {
    this.router.navigate(['/']);
  }

  loadBourseConfig() {
     this.http.get<{active: boolean, offer?: any, freeGiftThreshold: number}>(`${environment.apiBaseUrl}/bourse/active`).subscribe({
        next: (res) => {
           this.freeGiftThreshold = res.freeGiftThreshold || 1000;
           if (res.active && res.offer) {
              this.activeBourseOffer = res.offer;
           } else {
              this.activeBourseOffer = null;
           }
           this.loadCartBooks(); // Load books after getting Bourse config
        },
        error: (err) => {
           console.error('Error fetching bourse config', err);
           this.loadCartBooks();
        }
     });
  }

  loadCartBooks() {
    this.authService.cartBookIds.subscribe(bookIds => {
      if (bookIds.length > 0) {
        this.isLoading = true;
        this.dataService.getData().pipe(
          map((books: any[]) => {
            // Map books and check if their ID exists in cart with or without :free suffix
            return bookIds.map(idInCart => {
              const isFree = idInCart.endsWith(':free');
              const isBourse = idInCart.includes(':bourse:');
              const realId = idInCart.split(':')[0];
              const bourseOfferId = isBourse ? idInCart.split(':bourse:')[1] : null;

              const bookMatch = books.find(b => b.products_id === realId);
              if (bookMatch) {
                let finalPrice = bookMatch.product_price;
                let isExpiredBourse = false;
                
                if (isFree) {
                  finalPrice = 0;
                } else if (isBourse) {
                   // Check against active offer
                   if (this.activeBourseOffer && this.activeBourseOffer._id === bourseOfferId) {
                      const bourseBookInfo = this.activeBourseOffer.books.find((b: any) => b.bookId === realId);
                      if (bourseBookInfo) {
                         finalPrice = bourseBookInfo.boursePrice;
                      } else {
                         isExpiredBourse = true;
                      }
                   } else {
                      isExpiredBourse = true; // offer no longer active
                   }
                }

                return {
                  ...bookMatch,
                  products_id: idInCart, // Keep the suffix
                  product_price: finalPrice,
                  isFree: isFree,
                  isBourse: isBourse,
                  bourseOfferId: bourseOfferId,
                  isExpiredBourse: isExpiredBourse
                };
              }
              return null;
            }).filter(b => b !== null);
          })
        ).subscribe({
          next: (books) => {
            console.log(`[Cart] Loaded ${books.length} matching books out of ${bookIds.length} IDs in cart`);
            this.cartBooks = books;
            
            // Check flags
            this.hasExpiredBourseItems = books.some(b => b.isExpiredBourse);
            this.hasActiveBourseItems = books.some(b => b.isBourse && !b.isExpiredBourse);
            this.hasNormalItems = books.some(b => !b.isBourse && !b.isFree);

            this.calculateTotal();
            this.isLoading = false;
          },
          error: (err) => {
            console.error('Error loading cart books:', err);
            this.isLoading = false;
          }
        });
      } else {
        this.cartBooks = [];
        this.isLoading = false;
      }
    });
  }

  calculateTotal() {
    let discountedProductCount = 0;
    const maxProducts = this.appliedCoupon?.maxProducts || 0;

    this.totalPrice = this.cartBooks.reduce((total, book) => {
      const price = parseFloat(book.product_price);
      const qty = book.quantity || 1;

      // Prize items are already 0, just add to total
      if (book.isFree) {
        return total + 0;
      }

      // If maxProducts limit reached, don't apply discount to this item
      if (this.appliedCoupon && maxProducts > 0 && discountedProductCount >= maxProducts) {
        return total + (price * qty);
      }

      const { discountedPrice, discountedQty } = this.calculateDiscountedPrice(price, book.products_id, qty);

      // If a discount was actually applied
      if (this.appliedCoupon && (discountedPrice !== price) && discountedQty > 0) {
        discountedProductCount++;
        const discountedPart = discountedPrice * discountedQty;
        const normalPart = price * (qty - discountedQty);
        return total + discountedPart + normalPart;
      }

      return total + (price * qty);
    }, 0);
  }

  getBookImageUrl(book: any): string {
    return this.dataService.getBookImageUrl(book);
  }

  removeFromCart(bookId: string) {
    // Store original state in case we need to revert
    const originalCart = [...this.cartBooks];
    const originalTotal = this.totalPrice;

    // Immediately update UI
    this.cartBooks = this.cartBooks.filter(book => book.products_id !== bookId);
    this.calculateTotal();

    this.authService.user$.pipe(take(1)).subscribe(user => {
      const userId = user?.id;
      if (userId) {
        this.authService.removeFromCart(userId, bookId).subscribe({
          next: () => {
            // Update cart IDs in auth service
            const currentCartIds = this.authService.cartBookIds.getValue();
            this.authService.cartBookIds.next(currentCartIds.filter(id => id !== bookId));
          },
          error: (err) => {
            console.error('Error removing from cart:', err);
            // Revert to original state if API call fails
            this.cartBooks = originalCart;
            this.totalPrice = originalTotal;
          }
        });
      }
    });
  }


}
