import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faAmazon } from '@fortawesome/free-brands-svg-icons';
import { faPlug, faKey, faDatabase, faTasks, faStore, faCog, faCheckCircle, faExclamationCircle, faFileAlt, faSyncAlt, faStethoscope, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../../environments/environment';

interface DiagnosticsData {
  queueAvailable: boolean;
  queueError?: string;
  apiConnection: {
    status: 'connected' | 'disconnected' | 'error';
    lastChecked: string;
    latency?: number;
  };
  accessToken: {
    status: 'valid' | 'expired' | 'invalid' | 'missing';
    expiresAt?: string;
  };
  queue: {
    status: 'active' | 'inactive' | 'offline' | 'error';
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    error?: string;
  };
  redis: {
    status: 'connected' | 'disconnected';
    memoryUsage?: string;
    keyCount?: number;
    error?: string;
  };
  sellerAccount: {
    status: 'active' | 'inactive' | 'suspended';
    sellerId?: string;
    marketplaceId?: string;
  };
  systemSettings: {
    priceIncreasePercentage: number;
  };
  logs: string[];
  lastSuccessfulPublish?: {
    productId: string;
    productName: string;
    timestamp: string;
  };
  lastFailedPublish?: {
    productId: string;
    productName: string;
    timestamp: string;
    error: string;
  };
  activeJobs?: Array<{
    jobId: string;
    productId: string;
    productName: string;
    status: string;
    state: string;
    progress: number;
    attemptsMade: number;
    failedReason?: string;
    timestamp: number;
    processedOn?: number;
    finishedOn?: number;
    amazonStatus?: string;
    amazonSku?: string;
    amazonAsin?: string;
  }>;
}

@Component({
  selector: 'app-amazon-diagnostics',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  templateUrl: './amazon-diagnostics.component.html',
  styleUrls: ['./amazon-diagnostics.component.css']
})
export class AmazonDiagnosticsComponent implements OnInit {
  diagnostics: DiagnosticsData | null = null;
  loading = true;
  error: string | null = null;
  autoRefreshInterval: any;

  constructor(private http: HttpClient, private library: FaIconLibrary) {
    library.addIcons(
      faAmazon,
      faPlug,
      faKey,
      faDatabase,
      faTasks,
      faStore,
      faCog,
      faCheckCircle,
      faExclamationCircle,
      faFileAlt,
      faSyncAlt,
      faStethoscope,
      faSpinner
    );
  }

  ngOnInit() {
    this.loadDiagnostics();
    this.startAutoRefresh();
  }

  ngOnDestroy() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
  }

  startAutoRefresh() {
    this.autoRefreshInterval = setInterval(() => {
      this.loadDiagnostics();
    }, 30000); // Refresh every 30 seconds
  }

  loadDiagnostics() {
    this.loading = true;
    this.http.get<DiagnosticsData>(`${environment.apiBaseUrl}/amazon/diagnostics`).subscribe({
      next: (data) => {
        this.diagnostics = data;
        this.loading = false;
        this.error = null;
      },
      error: (err) => {
        this.error = 'Failed to load diagnostics data';
        this.loading = false;
        console.error('Error loading diagnostics:', err);
      }
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'connected':
      case 'valid':
      case 'active':
        return 'text-green-600 dark:text-green-400';
      case 'disconnected':
      case 'expired':
      case 'invalid':
      case 'missing':
      case 'inactive':
      case 'suspended':
        return 'text-red-600 dark:text-red-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  }

  getStatusBadge(status: string): string {
    switch (status) {
      case 'connected':
      case 'valid':
      case 'active':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
      case 'disconnected':
      case 'expired':
      case 'invalid':
      case 'missing':
      case 'inactive':
      case 'suspended':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      case 'error':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
    }
  }

  getJobStateBadge(state: string): string {
    switch (state) {
      case 'active':
        return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
      case 'completed':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
      case 'failed':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      case 'waiting':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200';
      case 'delayed':
        return 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
    }
  }

  refresh() {
    this.loadDiagnostics();
  }
}
