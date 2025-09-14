import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-merchant-profile',
  templateUrl: './merchant-profile.component.html',
  styleUrls: ['./merchant-profile.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class MerchantProfileComponent implements OnInit {
  merchantId: string | null = null;
  merchant: any = null;
  products: any[] = [];
  loading = false;
  error: string | null = null;
  uploadsBaseUrl = '/uploads'; // Add this property for image base URL

  constructor(private route: ActivatedRoute, private merchantAuthService: MerchantAuthService) {}

  ngOnInit(): void {
    this.merchantId = this.route.snapshot.paramMap.get('id');
    if (this.merchantId) {
      this.loadMerchantData(this.merchantId);
      this.loadMerchantProducts(this.merchantId);
    } else {
      this.error = 'معرف التاجر غير موجود.';
    }
  }

  loadMerchantData(id: string) {
    this.loading = true;
    this.merchantAuthService.getMerchantById(id).subscribe({
      next: (res: any) => {
        this.merchant = res.merchant || res;
        this.loading = false;
      },
      error: (err: any) => {
        this.error = 'فشل في تحميل بيانات التاجر.';
        this.loading = false;
      }
    });
  }

  loadMerchantProducts(id: string) {
    this.merchantAuthService.getProductsByMerchantId(id).subscribe({
      next: (res: any) => {
        this.products = res.products || res || [];
      },
      error: (err: any) => {
        this.error = 'فشل في تحميل منتجات التاجر.';
      }
    });
  }
}
