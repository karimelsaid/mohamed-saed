import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MerchantAuthService } from '../../services/merchant-auth.service';
import { environment } from '../../../environments/environment';
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
  username: string | null = null;
  merchant: any = null;
  products: any[] = [];
  loading = false;
  error: string | null = null;
  uploadsBaseUrl = environment.uploadsBaseUrl; // Use environment variable

  constructor(private route: ActivatedRoute, private merchantAuthService: MerchantAuthService) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.username = params.get('username');
      if (this.username) {
        this.loadMerchantData(this.username);
      } else {
        this.error = 'اسم التاجر غير موجود.';
        this.loading = false;
      }
    });
  }

  loadMerchantData(username: string) {
    this.loading = true;
    this.error = null;
    this.merchantAuthService.getMerchantByUsername(username).subscribe({
      next: (res: any) => {
        if (res.success && res.merchant) {
          this.merchant = res.merchant;
          this.loadMerchantProducts(this.merchant._id); // Load products using the ID
        } else {
          this.error = res.message || 'لا يمكن العثور على التاجر.';
          this.loading = false;
        }
      },
      error: (err: any) => {
        console.error('Error loading merchant data:', err);
        this.error = 'لا يمكن العثور على التاجر.';
        this.loading = false;
      }
    });
  }

  loadMerchantProducts(id: string) {
    this.merchantAuthService.getProductsByMerchantId(id).subscribe({ // This function remains the same
      next: (res: any) => {
        this.products = res.products || res || [];
        this.loading = false; // Stop loading after products are fetched
      },
      error: (err: any) => {
        this.error = 'فشل في تحميل منتجات التاجر.';
        this.loading = false;
      }
    });
  }

  getProductImageUrl(product: any): string {
    // This logic is now consistent with other working components like search-results.
    let imagePath = product.image_path || product.product_image || '';
    const merchantName = product.merchantName || (this.merchant ? (this.merchant.merchantName || this.merchant.name) : null);

    // If a full path is already provided in image_path, use it directly.
    if (imagePath && imagePath.startsWith('/uploads/books/')) {
      // The path is already correct, just return it.
      return imagePath;
    }

    // If not, build the path from scratch
    const imageId = product.products_id || product.product_image;
    if (!imageId) {
      return '/assets/placeholder-book.jpg';
    }

    let finalPath;
    if (merchantName) {
      finalPath = `merchant_${merchantName}/${imageId}/${imageId}.webp`;
    } else {
      // Fallback to admin path if no merchant name is found
      finalPath = `admin__karim_mohamed__/${imageId}/${imageId}.webp`;
    }

    // Construct the full path, ensuring not to duplicate '/books/'
    // uploadsBaseUrl is likely '/uploads' or '/uploads/books'
    // The final path should be /uploads/books/merchant_...
    const fullPath = `${this.uploadsBaseUrl}/${finalPath}`.replace('/books/books/', '/books/');
    return fullPath;
  }
}
