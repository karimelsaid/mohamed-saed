import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ai-control-center',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-control-center.component.html',
  styleUrls: ['./ai-control-center.component.css']
})
export class AiControlCenterComponent implements OnInit {
  providers = ['gemini', 'openai', 'claude'];
  models = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-3.5-turbo',
    'text-embedding-3-small',
    'gemini-embedding-001'
  ];
  tasks = [
    'generate_caption',
    'generate_hashtags',
    'sales_reply',
    'analyze_intent',
    'seo_content',
    'seo_metadata',
    'support_classification',
    'analytics_summary',
    'embedding'
  ];

  selectedProvider = 'gemini';
  selectedModel = 'gemini-2.5-flash';
  selectedTask = 'generate_caption';
  customPrompt = '';
  customSystemPrompt = '';
  inputData = '{}';
  skipCache = false;
  skipRetry = false;

  loading = false;
  result: any = null;
  error: string | null = null;

  healthStatus: any = {};
  metrics: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadHealthStatus();
    this.loadMetrics();
  }

  loadHealthStatus() {
    this.http.get('/api/automation/ai/health').subscribe({
      next: (data: any) => {
        this.healthStatus = data.health || {};
      },
      error: (err) => {
        console.error('Error loading health status:', err);
      }
    });
  }

  loadMetrics() {
    this.http.get('/api/automation/ai/metrics').subscribe({
      next: (data) => {
        this.metrics = data;
      },
      error: (err) => {
        console.error('Error loading metrics:', err);
      }
    });
  }

  executeTask() {
    this.loading = true;
    this.error = null;
    this.result = null;

    const payload: any = {
      task: this.selectedTask,
      data: this.parseInputData(),
      options: {
        provider: this.selectedProvider,
        model: this.selectedModel,
        skipCache: this.skipCache,
        skipRetry: this.skipRetry
      }
    };

    if (this.customPrompt) {
      payload.options.prompt = this.customPrompt;
    }

    if (this.customSystemPrompt) {
      payload.options.systemPrompt = this.customSystemPrompt;
    }

    this.http.post('/api/automation/ai/execute', payload).subscribe({
      next: (data) => {
        this.result = data;
        this.loading = false;
        this.loadMetrics(); // Refresh metrics after execution
      },
      error: (err) => {
        this.error = err.error?.message || err.message || 'خطأ في تنفيذ المهمة';
        this.loading = false;
      }
    });
  }

  parseInputData() {
    try {
      return JSON.parse(this.inputData);
    } catch (e) {
      return {};
    }
  }

  refreshHealth() {
    this.loadHealthStatus();
  }

  refreshMetrics() {
    this.loadMetrics();
  }

  clearResult() {
    this.result = null;
    this.error = null;
  }

  formatJSON(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }

  getExecutionTime(): string {
    if (!this.result?.executionTime) return 'N/A';
    return `${this.result.executionTime}ms`;
  }

  getCost(): string {
    if (!this.result?.cost) return 'N/A';
    return `$${this.result.cost.toFixed(6)}`;
  }

  getTokens(): string {
    if (!this.result?.tokens) return 'N/A';
    return `${this.result.tokens.input} in / ${this.result.tokens.output} out / ${this.result.tokens.total} total`;
  }
}
