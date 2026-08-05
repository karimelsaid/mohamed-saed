import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-edit-product',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-product.component.html',
  styleUrls: ['./edit-product.component.css']
})
export class EditProductComponent implements OnInit {
  product: any = {
    copyType: '',
    condition: '',
    weight: 0,
    length: 0,
    width: 0,
    height: 0
  };
  loading = false;
  saving = false;
  productId: string = '';

  // Image handling
  selectedFiles: File[] = [];
  imagePreviews: string[] = [];
  imageUrls: string[] = []; // Existing image URLs

  // Camera handling
  showCameraModal = false;
  @ViewChild('video') videoElement!: ElementRef;
  @ViewChild('canvas') canvasElement!: ElementRef;
  stream: MediaStream | null = null;

  categories = [
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

  generalCategories = [
    'كتب',
    'أدوات مكتبية',
    'إلكترونيات',
    'ملابس',
    'تجميل',
    'احذية',
    'اثاث',
    'العاب',
    'أقمشة',
    'أخرى'
  ];

  generalCategory: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private merchantAuthService: MerchantAuthService
  ) { }

  ngOnInit(): void {
    this.productId = this.route.snapshot.params['id'];
    if (this.productId) {
      this.loadProduct();
    } else {
      alert('معرف المنتج غير صحيح');
      this.router.navigate(['/merchant/dashboard']);
    }
  }

  loadProduct() {
    this.loading = true;
    this.merchantAuthService.getMerchantProducts().subscribe({
      next: (res: any) => {
        const products = res.products || [];
        this.product = products.find((p: any) => p._id === this.productId);
        if (!this.product) {
          alert('المنتج غير موجود');
          this.router.navigate(['/merchant/dashboard']);
          return;
        }

        if (this.product.images && this.product.images.length > 0) {
          this.imageUrls = [...this.product.images];
        } else if (this.product.product_image) {
          this.imageUrls = [this.product.product_image];
        }

        // Determine general category
        if (this.product.product_category) {
          if (this.categories.includes(this.product.product_category)) {
            this.generalCategory = 'كتب';
            // book_category is the actual product_category
            this.product.book_category = this.product.product_category;
          } else {
            this.generalCategory = this.product.product_category;
          }
        }

        this.loading = false;
      },
      error: () => {
        alert('فشل في تحميل المنتج');
        this.loading = false;
        this.router.navigate(['/merchant/dashboard']);
      }
    });
  }

  handleFiles(files: FileList) {
    if (files.length + this.selectedFiles.length + this.imageUrls.length > 3) {
      alert('يمكنك إضافة حتى 3 صور فقط للمنتج');
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 1 * 1024 * 1024) { // 1MB limit
        alert(`حجم الصورة "${file.name}" يتجاوز 1 ميجابايت. يرجى اختيار صورة أصغر.`);
        continue;
      }
      this.selectedFiles.push(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreviews.push(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  onFilesSelected(event: any) {
    const files = event.target.files;
    if (files) {
      this.handleFiles(files);
    }
  }

  onFileDropped(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (files) {
      this.handleFiles(files);
    }
  }

  removeExistingImage(index: number) {
    this.imageUrls.splice(index, 1);
  }

  removeNewImage(index: number) {
    this.selectedFiles.splice(index, 1);
    this.imagePreviews.splice(index, 1);
  }

  // Camera methods
  async startCamera() {
    this.showCameraModal = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setTimeout(() => {
        if (this.videoElement) {
          this.videoElement.nativeElement.srcObject = this.stream;
        }
      }, 100);
    } catch (err) {
      console.error('Error accessing camera:', err);
      alert('تعذر الوصول إلى الكاميرا');
      this.showCameraModal = false;
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.showCameraModal = false;
  }

  captureImage() {
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob((blob: Blob | null) => {
      if (blob) {
        const file = new File([blob], `camera_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        this.selectedFiles.push(file);
        this.imagePreviews.push(canvas.toDataURL('image/jpeg'));
        this.stopCamera();
      }
    }, 'image/jpeg', 0.8);
  }

  getProductImageUrl(imagePath: string): string {
    if (!imagePath) return 'assets/no-book.png';
    // If it's a full URL or blob
    if (imagePath.startsWith('http') || imagePath.startsWith('blob:') || imagePath.startsWith('data:')) {
      return imagePath;
    }
    // If it's a relative path from the backend
    if (imagePath.includes('/')) {
      return `${environment.uploadsBaseUrl}/books/${imagePath}`;
    }
    // Legacy support: relative path from uploads/books/
    return `${environment.uploadsBaseUrl}/books/${imagePath}${imagePath.includes('.') ? '' : '.webp'}`;
  }

  saveProduct() {
    // Merge categories
    if (this.generalCategory === 'كتب') {
      if (!this.product.book_category) {
        alert('يرجى اختيار فئة الكتاب');
        return;
      }
      this.product.product_category = this.product.book_category;
    } else {
      if (!this.generalCategory) {
        alert('يرجى اختيار الفئة');
        return;
      }
      this.product.product_category = this.generalCategory;
    }

    if (!this.product.product_name || !this.product.product_quantity) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    this.saving = true;

    // Check if product is approved - if so, submit update request
    if (this.product.status === 'approved' || this.product.status === 'pending_update') {
      const formData = new FormData();
      formData.append('product_name', this.product.product_name);
      formData.append('product_quantity', parseInt(this.product.product_quantity, 10).toString());
      formData.append('product_category', this.product.product_category);
      formData.append('product_description', this.product.product_description || '');
      formData.append('product_price', (parseFloat(this.product.product_price) || 0).toString());
      formData.append('price_cost', (parseFloat(this.product.price_cost) || 0).toString());
      formData.append('copyType', this.product.copyType || '');
      formData.append('condition', this.product.condition || '');
      formData.append('weight', (parseFloat(this.product.weight) || 0).toString());
      formData.append('length', (parseFloat(this.product.length) || 0).toString());
      formData.append('width', (parseFloat(this.product.width) || 0).toString());
      formData.append('height', (parseFloat(this.product.height) || 0).toString());
      formData.append('productType', this.product.productType || 'physical');
      formData.append('amazonAsin', this.product.amazonAsin || '');
      
      // Send remaining existing images as a JSON string
      formData.append('existingImages', JSON.stringify(this.imageUrls));

      // Append new selected files
      this.selectedFiles.forEach((file) => {
        formData.append('images', file);
      });

      this.merchantAuthService.submitProductUpdateRequest(this.productId, formData).subscribe({
        next: (res: any) => {
          if (res.success) {
            alert('تم إرسال طلب تحديث المنتج بنجاح. سيتم مراجعته من قبل الإدارة.');
            this.saving = false;
            this.router.navigate(['/merchant/dashboard']);
          } else {
            alert('فشل في إرسال طلب التحديث: ' + (res.message || 'خطأ غير معروف'));
            this.saving = false;
          }
        },
        error: (error) => {
          console.error('Error submitting update request:', error);
          alert('حدث خطأ أثناء إرسال طلب التحديث');
          this.saving = false;
        }
      });
    } else {
      // For pending products, show message that they need to wait for approval first
      alert('لا يمكن تعديل المنتج حتى يتم الموافقة عليه من قبل الإدارة');
      this.saving = false;
    }
  }

  cancel() {
    this.router.navigate(['/merchant/dashboard']);
  }
}
