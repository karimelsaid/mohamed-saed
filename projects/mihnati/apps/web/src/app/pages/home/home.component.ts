import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, CategoryItem, GovernorateItem } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

export interface FeaturedPro {
  id: string;
  name: string;
  profession: string;
  governorate: string;
  rating: number;
  reviewsCount: number;
  avatarUrl?: string;
  verified: boolean;
  avatarBg: string;
  avatarEmoji: string;
}

export interface FeaturedProduct {
  id: string;
  title: string;
  priceEgp: number;
  category: string;
  badge?: string;
  imageUrl?: string;
  productEmoji: string;
}

export interface CategoryCard {
  id: string;
  nameAr: string;
  slug: string;
  iconSvg: string;
  bgColor: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);

  searchQuery = signal<string>('');
  selectedGov = signal<string>('cairo');
  governorates = signal<GovernorateItem[]>([]);

  // 10 categories matching concept image
  categories = signal<CategoryCard[]>([
    {
      id: 'plumbing',
      nameAr: 'السباكة',
      slug: 'plumbing',
      bgColor: '#EFF6FF',
      iconSvg: 'plumbing'
    },
    {
      id: 'electricity',
      nameAr: 'الكهرباء',
      slug: 'electricity',
      bgColor: '#FEF9C3',
      iconSvg: 'electricity'
    },
    {
      id: 'carpentry',
      nameAr: 'النجارة',
      slug: 'carpentry',
      bgColor: '#FFF7ED',
      iconSvg: 'carpentry'
    },
    {
      id: 'blacksmith',
      nameAr: 'الحدادة',
      slug: 'blacksmith',
      bgColor: '#F1F5F9',
      iconSvg: 'blacksmith'
    },
    {
      id: 'alumital',
      nameAr: 'الألوميتال',
      slug: 'alumital',
      bgColor: '#F0FDF4',
      iconSvg: 'alumital'
    },
    {
      id: 'painting',
      nameAr: 'النقاشة',
      slug: 'painting',
      bgColor: '#FAF5FF',
      iconSvg: 'painting'
    },
    {
      id: 'hvac',
      nameAr: 'صيانة الأجهزة',
      slug: 'hvac',
      bgColor: '#ECFEFF',
      iconSvg: 'hvac'
    },
    {
      id: 'building',
      nameAr: 'مواد البناء',
      slug: 'building',
      bgColor: '#FFF1F2',
      iconSvg: 'building'
    },
    {
      id: 'tools',
      nameAr: 'الأدوات والمعدات',
      slug: 'tools',
      bgColor: '#FEF3C7',
      iconSvg: 'tools'
    },
    {
      id: 'paints',
      nameAr: 'الدهانات',
      slug: 'paints',
      bgColor: '#F0FDFA',
      iconSvg: 'paints'
    }
  ]);

  // Featured professionals from concept image
  featuredPros = signal<FeaturedPro[]>([
    {
      id: 'pro_1',
      name: 'أحمد محمود',
      profession: 'سباك محترف',
      governorate: 'القاهرة',
      rating: 4.9,
      reviewsCount: 124,
      verified: true,
      avatarBg: '#0284C7',
      avatarEmoji: '👨‍🔧'
    },
    {
      id: 'pro_2',
      name: 'محمد علي',
      profession: 'حداد محترف',
      governorate: 'الجيزة',
      rating: 4.8,
      reviewsCount: 98,
      verified: true,
      avatarBg: '#EA580C',
      avatarEmoji: '👷'
    },
    {
      id: 'pro_3',
      name: 'علي السيد',
      profession: 'نجار محترف',
      governorate: 'الشرقية',
      rating: 4.9,
      reviewsCount: 156,
      verified: true,
      avatarBg: '#16A34A',
      avatarEmoji: '🪚'
    },
    {
      id: 'pro_4',
      name: 'محمود حسن',
      profession: 'كهربائي محترف',
      governorate: 'القاهرة',
      rating: 4.7,
      reviewsCount: 89,
      verified: true,
      avatarBg: '#CA8A04',
      avatarEmoji: '⚡'
    }
  ]);

  // Featured products from concept image
  featuredProducts = signal<FeaturedProduct[]>([
    {
      id: 'prod_1',
      title: 'مثقاب كهربائي',
      priceEgp: 2250,
      category: 'الأدوات والمعدات',
      productEmoji: '🛠️'
    },
    {
      id: 'prod_2',
      title: 'طقم وصلات سباكة',
      priceEgp: 350,
      category: 'أدوات سباكة',
      productEmoji: '🔩'
    },
    {
      id: 'prod_3',
      title: 'دهان ممتاز',
      priceEgp: 620,
      category: 'الدهانات',
      productEmoji: '🪣'
    }
  ]);

  ngOnInit(): void {
    this.loadGovernorates();
  }

  loadGovernorates(): void {
    this.apiService.getGovernorates().subscribe({
      next: (res) => {
        if (res.data && res.data.length > 0) {
          this.governorates.set(res.data);
        }
      },
      error: () => {}
    });
  }

  onSearch(): void {
    const query = this.searchQuery();
    const gov = this.selectedGov();
    this.router.navigate(['/services'], {
      queryParams: {
        q: query || undefined,
        governorateId: gov !== 'all' ? gov : undefined
      }
    });
  }

  requestService(pro: FeaturedPro): void {
    this.router.navigate(['/orders'], {
      queryParams: {
        proId: pro.id,
        proName: pro.name,
        profession: pro.profession
      }
    });
  }

  addToCart(prod: FeaturedProduct): void {
    // Navigate to products or show alert
    this.router.navigate(['/products'], {
      queryParams: {
        selected: prod.id
      }
    });
  }
}
