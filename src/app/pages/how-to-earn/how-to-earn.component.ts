import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { environment } from '../../../environments/environment';
import {
  faBookOpen,
  faCoins,
  faWallet,
  faCheckCircle,
  faUsers,
  faTrophy,
  faArrowLeft,
  faCrown,
  faBriefcase,
  faStore
} from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-how-to-earn',
  templateUrl: './how-to-earn.component.html',
  styleUrls: ['./how-to-earn.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, FontAwesomeModule]
})
export class HowToEarnComponent implements OnInit {

  // Icons
  faBookOpen = faBookOpen;
  faCoins = faCoins;
  faWallet = faWallet;
  faCheckCircle = faCheckCircle;
  faUsers = faUsers;
  faTrophy = faTrophy;
  faArrowLeft = faArrowLeft;
  faCrown = faCrown;
  faBriefcase = faBriefcase;
  faStore = faStore;

  // Live Stats
  activeReaders = 127;
  coinsEarnedToday = 3214;
  lastWithdrawalMinutes = 12;

  // Calculator
  readingMinutes = 20;
  estimatedCoins = 0;
  estimatedEGP = 0;

  // Settings
  readingPointsPerMinute = 1;
  coinExchangeRate = 50;

  steps = [
    {
      icon: faBookOpen,
      title: 'الربح من القراءة 📚',
      description: 'كل دقيقة محسوبة بدقة. اقرأ يوميًا = عملات بتدخل محفظتك تلقائي.',
      badge: { text: 'يومي', color: 'bg-blue-100 text-blue-700' }
    },
    {
      icon: faUsers,
      title: 'الربح من الإحالات 🤝',
      description: 'كنزك الحقيقي! كل صديق نشيط = دخل متكرر ليك مدى الحياة.',
      badge: { text: 'الأكثر ربحًا 🔥', color: 'bg-red-100 text-red-700 animate-pulse' }
    },
    {
      icon: faTrophy,
      title: 'المسابقات والتحديات 🏆',
      description: 'منافسة ومكسب. شارك – التزم – اكسب جوائز ضخمة وكاش.',
      badge: { text: 'جوائز', color: 'bg-yellow-100 text-yellow-700' }
    },
    {
      icon: faStore,
      title: 'استبدال العملات 🪙',
      description: 'عملاتك ليها استخدام حقيقي: كتب – اشتراكات – خصومات – سحب كاش.',
      badge: { text: 'مرونة', color: 'bg-green-100 text-green-700' }
    },
    {
      icon: faCrown,
      title: 'ربح إضافي للمميزين 🌟',
      description: 'مستواك = قيمتك. كل ما تعلى، بتاخد مكافآت أعلى وأولوية سحب.',
      badge: { text: 'VIP', color: 'bg-purple-100 text-purple-700' }
    },
    {
      icon: faBriefcase,
      title: 'للتجار وصناع المحتوى 💼',
      description: 'عندك منتج أو جمهور؟ حوّله لدخل حقيقي من خلال كنوز بوك.',
      button: { text: 'سجل كتاجر ➜', link: '/register', queryParams: { type: 'merchant' } }
    }
  ];

  testimonials = [
    {
      name: 'أحمد محمد',
      role: 'قارئ ماسي 💎',
      coins: 5200,
      text: 'مكونتش متخيل إن القراءة ممكن تكون مصدر دخل. جمعت 5000 عملة في شهر واشتريت بيهم كتب كنت محتاجها.',
      image: null // Use default avatar
    },
    {
      name: 'سارة علي',
      role: 'قارئ محترف 🌟',
      coins: 3150,
      text: 'الموقع ده غير مفهومي عن القراءة. العداد بيشجعني أخلص كتب أكتر، وفي الآخر بلاقي مكافأة حقيقية.',
      image: 'https://i.pravatar.cc/150?u=sara'
    }
  ];

  constructor(private router: Router, private http: HttpClient) {
    this.calculateEarnings();
    this.simulateLiveStats();
  }

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    this.http.get<any>(`${environment.apiBaseUrl}/admin/settings`).subscribe({
      next: (settings) => {
        if (settings) {
          this.readingPointsPerMinute = settings.gamification?.readingPointsPerMinute || 1;
          this.coinExchangeRate = settings.economy?.coinExchangeRate || 50;
          this.calculateEarnings();
        }
      },
      error: (err) => console.error('Error loading settings', err)
    });
  }

  startReading() {
    this.router.navigate(['/library']);
  }

  // Calculator Logic
  calculateEarnings() {
    // Assumption: 1 minute = X coin (from settings)
    const dailyCoins = this.readingMinutes * this.readingPointsPerMinute;
    this.estimatedCoins = dailyCoins * 30; // 30 days
    this.estimatedEGP = (this.estimatedCoins / this.coinExchangeRate);
  }

  onMinutesChange() {
    this.calculateEarnings();
  }

  simulateLiveStats() {
    setInterval(() => {
      // Randomly fluctuate active readers slightly
      const change = Math.floor(Math.random() * 5) - 2;
      this.activeReaders = Math.max(100, this.activeReaders + change);

      // Increment coins occasionally
      if (Math.random() > 0.7) {
        this.coinsEarnedToday += Math.floor(Math.random() * 10) + 5;
      }

      // Update last withdrawal time randomly to keep it fresh
      if (Math.random() > 0.95) {
        this.lastWithdrawalMinutes = Math.floor(Math.random() * 15) + 1;
      }
    }, 5000);
  }
}
