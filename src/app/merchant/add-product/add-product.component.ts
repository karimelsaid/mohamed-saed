import { Component } from '@angular/core';
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
export class AddProductComponent {
  productForm: FormGroup;
  loading = false;
  selectedFile: File | null = null;
  imagePreview: string | null = null;

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
    'تنمية بشرية',
    'أعمال وإدارة',
    'فنون وثقافة',
    'تربية وتعليم',
    'أخرى'
  ];

  constructor(
    private fb: FormBuilder,
    private merchantAuthService: MerchantAuthService,
    private router: Router
  ) {
    this.productForm = this.fb.group({
      product_name: ['', Validators.required],
      product_price: ['', [Validators.required, Validators.min(0)]],
      product_description: ['', Validators.required],
      category: [''],
      book_category: [''],
      stock_quantity: [0, Validators.min(0)],
      price_cost: ['']
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  onSubmit() {
    if (this.productForm.valid && this.selectedFile) {
      this.loading = true;
      const formData = new FormData();
      formData.append('product_name', this.productForm.value.product_name);
      formData.append('product_price', this.productForm.value.product_price);
      formData.append('product_description', this.productForm.value.product_description);
      formData.append('product_quantity', this.productForm.value.stock_quantity);
      formData.append('price_cost', this.productForm.value.price_cost || '0');
      formData.append('product_category', this.productForm.value.category === 'كتب' ? this.productForm.value.book_category : this.productForm.value.category);
      formData.append('image', this.selectedFile);

      this.merchantAuthService.addMerchantProduct(formData).subscribe({
        next: (response) => {
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
        error: (error) => {
          console.error('Error adding product:', error);
          this.loading = false;
          alert('فشل في إضافة المنتج. يرجى المحاولة مرة أخرى.');
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
    this.selectedFile = null;
    this.imagePreview = null;
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToDashboard() {
    this.showSuccessModal = false;
    this.router.navigate(['/merchant/dashboard']);
  }
}
