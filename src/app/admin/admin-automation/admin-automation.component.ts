import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutomationService, AutomationSettings, AutomationLog } from '../../services/automation.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-admin-automation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-automation.component.html',
  styleUrls: ['./admin-automation.component.css']
})
export class AdminAutomationComponent implements OnInit, AfterViewInit {
  settings: AutomationSettings = {
    autoPostEnabled: true,
    randomPostEnabled: false,
    dailyPostLimit: 5,
    postTiming: '0 */6 * * *',
    aiModel: 'gpt-3.5-turbo',
    n8nWebhookUrls: {
      autoPost: '',
      commentReply: '',
      messageReply: ''
    },
    metaConfig: {
      pageId: '',
      instagramId: ''
    },
    googleSheetId: '',
    googleSheetEnabled: false,
    claudeConfig: {
      enabled: false,
      lastCommand: '',
      lastStatus: ''
    },
    n8nConfig: {
      apiUrl: 'https://n8n.knoozbook.com',
      apiKey: '',
      syncEnabled: false
    },
    // Social Media Automation V4 Settings
    socialPosts: {
      enabled: true,
      dailyLimit: 5,
      schedule: ['09:00', '12:00', '15:00', '18:00', '21:00'],
      platforms: ['facebook', 'instagram'],
      aiModels: ['groq', 'deepseek', 'mistral', 'gemini', 'cerebras', 'openrouter', 'github_models', 'sambanova', 'openai']
    },
    whatsappStatus: {
      enabled: true,
      dailyLimit: 10,
      schedule: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
      includeCaption: false
    }
  };

  stats: any[] = [];
  recentLogs: AutomationLog[] = [];
  loading = false;
  saving = false;

  // Advanced Stats - will be populated from n8n API
  advancedStats = {
    totalPosts: 0,
    postGrowth: 0,
    totalReplies: 0,
    replyGrowth: 0,
    engagementRate: 0,
    engagementGrowth: 0,
    timeSaved: 0,
    conversionRate: 0,
    conversionGrowth: 0
  };

  // Alerts - will be populated from n8n API
  alerts: any[] = [];

  // n8n Stats
  n8nStats: any = null;
  loadingN8n = false;

  // Modal State
  showStatModal = false;
  modalTitle = '';
  modalData: any = null;
  loadingModalData = false;
  @ViewChild('statChart') statChartCanvas!: ElementRef;
  private chartInstance: Chart | null = null;

  private settingsUpdateSubject = new Subject<void>();

  constructor(private automationService: AutomationService, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.loadData();
    this.loadN8nStats();

    // Debounce settings updates to avoid too many API calls
    this.settingsUpdateSubject.pipe(
      debounceTime(1000)
    ).subscribe(() => {
      this.saveSettings();
    });
  }

  loadData(): void {
    this.loading = true;
    this.automationService.getDashboardData().subscribe({
      next: (data) => {
        if (data.success) {
          this.settings = data.settings;
          this.stats = data.stats;
          this.recentLogs = data.recentLogs;
          // Calculate advanced stats from loaded data
          if (this.n8nStats) {
            this.calculateAdvancedStats(this.n8nStats);
          }
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading automation data:', err);
        this.loading = false;
      }
    });
  }

  loadN8nStats(): void {
    this.loadingN8n = true;
    this.automationService.getN8nStats().subscribe({
      next: (res) => {
        if (res.success && res.stats) {
          this.n8nStats = res.stats;
          // Calculate advanced stats from n8n data
          this.calculateAdvancedStats(res.stats);
        }
        this.loadingN8n = false;
      },
      error: (err) => {
        console.error('[loadN8nStats] Error loading stats:', err);
        this.loadingN8n = false;
      }
    });
  }

  calculateAdvancedStats(n8nData: any): void {
    console.log('[calculateAdvancedStats] Input data:', n8nData);

    // Calculate stats from n8n workflows and executions
    const totalWorkflows = n8nData.totalWorkflows || 0;
    const activeWorkflows = n8nData.activeWorkflows || 0;
    const totalExecutions = n8nData.totalExecutions || 0;
    const successfulExecutions = n8nData.successfulExecutions || 0;
    const failedExecutions = n8nData.failedExecutions || 0;

    // Get analytics stats from MongoDB (now included in n8nData response)
    const impressions = n8nData.impressions || 0;
    const comments = n8nData.comments || 0;
    const clicks = n8nData.clicks || 0;
    const engagementRate = n8nData.engagementRate || 0;
    const purchases = n8nData.purchases || 0;
    const conversionRate = n8nData.conversionRate || 0;
    const searches = n8nData.searches || 0;
    const timeSaved = n8nData.timeSaved || 0;

    console.log('[calculateAdvancedStats] Extracted values:', {
      impressions, comments, clicks, engagementRate, purchases, conversionRate, searches, timeSaved
    });

    // Update advanced stats with real MongoDB data
    this.advancedStats = {
      totalPosts: impressions, // المنشورات التلقائية = impression events
      postGrowth: 0, // TODO: calculate from historical data
      totalReplies: comments, // الردود الذكية = comment events
      replyGrowth: 0, // TODO: calculate from historical data
      engagementRate: engagementRate, // معدل التفاعل = clicks / impressions
      engagementGrowth: 0, // TODO: calculate from historical data
      timeSaved: timeSaved || Math.round(impressions * 0.5), // Use actual timeSaved or estimate
      conversionRate: conversionRate, // معدل التحويل = purchase_batch / clicks
      conversionGrowth: 0 // TODO: calculate from historical data
    };

    // Update n8nStats with the analytics data
    this.n8nStats = {
      ...this.n8nStats,
      totalWorkflows,
      activeWorkflows,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      clicks,
      searches
    };

    console.log('[calculateAdvancedStats] Updated advancedStats:', JSON.stringify(this.advancedStats, null, 2));
    console.log('[calculateAdvancedStats] Updated n8nStats:', JSON.stringify(this.n8nStats, null, 2));

    // Force UI update
    this.cdr.detectChanges();

    // Generate alerts based on stats
    this.generateAlerts(n8nData);
  }

  generateAlerts(n8nData: any): void {
    this.alerts = [];
    
    // Engagement rate alert
    if (this.advancedStats.engagementRate < 5 && this.advancedStats.engagementRate > 0) {
      this.alerts.push({
        id: Date.now(),
        type: 'warning',
        icon: 'fas fa-exclamation-triangle',
        title: 'تنبيه: معدل التفاعل منخفض',
        message: `معدل التفاعل الحالي ${this.advancedStats.engagementRate}% - يُنصح بتحسين المحتوى`
      });
    }
    
    // Active workflows alert
    if (n8nData.activeWorkflows > 0) {
      this.alerts.push({
        id: Date.now() + 1,
        type: 'success',
        icon: 'fas fa-check-circle',
        title: 'نجاح: Workflows نشطة',
        message: `يوجد ${n8nData.activeWorkflows} من أصل ${n8nData.totalWorkflows} workflow نشط حالياً`
      });
    }
    
    // Failed executions alert
    if (n8nData.failedExecutions > 0) {
      const failureRate = ((n8nData.failedExecutions / n8nData.totalExecutions) * 100).toFixed(1);
      if (parseFloat(failureRate) > 10) {
        this.alerts.push({
          id: Date.now() + 2,
          type: 'warning',
          icon: 'fas fa-exclamation-circle',
          title: 'تنبيه: معدل فشل مرتفع',
          message: `${n8nData.failedExecutions} من أصل ${n8nData.totalExecutions} execution فشل (${failureRate}%)`
        });
      }
    }
  }

  onSettingsChange(): void {
    this.settingsUpdateSubject.next();
  }

  saveSettings(): void {
    this.saving = true;
    this.automationService.updateSettings(this.settings).subscribe({
      next: (res) => {
        this.saving = false;
        console.log('Settings saved');
      },
      error: (err) => {
        this.saving = false;
        console.error('Error saving settings:', err);
      }
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'success': return 'badge-success';
      case 'failed': return 'badge-danger';
      case 'pending': return 'badge-warning';
      default: return 'badge-secondary';
    }
  }

  getPlatformIcon(platform: string): string {
    switch (platform) {
      case 'facebook': return 'fab fa-facebook';
      case 'instagram': return 'fab fa-instagram';
      case 'claude': return 'fas fa-brain';
      default: return 'fas fa-robot';
    }
  }

  dismissAlert(alertId: number): void {
    this.alerts = this.alerts.filter(a => a.id !== alertId);
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  ngAfterViewInit(): void {
    // Chart will be initialized when modal opens
  }

  openStatModal(statType: string): void {
    this.showStatModal = true;
    this.loadingModalData = true;

    // Set modal title based on stat type
    const titles: { [key: string]: string } = {
      'posts': 'تحليلات المنشورات التلقائية',
      'replies': 'تحليلات الردود الذكية',
      'engagement': 'تحليلات معدل التفاعل',
      'time': 'تحليلات الوقت الموفر',
      'conversion': 'تحليلات معدل التحويل',
      'workflows': 'تحليلات Workflows',
      'clicks': 'تحليلات الضغطات',
      'searches': 'تحليلات عمليات البحث'
    };
    this.modalTitle = titles[statType] || 'تحليلات';

    // Simulate loading detailed data (in real app, this would be an API call)
    setTimeout(() => {
      this.modalData = this.generateStatData(statType);
      this.loadingModalData = false;

      // Initialize chart after data is loaded and modal is visible
      setTimeout(() => {
        this.initChart(statType);
      }, 100);
    }, 500);
  }

  closeStatModal(event: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.showStatModal = false;
    this.modalData = null;
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  generateStatData(statType: string): any {
    // Generate mock data based on stat type
    const baseValue = this.getBaseValue(statType);
    const history = this.generateHistoryData(baseValue);
    const insights = this.generateInsights(statType, baseValue);

    return {
      currentValue: baseValue,
      change: this.calculateChange(history),
      monthlyAverage: this.calculateAverage(history),
      history: history,
      insights: insights
    };
  }

  getBaseValue(statType: string): number {
    switch (statType) {
      case 'posts': return this.advancedStats.totalPosts || 0;
      case 'replies': return this.advancedStats.totalReplies || 0;
      case 'engagement': return this.advancedStats.engagementRate || 0;
      case 'time': return this.advancedStats.timeSaved || 0;
      case 'conversion': return this.advancedStats.conversionRate || 0;
      case 'clicks': return this.n8nStats?.clicks || 0;
      case 'searches': return this.n8nStats?.searches || 0;
      case 'workflows': return this.n8nStats?.activeWorkflows || 0;
      default: return 0;
    }
  }

  generateHistoryData(baseValue: number): any[] {
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'];
    const history: any[] = [];
    let currentValue = baseValue;

    for (let i = 5; i >= 0; i--) {
      const variation = Math.floor(Math.random() * 20) - 10;
      const value = Math.max(0, currentValue + variation);
      let change: number;

      if (i === 5 || history.length === 0) {
        change = 0;
      } else {
        const previousValue = history[history.length - 1].value;
        change = previousValue === 0 ? 0 : Math.round(((value - previousValue) / previousValue) * 100);
      }

      history.push({
        period: months[i],
        value: value,
        change: change
      });

      currentValue = value;
    }

    return history;
  }

  calculateChange(history: any[]): number {
    if (history.length < 2) return 0;
    const current = history[history.length - 1].value;
    const previous = history[history.length - 2].value;
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  calculateAverage(history: any[]): number {
    if (history.length === 0) return 0;
    const sum = history.reduce((acc, item) => acc + item.value, 0);
    return Math.round(sum / history.length);
  }

  generateInsights(statType: string, baseValue: number): any[] {
    const insights = [];

    if (baseValue > 0) {
      insights.push({
        icon: 'fas fa-chart-line',
        text: `الأداء الحالي جيد مع ${baseValue} وحدة نشطة`
      });
    }

    if (statType === 'engagement' && baseValue < 5) {
      insights.push({
        icon: 'fas fa-exclamation-triangle',
        text: 'معدل التفاعل منخفض، يُنصح بتحسين المحتوى'
      });
    }

    if (statType === 'conversion' && baseValue > 3) {
      insights.push({
        icon: 'fas fa-check-circle',
        text: 'معدل التحويل ممتاز، استمر في الاستراتيجية الحالية'
      });
    }

    insights.push({
      icon: 'fas fa-lightbulb',
      text: 'يمكنك تحسين الأداء من خلال تحليل الأنماط الموسمية'
    });

    return insights;
  }

  initChart(statType: string): void {
    const canvas = document.getElementById('statChart') as HTMLCanvasElement;
    if (!canvas || !this.modalData) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = this.modalData.history.map((h: any) => h.period);
    const data = this.modalData.history.map((h: any) => h.value);

    const colors: { [key: string]: string } = {
      'posts': '#4338ca',
      'replies': '#b45309',
      'engagement': '#15803d',
      'time': '#a21caf',
      'conversion': '#1d4ed8',
      'workflows': '#7c3aed',
      'clicks': '#dc2626',
      'searches': '#0891b2'
    };

    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: this.modalTitle,
          data: data,
          borderColor: colors[statType] || '#6366f1',
          backgroundColor: (colors[statType] || '#6366f1') + '20',
          fill: true,
          tension: 0.4,
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              font: {
                family: 'Cairo',
                size: 12
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: '#e2e8f0'
            }
          },
          x: {
            grid: {
              display: false
            }
          }
        }
      }
    });
  }
}

