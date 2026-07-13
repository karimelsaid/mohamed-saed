import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Statistics {
  orders: number;
  products: number;
  customers: number;
  rating: number;
  since: number;
}

@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private apiUrl = environment.apiBaseUrl || 'http://localhost:3000';

  constructor(private http: HttpClient) {}

  getStatistics(): Observable<Statistics> {
    const url = this.apiUrl.endsWith('/api') ? `${this.apiUrl}/statistics` : `${this.apiUrl}/api/statistics`;
    return this.http.get<Statistics>(url);
  }
}
