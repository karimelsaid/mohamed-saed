import { Component, OnInit, ViewChild, ElementRef, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ModalDialogComponent } from '../../shared/modal-dialog/modal-dialog.component';

@Component({
  selector: 'app-add-product',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModalDialogComponent],
  templateUrl: './add-product.component.html',
  styleUrls: ['./add-product.component.css']
})
export class AddProductComponent implements OnInit, OnDestroy {
  productForm: FormGroup;
  loading = false;
  selectedFiles: File[] = [];
  imagePreviews: string[] = [];
  isApproved = false;
  isLoading = true;

  // Modal properties
  showSuccessModal = false;
  modalTitle = '';
  modalMessage = '';
  confirmButtonText = '';
  cancelButtonText = '';
  onConfirm: (() => void) | null = null;
  onCancel: (() => void) | null = null;

  bookCategories = [
    'روايات وقصص',
    'تاريخ وسير ذاتية',
    'قواميس ومراجع',
    'كتب دينية',
    'صحة وطب وعلوم',
    'تطوير الذات وعلم النفس',
    'أعمال وتسويق ومالية',
    'فنون وحرف',
    'تربية وأطفال',
    'أخرى'
  ];

  @ViewChild('videoElement') videoElement!: ElementRef;
  @ViewChild('canvasElement') canvasElement!: ElementRef;

  showCameraModal = false;
  cameraStream: MediaStream | null = null;
  errorMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private merchantAuthService: MerchantAuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.productForm = this.fb.group({
      product_name: ['', Validators.required],
      product_price: ['', [Validators.required, Validators.min(0)]],
      product_description: ['', Validators.required],
      category: [''],
      book_category: [''],
      stock_quantity: [0, Validators.min(0)],
      price_cost: [''],
      copyType: [''],
      condition: ['']
    });
  }

  ngOnInit() {
    this.checkMerchantApproval();
  }

  private checkMerchantApproval() {
    // Get current merchant data from service
    const currentMerchant = this.merchantAuthService.getCurrentMerchant();

    if (currentMerchant) {
      this.isApproved = currentMerchant.approved || false;
      this.isLoading = false;

      if (!this.isApproved) {
        console.log('🔍 Unapproved merchant trying to access add-product component');
        alert('حسابك قيد المراجعة من قبل الإدارة. لا يمكنك إضافة منتجات حتى يتم الموافقة على حسابك.');
        this.router.navigate(['/merchant/dashboard']);
        return;
      }
    } else {
      // If no merchant data in localStorage, fetch from API
      this.merchantAuthService.getCurrentMerchantFromAPI().subscribe({
        next: (response: any) => {
          this.isApproved = response.merchant?.approved || false;
          this.isLoading = false;

          if (!this.isApproved) {
            console.log('🔍 Unapproved merchant trying to access add-product component');
            alert('حسابك قيد المراجعة من قبل الإدارة. لا يمكنك إضافة منتجات حتى يتم الموافقة على حسابك.');
            this.router.navigate(['/merchant/dashboard']);
          }
        },
        error: (error: any) => {
          console.error('❌ Error fetching merchant data in component:', error);
          this.isLoading = false;
          alert('حدث خطأ في تحميل بيانات الحساب. يرجى تسجيل الدخول مرة أخرى.');
          this.router.navigate(['/login']);
        }
      });
    }
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (this.selectedFiles.length >= 3) break;

        const file = files[i];
        if (file.size > 1 * 1024 * 1024) { // 1MB limit
          alert('حجم هذه الصورة يتجاوز 1 ميجابايت. يرجى اختيار صورة أخرى أو تقليل حجمها.');
          continue;
        }
        this.selectedFiles.push(file);

        const reader = new FileReader();
        reader.onload = (e) => {
          this.imagePreviews.push(e.target?.result as string);
          this.cdr.detectChanges();
        };
        reader.readAsDataURL(file);
      }
    }
  }

  removeImage(index: number) {
    this.selectedFiles.splice(index, 1);
    this.imagePreviews.splice(index, 1);
  }

  // --- Camera Logic ---
  currentFacingMode: 'user' | 'environment' = 'environment';

  async openCamera() {
    console.log('📸 Opening camera request...');
    this.showCameraModal = true;
    this.cdr.detectChanges(); // Force update to ensure modal exists in DOM

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('متصفحك لا يدعم الوصول إلى الكاميرا');
      this.showCameraModal = false;
      return;
    }

    try {
      console.log('📸 Requesting media stream with mode:', this.currentFacingMode);

      if (this.cameraStream) {
        this.cameraStream.getTracks().forEach(track => track.stop());
        this.cameraStream = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.currentFacingMode }
      });

      // CRITICAL FIX: Check if modal was closed while waiting for stream
      if (!this.showCameraModal) {
        console.log('📸 Modal closed during initialization, stopping stream.');
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      this.cameraStream = stream;
      console.log('📸 Stream obtained:', this.cameraStream);

      setTimeout(() => {
        if (this.videoElement && this.videoElement.nativeElement) {
          console.log('📸 Assigning stream to video element');
          this.videoElement.nativeElement.srcObject = this.cameraStream;
          this.videoElement.nativeElement.muted = true;
          this.videoElement.nativeElement.style.transform = this.currentFacingMode === 'user' ? 'scaleX(-1)' : 'none';

          this.videoElement.nativeElement.play().then(() => {
            console.log('📸 Video playing');
          }).catch((e: any) => console.error('📸 Video play error:', e));
        } else {
          console.error('📸 Video element not found!');
          alert('حدث خطأ في عرض الكاميرا (Video Element not found)');
        }
      }, 300);
    } catch (err: any) {
      console.error('❌ Error accessing camera:', err);
      // Explicit alert for the user
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('تم رفض إذن الوصول للكاميرا.');
      } else {
        alert('تعذر فتح الكاميرا: ' + (err.message || err));
      }
      this.showCameraModal = false;
    }
  }

  closeCamera() {
    this.showCameraModal = false;
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
  }

  switchCamera() {
    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    this.openCamera(); // Re-open camera with the new facing mode
  }

  captureImage() {
    if (this.videoElement && this.canvasElement) {
      if (this.selectedFiles.length >= 3) {
        alert('يمكنك إضافة 3 صور كحد أقصى');
        this.closeCamera();
        return;
      }

      const video = this.videoElement.nativeElement;
      const canvas = this.canvasElement.nativeElement;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob: Blob) => {
        if (blob) {
          // Check blob size before adding
          if (blob.size > 1 * 1024 * 1024) { // 1MB limit
            alert('حجم هذه الصورة يتجاوز 1 ميجابايت. يرجى اختيار صورة أخرى أو تقليل حجمها.');
            this.closeCamera();
            return;
          }

          // Create file from blob
          const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: "image/jpeg" });

          // Add to selected files
          this.selectedFiles.push(file);

          // Generate preview
          const reader = new FileReader();
          reader.onload = (e) => {
            this.imagePreviews.push(e.target?.result as string);
            this.cdr.detectChanges();
          };
          reader.readAsDataURL(file);

          this.closeCamera();
        }
      }, 'image/jpeg');
    }
  }

  ngOnDestroy() {
    this.closeCamera();
  }

  onSubmit() {
    // Double-check approval status before submitting
    if (!this.isApproved) {
      alert('حسابك قيد المراجعة من قبل الإدارة. لا يمكنك إضافة منتجات حتى يتم الموافقة على حسابك.');
      this.router.navigate(['/merchant/dashboard']);
      return;
    }

    if (this.productForm.valid && this.selectedFiles.length > 0) {
      this.loading = true;
      const formData = new FormData();
      formData.append('product_name', this.productForm.value.product_name);
      formData.append('product_price', this.productForm.value.product_price);
      formData.append('product_description', this.productForm.value.product_description);
      formData.append('product_quantity', this.productForm.value.stock_quantity);
      formData.append('price_cost', this.productForm.value.price_cost || '0');
      formData.append('product_category', this.productForm.value.category === 'كتب' ? this.productForm.value.book_category : this.productForm.value.category);
      formData.append('copyType', this.productForm.value.copyType || '');
      formData.append('condition', this.productForm.value.condition || '');

      this.selectedFiles.forEach((file, index) => {
        formData.append('images', file);
      });

      this.merchantAuthService.addMerchantProduct(formData).subscribe({
        next: (response: any) => {
          console.log('Product added successfully:', response);
          this.loading = false;
          this.showSuccessModal = true;
          this.modalTitle = 'تم إضافة المنتج بنجاح!';
          this.modalMessage = 'تم إضافة منتجك بنجاح وهو الآن قيد المراجعة من قبل الإدارة.';
          this.confirmButtonText = 'إضافة منتج آخر';
          this.cancelButtonText = 'الذهاب للوحة التحكم';
          this.onConfirm = () => this.addAnotherProduct();
          this.onCancel = () => this.goToDashboard();
        },
        error: (error: any) => {
          console.error('Error adding product:', error);
          this.loading = false;

          // Handle specific error cases
          if (error.status === 403 && error.error?.message?.includes('قيد المراجعة')) {
            alert('حسابك قيد المراجعة من قبل الإدارة. لا يمكنك إضافة منتجات حتى يتم الموافقة على حسابك.');
            this.router.navigate(['/merchant/dashboard']);
          } else {
            alert('فشل في إضافة المنتج. يرجى المحاولة مرة أخرى.');
          }
        }
      });
    } else {
      alert('يرجى ملء جميع الحقول المطلوبة واختيار صورة للمنتج.');
    }
  }

  cancel() {
    this.router.navigate(['/merchant/dashboard']);
  }

  addAnotherProduct() {
    this.showSuccessModal = false;
    // Reset the form
    this.productForm.reset({
      stock_quantity: 0,
      price_cost: ''
    });
    this.selectedFiles = [];
    this.imagePreviews = [];
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToDashboard() {
    this.showSuccessModal = false;
    this.router.navigate(['/merchant/dashboard']);
  }
}
