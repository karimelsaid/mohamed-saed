import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface WhitelistedOffer {
    _id?: string;
    email: string;
    type: 'discount' | 'free_months' | 'free_days' | 'lifetime';
    value: number;
    isClaimed: boolean;
    isWelcomed: boolean;
    notes?: string;
    createdAt?: Date;
}

@Injectable({
    providedIn: 'root'
})
export class SpecialOffersService {
    private apiUrl = `${environment.apiBaseUrl}/special-offers`;

    constructor(private http: HttpClient) { }

    // --- Admin Methods ---
    getAllOffers(): Observable<{ success: boolean, data: WhitelistedOffer[] }> {
        return this.http.get<{ success: boolean, data: WhitelistedOffer[] }>(`${this.apiUrl}/admin/all`);
    }

    addOffer(offer: Partial<WhitelistedOffer>): Observable<{ success: boolean, data: WhitelistedOffer }> {
        return this.http.post<{ success: boolean, data: WhitelistedOffer }>(`${this.apiUrl}/admin/add`, offer);
    }

    deleteOffer(id: string): Observable<{ success: boolean, message: string }> {
        return this.http.delete<{ success: boolean, message: string }>(`${this.apiUrl}/admin/${id}`);
    }

    // --- User Methods ---
    checkMyOffer(): Observable<{ success: boolean, hasOffer: boolean, data?: WhitelistedOffer }> {
        return this.http.get<{ success: boolean, hasOffer: boolean, data?: WhitelistedOffer }>(`${this.apiUrl}/check`);
    }

    acknowledgeOffer(): Observable<{ success: boolean }> {
        return this.http.post<{ success: boolean }>(`${this.apiUrl}/acknowledge`, {});
    }
}
