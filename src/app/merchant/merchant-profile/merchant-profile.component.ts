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

  constructor(private route: ActivatedRoute, private merchantAuthService: MerchantAuthService) { }

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
    let imagePath = product.image_path || product.product_image || '';
    const merchantName = product.merchantName || (this.merchant ? (this.merchant.merchantName || this.merchant.name) : null);

    // If a full path is already provided in image_path, use it directly.
    if (imagePath && imagePath.startsWith('/uploads/books/')) {
      return imagePath;
    }

    // If not, build the path from scratch
    const imageId = product.products_id || product.product_image;
    if (!imageId) {
      return '/assets/placeholder-book.jpg';
    }

    let finalPath = String(imageId);

    // Check if it's just an ID or has extension
    if (!finalPath.includes('/') && !finalPath.includes('.')) {
      // It's just an ID
      const id = finalPath;
      if (merchantName) {
        const sanitizedMerchantName = merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        finalPath = `merchant_${sanitizedMerchantName}/${id}/${id}.webp`;
      } else {
        finalPath = `admin__karim_mohamed__/${id}/${id}.webp`;
      }
    } else if (!finalPath.includes('/')) {
      // It has an extension or suffix (e.g. 123.webp or 123_1.webp)
      // Try to extract ID
      const id = finalPath.split('.')[0].split('_')[0];
      if (merchantName) {
        const sanitizedMerchantName = merchantName.replace(/[^a-zA-Z0-9\u0600-\u06FF-_]/g, '_');
        finalPath = `merchant_${sanitizedMerchantName}/${id}/${finalPath}`;
      } else {
        finalPath = `admin__karim_mohamed__/${id}/${finalPath}`;
      }
    }

    // Construct the full path
    // uploadsBaseUrl is likely '/uploads/books' or similar. 
    // We want to avoid double slashes and ensure correct structure.
    return `${this.uploadsBaseUrl}/${finalPath}`.replace('/books/books/', '/books/');
  }

  getBookSlug(bookName: string): string {
    return bookName.trim().replace(/\s+/g, '-');
  }

  getProductRoute(product: any): any[] {
    const slug = this.getBookSlug(product.product_name);
    const categoryRoutes: { [key: string]: string } = {
      'أدوات مكتبية': 'office-supplies',
      'إلكترونيات': 'electronics',
      'ملابس': 'clothing',
      'التجميل والعناية الشخصية': 'cosmetics',
      'الأحذية': 'shoes',
      'أثاث': 'furniture',
      'ألعاب': 'games',
      'أقمشة': 'fabrics',
      'كتب': 'book',
      'روايات وقصص': 'book',
      'تطوير الذات وعلم النفس': 'book',
      'كتب دينية': 'book',
      'أعمال وتسويق ومالية': 'book',
      'صحة وطب وعلوم': 'book',
      'تاريخ وسير ذاتية': 'book',
      'تربية وأطفال': 'book',
      'فنون وحرف': 'book',
      'قواميس ومراجع': 'book'
    };

    const category = (product.product_category || '').trim();
    let route = categoryRoutes[category];

    if (!route) {
      route = 'others';
    }

    let productId = product.products_id;

    if (!productId && product.product_image) {
      const imagePath = String(product.product_image);
      // If it's a simple filename or ID, try to extract the ID
      if (!imagePath.includes('/')) {
        productId = imagePath.split('.')[0].split('_')[0];
      }
    }

    if (!productId) {
      productId = product._id || product.id;
    }

    return ['/' + route, productId, slug];
  }
}
