// Angular Core
import { Component, OnInit, ViewChild, ElementRef, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

// RxJS
import { take } from 'rxjs/operators';

// App-specific
import { AuthService } from '../auth.service';
import { User } from '../user.model';
import { environment } from '../../../environments/environment';
import { FormsModule } from '@angular/forms'; // Added FormsModule
import governoratesData from '../../../../public/json/egypt-governorates.json';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { GamificationService, GamificationProfile } from '../../services/gamification.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { faUser, faUsers, faTrophy, faSignOutAlt, faCopy, faCheckCircle, faCoins, faGift, faEdit, faSave, faTimes, faCamera, faBell } from '@fortawesome/free-solid-svg-icons';
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FontAwesomeModule, RouterModule], // Added FormsModule and RouterModule
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit, OnDestroy {
  // Expose Math to template
  Math = Math;

  // Ions
  faUser = faUser;
  faUsers = faUsers;
  faTrophy = faTrophy;
  faSignOutAlt = faSignOutAlt;
  faCopy = faCopy;
  faCheckCircle = faCheckCircle;
  faCoins = faCoins;
  faGift = faGift;
  faEdit = faEdit;
  faSave = faSave;
  faTimes = faTimes;
  faCamera = faCamera;
  faBell = faBell;

  // Notification Loading State
  isEnablingNotifications = false;
  notificationsEnabled = false;

  async enableNotifications() {
    this.isEnablingNotifications = true;
    try {
      if (this.pushService && this.notificationsEnabled) {
        alert('الإشعارات مفعلة بالفعل.');
        this.isEnablingNotifications = false;
        return;
      }

      // 1. Check current status first
      const currentStatus = await this.pushService.getPermissionStatus();

      if (currentStatus === 'denied') {
        const confirmSettings = confirm('⚠️ تم حظر الإشعارات مسبقاً.\nهل تريد الذهاب إلى الإعدادات لتفعيلها الآن؟');
        if (confirmSettings) {
          try {
            await NativeSettings.open({
              optionAndroid: AndroidSettings.AppNotification,
              optionIOS: IOSSettings.App
            });
          } catch (e) {
            console.error('Error opening settings', e);
            // Fallback
            alert('يرجى الذهاب إلى إعدادات الهاتف -> التطبيقات -> Kenouz -> الإشعارات.');
          }
        }
        this.isEnablingNotifications = false;
        return;
      }

      // 2. Request Subscription
      await this.pushService.subscribeToNotifications();

      // 3. Verify Again
      const newStatus = await this.pushService.getPermissionStatus();
      if (newStatus === 'granted') {
        this.notificationsEnabled = true;
        alert('تم تفعيل الإشعارات بنجاح! 🔔');
      } else {
        // If still not granted after request (user denied prompt)
        alert('لم يتم تفعيل الإشعارات. يرجى المحاولة مرة أخرى والموافقة على الإذن.');
      }

    } catch (err: any) {
      console.error('Notification error', err);
      // ... existing error handling
      if (err.message && err.message.includes('Dev Mode')) {
        alert('⚠️ تنبيه: الإشعارات لا تعمل في وضع التطوير (ng serve).\nلتجربتها، يجب تشغيل نسخة الإنتاج (Production Build).');
      } else if (err.message && (err.message.includes('User denied') || err.message.includes('denied permissions'))) {
        alert('⚠️ تم رفض الإشعارات.\nيرجى الذهاب إلى إعدادات الهاتف -> التطبيقات -> Kenouz -> الإشعارات -> وتفعيلها يدوياً.');
      } else {
        const errorMsg = err.error?.message || err.message || err;
        alert('تعذر تفعيل الإشعارات: ' + errorMsg);
      }
    } finally {
      this.isEnablingNotifications = false;
    }
  }

  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('videoElement') videoElement!: ElementRef;
  @ViewChild('canvasElement') canvasElement!: ElementRef;

  profileImage: string | null = null;
  showCameraModal = false;
  cameraStream: MediaStream | null = null;
  isUploadingImage = false;

  profileForm: FormGroup;
  isLoading = true;
  isSubmitting = false;
  user: User | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  isEditingAddress = false;
  governorates: any[] = governoratesData.governorates;
  cities: string[] = [];
  phoneValid = false;
  phoneTouched = false;
  locationValid = false;

  // New Tabs Logic
  activeTab: 'profile' | 'referrals' | 'achievements' = 'profile';
  gamificationProfile: GamificationProfile | null = null;
  copied = false;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private gamificationService: GamificationService,
    private pushService: PushNotificationService,
    private cdr: ChangeDetectorRef
  ) {
    this.profileForm = this.fb.group({
      username: ['', Validators.required],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^(010|011|012|015)[0-9]{8}$/)]],
      governorate: [''],
      city: [''],
      village: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    // Race Condition Fix: Check localStorage directly first
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/profile' } });
      return;
    }

    // Defensive check for AuthService
    if (!this.authService || !this.authService.user$) {
      console.error('CRITICAL: AuthService or user$ is undefined!', this.authService);
      return;
    }

    this.authService.user$.subscribe(user => {
      try {
        if (user && user.id) {
          this.user = user;

          // Wrap calls in independent try-catch blocks so one failure doesn't stop others
          try {
            this.loadUserProfile(user.id);
          } catch (e) {
            console.error('Error in loadUserProfile call:', e);
          }

          try {
            this.loadGamificationProfile();
          } catch (e) {
            console.error('Error in loadGamificationProfile call:', e);
          }

          // Auto-Prompt for Notifications & Sync UI
          setTimeout(() => {
            if (this.pushService) {
              // 1. Check current status first
              this.pushService.getPermissionStatus().then(status => {
                console.log('🔔 Permission Status:', status);
                if (status === 'granted') {
                  this.notificationsEnabled = true;
                } else if (status === 'prompt' || status === 'prompt-with-rationale') {
                  // 2. If prompt, trigger the request flow (Auto-Prompt)
                  this.pushService.initialPermissionRequest();
                }
              });
            }
          }, 1000);
        }
      } catch (err) {
        console.error('Error inside user$ subscription:', err);
      }
    });

    if (this.profileForm && this.profileForm.valueChanges) {
      this.profileForm.valueChanges.subscribe(() => {
        this.validatePhone();
        this.validateLocation();
      });
    }
  }

  // Helper to manually attach token
  private getAuthHeaders(): { headers: HttpHeaders } {
    const userStr = localStorage.getItem('user');
    let headers = new HttpHeaders();
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        // Try both token locations
        const token = user.token || user.accessToken;
        if (token) {
          headers = headers.set('Authorization', `Bearer ${token}`);
        }
      } catch (e) {
        console.error('UserProfile: Error parsing user', e);
      }
    }
    return { headers };
  }

  loadUserProfile(userId: string): void {
    const options = this.getAuthHeaders();
    this.http.get<any>(`${environment.apiBaseUrl}/users/profile/${userId}`, options).pipe(take(1)).subscribe({
      next: (data) => {
        this.profileForm.patchValue(data);
        this.profileImage = this.getProfileImageUrl(data.profileImage); // Load profile image
        this.isLoading = false;
        this.profileForm.disable(); // ابدأ والفورم معطل
        if (this.profileForm.get('governorate')?.value) {
          // تأكد من أن قيمة المحافظة قد تم تعيينها قبل محاولة تحميل المدن
          this.onGovernorateChange(false); // تحميل المدن بدون إعادة تعيين المدينة
        }
        this.validatePhone();
      },
      error: (err) => {
        this.errorMessage = 'حدث خطأ أثناء تحميل بيانات الملف الشخصي.';
        this.isLoading = false;
        console.error('Error loading user profile:', err);
      }
    });
  }

  loadGamificationProfile() {
    this.gamificationService.getProfile().subscribe({
      next: (res) => {
        if (res.success) {
          this.gamificationProfile = res.data;
          // Sync profile image if available from backend (fixes persistence issue)
          if (res.data.profileImage) {
            this.profileImage = this.getProfileImageUrl(res.data.profileImage);
            if (this.user) {
              this.user.profileImage = this.profileImage ?? undefined;
              // Optionally update auth service to persist to localStorage
              // this.authService.setUser(this.user); 
            }
          }
        }
        this.isLoading = false;
      },
      error: (err) => console.error('Error loading gamification profile', err)
    });
  }

  onGovernorateChange(resetCity = true) {
    const selectedGovernorate = this.governorates.find(g => g.governorate_name === this.profileForm.get('governorate')?.value);
    this.cities = selectedGovernorate ? selectedGovernorate.cities : [];
    if (resetCity) this.profileForm.get('city')?.setValue('');
    this.validateLocation();
  }

  validatePhone() {
    this.phoneTouched = true;
    const phoneControl = this.profileForm.get('phone');
    this.phoneValid = phoneControl?.valid ?? false;
  }

  validateLocation() {
    const governorate = this.profileForm.get('governorate')?.value;
    const city = this.profileForm.get('city')?.value;
    this.locationValid = !!governorate && !!city;
  }

  toggleEdit(isEditing: boolean): void {
    this.isEditingAddress = isEditing;
    if (isEditing) {
      // Enable all controls except email
      Object.keys(this.profileForm.controls).forEach(controlName => {
        if (controlName !== 'email') {
          this.profileForm.get(controlName)?.enable();
        }
      });
      this.profileForm.get('email')?.disable(); // البريد الإلكتروني يبقى للقراءة فقط
      this.phoneTouched = false;
      this.validatePhone();
      this.validateLocation();
    } else {
      this.profileForm.disable();
      this.successMessage = null;
      this.errorMessage = null;
      // إعادة تحميل البيانات الأصلية عند الإلغاء
      if (this.user?.id) {
        this.loadUserProfile(this.user.id);
      }
    }
  }

  onSubmit(): void {
    if (this.profileForm.invalid || !this.user) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;
    this.successMessage = null;

    const updatedData = this.profileForm.getRawValue();

    this.http.put(`${environment.apiBaseUrl}/users/update-profile/${this.user.id}`, updatedData).subscribe({
      next: (response: any) => {
        this.successMessage = response.message || 'تم تحديث بياناتك بنجاح.';
        // تحديث بيانات المستخدم في AuthService إذا لزم الأمر
        const updatedUser = { ...this.user, ...updatedData };
        this.authService.setUser(updatedUser as User);
        this.isSubmitting = false;
        this.isEditingAddress = false;
        this.profileForm.disable();
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'فشل تحديث البيانات. يرجى المحاولة مرة أخرى.';
        this.isSubmitting = false;
        console.error('Error updating user profile:', err);
      }
    });
  }

  switchTab(tab: 'profile' | 'referrals' | 'achievements') {
    this.activeTab = tab;
    // Auto-scroll on mobile
    if (window.innerWidth < 768) {
      setTimeout(() => {
        const element = document.getElementById('tab-content');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }

  copyReferralCode() {
    if (this.gamificationProfile?.referralCode) {
      // Assuming frontend is hosted at current domain
      const link = `${window.location.origin}/register?ref=${this.gamificationProfile.referralCode}`;
      navigator.clipboard.writeText(link).then(() => {
        this.copied = true;
        setTimeout(() => this.copied = false, 2000);
      });
    }
  }

  // Conversion Logic
  showConvertModal: boolean = false;
  coinsToConvert: number = 0;
  conversionRate: number = 50;

  openConvertModal() {
    this.showConvertModal = true;
    this.coinsToConvert = 50; // default min
  }

  closeConvertModal() {
    this.showConvertModal = false;
  }

  convertCoins() {
    if (this.coinsToConvert < 50 || this.coinsToConvert > (this.gamificationProfile?.coins || 0)) return;

    this.gamificationService.convertCoins(this.coinsToConvert).subscribe({
      next: (res) => {
        if (res.success && this.gamificationProfile) {
          this.gamificationProfile.coins = res.data.newCoinBalance;
          this.gamificationProfile.referralBalance = res.data.newWalletBalance;
          this.successMessage = `تم تحويل ${this.coinsToConvert} عملة بنجاح!`;
          this.closeConvertModal();
          setTimeout(() => this.successMessage = null, 5000);
        }
      },
      error: (err) => this.errorMessage = err.error?.message || 'فشل التحويل'
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  // --- Image Upload & Camera Logic ---

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.uploadImage(file);
    }
  }

  // --- Camera Logic ---
  currentFacingMode: 'user' | 'environment' = 'user'; // Default to user (front)

  async openCamera() {
    console.log('📸 Profile: Opening camera request...');
    this.showCameraModal = true;
    this.cdr.detectChanges();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('نأسف، المتصفح لا يدعم تشغيل الكاميرا.');
      this.showCameraModal = false;
      return;
    }

    try {
      console.log('📸 Profile: Requesting media stream with mode:', this.currentFacingMode);

      if (this.cameraStream) {
        this.cameraStream.getTracks().forEach(track => track.stop());
        this.cameraStream = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.currentFacingMode }
      });

      // CRITICAL FIX: Check if modal was closed while waiting for stream
      if (!this.showCameraModal) {
        console.log('📸 Profile: Modal closed during initialization, stopping stream.');
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      this.cameraStream = stream;

      setTimeout(() => {
        let videoEl: HTMLVideoElement | null = null;
        if (this.videoElement && this.videoElement.nativeElement) {
          videoEl = this.videoElement.nativeElement;
        } else {
          videoEl = document.getElementById('userProfileCameraVideo') as HTMLVideoElement;
        }

        if (videoEl) {
          videoEl.srcObject = this.cameraStream;
          videoEl.muted = true;
          videoEl.style.transform = this.currentFacingMode === 'user' ? 'scaleX(-1)' : 'none';
          videoEl.play().catch((e: any) => console.error('📸 Profile: Play error', e));
        } else {
          console.error('📸 Profile: Video element NOT found!');
        }
      }, 300);

    } catch (err: any) {
      console.error('❌ Error accessing camera:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('تم رفض إذن الوصول للكاميرا.');
      } else {
        alert('تعذر فتح الكاميرا: ' + (err.message || err));
      }
      this.showCameraModal = false;
      this.cdr.detectChanges();
    }
  }

  switchCamera() {
    this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    this.openCamera();
  }

  closeCamera() {
    this.showCameraModal = false;
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
  }

  captureImage() {
    if (this.videoElement && this.canvasElement) {
      const video = this.videoElement.nativeElement;
      const canvas = this.canvasElement.nativeElement;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob: Blob) => {
        if (blob) {
          const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
          this.uploadImage(file);
          this.closeCamera();
        }
      }, 'image/jpeg');
    }
  }

  getProfileImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    // Remove '/api' from apiBaseUrl to get the root domain
    const rootUrl = environment.apiBaseUrl.replace('/api', '');
    // Ensure url starts with /
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return `${rootUrl}${cleanPath}`;
  }

  uploadImage(file: File) {
    if (!this.user) {
      alert('خطأ: لا يوجد مسجل دخول');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('خطأ: حجم الصورة كبير جداً (أقصى حد 5 ميجابايت)');
      return;
    }

    console.log('📸 Uploading Image:', file.name, file.type, file.size);

    this.isUploadingImage = true;
    const formData = new FormData();
    // Append properly with filename (3rd arg) to check if that helps Android
    formData.append('image', file, file.name);
    formData.append('userId', this.user.id);

    this.http.post<any>(`${environment.apiBaseUrl}/users/profile-image`, formData).subscribe({
      next: (res) => {
        this.isUploadingImage = false;

        // Resolve URL before assigning
        const resolvedUrl = this.getProfileImageUrl(res.imageUrl);
        this.profileImage = resolvedUrl;

        if (this.user && resolvedUrl) {
          this.user.profileImage = resolvedUrl;
        }

        // Critical Fix: Ensure token is preserved to prevent logout
        if (!this.user!.token) {
          // ... (rest of logic)
          const storedUserStr = localStorage.getItem('user');
          if (storedUserStr) {
            try {
              const storedUser = JSON.parse(storedUserStr);
              if (storedUser.token) {
                this.user!.token = storedUser.token;
              }
            } catch (e) {
              console.error('Error parsing stored user for token recovery', e);
            }
          }
        }

        this.authService.setUser(this.user!); // Persist to auth service
        this.successMessage = 'تم تحديث الصورة الشخصية بنجاح';
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: (err) => {
        this.isUploadingImage = false;
        this.errorMessage = err.error?.message || 'فشل رفع الصورة';
        console.error('Upload error:', err);
      }
    });
  }

  ngOnDestroy() {
    this.closeCamera();
  }
}