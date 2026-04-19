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
    googleSheetEnabled: false
  };

  stats: any[] = [];
  recentLogs: AutomationLog[] = [];
  loading = false;
  saving = false;
  
  private settingsUpdateSubject = new Subject<void>();

  constructor(private automationService: AutomationService) { }

  ngOnInit(): void {
    this.loadData();

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

