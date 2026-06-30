import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutomationService, AutomationSettings, AutomationLog } from '../../services/automation.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-admin-automation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-automation.component.html',
  styleUrls: ['./admin-automation.component.css']
})
export class AdminAutomationComponent implements OnInit {
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

  private settingsUpdateSubject = new Subject<void>();

  constructor(private automationService: AutomationService) { }

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
      error: () => this.loadingN8n = false
    });
  }

  calculateAdvancedStats(n8nData: any): void {
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
    
    // Update advanced stats with real MongoDB data
    this.advancedStats = {
      totalPosts: impressions, // المنشورات التلقائية = impression events
      postGrowth: 0, // TODO: calculate from historical data
      totalReplies: comments, // الردود الذكية = comment events
      replyGrowth: 0, // TODO: calculate from historical data
      engagementRate: engagementRate, // معدل التفاعل = clicks / impressions
      engagementGrowth: 0, // TODO: calculate from historical data
      timeSaved: Math.round(impressions * 0.5), // Estimate 30 min saved per impression
      conversionRate: conversionRate, // معدل التحويل = purchase_batch / clicks
      conversionGrowth: 0 // TODO: calculate from historical data
    };
    
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
}

