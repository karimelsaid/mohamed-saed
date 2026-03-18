import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private apiUrl = `${environment.apiBaseUrl}/analytics`;

  constructor(private http: HttpClient) {}

  /**
   * Tracks a view for a product
   * @param productId The ID of the product being viewed
   */
  trackProductView(productId: string): Observable<any> {
    if (!productId) return of(null);
    return this.http.post(`${this.apiUrl}/track/product/${productId}`, {}).pipe(
      catchError(err => {
        console.error('Error tracking product view', err);
        return of(null);
      })
    );
  }

  /**
   * Tracks a visit to a merchant's store
   * @param merchantId The ID of the merchant being visited
   */
  trackStoreVisit(merchantId: string): Observable<any> {
    if (!merchantId) return of(null);
    return this.http.post(`${this.apiUrl}/track/store/${merchantId}`, {}).pipe(
      catchError(err => {
        console.error('Error tracking store visit', err);
        return of(null);
      })
    );
  }

  /**
   * Fetches analytics data for the current merchant
   */
  getMerchantStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/merchant-stats`).pipe(
      map((res: any) => res.success ? res.analytics : null),
      catchError(err => {
        console.error('Error fetching merchant stats', err);
        return of(null);
      })
    );
  }

  /**
   * Tracks a user search query
   * @param term The search query string
   */
  trackSearchTerm(term: string): Observable<any> {
    if (!term || term.trim().length === 0) return of(null);
    return this.http.post(`${this.apiUrl}/search`, { term: term.trim() }).pipe(
      catchError(err => {
        console.error('Error tracking search term', err);
        return of(null);
      })
    );
  }
}
