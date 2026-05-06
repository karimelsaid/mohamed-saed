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
    }
  };

  stats: any[] = [];
  recentLogs: AutomationLog[] = [];
  loading = false;
  saving = false;

  // Claude Agent Properties
  claudePrompt = '';
  claudeOutput = '';
  claudeExecuting = false;

  // n8n Stats
  n8nStats: any = null;
  loadingN8n = false;

  // Deployment
  deploying = false;

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
    if (!this.settings.n8nConfig?.apiKey) return;
    this.loadingN8n = true;
    this.automationService.getN8nStats().subscribe({
      next: (res) => {
        if (res.success) this.n8nStats = res.stats;
        this.loadingN8n = false;
      },
      error: () => this.loadingN8n = false
    });
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

  executeClaude(): void {
    if (!this.claudePrompt.trim()) return;

    this.claudeExecuting = true;
    this.claudeOutput = 'جاري التنفيذ...';
    
    this.automationService.executeClaudeCommand(this.claudePrompt).subscribe({
      next: (res) => {
        this.claudeExecuting = false;
        this.claudeOutput = res.output;
        if (res.success) {
          this.claudePrompt = '';
          this.loadData(); // Refresh logs
        }
      },
      error: (err) => {
        this.claudeExecuting = false;
        this.claudeOutput = 'خطأ في التنفيذ: ' + (err.error?.message || err.message);
      }
    });
  }

  triggerDeploy(): void {
    if (!confirm('هل أنت متأكد من رغبتك في مزامنة التعديلات مع السيرفر العالمي الآن؟')) return;
    
    this.deploying = true;
    this.automationService.deployToProduction().subscribe({
      next: (res) => {
        this.deploying = false;
        alert('✅ تم بدء عملية المزامنة بنجاح!');
      },
      error: (err) => {
        this.deploying = false;
        alert('❌ فشل المزامنة: ' + err.message);
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

  syncAllProducts(): void {
    if (!confirm('هل أنت متأكد من استيراد كافة المنتجات من Google Sheets؟ هذا سيقوم بتحديث قاعدة البيانات الحالية.')) {
      return;
    }

    this.loading = true;
    this.automationService.importProductsFromSheets().subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) {
          alert('✅ تم استيراد ' + res.message + ' بنجاح!');
          this.loadData();
        } else {
          alert('❌ فشل الاستيراد: ' + res.message);
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('Error syncing products:', err);
        alert('❌ حدث خطأ أثناء عملية الاستيراد: ' + (err.error?.message || err.message));
      }
    });
  }
}

