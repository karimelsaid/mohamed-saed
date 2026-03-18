import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class AdminApiService {
    private baseUrl = environment.apiBaseUrl + '/admin';

    constructor(private http: HttpClient) { }

    registerSale(saleData: any): Observable<any> {
        return this.http.post(`${this.baseUrl}/register-sale`, saleData);
    }

    getSalesHistory(): Observable<any[]> {
        return this.http.get<any[]>(`${this.baseUrl}/sales-history`);
    }

    getShortageSettings(): Observable<any> {
        return this.http.get(`${this.baseUrl}/shortage-settings`);
    }

    updateShortageSettings(settings: any): Observable<any> {
        return this.http.patch(`${this.baseUrl}/shortage-settings`, settings);
    }

    downloadShortagesReport(): Observable<Blob> {
        return this.http.get(`${this.baseUrl}/shortages-report`, {
            responseType: 'blob'
        });
    }
}
