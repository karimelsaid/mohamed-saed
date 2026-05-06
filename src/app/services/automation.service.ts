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
}

