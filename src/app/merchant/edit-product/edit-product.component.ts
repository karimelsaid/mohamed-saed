import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-edit-product',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-product.component.html',
  styleUrls: ['./edit-product.component.css']
})
export class EditProductComponent implements OnInit {
  product: any = {};
  loading = false;
  saving = false;
  productId: string = '';
  selectedFile: File | null = null;
  imagePreview: string | null = null;

  categories = [
    'رواية',
    'تنمية',
    'ديني',
    'قاموس',
    'صحة',
    'اعمال',
    'فن',
    'تاريخ',
    'تربية'
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private merchantAuthService: MerchantAuthService
  ) {}

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

  saveProduct() {
    if (!this.product.product_name || !this.product.product_quantity || !this.product.product_category) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    this.saving = true;

    // Check if product is approved - if so, submit update request
    if (this.product.status === 'approved') {
      const updateData = {
        product_name: this.product.product_name,
        product_quantity: parseInt(this.product.product_quantity, 10),
        product_category: this.product.product_category,
        product_description: this.product.product_description,
        product_price: parseFloat(this.product.product_price) || 0,
        price_cost: parseFloat(this.product.price_cost) || 0
      };

      this.merchantAuthService.submitProductUpdateRequest(this.productId, updateData).subscribe({
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
