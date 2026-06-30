import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class QuickActionsService {
  private apiUrl = 'http://localhost:3000/api/quick-actions';

  constructor(private http: HttpClient) {}

  /**
   * Get all quick actions (default + categories + personalized)
   */
  getAllQuickActions(conversationId?: string): Observable<any> {
    const params: any = {};
    if (conversationId) {
      params.conversationId = conversationId;
    }
    return this.http.get(`${this.apiUrl}/all`, { params });
  }

  /**
   * Get personalized quick actions for user
   */
  getPersonalizedActions(conversationId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/personalized`, {
      params: { conversationId }
    });
  }

  /**
   * Get all categories from MongoDB
   */
  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/categories`);
  }

  /**
   * Get top selling books (MongoDB direct)
   */
  getTopSelling(limit: number = 5): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/top-selling`, {
      params: { limit: limit.toString() }
    });
  }

  /**
   * Get newest books (MongoDB direct)
   */
  getNewestBooks(limit: number = 5): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/newest`, {
      params: { limit: limit.toString() }
    });
  }

  /**
   * Search books by category (MongoDB direct)
   */
  searchByCategory(category: string, limit: number = 10): Observable<any> {
    return this.http.get(`${this.apiUrl}/category/${encodeURIComponent(category)}`, {
      params: { limit: limit.toString() }
    });
  }

  /**
   * Smart search (MongoDB direct)
   */
  smartSearch(query: string, limit: number = 10): Observable<any> {
    return this.http.get(`${this.apiUrl}/search`, {
      params: { query, limit: limit.toString() }
    });
  }
}
