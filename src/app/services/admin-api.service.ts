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

    registerSale(soldItems: any[]): Observable<any> {
        return this.http.post(`${this.baseUrl}/register-sale`, { soldItems });
    }

    getShortageSettings(): Observable<any> {
        const url = environment.apiBaseUrl + '/system-settings'; // Assuming it's exposed or I can use the new Patch endpoint to get it too
        // For now, I'll rely on the PATCH endpoint returning the settings or a GET I might need to add.
        // Let's assume I can get it from the general settings if available.
        return this.http.get(`${this.baseUrl}/shortage-settings`); // I should add this route if not exist
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
