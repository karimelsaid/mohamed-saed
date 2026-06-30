import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AutomationLog {
  _id: string;
  type: string;
  platform: string;
  status: string;
  title: string;
  details: any;
  error?: string;
  metadata?: any;
  createdAt: Date;
}

export interface AutomationSettings {
  autoPostEnabled: boolean;
  randomPostEnabled: boolean;
  dailyPostLimit: number;
  postTiming: string;
  aiModel: string;
  n8nWebhookUrls: {
    autoPost: string;
    commentReply: string;
    messageReply: string;
  };
  metaConfig: {
    pageId: string;
    instagramId: string;
  };
  googleSheetId?: string;
  googleSheetEnabled?: boolean;
  claudeConfig: {
    enabled: boolean;
    lastCommand?: string;
    lastStatus?: string;
  };
  n8nConfig: {
    apiUrl: string;
    apiKey: string;
    syncEnabled: boolean;
  };
  // Social Media Automation V4 Settings
  socialPosts?: {
    enabled: boolean;
    dailyLimit: number;
    schedule: string[];
    platforms: string[];
    aiModels: string[];
  };
  whatsappStatus?: {
    enabled: boolean;
    dailyLimit: number;
    schedule: string[];
    includeCaption: boolean;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AutomationService {
  private apiUrl = `${environment.apiBaseUrl}/automation`;

  constructor(private http: HttpClient) { }

  getDashboardData(): Observable<any> {
    return this.http.get(`${this.apiUrl}/dashboard`);
  }

  updateSettings(settings: Partial<AutomationSettings>): Observable<any> {
    return this.http.patch(`${this.apiUrl}/settings`, settings);
  }

  getLogs(page: number = 1, limit: number = 20, type?: string, status?: string): Observable<any> {
    let params = `?page=${page}&limit=${limit}`;
    if (type) params += `&type=${type}`;
    if (status) params += `&status=${status}`;
    return this.http.get(`${this.apiUrl}/logs${params}`);
  }

  importProductsFromSheets(): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/admin/import-products-from-sheets`, {});
  }

  executeClaudeCommand(prompt: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/claude/execute`, { prompt });
  }

  getN8nStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/n8n/stats`);
  }

  deployToProduction(): Observable<any> {
    return this.http.post(`${this.apiUrl}/deploy`, {});
  }

  // n8n Workflow Management
  getWorkflows(): Observable<any> {
    return this.http.get(`${environment.apiBaseUrl}/n8n/workflows`);
  }

  getWorkflow(id:	string): Observable<any> {
    return this.http.get(`${environment.apiBaseUrl}/n8n/workflows/${id}`);
  }

  createWorkflow(workflowData: any): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/n8n/workflows`, { workflowData });
  }

  updateWorkflow(id: string, workflowData: any): Observable<any> {
    return this.http.patch(`${environment.apiBaseUrl}/n8n/workflows/${id}`, { workflowData });
  }

  toggleWorkflow(id: string, active: boolean): Observable<any> {
    return this.http.patch(`${environment.apiBaseUrl}/n8n/workflows/${id}/toggle`, { active });
  }

  deleteWorkflow(id: string): Observable<any> {
    return this.http.delete(`${environment.apiBaseUrl}/n8n/workflows/${id}`);
  }

  getWorkflowExecutions(id: string, limit: number = 20): Observable<any> {
    return this.http.get(`${environment.apiBaseUrl}/n8n/workflows/${id}/executions?limit=${limit}`);
  }

  importWorkflow(workflowName: string): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/n8n/workflows/import`, { workflowName });
  }

  executeWorkflow(id: string, data?: any): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/n8n/workflows/${id}/execute`, data || {});
  }
}

