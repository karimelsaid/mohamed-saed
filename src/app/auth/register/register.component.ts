import { CommonModule } from '@angular/common';
import { Component, OnInit, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import governoratesData from '../../../../public/json/egypt-governorates.json';
import { environment } from '../../../environments/environment';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faUser, faEnvelope, faLock, faPhone, faMapMarkerAlt,
  faStore, faIdCard, faImage, faEye, faEyeSlash, faBuilding, faGift, faCheckCircle
} from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit, AfterViewInit {
  // Icons
  faUser = faUser;
  faEnvelope = faEnvelope;
  faLock = faLock;
  faPhone = faPhone;
  faMapMarkerAlt = faMapMarkerAlt;
  faStore = faStore;
  faIdCard = faIdCard;
  faImage = faImage;
  faEye = faEye;
  faEyeSlash = faEyeSlash;
  faBuilding = faBuilding;
  faGift = faGift;
  faCheckCircle = faCheckCircle;

  governorates: any[] = governoratesData.governorates;
  buyerCities: string[] = [];
  merchantCities: string[] = [];

  isMerchantRegistration: boolean = false;
  isAndroid = Capacitor.getPlatform() === 'android';

  // Buyer user data
  user = {
    username: '',
    email: '',
    password: '',
    phone: '',
    governorate: '',
    city: '',
    village: ''
  };

  // Merchant user data
  merchantUser = {
    libraryName: '',
    email: '',
    password: '',
    phone: '',
    governorate: '',
    city: '',
    village: '',
    taxNumber: '',
    logoFile: null as File | null
  };

  buyerConfirmPassword: string = '';
  merchantConfirmPassword: string = '';
  buyerPasswordMismatch: boolean = false;
  merchantPasswordMismatch: boolean = false;
  buyerPasswordTouched: boolean = false;
  merchantPasswordTouched: boolean = false;
  buyerPasswordValid: boolean = false;
  merchantPasswordValid: boolean = false;
  buyerPasswordInvalid: boolean = false;
  merchantPasswordInvalid: boolean = false;
  phoneValid: boolean = false;
  usernameValid: boolean = false;
  phoneTouched: boolean = false;
  emailValid: boolean = false;
  emailTouched: boolean = false;
  message: string = '';
  private returnUrl: string = '/';

  referralCode: string = '';

  constructor(private authService: AuthService, private router: Router, private route: ActivatedRoute) { }

  ngOnInit() {
    // اقرأ returnUrl من الرابط
    this.route.queryParams.subscribe(params => {
      // إذا كان returnUrl هو صفحة التسجيل نفسها، وجه للصفحة الرئيسية
      this.returnUrl = params['returnUrl'] && !params['returnUrl'].includes('/register') ? params['returnUrl'] : '/';

      // Check for registration type (merchant vs buyer)
      if (params['type'] === 'merchant') {
        this.isMerchantRegistration = true;
      }

      // حفظ رمز الإحالة في localStorage إذا كان موجودًا
      if (params['ref']) {
        localStorage.setItem('referralCode', params['ref']);
        this.referralCode = params['ref']; // Auto-fill from URL
      }
    });

    // Auto-fill from localStorage if not already set from URL
    if (!this.referralCode) {
      const storedRef = localStorage.getItem('referralCode');
      if (storedRef) {
        this.referralCode = storedRef;
      }
    }

    if (this.isAndroid) {
      GoogleAuth.initialize({
        clientId: environment.googleClientId,
        scopes: ['profile', 'email'],
      });
    }
  }

  ngAfterViewInit() {
    if (!this.isAndroid) {
      this.loadGoogleScript();
    }
  }

  loadGoogleScript() {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => this.initializeGoogleSignIn();
    document.body.appendChild(script);
  }

  initializeGoogleSignIn() {
    // @ts-ignore
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: any) => this.handleGoogleCredentialResponse(response)
    });
    // @ts-ignore
    google.accounts.id.renderButton(
      document.getElementById('googleSignInDiv'),
      { theme: 'outline', size: 'large' }
    );
  }

  async googleSignIn() {
    if (this.isAndroid) {
      try {
        await GoogleAuth.signOut();
        const result = await GoogleAuth.signIn();
        const idToken = result.authentication.idToken;
        const referralCode = localStorage.getItem('referralCode');
        this.authService.googleSignIn(idToken, referralCode || undefined).subscribe({
          next: (user) => {
            this.message = '✅ تم تسجيل الدخول بنجاح! جارِ توجيهك...';
            this.router.navigateByUrl(this.returnUrl);
          },
          error: (error) => {
            if (error.status === 400 && error.error.message) {
              this.message = `❌ ${error.error.message}`;
            } else {
              this.message = '❌ فشل إنشاء الحساب باستخدام حساب Google. يرجى المحاولة مرة أخرى.';
            }
            console.error('Google sign-in error:', error);
          }
        });
      } catch (error) {
        this.message = '❌ فشل إنشاء الحساب باستخدام حساب Google. يرجى المحاولة مرة أخرى.';
        console.error('Google sign-in error:', error);
      }
    } else {
      // For web, handled by script
    }
  }

  handleGoogleCredentialResponse(response: any) {
    const idToken = response.credential;
    const referralCode = localStorage.getItem('referralCode');
    this.authService.googleSignIn(idToken, referralCode || undefined).subscribe({
      next: (user) => {
        this.message = '✅ تم تسجيل الدخول بنجاح! جارِ توجيهك...';
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (error) => {
        this.message = '❌ فشل إنشاء الحساب باستخدام حساب Google. يرجى المحاولة مرة أخرى.';
        console.error('Google sign-in error:', error);
      }
    });
  }

  onGovernorateChange(formType: 'merchant' | 'buyer') {
    if (formType === 'merchant') {
      const selectedGov = this.governorates.find(g => g.governorate_name === this.merchantUser.governorate);
      this.merchantCities = selectedGov ? selectedGov.cities : [];
      this.merchantUser.city = ''; // Reset city when governorate changes
    } else if (formType === 'buyer') {
      const selectedGov = this.governorates.find(g => g.governorate_name === this.user.governorate);
      this.buyerCities = selectedGov ? selectedGov.cities : [];
      this.user.city = ''; // Reset city when governorate changes
    }
  }


  validateLocation() {
    return this.user.governorate && this.user.city;
  }

  // التحقق من أن الاسم غير فارغ
  validateName() {
    this.usernameValid = this.user.username.trim().length > 0;
  }
  // التحقق من تطابق كلمة المرور للمشتري
  checkBuyerPasswordMatch() {
    this.buyerPasswordMismatch = this.user.password !== this.buyerConfirmPassword;
  }

  // التحقق من تطابق كلمة المرور للتاجر
  checkMerchantPasswordMatch() {
    this.merchantPasswordMismatch = this.merchantUser.password !== this.merchantConfirmPassword;
  }

  // التحقق من كلمة المرور للمشتري (منع المسافات والتحقق من الطول)
  validateBuyerPassword() {
    const regex = /\s/;
    this.buyerPasswordInvalid = regex.test(this.user.password) || this.user.password.length < 8;
    this.buyerPasswordValid = !this.buyerPasswordInvalid;
  }

  // التحقق من كلمة المرور للتاجر (منع المسافات والتحقق من الطول)
  validateMerchantPassword() {
    const regex = /\s/;
    this.merchantPasswordInvalid = regex.test(this.merchantUser.password) || this.merchantUser.password.length < 8;
    this.merchantPasswordValid = !this.merchantPasswordInvalid;
  }

  // التحقق من رقم الهاتف
  validatePhone() {
    const egyptPhoneRegex = /^(010|011|012|015)[0-9]{8}$/;
    this.phoneTouched = true;
    if (this.isMerchantRegistration) {
      this.phoneValid = egyptPhoneRegex.test(this.merchantUser.phone);
    } else {
      this.phoneValid = egyptPhoneRegex.test(this.user.phone);
    }
  }

  // التحقق من البريد الإلكتروني
  validateEmail() {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    this.emailTouched = true;
    if (this.isMerchantRegistration) {
      this.emailValid = emailRegex.test(this.merchantUser.email);
    } else {
      this.emailValid = emailRegex.test(this.user.email);
    }
  }

  // Check if buyer form is valid
  get isBuyerFormValid(): boolean {
    // Ensure all validations are up to date
    this.validateName();
    this.validateEmail();
    this.validateBuyerPassword();
    this.checkBuyerPasswordMatch();
    this.validatePhone();

    const isValid = !!(
      this.user.username.trim() &&
      this.user.email.trim() &&
      this.emailValid &&
      this.user.password.length >= 8 &&
      !this.buyerPasswordInvalid &&
      !this.buyerPasswordMismatch &&
      this.phoneValid &&
      this.user.governorate &&
      this.user.city
    );

    return isValid;
  }

  // Check if merchant form is valid
  get isMerchantFormValid(): boolean {
    this.validateMerchantPassword();
    this.checkMerchantPasswordMatch();

    return !!(
      this.merchantUser.libraryName.trim() &&
      this.merchantUser.email.trim() &&
      this.emailValid &&
      this.merchantUser.password.length >= 8 &&
      !this.merchantPasswordInvalid &&
      !this.merchantPasswordMismatch &&
      this.phoneValid &&
      this.merchantUser.governorate &&
      this.merchantUser.city &&
      this.merchantUser.logoFile
    );
  }

  // دالة التسجيل
  onRegister() {
    if (this.isMerchantRegistration) {
      this.registerMerchant();
    } else {
      this.registerBuyer();
    }
  }

  registerBuyer() {
    this.checkBuyerPasswordMatch();
    this.validateBuyerPassword();
    this.validatePhone();
    this.validateEmail();

    if (!this.isBuyerFormValid) {
      this.message = '❌ هناك خطأ في البيانات المدخلة. يرجى التحقق من جميع الحقول.';
      return;
    }

    this.message = ''; // Clear previous messages
    console.log('تم التسجيل بالبيانات:', this.user);

    // Use the referral code from the input field (which defaults to localStorage value)
    const finalReferralCode = this.referralCode || localStorage.getItem('referralCode');

    this.authService.createAccount(
      this.user.username,
      this.user.email,
      this.user.password,
      this.user.phone,
      this.user.governorate,
      this.user.city,
      this.user.village || '',
      finalReferralCode || undefined
    )
      .subscribe({
        next: (response) => {
          this.message = '✅ تم إنشاء الحساب بنجاح! جارِ توجيهك...';
          this.router.navigateByUrl(this.returnUrl);
        },
        error: (error) => {
          if (error.status === 400 && error.error.message) {
            this.message = `❌ ${error.error.message}`;
          } else {
            this.message = '❌ حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة لاحقًا.';
          }
          console.error('Error creating account:', error);
        }
      });
  }

  registerMerchant() {
    this.checkMerchantPasswordMatch();
    this.validateMerchantPassword();
    this.validatePhone();
    this.validateEmail();

    if (!this.isMerchantFormValid) {
      this.message = '❌ هناك خطأ في البيانات المدخلة. يرجى التحقق من جميع الحقول.';
      return;
    }

    this.message = ''; // Clear previous messages

    const formData = new FormData();
    formData.append('name', this.merchantUser.libraryName);
    formData.append('email', this.merchantUser.email);
    formData.append('password', this.merchantUser.password);
    formData.append('phone', this.merchantUser.phone);
    formData.append('governorate', this.merchantUser.governorate);
    formData.append('city', this.merchantUser.city);
    formData.append('village', this.merchantUser.village || '');
    formData.append('taxNumber', this.merchantUser.taxNumber || '');
    if (this.merchantUser.logoFile) {
      formData.append('logo', this.merchantUser.logoFile);
    }

    this.authService.registerMerchant(formData).subscribe({
      next: (response) => {
        this.message = '✅ تم إنشاء حساب التاجر بنجاح! جارِ توجيهك...';
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (error) => {
        if (error.status === 400 && error.error.message) {
          this.message = `❌ ${error.error.message}`;
        } else {
          this.message = '❌ حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة لاحقًا.';
        }
        console.error('Error creating merchant account:', error);
      }
    });
  }
}
