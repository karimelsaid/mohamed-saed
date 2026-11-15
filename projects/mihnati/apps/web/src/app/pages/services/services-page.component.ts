import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService, ServiceItem, CategoryItem, GovernorateItem } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

export interface CraftsmanResult {
  id: string;
  name: string;
  profession: string;
  governorate: string;
  locality?: string;
  rating: number;
  reviewsCount: number;
  startingPriceEgp: number;
  experienceYears: number;
  availableNow: boolean;
  avatarBg: string;
  avatarEmoji: string;
  bio: string;
  workAreas: string;
  portfolio: { title: string; emoji: string }[];
  servicesOffered: { title: string; priceEgp: number }[];
  reviews: { author: string; rating: number; comment: string; date: string }[];
}

@Component({
  selector: 'app-services-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './services-page.component.html',
  styleUrls: ['./services-page.component.css']
})
export class ServicesPageComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly authService = inject(AuthService);

  // Filters State matching ui-ux-overview.png
  searchQuery = '';
  selectedGovId = '';
  selectedProfessions: Record<string, boolean> = {
    plumbing: true,
    electric: true,
    carpentry: false,
    blacksmith: false,
    alumital: false,
    painting: false
  };
  minRating = signal<number>(4);
  priceFrom = signal<number | null>(null);
  priceTo = signal<number | null>(null);

  // Data
  services = signal<ServiceItem[]>([]);
  categories = signal<CategoryItem[]>([]);
  governorates = signal<GovernorateItem[]>([]);
  isLoading = signal<boolean>(false);

  // Profile Modal State
  selectedCraftsman = signal<CraftsmanResult | null>(null);
  activeProfileTab = signal<'about' | 'portfolio' | 'services' | 'reviews'>('about');

  // Request Service Modal inside Profile
  showRequestModal = signal<boolean>(false);
  requestNotes = '';
  requestSubmitted = signal<boolean>(false);

  // Mocked/rich craftsmen results matching ui-ux-overview.png
  allCraftsmen: CraftsmanResult[] = [
    {
      id: 'pro_1',
      name: 'أحمد محمود',
      profession: 'سباك محترف',
      governorate: 'القاهرة',
      locality: 'مدينة نصر، مصر الجديدة',
      rating: 4.9,
      reviewsCount: 120,
      startingPriceEgp: 150,
      experienceYears: 15,
      availableNow: true,
      avatarBg: '#0284C7',
      avatarEmoji: '👨‍🔧',
      bio: 'أعمل في مجال السباكة منذ أكثر من 15 سنة، وأقدم خدمات احترافية بجودة عالية وأسعار مناسبة مع ضمان على كافة الأعمال وقطع الغيار الأصلية.',
      workAreas: 'داخل مناطق القاهرة الكبرى والتجمع والجيزة',
      portfolio: [
        { title: 'تأسيس وتشطيب حمام كامل', emoji: '🚿' },
        { title: 'تركيب خلاطات وسخانات غاز', emoji: '🚰' },
        { title: 'عزل مائي وشبكات صرف', emoji: '🔧' }
      ],
      servicesOffered: [
        { title: 'تركيب وصيانة السباكة المنزلية', priceEgp: 200 },
        { title: 'كشف تسريبات المياه إلكترونياً', priceEgp: 350 },
        { title: 'صيانة وتوصيل سخانات ومضخات المياه', priceEgp: 180 }
      ],
      reviews: [
        { author: 'محمد إبراهيم', rating: 5, comment: 'شغل ممتاز ومحترم جداً ودقة في المواعيد وأمانة في التسعير.', date: 'منذ يومين' },
        { author: 'سامح حسن', rating: 5, comment: 'فني ممتاز وسريع وحل المشكلة في أقل من ساعة، أنصح به بشدة.', date: 'منذ أسبوع' }
      ]
    },
    {
      id: 'pro_2',
      name: 'محمد علي',
      profession: 'حداد محترف',
      governorate: 'الجيزة',
      locality: 'الدقي، المهندسين',
      rating: 4.8,
      reviewsCount: 95,
      startingPriceEgp: 250,
      experienceYears: 12,
      availableNow: true,
      avatarBg: '#EA580C',
      avatarEmoji: '🧑‍🏭',
      bio: 'متخصص في أعمال الكريتال والحدادة والأبواب المصفحة والمظلات والمظلات الحديدية وحماية الشبابيك بجودة وتشطيب عالي.',
      workAreas: 'محافظة الجيزة والقاهرة الكبرى',
      portfolio: [
        { title: 'بوابة فيلا حديد مشغول', emoji: '🚪' },
        { title: 'حماية شبابيك ودربزين سلالم', emoji: '⚒️' }
      ],
      servicesOffered: [
        { title: 'تفصيل وتركيب بوابات حديد', priceEgp: 1200 },
        { title: 'صيانة ولحام مفصلات وأقفال', priceEgp: 250 }
      ],
      reviews: [
        { author: 'هاني رضوان', rating: 5, comment: 'صنايعي شاطر جداً وتفصيل الباب طلع أحسن من الكتالوج.', date: 'منذ 3 أيام' }
      ]
    },
    {
      id: 'pro_3',
      name: 'علي عبد الرحمن',
      profession: 'نجار محترف',
      governorate: 'الجيزة',
      locality: 'الهرم، فيصل',
      rating: 4.7,
      reviewsCount: 88,
      startingPriceEgp: 180,
      experienceYears: 10,
      availableNow: false,
      avatarBg: '#16A34A',
      avatarEmoji: '🪚',
      bio: 'تصنيع وصيانة غرف النوم والمطابخ والأبواب الخشبية وتركيب الكوالين والإكسسوارات.',
      workAreas: 'الجيزة وغرب القاهرة',
      portfolio: [
        { title: 'مطبخ خشب زان حديث', emoji: '🪑' },
        { title: 'تصليح وضبط دواليب وأبواب', emoji: '🚪' }
      ],
      servicesOffered: [
        { title: 'فك وتركيب غرف ومطابخ', priceEgp: 450 },
        { title: 'صيانة أبواب وكوالين', priceEgp: 180 }
      ],
      reviews: [
        { author: 'خالد السعيد', rating: 4, comment: 'شغل جيد وملتزم بالموعد.', date: 'منذ أسبوعين' }
      ]
    },
    {
      id: 'pro_4',
      name: 'محمود حسن',
      profession: 'كهربائي محترف',
      governorate: 'القاهرة',
      locality: 'المعادي، حلوان',
      rating: 4.8,
      reviewsCount: 110,
      startingPriceEgp: 160,
      experienceYears: 14,
      availableNow: true,
      avatarBg: '#CA8A04',
      avatarEmoji: '⚡',
      bio: 'فني كهرباء منازل وتأسيس شقق ولوحات قواطع وأنظمة إضاءة ليد وإنتركم وتشطيبات فاخرة.',
      workAreas: 'المعادي والمقطم والتجمع والقاهرة',
      portfolio: [
        { title: 'تأسيس لوحة كهرباء أوتوماتيك', emoji: '🔌' },
        { title: 'تركيب إضاءات ليد ونجف', emoji: '💡' }
      ],
      servicesOffered: [
        { title: 'صيانة أعطال الكهرباء المنزلية', priceEgp: 160 },
        { title: 'تركيب نجف ووحدات إضاءة', priceEgp: 200 }
      ],
      reviews: [
        { author: 'عادل يوسف', rating: 5, comment: 'شغل هندسي ونظيف جداً وسريع البديهة في كشف الشورت.', date: 'منذ 4 أيام' }
      ]
    }
  ];

  filteredCraftsmen = signal<CraftsmanResult[]>([]);

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['governorateId']) this.selectedGovId = params['governorateId'];
      if (params['q']) this.searchQuery = params['q'];
      this.applyFilters();
    });

    this.loadGovernorates();
  }

  loadGovernorates(): void {
    this.apiService.getGovernorates().subscribe({
      next: (res) => this.governorates.set(res.data),
      error: () => {}
    });
  }

  applyFilters(): void {
    let list = [...this.allCraftsmen];

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.profession.toLowerCase().includes(q) || c.governorate.toLowerCase().includes(q));
    }

    if (this.selectedGovId && this.selectedGovId !== 'all') {
      const govName = this.selectedGovId === 'cairo' ? 'القاهرة' : (this.selectedGovId === 'giza' ? 'الجيزة' : this.selectedGovId);
      list = list.filter((c) => c.governorate.includes(govName));
    }

    if (this.minRating() > 0) {
      list = list.filter((c) => c.rating >= this.minRating());
    }

    this.filteredCraftsmen.set(list);
  }

  openProfile(craftsman: CraftsmanResult): void {
    this.selectedCraftsman.set(craftsman);
    this.activeProfileTab.set('about');
    this.showRequestModal.set(false);
    this.requestSubmitted.set(false);
  }

  closeProfile(): void {
    this.selectedCraftsman.set(null);
  }

  setTab(tab: 'about' | 'portfolio' | 'services' | 'reviews'): void {
    this.activeProfileTab.set(tab);
  }

  openRequestModal(): void {
    this.showRequestModal.set(true);
    this.requestSubmitted.set(false);
  }

  submitServiceRequest(): void {
    this.requestSubmitted.set(true);
    setTimeout(() => {
      this.showRequestModal.set(false);
      this.requestNotes = '';
    }, 2000);
  }
}
