import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MarketerService {
  private apiUrl = `${environment.apiBaseUrl}/marketer`;

  constructor(private http: HttpClient) { }

  getDashboardStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/dashboard`);
  }

  apply(bio: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/apply`, { bio });
  }

  searchProducts(query: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/search-products`, { params: { query } });
  }

  generateLink(targetId: string, targetType: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/generate-link`, { targetId, targetType });
  }

  getEarnings(): Observable<any> {
    return this.http.get(`${this.apiUrl}/earnings`);
  }
  
  getOpportunities(): Observable<any> {
    return this.http.get(`${this.apiUrl}/opportunities`);
  }

  claimPrize(prizeId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/prizes/${prizeId}/claim`, {});
  }

  // Admin methods
  getPendingApplications(): Observable<any> {
    return this.http.get(`${this.apiUrl}/applications`);
  }

  processApplication(userId: string, status: 'approved' | 'rejected', rejectionReason?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/applications/process`, { userId, status, rejectionReason });
  }
}
