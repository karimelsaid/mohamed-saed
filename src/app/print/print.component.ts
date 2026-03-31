import { Component, OnInit, ViewChild, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth/auth.service';
import { AccountModalComponent } from '../auth/account-modal/account-modal.component';
import { FreeShippingService, FreeShippingRules } from '../services/free-shipping.service';
import { AdminService } from '../services/admin.service';
import { User } from '../auth/user.model';
import governoratesData from '../../../public/json/egypt-governorates.json';
import { take } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AccountModalComponent
  ],
  selector: 'app-print',
  templateUrl: './print.component.html',
  styleUrls: ['./print.component.css']
})
export class PrintComponent implements OnInit {
  currentStep: number = 1;
  totalSteps: number = 3;

  projects: any[] = [];
  userId: string = ''; // سيتم تعيينه من خدمة المصادقة
  uploadResponse: any = null;
  uploading: boolean = false;
  uploadProgress: number = 0;
  uploadSuccess: boolean = false;
  errorMessage: string = '';
  showModal: boolean = false;
  modalType: 'success' | 'error' = 'success';
  showUploadModal: boolean = false;
  modalMessage: string = '';

  showPreviousProjects: boolean = false;
  previousOrders: any[] = [];

  validationErrors: any[] = [];
  isLoggedIn: boolean = false;
  showAuthModal: boolean = false;
  private modalOpened = false;

  @ViewChild(AccountModalComponent) accountModal!: AccountModalComponent;

  // Shipping properties
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
  shippingCost: number = 0;
  totalPrice: number = 0;

  isEditingAddress: boolean = false;
  editedUserProfile: User | null = null;
  userProfile: User | null = null;
  governorates: any[] = governoratesData.governorates;
  cities: string[] = [];
  phoneValid: boolean = true;
  phoneTouched: boolean = false;
  locationValid: boolean = true;

  // API Base URL from environment
  private apiUrl = environment.apiBaseUrl;

  freeShippingRules: FreeShippingRules = {
    minQuantity: 3,
    minOrderValue: 0,
    userGroups: [],
    includedProducts: [],
    includedCategories: [],
    includedGovernorates: [],
    freeShippingEnabled: true,
    codFee: 10,
    communityShippingCost: 70,
    swapShippingCost: 70,
    auctionShippingCost: 70
  };

  printingSettings: any = {
    paperTypes: [],
    printers: [],
    coverPrices: { soft: 25.0, hard: 60.0, luxuryLeather: 100.0 }
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService,
    private freeShippingService: FreeShippingService,
    private adminService: AdminService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: any
  ) { }

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      this.isLoggedIn = !!user;
      this.userId = user ? user.id : '';
      if (user) {
        this.loadUserProfile();
      } else {
        this.previousOrders = [];
        this.userProfile = null;
        this.editedUserProfile = null;
        this.shippingCost = 0;
        this.calculateTotalPrice();
      }
    });
    this.loadFreeShippingRules();
    this.loadPrintingSettings();
  }

  ngAfterViewChecked(): void {
    // This lifecycle hook ensures that the view is updated before we try to open the modal.
    // It's a robust way to solve the "double click" issue.
    if (this.showAuthModal && this.accountModal && !this.modalOpened) {
      this.accountModal.openModal();
      this.modalOpened = true;
      this.cdr.detectChanges();
    }
  }

  togglePreviousProjects() {
    this.showPreviousProjects = !this.showPreviousProjects;
    if (this.showPreviousProjects && this.userId) {
      this.loadPreviousOrders();
    }
  }

  loadPreviousOrders() {
    console.log('🔄 Loading previous orders for userId:', this.userId);
    if (!this.userId) {
      console.error('❌ Cannot load orders: userId is missing/empty');
      return;
    }
    // Use environment.apiBaseUrl
    this.http.get<any[]>(`${this.apiUrl}/users/${this.userId}/print-orders`).subscribe({
      next: (orders) => {
        console.log('✅ Previous orders loaded:', orders);
        this.previousOrders = orders;
      },
      error: (err) => {
        console.error('❌ Failed to load previous orders:', err);
        this.modalMessage = 'فشل في تحميل المشاريع السابقة.';
        this.modalType = 'error';
        this.showModal = true;
      }
    });
  }

  reorderProject(project: any) {
    const newProject = { ...project, file: null, estimatedPrice: 0 };
    delete newProject.filename;
    delete newProject.filepath;
    delete newProject.createdAt;
    delete newProject._id;
    this.projects = [newProject];
    this.showPreviousProjects = false;
  }

  addProject() {
    if (!this.isLoggedIn) {
      this.showAuthModal = true;
      this.modalOpened = false; // Reset flag when trying to open the modal
      return;
    }
    this.projects.push({
      file: null,
      size: '',
      coverType: '',
      printColor: '',
      pages: null,
      fromPage: 1,
      toPage: null,
      paperColor: '#FFFFFF', // Default to white
      copies: null,
      notes: '',
      projectTitle: '',
      coverPrintingType: 'ديجيتال', // New field
      estimatedPrice: 0, // Add estimatedPrice property
      loadingPages: false // Added to track loading state
    });
    this.validationErrors.push({});
  }

  nextStep() {
    if (this.canGoNext()) {
      if (this.currentStep === 2) {
        this.saveUserProfile();
      }
      this.currentStep++;
      window.scrollTo(0, 0);
    }
  }

  saveUserProfile() {
    if (!this.editedUserProfile || !this.userId) return;

    // Prepare update payload
    const updateData: any = {
      governorate: this.editedUserProfile.governorate,
      city: this.editedUserProfile.city,
      village: this.editedUserProfile.village,
      phone: this.editedUserProfile.phone
    };

    // Call API to update profile
    this.http.put(`${this.apiUrl}/users/update-profile/${this.userId}`, updateData).subscribe({
      next: () => console.log('✅ User profile updated successfully'),
      error: (err) => console.error('❌ Failed to update profile:', err)
    });
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      window.scrollTo(0, 0);
    }
  }

  canGoNext(): boolean {
    if (this.currentStep === 1) {
      return this.projects.length > 0 && this.validateProjects();
    } else if (this.currentStep === 2) {
      return this.isAddressComplete;
    }
    return true;
  }

  goToStep(step: number) {
    if (step >= 1 && step <= this.totalSteps) {
      // Allow going back to previous steps
      if (step < this.currentStep) {
        this.currentStep = step;
        window.scrollTo(0, 0);
      } else if (step > this.currentStep && this.canGoNext()) {
        this.currentStep = step;
        window.scrollTo(0, 0);
      }
    }
  }

  removeProject(index: number) {
    this.projects.splice(index, 1);
    this.validationErrors.splice(index, 1);
  }

  async onFileChange(event: any, index: number) {
    if (!isPlatformBrowser(this.platformId)) return;

    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      this.projects[index].file = file;
      this.projects[index].loadingPages = true;
      this.clearValidationError(index, 'file');
      this.cdr.detectChanges();

      try {
        console.log('PDF: Starting processing for file:', file.name, 'Size:', file.size);

        // Timeout for the whole process (30 seconds for larger files or slow networks)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 30000)
        );

        const processPromise = (async () => {
          try {
            console.log('PDF: Importing pdfjs-dist...');
            const pdfjsModule = await import('pdfjs-dist');
            const pdfjsLib: any = (pdfjsModule as any).default || pdfjsModule;
            console.log('PDF: pdfjs-dist imported, version:', pdfjsLib.version);

            // Use unpkg for worker - generally more consistent for this purpose
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
              const version = pdfjsLib.version || '5.4.296';
              pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
              console.log('PDF: Worker source set to:', pdfjsLib.GlobalWorkerOptions.workerSrc);
            }

            console.log('PDF: Reading file as ArrayBuffer...');
            const arrayBuffer = await file.arrayBuffer();

            console.log('PDF: Getting document...');
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

            // Add progress logging
            loadingTask.onProgress = (progress: any) => {
              if (progress.total > 0) {
                console.log(`PDF: Loading progress: ${Math.round(progress.loaded / progress.total * 100)}%`);
              }
            };

            const pdf = await loadingTask.promise;
            console.log('PDF: Document loaded, numPages:', pdf.numPages);
            return pdf.numPages;
          } catch (innerError: any) {
            console.error('PDF: Inner processing error:', innerError);
            throw innerError;
          }
        })();

        const totalPages = await Promise.race([processPromise, timeoutPromise]) as number;

        this.projects[index].pages = totalPages;
        this.projects[index].fromPage = 1;
        this.projects[index].toPage = totalPages;
        this.projects[index].loadingPages = false;

        this.updateEstimatedPrice(index);
        this.cdr.detectChanges();
        console.log('PDF: UI Updated with pages:', totalPages);
      } catch (error: any) {
        console.error('PDF: Top level error:', error);
        this.projects[index].loadingPages = false;
        this.cdr.detectChanges();

        let errorMsg = 'حدث خطأ أثناء قراءة صفحات الملف.';
        if (error.message === 'Timeout') {
          errorMsg = 'استغرق تحميل الصفحات وقتاً طويلاً (30 ثانية). يرجى التأكد من استقرار الاتصال بالإنترنت.';
        } else {
          errorMsg += `\n\nتفاصيل الخطأ: ${error.message || 'خطأ غير معروف'}`;
          if (error.name) errorMsg += ` (${error.name})`;
        }

        alert(errorMsg);
      }
    } else {
      alert('Please select a PDF file.');
      event.target.value = '';
    }
  }

  clearValidationError(index: number, field: string) {
    if (this.validationErrors[index]) {
      delete this.validationErrors[index][field];
    }
  }

  closeAuthModal() {
    this.showAuthModal = false;
    this.modalOpened = false; // Reset flag when modal is closed
  }

  validateProjects(): boolean {
    let isValid = true;
    this.validationErrors = [];

    this.projects.forEach((project, i) => {
      const errors: any = {};
      if (!project.file) {
        errors.file = true;
        isValid = false;
      }
      if (!project.projectTitle || project.projectTitle.trim() === '') {
        errors.projectTitle = true;
        isValid = false;
      }
      if (!project.size) {
        errors.size = true;
        isValid = false;
      }
      if (!project.coverType) {
        errors.coverType = true;
        isValid = false;
      }
      if (!project.printColor) {
        errors.printColor = true;
        isValid = false;
      }
      if (!project.paperColor) {
        errors.paperColor = true;
        isValid = false;
      }
      if (!project.pages || project.pages < 1) {
        errors.pages = true;
        isValid = false;
      }
      if (!project.copies || project.copies < 1) {
        errors.copies = true;
        isValid = false;
      }
      this.validationErrors[i] = errors;
    });

    return isValid;
  }

  loadPrintingSettings() {
    this.adminService.getPrintingSettings().subscribe({
      next: (settings) => {
        if (settings) {
          this.printingSettings = settings;
          // Recalculate prices if projects exist
          this.projects.forEach((_, i) => this.updateEstimatedPrice(i));
          this.calculateTotalPrice();
        }
      },
      error: (err) => console.error('Failed to load printing settings:', err)
    });
  }

  calculatePrice(project: any) {
    if (!this.printingSettings || !this.printingSettings.paperTypes || this.printingSettings.paperTypes.length === 0) return 0;

    const pages = project.pages || 0;
    const fromPage = project.fromPage || 1;
    const toPage = project.toPage || pages;
    const pagesToPrint = (toPage - fromPage + 1);

    const copies = project.copies || 0;
    if (pagesToPrint <= 0 || copies <= 0) return 0;

    // 1. Paper Cost
    const paper = this.printingSettings.paperTypes.find((p: any) => p.name === project.size) || this.printingSettings.paperTypes[0];
    let paperKey: 'white' | 'yellow' | 'creamy' = 'white';
    if (project.paperColor === '#DED5AF' || project.paperColor === 'yellow') paperKey = 'yellow';
    else if (project.paperColor === '#F5F5DC' || project.paperColor === 'creamy') paperKey = 'creamy';

    const paperPricePerSheet = paper.prices[paperKey] || 0;

    // Logic for sheets (Duplex is not yet in project object, but we follow standard 2 pages per sheet for now)
    // Actually, let's keep it simple: 1 page = 1 sheet cost if user didn't specify duplex
    const sheetsCount = pagesToPrint;
    const totalPaperCost = sheetsCount * paperPricePerSheet;

    // 2. Ink Cost
    let inkCostTotal = 0;
    const printer = this.printingSettings.printers[0]; // Use first printer as baseline
    if (printer) {
      const isColor = project.printColor === 'ألوان' || project.printColor === 'Color';
      const yieldValue = isColor ? printer.pageYieldColor : printer.pageYieldBW;
      const priceValue = isColor ? printer.inkPriceColor : printer.inkPriceBW;

      const inkCostPerPage = (yieldValue > 0) ? (priceValue / yieldValue) : 0;
      inkCostTotal = inkCostPerPage * pagesToPrint;
    }

    // 3. Cover price
    let coverPrice = 0;
    if (project.coverType === 'غلاف ورقي' || project.coverType === 'Soft Cover') {
      coverPrice = this.printingSettings.coverPrices.soft || 25;
    } else if (project.coverType === 'غلاف مجلد' || project.coverType === 'Hard Cover' || project.coverType === 'غلاف كرتوني') {
      coverPrice = this.printingSettings.coverPrices.hard || 60;
    } else if (project.coverType === 'جلد فاخر' || project.coverType === 'Luxury Leather' || project.coverType === 'غلاف جلد فاخر') {
      coverPrice = this.printingSettings.coverPrices.luxuryLeather || 100;
    } else if (project.coverType === 'بدون غلاف' || project.coverType === 'none') {
      coverPrice = 0;
    }

    const totalCost = (totalPaperCost + inkCostTotal + coverPrice);

    // 4. Default Profit Margin (Assume 50% if not specified, or we could add it to settings)
    const profitMargin = 50;
    const finalPrice = totalCost + (totalCost * (profitMargin / 100));

    return Math.ceil(finalPrice * copies);
  }

  updateEstimatedPrice(index: number) {
    const project = this.projects[index];
    project.estimatedPrice = this.calculatePrice(project);
  }

  getPaperPrice(size: string, colorKey: string): number {
    if (!this.printingSettings || !this.printingSettings.paperTypes) return 0;
    const paper = this.printingSettings.paperTypes.find((p: any) => p.name === size);
    if (!paper) return 0;

    let key: 'white' | 'yellow' | 'creamy' = 'white';
    if (colorKey === '#DED5AF' || colorKey === 'yellow') key = 'yellow';
    else if (colorKey === '#F5F5DC' || colorKey === 'creamy') key = 'creamy';

    return paper.prices[key] || 0;
  }

  deleteOrder(orderId: string, index: number) {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.')) {
      return;
    }
    // Use environment.apiBaseUrl
    this.http.delete(`${this.apiUrl}/print/orders/${this.userId}/${orderId}`).subscribe({
      next: () => {
        this.previousOrders.splice(index, 1);
      },
      error: (err: any) => {
        this.modalMessage = 'فشل حذف الطلب. يرجى المحاولة مرة أخرى.';
        this.modalType = 'error';
        this.showModal = true;
      }
    });
  }
  onProjectChange(index: number) {
    this.updateEstimatedPrice(index);
    this.calculateTotalPrice();
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
            // Set phoneTouched to true if phone exists and is valid to enable dynamic validation
            if (this.editedUserProfile && this.editedUserProfile.phone) {
              const egyptPhoneRegex = /^(010|011|012|015)[0-9]{8}$/;
              this.phoneTouched = egyptPhoneRegex.test(this.editedUserProfile.phone);
              this.phoneValid = this.phoneTouched;
            }
            // Set post office details from user profile
            if (this.userProfile?.postOffice) {
              this.postOfficeGovernorate = this.userProfile.postOffice.governorate || '';
              this.postOfficeCity = this.userProfile.postOffice.city || '';
              this.postOfficeName = this.userProfile.postOffice.name || '';
              this.postOfficeAddress = this.userProfile.postOffice.address || '';
              this.onPostOfficeGovernorateChange();
            }
            this.cdr.markForCheck(); // Notify Angular to check for changes
          },
          error: (err) => {
            console.error('خطأ في جلب بيانات المستخدم:', err);
          }
        });
      }
    });
  }

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

  calculateShippingCost(): void {
    if (this.isPickup) {
      this.shippingCost = 0;
      this.calculateTotalPrice();
      return;
    }
    if (this.isPostOffice) {
      // Use post_office_cost for post office shipping
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
    console.log('freeShippingRules object:', this.freeShippingRules);
    console.log('freeShippingEnabled:', this.freeShippingRules.freeShippingEnabled);
    if (!this.freeShippingRules.freeShippingEnabled) {
      // If free shipping is disabled, calculate shipping normally
      this.calculateShippingCostNormal();
      return;
    }

    const totalPrice = this.projects.reduce((total, project) => total + (project.estimatedPrice || 0), 0);

    console.log('totalPrice:', totalPrice);
    console.log('minOrderValue:', this.freeShippingRules.minOrderValue);

    // Check free shipping conditions
    if (totalPrice >= this.freeShippingRules.minOrderValue) {
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
    const itemsTotal = this.projects.reduce((total, project) => total + (project.estimatedPrice || 0), 0);
    this.totalPrice = Math.ceil(itemsTotal + this.shippingCost);
  }

  onDeliveryTypeChange() {
    this.isPickup = this.deliveryType === 'pickup';
    this.isPostOffice = this.deliveryType === 'postOffice';
    if (this.isPostOffice && this.userProfile) {
      // Set post office fields to match user profile or load existing postOffice
      this.postOfficeGovernorate = this.userProfile!.postOffice?.governorate || this.userProfile!.governorate || '';
      this.postOfficeCity = this.userProfile!.postOffice?.city || this.userProfile!.city || '';
      this.onPostOfficeGovernorateChange(); // Update cities list
      this.isEditingPostOffice = false; // Start with disabled fields
      // Load post office name and address from user profile if exists
      this.postOfficeName = this.userProfile!.postOffice?.name || '';
      this.postOfficeAddress = this.userProfile!.postOffice?.address || '';
    } else {
      // Reset post office fields when changing delivery type
      this.postOfficeName = '';
      this.postOfficeGovernorate = '';
      this.postOfficeCity = '';
      this.postOfficeAddress = '';
      this.postOfficeCities = [];
      this.isEditingPostOffice = false;
    }
    this.calculateShippingCost();
    // Address confirmation removed as per user request
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
    }
  }

  onPostOfficeGovernorateChange() {
    const selectedGov = this.governorates.find(g => g.governorate_name === this.postOfficeGovernorate);
    this.postOfficeCities = selectedGov ? selectedGov.cities : [];
    if (!this.postOfficeCities.includes(this.postOfficeCity)) {
      this.postOfficeCity = '';
    }
    this.calculateShippingCost();
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

  onEditAddress() {
    this.isEditingAddress = true;
  }

  cancelEditAddress() {
    this.isEditingAddress = false;
    if (this.userProfile && this.editedUserProfile) {
      this.editedUserProfile = { ...this.userProfile };
      this.calculateShippingCost();
    }
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
    // Note: Assuming DataService is available, but since it's not imported, we'll skip for now
    // this.dataService.updateUserProfile(this.userProfile).subscribe({...});
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
    // Reset post office name and address to empty when canceling
    this.postOfficeName = '';
    this.postOfficeAddress = '';
  }

  saveEditPostOffice() {
    if (!this.userProfile) return;

    // Validate governorate, city, and required fields
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

    // Update userProfile with post office data
    this.userProfile.postOffice = {
      name: this.postOfficeName,
      address: this.postOfficeAddress,
      governorate: this.postOfficeGovernorate,
      city: this.postOfficeCity
    };

    this.editedUserProfile = { ...this.userProfile };
    this.isEditingPostOffice = false;
    this.calculateShippingCost();

    // Save post office details to user profile immediately
    // Use environment.apiBaseUrl
    this.http.put(`${this.apiUrl}/users/update-profile/${this.userProfile.id}`, { postOffice: this.userProfile.postOffice }).subscribe({
      next: () => console.log('Post office details saved to user profile.'),
      error: (err: any) => console.error('Failed to save post office details:', err)
    });
  }

  get isAddressComplete(): boolean {
    if (this.deliveryType === 'pickup') return true;
    if (this.deliveryType === 'postOffice') {
      return this.postOfficeGovernorate.trim().length > 0 &&
        this.postOfficeCity.trim().length > 0 &&
        this.postOfficeAddress.trim().length > 0;
    }
    if (!this.editedUserProfile) return false;
    const governorate = this.editedUserProfile?.governorate ?? '';
    const city = this.editedUserProfile?.city ?? '';
    const village = this.editedUserProfile?.village ?? '';
    const phone = this.editedUserProfile?.phone ?? '';

    // Dynamic validation
    const egyptPhoneRegex = /^(010|011|012|015)[0-9]{8}$/;
    const isPhoneValid = egyptPhoneRegex.test(phone);
    const isLocationValid = governorate.trim().length > 0 &&
      city.trim().length > 0 &&
      // Check if governorate is valid selection
      this.governorates.some(g => g.governorate_name === governorate);

    return (
      governorate.trim().length > 0 &&
      city.trim().length > 0 &&
      village.trim().length > 0 &&
      phone.trim().length > 0 &&
      isPhoneValid &&
      isLocationValid
    );
  }

  submit() {
    if (!this.isLoggedIn) {
      this.showAuthModal = true;
      if (this.accountModal) {
        this.accountModal.openModal();
      }
      return;
    }

    if (this.projects.length === 0) {
      this.showModal = true;
      this.modalType = 'error';
      this.modalMessage = 'أدخل مشروع الطباعة أولاً';
      return;
    }

    if (!this.validateProjects()) {
      this.showModal = true;
      this.modalType = 'error';
      this.modalMessage = 'يجب إكمال البيانات';
      return;
    }

    if (!this.isAddressComplete) {
      this.showModal = true;
      this.modalType = 'error';
      this.modalMessage = 'يجب إكمال بيانات الشحن قبل إرسال الطلب';
      return;
    }

    // Address confirmation removed as per user request

    const formData = new FormData();
    const projectsData = this.projects.map(p => ({
      size: p.size,
      coverType: p.coverType,
      printColor: p.printColor,
      paperColor: p.paperColor || 'أبيض',
      pages: p.pages,
      fromPage: p.fromPage,
      toPage: p.toPage,
      copies: p.copies,
      notes: p.notes,
      projectTitle: p.projectTitle
    }));

    this.projects.forEach(p => {
      if (p.file) {
        formData.append('files', p.file, p.file.name);
      }
    });

    formData.append('projectsData', JSON.stringify(projectsData));
    formData.append('userId', this.userId);

    // Add shipping data
    const shippingDetails: any = {
      shippingCost: this.shippingCost,
      totalAmount: this.totalPrice,
      deliveryType: this.deliveryType,
      isPickup: this.isPickup,
      isPostOffice: this.isPostOffice,
    };

    // Add address data based on delivery type
    if (this.isPickup) {
      shippingDetails.pickupLocation = this.pickupLocation;
    } else if (this.isPostOffice) {
      shippingDetails.governorate = this.postOfficeGovernorate;
      shippingDetails.city = this.postOfficeCity;
      shippingDetails.address = this.postOfficeAddress;
      shippingDetails.name = this.postOfficeName;
      shippingDetails.phone = this.userProfile?.phone || '';
    } else {
      // Home delivery
      shippingDetails.governorate = this.userProfile?.governorate || this.editedUserProfile?.governorate || '';
      shippingDetails.city = this.userProfile?.city || this.editedUserProfile?.city || '';
      shippingDetails.village = this.userProfile?.village || this.editedUserProfile?.village || '';
      shippingDetails.phone = this.userProfile?.phone || this.editedUserProfile?.phone || '';
    }
    formData.append('shippingAddress', JSON.stringify(shippingDetails));

    this.uploading = true;
    this.uploadProgress = 0;
    this.showUploadModal = true; // Show upload progress modal immediately
    // Use environment.apiBaseUrl
    this.http.post(`${this.apiUrl}/print/upload`, formData, {
      reportProgress: true,
      observe: 'events'
    }).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress = Math.round(100 * event.loaded / event.total);
        } else if (event.type === HttpEventType.Response) {
          this.uploadResponse = event.body;
          this.showUploadModal = false;
          this.uploading = false;
          this.showModal = true;
          this.modalType = 'success';
          this.modalMessage = 'تم إرسال الطلب بنجاح! سيتم التواصل معك قريباً.';
        }
      },
      error: (err) => {
        this.uploading = false;
        this.showUploadModal = false;
        console.error('❌ Upload Error:', err);
        this.showModal = true;
        this.modalType = 'error';
        // Detailed error message for debugging
        const status = err.status || 'Unknown';
        const msg = err.error?.message || err.message || 'فشل في إرسال الطلب.';
        this.modalMessage = `خطأ (${status}): ${msg}`;
      }
    });
  }

  closeModal() {
    this.showModal = false;
  }

  addNewProject() {
    this.projects = [];
    this.addProject();
    this.currentStep = 1;
    this.showModal = false;
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
