import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../environments/environment';

export interface FreeShippingRules {
  minQuantity: number;
  minOrderValue: number;
  userGroups: string[];
  includedProducts: string[];
  includedCategories: string[];
  includedGovernorates: string[];
  freeShippingEnabled: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class FreeShippingService {
  private defaultRules: FreeShippingRules = {
    minQuantity: 3,
    minOrderValue: 0,
    userGroups: [],
    includedProducts: [],
    includedCategories: [],
    includedGovernorates: [],
    freeShippingEnabled: true
  };

  private apiUrl = `${environment.apiBaseUrl}/admin/settings/free-shipping-rules`;

  constructor(private http: HttpClient) { }

  getRules(): Observable<FreeShippingRules> {
    return this.http.get<{ success: boolean; rules: FreeShippingRules }>(this.apiUrl).pipe(
      map(response => response.rules),
      catchError(() => of(this.defaultRules))
    );
  }

  saveRules(rules: FreeShippingRules): Observable<any> {
    return this.http.post(this.apiUrl, rules);
  }
}
