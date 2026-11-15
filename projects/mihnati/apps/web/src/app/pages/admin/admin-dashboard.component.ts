import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

export interface AdminKpi {
  totalUsers: number;
  ordersToday: number;
  salesTodayEgp: number;
  commissionsTodayEgp: number;
}

export interface RecentOrder {
  id: string;
  customerName: string;
  providerName: string;
  serviceType: string;
  amountEgp: number;
  commissionEgp: number;
  status: 'completed' | 'in_progress' | 'disputed';
  time: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);

  activeTab = signal<'overview' | 'users' | 'orders' | 'stores' | 'commissions' | 'gates'>('overview');

  // Stats matching ui-ux-overview.png
  kpis = signal<AdminKpi>({
    totalUsers: 28560,
    ordersToday: 1250,
    salesTodayEgp: 156750,
    commissionsTodayEgp: 37500
  });

  // Recent platform transactions matching ui-ux-overview.png
  recentOrders = signal<RecentOrder[]>([
    {
      id: 'ORD-9021',
      customerName: 'قاسم رستم',
      providerName: 'أحمد محمود (سباك)',
      serviceType: 'تأسيس شبكة مياه',
      amountEgp: 2400,
      commissionEgp: 240,
      status: 'completed',
      time: 'منذ 10 دقائق'
    },
    {
      id: 'ORD-9020',
      customerName: 'نغم مرعي',
      providerName: 'محمد علي (حداد)',
      serviceType: 'تركيب باب حماية',
      amountEgp: 1850,
      commissionEgp: 185,
      status: 'in_progress',
      time: 'منذ 25 دقيقة'
    },
    {
      id: 'ORD-9019',
      customerName: 'أريج قاسم',
      providerName: 'محمود حسن (كهربائي)',
      serviceType: 'صيانة قواطع وتمديد ليد',
      amountEgp: 650,
      commissionEgp: 65,
      status: 'completed',
      time: 'منذ ساعة'
    },
    {
      id: 'ORD-9018',
      customerName: 'طارق عبد الله',
      providerName: 'متجر النور للأدوات',
      serviceType: 'شراء دريل ومعدات سباكة',
      amountEgp: 1600,
      commissionEgp: 160,
      status: 'completed',
      time: 'منذ ساعتين'
    }
  ]);

  // Launch Gates status (AC-E20)
  launchGates = [
    { id: 'gateA', name: 'قاعدة البيانات والهجرات (Database & Migrations)', status: 'passed', note: 'كافة الـ 19 هجرة مطبقة بنجاح' },
    { id: 'gateB', name: 'الضوابط المالية والتسويات (Financial Controls)', status: 'passed', note: 'حساب القروش السليم ومطابقة العمولات' },
    { id: 'gateC', name: 'حظر الاستهداف الحساس والخصوصية (Privacy & Minimization)', status: 'passed', note: 'حظر البيانات الحساسة وتشفير التصدير' },
    { id: 'gateD', name: 'صلاحيات الإدارة والرقابة (RBAC & Audit Trail)', status: 'passed', note: 'سجل تدقيق غير قابل للتعديل' },
    { id: 'gateE', name: 'الجاهزية التشغيلية (Operational Health Readiness)', status: 'passed', note: 'نقطة /ready تعمل بحالة جاهزية تامة' }
  ];

  ngOnInit(): void {
    // If user is not admin, redirect or handle view
  }

  setTab(tab: 'overview' | 'users' | 'orders' | 'stores' | 'commissions' | 'gates'): void {
    this.activeTab.set(tab);
  }
}

