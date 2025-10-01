import { Component, Output, EventEmitter, OnInit, Input } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../services/data.service';
import { PaymentService } from '../services/payment.service';
import { map, take } from 'rxjs/operators';
import { User } from '../auth/user.model';
import governoratesData from '../../../public/json/egypt-governorates.json';
import {faCheck , faHandPointRight} from '@fortawesome/free-solid-svg-icons';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { environment } from '../../environments/environment';
import { FreeShippingService, FreeShippingRules } from '../services/free-shipping.service';

@Component({
  selector: 'app-checkout-modal',
  templateUrl: './checkout-modal.component.html',
  styleUrls: ['./checkout-modal.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule]
})
export class CheckoutModalComponent implements OnInit {
  uploadsBaseUrl = environment.uploadsBaseUrl;
  @Input() bookId?: string;
  @Output() close = new EventEmitter<void>();
  cartItems: any[] = [];
  totalPrice: number = 0;
  shippingCost: number = 0;
  isLoading = true;
  showSuccessMessage: boolean = false;
  showPurchaseConfirmation: boolean = false;
  isProcessing: boolean = false;
  faCheck = faCheck;
  faHandPointRight = faHandPointRight
  // بيانات المستخدم
  userProfile: User | null = null;
  isAddressConfirmed: boolean = false;
  isEditingAddress: boolean = false;
  editedUserProfile: User | null = null;
  isPickup: boolean = false;
  pickupLocation: string = 'https://maps.app.goo.gl/Ms3sHBp6EDgjAb3G6';

  private cartItemsLoaded: boolean = false;
  private freeShippingRulesLoaded: boolean = false;

  private tryCalculateShippingCost(): void {
    if (this.cartItemsLoaded && this.freeShippingRulesLoaded) {
      this.calculateShippingCost();
    }
  }

  governorates: any[] = governoratesData.governorates;
  cities: string[] = [];

  phoneValid: boolean = true;
  phoneTouched: boolean = false;
  locationValid: boolean = true;
  errorMessage: string = '';
  currentStep: number = 1;

  freeShippingRules: FreeShippingRules = {
    minQuantity: 3,
    minOrderValue: 0,
    userGroups: [],
    includedProducts: [],
    includedCategories: [],
    includedGovernorates: [],
    freeShippingEnabled: true
  };

  constructor(
    private authService: AuthService,
    private dataService: DataService,
    private paymentService: PaymentService,
    private freeShippingService: FreeShippingService
  ) {}

  loadFreeShippingRules(): void {
    this.freeShippingService.getRules().subscribe({
      next: (rules) => {
        console.log('Free shipping rules loaded:', rules);
        this.freeShippingRules = rules;
        this.calculateShippingCost();
      },
      error: (error) => {
        console.error('Error loading free shipping rules:', error);
      }
    });
  }

  get freeShippingMessage(): string {
    if (!this.freeShippingRules.freeShippingEnabled) {
      return '';
    }
    const totalQuantity = this.cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const totalPrice = this.cartItems.reduce((total, book) => {
      if (book.product_quantity > 0) {
        return total + (parseFloat(book.product_price) * (book.quantity || 1));
      }
      return total;
    }, 0);
    if (totalQuantity >= this.freeShippingRules.minQuantity && totalPrice >= this.freeShippingRules.minOrderValue) {
      return 'لقد حصلت على شحن مجاني';
    } else if (totalQuantity < this.freeShippingRules.minQuantity) {
      return `اشترِ ${this.freeShippingRules.minQuantity - totalQuantity} كتاب${this.freeShippingRules.minQuantity - totalQuantity > 1 ? 'ات' : ''} أو أكثر لتحصل على شحن مجاني`;
    } else if (totalPrice < this.freeShippingRules.minOrderValue) {
      const remainingAmount = this.freeShippingRules.minOrderValue - totalPrice;
      return `أضف ${remainingAmount.toFixed(2)} جنيهًا أو أكثر لتحصل على شحن مجاني`;
    } else {
      return '';
    }
  }

  get isAddressComplete(): boolean {
    if (this.isPickup) return true;
    if (!this.editedUserProfile) return false;
    const governorate = this.editedUserProfile?.governorate ?? '';
    const city = this.editedUserProfile?.city ?? '';
    const village = this.editedUserProfile?.village ?? '';
    const phone = this.editedUserProfile?.phone ?? '';
    const phoneValid = this.phoneValid && this.phoneTouched;
    const locationValid = this.locationValid;
    return (
      governorate.trim().length > 0 &&
      city.trim().length > 0 &&
      village.trim().length > 0 &&
      phone.trim().length > 0 &&
      phoneValid &&
      locationValid
    );
  }

  ngOnInit(): void {
    console.log('CheckoutModalComponent initialized');
    this.loadCartItems();
    this.loadUserProfile();
    this.loadFreeShippingRules();
  }

  loadUserProfile() {
    this.authService.user$.pipe(take(1)).subscribe(currentUser => {
      if (currentUser && currentUser.id) {
        this.authService.getUserProfile(currentUser.id).subscribe({
          next: (profile) => {
            this.userProfile = profile;
            this.editedUserProfile = { ...profile }; // clone for editing
            this.updateCities();
            this.calculateShippingCost();
            this.calculateTotalPrice();
            // Set phoneTouched to true if phone exists and is valid to enable dynamic validation
            if (this.editedUserProfile && this.editedUserProfile.phone) {
              const egyptPhoneRegex = /^(010|011|012|015)[0-9]{8}$/;
              this.phoneTouched = egyptPhoneRegex.test(this.editedUserProfile.phone);
              this.phoneValid = this.phoneTouched;
            }
          },
          error: (err) => {
            console.error('خطأ في جلب بيانات المستخدم:', err);
          }
        });
      }
    });
  }

  loadCartItems() {
    console.log('Loading cart items...');
    if (this.bookId) {
      // Load only the book with the given bookId
      this.dataService.getData().pipe(
        map((books: any[]) => books.filter(book => book.products_id === this.bookId))
      ).subscribe({
        next: (filteredBooks) => {
          // Ensure quantity is set to 1 if undefined
          this.cartItems = filteredBooks.map(item => ({
            ...item,
            quantity: item.quantity ?? 1
          }));
          this.calculateTotalPrice();
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error loading book by id:', err);
          this.cartItems = [];
          this.isLoading = false;
        }
      });
    } else {
      this.authService.cartBookIds.subscribe(bookIds => {
        console.log('Received book IDs:', bookIds);
        if (bookIds.length > 0) {
          this.dataService.getData().pipe(
            map((books: any[]) => books.filter(book => bookIds.includes(book.products_id)))
          ).subscribe({
            next: (filteredBooks) => {
              // Ensure quantity is set to 1 if undefined
              this.cartItems = filteredBooks.map(item => ({
                ...item,
                quantity: item.quantity ?? 1
              })).sort((a, b) => {
                if (a.product_quantity > 0 && b.product_quantity <= 0) return -1;
                if (a.product_quantity <= 0 && b.product_quantity > 0) return 1;
                return b.product_quantity - a.product_quantity;
              });
              this.calculateTotalPrice();
              this.isLoading = false;
            },
            error: (err) => {
              console.error('Error loading cart items:', err);
              this.isLoading = false;
            }
          });
        } else {
          this.cartItems = [];
          this.isLoading = false;
        }
      });
    }
  }

  calculateShippingCost(): void {
    if (this.isPickup) {
      this.shippingCost = 0;
      this.calculateTotalPrice();
      return;
    }
    console.log('calculateShippingCost called');
    console.log('freeShippingRules object:', this.freeShippingRules);
    console.log('freeShippingEnabled:', this.freeShippingRules.freeShippingEnabled);
    if (!this.freeShippingRules.freeShippingEnabled) {
      // If free shipping is disabled, calculate shipping normally
      this.calculateShippingCostNormal();
      return;
    }

    const totalQuantity = this.cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const totalPrice = this.cartItems.reduce((total, book) => {
      if (book.product_quantity > 0) {
        return total + (parseFloat(book.product_price) * (book.quantity || 1));
      }
      return total;
    }, 0);

    console.log('totalQuantity:', totalQuantity);
    console.log('totalPrice:', totalPrice);
    console.log('minQuantity:', this.freeShippingRules.minQuantity);
    console.log('minOrderValue:', this.freeShippingRules.minOrderValue);

    // Check free shipping conditions
    if (totalQuantity >= this.freeShippingRules.minQuantity && totalPrice >= this.freeShippingRules.minOrderValue) {
      this.shippingCost = 0;
      console.log('Free shipping applied, shippingCost set to 0');
      this.calculateTotalPrice();
      return;
    }

    // Check governorate shipping cost if applicable
    const governorateName = this.editedUserProfile?.governorate || this.userProfile?.governorate;
    if (!governorateName) {
      this.shippingCost = 0;
      this.calculateTotalPrice();
      return;
    }
    const governorate = this.governorates.find(g => g.governorate_name === governorateName);
    if (governorate && governorate.shipping_cost) {
      this.shippingCost = parseFloat(governorate.shipping_cost);
    } else {
      this.shippingCost = 0;
    }
    console.log('Shipping cost set to:', this.shippingCost);
    this.calculateTotalPrice();
  }

  private calculateShippingCostNormal(): void {
    const governorateName = this.editedUserProfile?.governorate || this.userProfile?.governorate;
    if (!governorateName) {
      this.shippingCost = 0;
      this.calculateTotalPrice();
      return;
    }
    const governorate = this.governorates.find(g => g.governorate_name === governorateName);
    if (governorate && governorate.shipping_cost) {
      this.shippingCost = parseFloat(governorate.shipping_cost);
    } else {
      this.shippingCost = 0;
    }
    this.calculateTotalPrice();
  }

  calculateTotalPrice(): void {
    const itemsTotal = this.cartItems.reduce((total, book) => {
      if (book.product_quantity > 0) {
        return total + (parseFloat(book.product_price) * (book.quantity || 1));
      }
      return total;
    }, 0);
    this.totalPrice = itemsTotal + this.shippingCost;
  }

  get hasPurchasableItems(): boolean {
    return this.cartItems.some(item => item.product_quantity > 0);
  }

  onClose(): void {
    this.close.emit();
  }

  nextStep(): void {
    if (this.currentStep < 3) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }



  decreaseQuantity(item: any): void {
    if (!item.quantity) item.quantity = 1;

    if (item.quantity <= 1) {
      this.showAlert(item, 'الحد الأدنى للكمية هو 1');
      return;
    }

    item.quantity--;
    this.calculateShippingCost();
    this.calculateTotalPrice();
  }

  increaseQuantity(item: any): void {
    if (!item.quantity) item.quantity = 1;

    if (item.quantity >= item.product_quantity) {
      this.showAlert(item, 'لا يمكن زيادة الكمية عن ' + item.product_quantity);
      return;
    }

    item.quantity++;
    this.calculateShippingCost();
    this.calculateTotalPrice();
  }

  showAlert(item: any, msg: string): void {
    if (!item) return;

    item.message = msg;
    item.showMessage = true;

    setTimeout(() => {
      if (item) {
        item.showMessage = false;
      }
    }, 2000);
  }

  // تفعيل زر التعديل إذا لم يتم التأكيد
  onEditAddress() {
    this.isEditingAddress = true;
  }

  cancelEditAddress() {
    this.isEditingAddress = false;
    if (this.userProfile && this.editedUserProfile) {
      this.editedUserProfile = { ...this.userProfile };
      this.calculateShippingCost();
      this.calculateTotalPrice();
    }
  }

  onDeliveryTypeChange() {
    this.calculateShippingCost();
    this.calculateTotalPrice();
    // Reset address confirmation when switching delivery types
    this.isAddressConfirmed = false;
  }

  onGovernorateChange() {
    if (this.editedUserProfile) {
      const selectedGov = this.governorates.find(g => g.governorate_name === this.editedUserProfile!.governorate);
      this.cities = selectedGov ? selectedGov.cities : [];
      if (!this.cities.includes(this.editedUserProfile.city)) {
        this.editedUserProfile.city = '';
      }
      this.validateLocation();
      this.calculateShippingCost();
      this.calculateTotalPrice();
    }
  }

  updateCities() {
    if (this.editedUserProfile) {
      const selectedGov = this.governorates.find(g => g.governorate_name === this.editedUserProfile!.governorate);
      this.cities = selectedGov ? selectedGov.cities : [];
    }
  }

  validatePhone() {
    if (!this.editedUserProfile) return;
    const egyptPhoneRegex = /^(010|011|012|015)[0-9]{8}$/;
    this.phoneTouched = true;
    this.phoneValid = egyptPhoneRegex.test(this.editedUserProfile.phone);
  }

  validateLocation() {
    if (!this.editedUserProfile) return false;
    const govValid = this.governorates.some(g => g.governorate_name === this.editedUserProfile!.governorate);
    const cityValid = this.cities.includes(this.editedUserProfile.city);
    this.locationValid = govValid && cityValid;
    return this.locationValid;
  }

  saveEditAddress() {
    if (!this.editedUserProfile) return;

    this.errorMessage = '';
    this.validatePhone();
    this.validateLocation();

    if (!this.phoneValid || !this.locationValid) {
      return;
    }

    // Update userProfile with edited data
    this.userProfile = { ...this.editedUserProfile };
    this.isEditingAddress = false;

    // Call service to persist changes to backend
this.dataService.updateUserProfile(this.userProfile).subscribe({
      next: () => {
        console.log('User profile updated successfully');
        this.errorMessage = '';
      },
      error: (error: any) => {
        console.error('Error updating user profile:', error);
        this.errorMessage = 'حدث خطأ أثناء تحديث البيانات، يرجى المحاولة مرة أخرى';
      }
    });
  }

completePurchase(): void {
  this.isProcessing = true;
  this.showPurchaseConfirmation = true;
}

executePurchase(): void {
  this.showPurchaseConfirmation = false;

  const purchasedItems = this.cartItems
    .filter(item => item.product_quantity > 0);

  const purchasedBookIds = purchasedItems.map(item => item.products_id);

  this.authService.user$.pipe(take(1)).subscribe(currentUser => {
    if (currentUser) {
      const orderData = {
        userId: currentUser.id,
        products: purchasedItems.map(item => ({
          bookId: item.products_id,
          bookName: item.product_name,
          quantity: item.quantity || 1,
          price: parseFloat(item.product_price)
        })),
        shippingCost: this.shippingCost,
        totalAmount: this.totalPrice,
        merchantId: purchasedItems[0]?.merchantId,
        isPickup: this.isPickup,
        pickupLocation: this.isPickup ? this.pickupLocation : null
      };

      this.dataService.submitOrder(orderData).subscribe({
        next: (response: any) => {
          const orderId = response.orderId;
          const currency = 'EGP'; // يمكن تعديل العملة حسب الحاجة
          const merchantRedirect = window.location.origin + '/payment-success'; // رابط إعادة التوجيه بعد الدفع

          if (orderId && this.userProfile && this.userProfile.email) {
            this.paymentService.createPayment(orderId, this.totalPrice, currency, this.userProfile.email, merchantRedirect).subscribe({
              next: (paymentResponse: any) => {
                if (paymentResponse.sessionUrl) {
                  window.location.href = paymentResponse.sessionUrl;
                } else {
                  alert('فشل في الحصول على رابط الدفع');
                  this.isProcessing = false;
                }
              },
              error: (paymentError) => {
                console.error('خطأ في إنشاء طلب الدفع:', paymentError);
                alert('حدث خطأ أثناء إنشاء طلب الدفع، يرجى المحاولة مرة أخرى');
                this.isProcessing = false;
              }
            });
          } else {
            alert('بيانات الطلب غير مكتملة للدفع');
            this.isProcessing = false;
          }

          // باقي الكود كما هو لتحديث العنوان، السلة، والطلبات
        },
        error: (err) => {
          alert('حدث خطأ أثناء إتمام الشراء، يرجى المحاولة مرة أخرى');
          this.isProcessing = false;
        }
      });
    } else {
      alert('يجب تسجيل الدخول لإتمام الشراء');
    }
  });
}

  cancelPurchase(): void {
    this.showPurchaseConfirmation = false;
    this.isProcessing = false;
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
            imagePath = 'merchant_' + book.merchantName + '/' + book.products_id + '/' + imagePath + '.webp';
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

}
