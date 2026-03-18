// Angular Core
import { Component, OnInit, ViewChild, ElementRef, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';

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
import { CommunitySocialService } from '../../core/services/community-social.service';
import { ReaderPost } from '../../core/models/post.model';
import { 
    faUser, faUsers, faTrophy, faSignOutAlt, faCheckCircle, 
    faCoins, faGift, faEdit, faSave, faTimes, faCamera, 
    faBell, faMars, faVenus, faHeart, faComment, faBook, 
    faStar, faQuoteRight, faPlus, faArrowRight, faSyncAlt,
    faEllipsisV, faThumbtack, faTrash, faStore
} from '@fortawesome/free-solid-svg-icons';
import { faCopy } from '@fortawesome/free-regular-svg-icons';

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
  faMars = faMars;
  faVenus = faVenus;
  faHeart = faHeart;
  faComment = faComment;
  faBook = faBook;
  faStar = faStar;
  faQuoteRight = faQuoteRight;
  faPlus = faPlus;
  faArrowRight = faArrowRight;
  faRefresh = faSyncAlt;
  faEllipsisV = faEllipsisV;
  faThumbtack = faThumbtack;
  faTrash = faTrash;
  faStore = faStore;

  activeMenuId: string | null = null;



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
      const statusResponse = await this.pushService.getPermissionStatus();
      const currentStatus = statusResponse.permission;

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
      const statusResponse2 = await this.pushService.getPermissionStatus();
      if (statusResponse2.permission === 'granted') {
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

  // User Posts
  userPosts: ReaderPost[] = [];
  isPostsLoading = false;
  
  // Create Post Modal State
  showCreatePost = false;
  newPost = { content: '', type: 'thought' as 'thought' | 'review', bookTitle: '', rating: 0 };

  profileForm: FormGroup;
  isLoading = true;
  isSubmitting = false;
  profileUser: User | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  isEditingAddress = false;
  governorates: any[] = governoratesData.governorates;
  cities: string[] = [];
  phoneValid = false;
  phoneTouched = false;
  locationValid = false;

  // Social/Public Profile state
  isPublicProfile = false;
  targetUserId: string | null = null;
  isFollowing = false;
  socialStats = {
    likesReceived: 0,
    followingCount: 0,
    followersCount: 0
  };

  // Public View & Cover/Bio state
  isPublicView = false;
  isOwnProfile = false;
  coverPhoto: string | null = null;
  bio: string = '';
  isEditingBio = false;
  isUploadingCover = false;

  // New Tabs Logic
  activeTab: 'profile' | 'referrals' | 'achievements' | 'posts' = 'profile';
  gamificationProfile: GamificationProfile | null = null;
  copied = false;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    public authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private gamificationService: GamificationService,
    private pushService: PushNotificationService,
    private communityService: CommunitySocialService,
    private cdr: ChangeDetectorRef
  ) {
    this.profileForm = this.fb.group({
      username: ['', Validators.required],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^(010|011|012|015)[0-9]{8}$/)]],
      governorate: [''],
      city: [''],
      village: ['', Validators.required],
      gender: ['']
    });
  }

  ngOnInit(): void {
    // Race Condition Fix: Check localStorage directly first
    const storedUser = localStorage.getItem('user');
    
    // Check if we are viewing a public profile (or own public view)
    this.route.params.subscribe(params => {
        const currentUser = this.authService.userValue;
        
        if (params['id']) {
            this.targetUserId = params['id'];
        } else {
            this.targetUserId = currentUser?.id || null;
        }

        if (!this.targetUserId) {
            this.router.navigate(['/login'], { queryParams: { returnUrl: '/profile' } });
            return;
        }

        this.isOwnProfile = this.targetUserId === currentUser?.id;
        this.isPublicProfile = !this.isOwnProfile;
        
        // We now use unified view for everyone
        this.isPublicView = true; 
        
        // Load Posts and Social Stats for BOTH cases
        this.loadUserPosts(this.targetUserId);
        this.loadSocialStats(this.targetUserId);

        if (this.isOwnProfile) {
            this.initPrivateProfile();
        } else {
            this.loadPublicProfile(this.targetUserId);
            this.activeTab = 'posts';
        }
    });
  }

  private initPrivateProfile() {
    this.loadUserProfile(this.targetUserId!);
    this.loadGamificationProfile();
    this.activeTab = 'posts'; // Default to posts even for private view (like Facebook)

    // Auto-Prompt for Notifications
    setTimeout(() => {
      if (this.pushService) {
        this.pushService.getPermissionStatus().then(statusRes => {
          if (statusRes.permission === 'granted') {
            this.notificationsEnabled = true;
          } else if (statusRes.permission === 'prompt') {
            this.pushService.initialPermissionRequest();
          }
        });
      }
    }, 1000);

    this.loadConversionRate();
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
        this.profileUser = { ...this.profileUser, ...data };
        console.log('👤 Profile Data Loaded (Private):', { role: this.profileUser?.role, userId: this.profileUser?.id, merchantName: this.profileUser?.merchantName });
        this.profileForm.patchValue(data);
        this.profileImage = this.getProfileImageUrl(data.profileImage);
        this.coverPhoto = this.getProfileImageUrl(data.coverPhoto);
        this.bio = data.bio || '';
        this.isLoading = false;
        this.profileForm.disable(); // ابدأ والفورم معطل
        if (this.profileForm.get('governorate')?.value) {
          // تأكد من أن قيمة المحافظة قد تم تعيينها قبل محاولة تحميل المدن
          this.onGovernorateChange(false); // تحميل المدن بدون إعادة تعيين المدينة
        }
        this.validatePhone();
        this.cdr.detectChanges();
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
            if (this.profileUser) {
              this.profileUser.profileImage = this.profileImage ?? undefined;
              // Optionally update auth service to persist to localStorage
              // this.authService.setUser(this.profileUser); 
            }
          }
        }
        this.isLoading = false;
      },
      error: (err) => console.error('Error loading gamification profile', err)
    });
  }

  loadUserPosts(userId: string) {
    this.isPostsLoading = true;
    this.communityService.getUserPosts(userId).subscribe({
      next: (posts) => {
        this.userPosts = posts;
        this.isPostsLoading = false;
      },
      error: (err) => {
        console.error('Error loading user posts', err);
        this.isPostsLoading = false;
      }
    });
  }

  loadSocialStats(userId: string) {
    const viewerId = this.authService.userValue?.id;
    this.communityService.getUserSocialStats(userId, viewerId).subscribe({
      next: (stats: any) => {
        this.socialStats = stats;
        this.isFollowing = stats.isFollowing;
        if (this.profileUser && this.isOwnProfile) {
          this.profileUser.likesReceived = stats.likesReceived;
        }
      },
      error: (err) => console.error('Error loading social stats', err)
    });
  }

  loadPublicProfile(userId: string) {
    this.isLoading = true;
    const viewerId = this.authService.userValue?.id;
    this.http.get<any>(`${environment.apiBaseUrl}/community/users/profile/${userId}?viewerId=${viewerId || ''}`).subscribe({
      next: (data) => {
        this.profileUser = data;
        console.log('👤 Profile Data Loaded (Public):', { role: this.profileUser?.role, userId: this.profileUser?.id });
        this.profileImage = this.getProfileImageUrl(data.profileImage);
        this.coverPhoto = this.getProfileImageUrl(data.coverPhoto);
        this.bio = data.bio || '';
        // Social stats are already loaded natively via loadSocialStats
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading public profile', err);
        this.isLoading = false;
        this.errorMessage = 'تعذر تحميل ملف المستخدم.';
      }
    });
  }

  toggleFollow() {
    if (!this.targetUserId || !this.authService.userValue?.id) {
        if (!this.authService.userValue?.id) this.openAccountModal();
        return;
    }

    const followerId = this.authService.userValue.id;
    if (this.isFollowing) {
        this.communityService.unfollowUser(this.targetUserId, followerId).subscribe({
            next: () => {
                this.isFollowing = false;
                this.socialStats.followersCount--;
            },
            error: (err) => console.error('Error unfollowing', err)
        });
    } else {
        this.communityService.followUser(this.targetUserId, followerId).subscribe({
            next: () => {
                this.isFollowing = true;
                this.socialStats.followersCount++;
            },
            error: (err) => console.error('Error following', err)
        });
    }
  }

  // --- Post Interactions (Social) ---

  toggleComments(post: any) {
    post.showComments = !post.showComments;
  }

  addComment(post: any) {
    if (!this.authService.userValue?.id) {
        this.openAccountModal();
        return;
    }

    if (!post.newCommentText?.trim()) return;

    const comment = {
        userId: this.authService.userValue.id,
        userName: (this.authService.userValue as any).full_name || this.authService.userValue.username,
        content: post.newCommentText
    };

    this.communityService.addComment(post.id || post._id, comment).subscribe({
        next: (updatedPost) => {
            post.comments = updatedPost.comments;
            post.newCommentText = '';
        },
        error: (err) => console.error('Error adding comment', err)
    });
  }

  toggleReplyInput(comment: any) {
    comment.showReplyInput = !comment.showReplyInput;
    if (comment.showReplyInput) comment.replyText = '';
  }

  submitReply(post: any, comment: any) {
    if (!this.authService.userValue?.id) {
        this.openAccountModal();
        return;
    }

    if (!comment.replyText?.trim()) return;

    const reply = {
      userId: this.authService.userValue.id,
      userName: (this.authService.userValue as any).full_name || this.authService.userValue.username,
      content: comment.replyText
    };

    this.communityService.addReply(post.id || post._id, comment._id || comment.id, reply).subscribe({
      next: (updatedPost: any) => {
        const targetComment = updatedPost.comments.find((c: any) => (c._id || c.id).toString() === (comment._id || comment.id).toString());
        if (targetComment) {
          comment.replies = targetComment.replies;
        }
        comment.showReplyInput = false;
        comment.replyText = '';
      },
      error: (err) => console.error('Error submitting reply', err)
    });
  }

  toggleMenu(postId: string) {
    this.activeMenuId = this.activeMenuId === postId ? null : postId;
  }

  deletePost(postId: string) {
    if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) return;
    const userId = this.authService.userValue?.id;
    if (!userId) return;

    this.communityService.deletePost(postId, userId).subscribe({
        next: () => {
            this.userPosts = this.userPosts.filter(p => (p.id || p._id) !== postId);
            this.activeMenuId = null;
            this.successMessage = 'تم حذف المنشور بنجاح.';
            setTimeout(() => this.successMessage = null, 3000);
        },
        error: (err) => console.error('Error deleting post', err)
    });
  }

  pinPost(post: ReaderPost, type: 'personal' | 'community') {
    const userId = this.authService.userValue?.id;
    if (!userId) return;
    const postId = post.id || post._id;
    if (!postId) return;

    this.communityService.pinPost(postId, userId, type).subscribe({
        next: (updatedPost) => {
            const index = this.userPosts.findIndex(p => (p.id || p._id) === postId);
            if (index !== -1) {
                this.userPosts[index] = { ...this.userPosts[index], ...updatedPost };
                // Re-sort user posts
                this.userPosts.sort((a, b) => {
                    if (a.isPinned && !b.isPinned) return -1;
                    if (!a.isPinned && b.isPinned) return 1;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });
            }
            this.activeMenuId = null;
        }
    });
  }

  unpinPost(post: ReaderPost) {
    const userId = this.authService.userValue?.id;
    if (!userId) return;
    const postId = post.id || post._id;
    if (!postId) return;

    this.communityService.unpinPost(postId, userId).subscribe({
        next: (updatedPost) => {
            const index = this.userPosts.findIndex(p => (p.id || p._id) === postId);
            if (index !== -1) {
                this.userPosts[index] = { ...this.userPosts[index], ...updatedPost };
            }
            this.activeMenuId = null;
        }
    });
  }

  isAdminUser(): boolean {
    return this.authService.userValue?.role === 'admin';
  }

  isProfileAdmin(): boolean {
    return this.profileUser?.role === 'admin';
  }

  isOwner(post: ReaderPost): boolean {
    return post.userId === this.authService.userValue?.id;
  }

  viewProfile(userId: string) {
    if (!userId) return;
    this.router.navigate(['/user-profile', userId]);
  }

  likePost(postId: string | undefined) {
    if (!postId) return;
    if (!this.authService.userValue?.id) {
        this.openAccountModal();
        return;
    }

    this.communityService.likePost(postId, this.authService.userValue.id).subscribe({
        next: (res) => {
            const post = this.userPosts.find(p => (p.id || p._id) === postId);
            if (post) post.likes = res.likes;
        },
        error: (err) => console.error('Error liking post', err)
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
      if (this.profileUser?.id) {
        this.loadUserProfile(this.profileUser.id);
      }
    }
  }

  onSubmit(): void {
    if (this.profileForm.invalid || !this.profileUser) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;
    this.successMessage = null;

    const updatedData = this.profileForm.getRawValue();

    this.http.put(`${environment.apiBaseUrl}/users/update-profile/${this.profileUser.id}`, updatedData).subscribe({
      next: (response: any) => {
        this.successMessage = response.message || 'تم تحديث بياناتك بنجاح.';
        // تحديث بيانات المستخدم في AuthService إذا لزم الأمر
        const updatedUser = { ...this.profileUser, ...updatedData };
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

  switchTab(tab: 'profile' | 'referrals' | 'achievements' | 'posts') {

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
      navigator.clipboard.writeText(this.gamificationProfile.referralCode).then(() => {
        this.copied = true;
        setTimeout(() => this.copied = false, 2000);
      });
    }
  }

  shareReferralCode() {
    if (this.gamificationProfile?.referralCode && navigator.share) {
      navigator.share({
        title: 'كود دعوة كنوز بوك',
        text: `استخدم كود الدعوة الخاص بي: ${this.gamificationProfile.referralCode} عند التسجيل في كنوز بوك!`,
      }).catch(err => console.log('Error sharing:', err));
    } else if (this.gamificationProfile?.referralCode) {
      this.copyReferralCode();
      alert('تم نسخ الكود للمشاركة!');
    }
  }

  // Conversion Logic
  showConvertModal: boolean = false;
  coinsToConvert: number = 0;
  conversionRate: number = 50; // default will be overwritten by loadConversionRate

  loadConversionRate() {
    this.http.get<any>(`${environment.apiBaseUrl}/admin/settings`).subscribe({
      next: (settings) => {
        if (settings && settings.economy?.coinExchangeRate) {
          this.conversionRate = settings.economy.coinExchangeRate;
        }
      },
      error: (err) => console.error('Error loading conversion rate:', err)
    });
  }

  openConvertModal() {
    this.showConvertModal = true;
    this.coinsToConvert = 50; // default min
  }

  closeConvertModal() {
    this.showConvertModal = false;
  }

  convertCoins() {
    if (this.coinsToConvert < this.conversionRate || this.coinsToConvert > (this.gamificationProfile?.coins || 0)) return;

    this.gamificationService.convertCoins(this.coinsToConvert).subscribe({
      next: (res) => {
        if (res.success && this.gamificationProfile) {
          this.gamificationProfile.coins = res.data.newCoinBalance;
          this.gamificationProfile.referralBalance = res.data.newWalletBalance;

          const deducted = res.data.coinsDeducted;
          const gained = res.data.exchangedAmount;

          this.successMessage = `تم تحويل ${deducted} عملة بنجاح إلى ${gained} جنيه!`;
          this.closeConvertModal();
          setTimeout(() => this.successMessage = null, 5000);

          // Refresh profile just in case
          this.loadGamificationProfile();
        }
      },
      error: (err) => this.errorMessage = err.error?.message || 'فشل التحويل'
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  openAccountModal() {
    // Navigate to login for now in profile view, or show a toast
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  // --- Image Upload & Camera Logic ---
  @ViewChild('coverInput') coverInput!: ElementRef;

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  triggerCoverInput() {
    this.coverInput.nativeElement.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.uploadImage(file);
    }
  }

  onCoverSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.uploadCoverImage(file);
    }
  }

  toggleBioEdit() {
    this.isEditingBio = !this.isEditingBio;
  }

  updateBio() {
    if (!this.profileUser?.id) return;
    this.isSubmitting = true;
    
    this.http.put(`${environment.apiBaseUrl}/users/profile/${this.profileUser.id}`, { bio: this.bio }).subscribe({
      next: (res: any) => {
        this.isSubmitting = false;
        this.isEditingBio = false;
        this.successMessage = 'تم تحديث النبذة بنجاح';
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = 'فشل تحديث النبذة';
        console.error('Error updating bio:', err);
      }
    });
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
    if (!this.profileUser) {
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
    formData.append('userId', this.profileUser.id);
    // Append properly with filename (3rd arg)
    formData.append('image', file, file.name);

    this.http.post<any>(`${environment.apiBaseUrl}/users/profile-image`, formData).subscribe({
      next: (res) => {
        this.isUploadingImage = false;

        // Resolve URL before assigning
        const resolvedUrl = this.getProfileImageUrl(res.imageUrl);
        this.profileImage = resolvedUrl;

        if (this.profileUser && resolvedUrl) {
          this.profileUser.profileImage = resolvedUrl;
        }

        // Critical Fix: Ensure token is preserved to prevent logout
        if (!this.profileUser!.token) {
          // ... (rest of logic)
          const storedUserStr = localStorage.getItem('user');
          if (storedUserStr) {
            try {
              const storedUser = JSON.parse(storedUserStr);
              if (storedUser.token) {
                this.profileUser!.token = storedUser.token;
              }
            } catch (e) {
              console.error('Error parsing stored user for token recovery', e);
            }
          }
        }

        this.authService.setUser(this.profileUser!); // Persist to auth service
        this.successMessage = 'تم تحديث الصورة الشخصية بنجاح';
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: (err) => {
        this.isUploadingImage = false;
        const errorMsg = err.error?.message || err.message || 'فشل رفع الصورة';
        alert('حدث خطأ أثناء رفع الصورة الشخصية: ' + errorMsg);
        console.error('Upload error:', err);
      }
    });
  }

  uploadCoverImage(file: File) {
    if (!this.profileUser) {
      alert('خطأ: لا يوجد مسجل دخول');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('خطأ: حجم الصورة كبير جداً (أقصى حد 5 ميجابايت)');
      return;
    }

    this.isUploadingCover = true;
    const formData = new FormData();
    formData.append('userId', this.profileUser.id);
    formData.append('image', file, file.name);

    this.http.post<any>(`${environment.apiBaseUrl}/users/cover-image`, formData).subscribe({
      next: (res) => {
        this.isUploadingCover = false;
        const resolvedUrl = this.getProfileImageUrl(res.imageUrl);
        this.coverPhoto = resolvedUrl;

        if (this.profileUser && resolvedUrl) {
          this.profileUser.coverPhoto = resolvedUrl;
          this.authService.setUser(this.profileUser);
        }

        this.successMessage = 'تم تحديث صورة الغلاف بنجاح';
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: (err) => {
        this.isUploadingCover = false;
        const errorMsg = err.error?.message || err.message || 'فشل رفع الغلاف';
        alert('حدث خطأ أثناء رفع صورة الغلاف: ' + errorMsg);
        console.error('Upload cover error:', err);
      }
    });
  }

  handleCreatePostClick() {
    this.showCreatePost = true;
  }

  createPost() {
    if (!this.newPost.content.trim()) return;
    if (!this.profileUser) return;
    
    this.isPostsLoading = true;
    this.communityService.createPost({
        userId: this.profileUser.id,
        content: this.newPost.content,
        type: this.newPost.type as any,
        bookTitle: this.newPost.type === 'review' ? this.newPost.bookTitle : undefined,
        rating: this.newPost.type === 'review' ? this.newPost.rating : undefined
    } as any).subscribe({
        next: (res) => {
            this.successMessage = '✅ تم نشر المنشور بنجاح!';
            this.showCreatePost = false;
            this.newPost = { content: '', type: 'thought', bookTitle: '', rating: 0 };
            
            // Refresh posts
            this.loadUserPosts(this.profileUser!.id);
            
            // Refresh gamification profile to show new coin balance
            this.gamificationService.getProfile().subscribe(p => {
              if (p.success) this.gamificationProfile = p.data;
            });
            
            setTimeout(() => this.successMessage = null, 3000);
        },
        error: (err: any) => {
            console.error('Create Post Error:', err);
            this.errorMessage = `❌ ${err.error?.message || 'فشل نشر المنشور. يرجى المحاولة مرة أخرى.'}`;
            this.isPostsLoading = false;
            setTimeout(() => this.errorMessage = null, 5000);
        }
    });
  }

  ngOnDestroy() {
    this.closeCamera();
  }
}