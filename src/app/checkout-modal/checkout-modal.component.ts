import { Component, Output, EventEmitter, OnInit, Input } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../services/data.service';
import { PaymentService } from '../services/payment.service';
import { map, take } from 'rxjs/operators';
import { User } from '../auth/user.model';
import governoratesData from '../../../public/json/egypt-governorates.json';
import { faCheck, faHandPointRight } from '@fortawesome/free-solid-svg-icons';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { environment } from '../../environments/environment';
import { FreeShippingService, FreeShippingRules } from '../services/free-shipping.service';
import { PaymentModalComponent } from '../payment-modal/payment-modal.component';

@Component({
  selector: 'app-checkout-modal',
  templateUrl: './checkout-modal.component.html',
  styleUrls: ['./checkout-modal.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule, PaymentModalComponent]
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
  deliveryType: string = 'delivery';
  isPickup: boolean = false;
  pickupLocation: string = 'https://maps.app.goo.gl/Ms3sHBp6EDgjAb3G6';
  isPostOffice: boolean = false;
  postOfficeName: string = '';
  postOfficeGovernorate: string = '';
  postOfficeCity: string = '';
  postOfficeAddress: string = '';
  postOfficeCities: string[] = [];
  isEditingPostOffice: boolean = false;

  // New properties for Payment Modal
  showPaymentModal: boolean = false;
  paymentUrl: string = '';

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
  ) { }

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
    if (this.isPostOffice) {
      return this.postOfficeGovernorate.trim().length > 0 &&
        this.postOfficeCity.trim().length > 0 &&
        this.postOfficeAddress.trim().length > 0;
    }
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
            if (this.editedUserProfile && this.editedUserProfile.phone) {
              const egyptPhoneRegex = /^(010|011|012|015)[0-9]{8}$/;
              this.phoneTouched = egyptPhoneRegex.test(this.editedUserProfile.phone);
              this.phoneValid = this.phoneTouched;
            }
            if (this.userProfile?.postOffice) {
              this.postOfficeGovernorate = this.userProfile.postOffice.governorate || '';
              this.postOfficeCity = this.userProfile.postOffice.city || '';
              this.postOfficeName = this.userProfile.postOffice.name || '';
              this.postOfficeAddress = this.userProfile.postOffice.address || '';
              this.onPostOfficeGovernorateChange();
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
      this.dataService.getData().pipe(
        map((books: any[]) => books.filter(book => book.products_id === this.bookId))
      ).subscribe({
        next: (filteredBooks) => {
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
    if (this.isPostOffice) {
      const governorateName = this.editedUserProfile?.governorate || this.userProfile?.governorate;
      if (governorateName) {
        const governorate = this.governorates.find(g => g.governorate_name === governorateName);
        if (governorate && governorate.post_office_cost) {
          this.shippingCost = parseFloat(governorate.post_office_cost);
        } else {
          this.shippingCost = 0;
        }
      } else {
        this.shippingCost = 0;
      }
      this.calculateTotalPrice();
      return;
    }
    console.log('calculateShippingCost called');
    if (!this.freeShippingRules.freeShippingEnabled) {
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

    if (totalQuantity >= this.freeShippingRules.minQuantity && totalPrice >= this.freeShippingRules.minOrderValue) {
      this.shippingCost = 0;
      console.log('Free shipping applied, shippingCost set to 0');
      this.calculateTotalPrice();
      return;
    }

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

  get hasMerchantProducts(): boolean {
    const result = this.cartItems.some(item => item.merchantId && item.merchantId.trim() !== '');
    return result;
  }

  get pickupLocationText(): string {
    return this.hasMerchantProducts ? 'استلام مجاني من التاجر' : 'استلام مجاني من المكتبة';
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
    this.isPickup = this.deliveryType === 'pickup';
    this.isPostOffice = this.deliveryType === 'postOffice';
    if (this.isPostOffice && this.userProfile) {
      this.postOfficeGovernorate = this.userProfile!.governorate || '';
      this.postOfficeCity = this.userProfile!.city || '';
      this.onPostOfficeGovernorateChange();
      this.isEditingPostOffice = false;
    } else {
      this.postOfficeName = '';
      this.postOfficeGovernorate = '';
      this.postOfficeCity = '';
      this.postOfficeAddress = '';
      this.postOfficeCities = [];
      this.isEditingPostOffice = false;
    }
    this.calculateShippingCost();
    this.calculateTotalPrice();
    this.isAddressConfirmed = false;
  }

  onPostOfficeGovernorateChange() {
    const selectedGov = this.governorates.find(g => g.governorate_name === this.postOfficeGovernorate);
    this.postOfficeCities = selectedGov ? selectedGov.cities : [];
    if (!this.postOfficeCities.includes(this.postOfficeCity)) {
      this.postOfficeCity = '';
    }
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

    this.userProfile = { ...this.editedUserProfile };
    this.isEditingAddress = false;

    this.dataService.updateUserProfile(this.userProfile).subscribe({
      next: () => {
        console.log('User profile updated successfully');
        this.errorMessage = '';
        if (this.isPostOffice) {
          this.postOfficeGovernorate = this.userProfile!.governorate || '';
          this.postOfficeCity = this.userProfile!.city || '';
          this.onPostOfficeGovernorateChange();
        }
      },
      error: (error: any) => {
        console.error('Error updating user profile:', error);
        this.errorMessage = 'حدث خطأ أثناء تحديث البيانات، يرجى المحاولة مرة أخرى';
      }
    });
  }

  onEditPostOffice() {
    this.isEditingPostOffice = true;
  }

  cancelEditPostOffice() {
    this.isEditingPostOffice = false;
    if (this.userProfile) {
      this.postOfficeGovernorate = this.userProfile.governorate || '';
      this.postOfficeCity = this.userProfile.city || '';
      this.onPostOfficeGovernorateChange();
    }
  }

  saveEditPostOffice() {
    if (!this.userProfile) return;

    const govValid = this.governorates.some(g => g.governorate_name === this.postOfficeGovernorate);
    const cityValid = this.postOfficeCities.includes(this.postOfficeCity);
    const addressValid = this.postOfficeAddress.trim().length > 0;
    const nameValid = this.postOfficeName.trim().length > 0;

    if (!govValid || !cityValid) {
      alert('يرجى اختيار محافظة ومدينة صحيحة');
      return;
    }

    if (!addressValid || !nameValid) {
      alert('يرجى إدخال اسم المكتب وعنوانه');
      return;
    }

    this.userProfile.postOffice = {
      name: this.postOfficeName,
      address: this.postOfficeAddress,
      governorate: this.postOfficeGovernorate,
      city: this.postOfficeCity
    };

    this.editedUserProfile = { ...this.userProfile };
    this.isEditingPostOffice = false;

    this.dataService.updateUserProfile(this.userProfile).subscribe({
      next: () => console.log('Post office details saved to user profile.'),
      error: (err: any) => console.error('Failed to save post office details:', err)
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
        console.log('[Checkout] Preparing order data...');
        const referralCode = localStorage.getItem('referralCode');
        const bookId = localStorage.getItem('referralBookId');
        console.log(`[Checkout] Retrieved from localStorage - referralCode: ${referralCode}, bookId: ${bookId}`);

        let address = '';
        if (this.isPickup) {
          address = this.pickupLocation;
        } else if (this.isPostOffice) {
          address = `شحن عبر مكاتب البريد: ${this.postOfficeGovernorate}, ${this.postOfficeCity}, ${this.postOfficeAddress}, اسم المكتب: ${this.postOfficeName}, رقم الهاتف: ${this.userProfile?.phone}`;
        } else {
          address = `${this.editedUserProfile?.governorate}, ${this.editedUserProfile?.city}, ${this.editedUserProfile?.village}, رقم الهاتف: ${this.userProfile?.phone}`;
        }

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
          address: address,
          isPickup: this.isPickup,
          pickupLocation: this.isPickup ? this.pickupLocation : null,
          isPostOffice: this.isPostOffice,
          postOfficeGovernorate: this.isPostOffice ? this.postOfficeGovernorate : null,
          postOfficeCity: this.isPostOffice ? this.postOfficeCity : null,
          postOfficeAddress: this.isPostOffice ? this.postOfficeAddress : null,
          postOfficeName: this.isPostOffice ? this.postOfficeName : null,
          phone: this.userProfile?.phone,
          referralCode: referralCode,
          bookId: bookId
        };

        console.log('[Checkout] Submitting order with data:', orderData);
        this.dataService.submitOrder(orderData).subscribe({
          next: (response: any) => {
            if (referralCode) {
              localStorage.removeItem('referralCode');
              localStorage.removeItem('referralBookId');
            }

            const orderId = response.orderId;
            const currency = 'EGP';
            const merchantRedirect = window.location.origin + '/order/callback';

            if (orderId && this.userProfile && this.userProfile.email) {
              this.paymentService.createPayment(orderId, this.totalPrice, currency, this.userProfile.email, merchantRedirect).subscribe({
                next: (paymentResponse: any) => {
                  if (paymentResponse.sessionUrl) {
                    this.paymentUrl = paymentResponse.sessionUrl;
                    this.showPaymentModal = true;
                    this.isProcessing = false;
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

  executeCashOnDelivery(): void {
    this.showPurchaseConfirmation = false;

    const purchasedItems = this.cartItems
      .filter(item => item.product_quantity > 0);

    const purchasedBookIds = purchasedItems.map(item => item.products_id);

    this.authService.user$.pipe(take(1)).subscribe(currentUser => {
      if (currentUser) {
        console.log('[Checkout] Preparing COD order data...');
        const referralCode = localStorage.getItem('referralCode');
        const bookId = localStorage.getItem('referralBookId');
        console.log(`[Checkout] Retrieved from localStorage - referralCode: ${referralCode}, bookId: ${bookId}`);

        let address = '';
        if (this.isPickup) {
          address = this.pickupLocation;
        } else if (this.isPostOffice) {
          address = `شحن عبر مكاتب البريد: ${this.postOfficeGovernorate}, ${this.postOfficeCity}, ${this.postOfficeAddress}, اسم المكتب: ${this.postOfficeName}, رقم الهاتف: ${this.userProfile?.phone}`;
        } else {
          address = `${this.editedUserProfile?.governorate}, ${this.editedUserProfile?.city}, ${this.editedUserProfile?.village}, رقم الهاتف: ${this.userProfile?.phone}`;
        }

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
          address: address,
          isPickup: this.isPickup,
          pickupLocation: this.isPickup ? this.pickupLocation : null,
          isPostOffice: this.isPostOffice,
          postOfficeGovernorate: this.isPostOffice ? this.postOfficeGovernorate : null,
          postOfficeCity: this.isPostOffice ? this.postOfficeCity : null,
          postOfficeAddress: this.isPostOffice ? this.postOfficeAddress : null,
          postOfficeName: this.isPostOffice ? this.postOfficeName : null,
          phone: this.userProfile?.phone,
          referralCode: referralCode,
          bookId: bookId,
          paymentMethod: 'cod'
        };

        console.log('[Checkout] Submitting COD order with data:', orderData);
        this.dataService.submitOrder(orderData).subscribe({
          next: (response: any) => {
            if (referralCode) {
              localStorage.removeItem('referralCode');
              localStorage.removeItem('referralBookId');
            }
            this.onClose();
            window.location.href = '/requests';
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

  getBookImageUrl(book: any): string {
    const imageId = book.product_image || book.products_id;
    if (!imageId) {
      return '/assets/placeholder-book.jpg';
    }

    let imagePath;
    if (book.merchantName) {
      const sanitizedMerchantName = book.merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
      imagePath = `merchant_${sanitizedMerchantName}/${imageId}/${imageId}.webp`;
    } else {
      imagePath = `admin__karim_mohamed__/${imageId}/${imageId}.webp`;
    }
    return `${this.uploadsBaseUrl}/${imagePath}`;
  }

  onPaymentModalClose(): void {
    if (confirm('هل أنت متأكد من إلغاء عملية الدفع؟ سيظل طلبك معلقاً في قائمة الطلبات.')) {
      this.showPaymentModal = false;
      this.paymentUrl = '';
      this.onClose(); // Close the checkout modal too
      window.location.href = '/requests'; // Redirect to requests to see the pending order
    }
  }

  onPaymentComplete(success: boolean): void {
    this.showPaymentModal = false;
    this.paymentUrl = '';

    if (success) {
      alert('تم الدفع بنجاح! سيتم توجيهك إلى صفحة طلباتك.');
      this.onClose();
      window.location.href = '/requests';
    } else {
      alert('فشلت عملية الدفع أو تم إلغاؤها.');
    }
  }

}
