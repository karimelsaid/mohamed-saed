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
  codFee: number;
  communityShippingCost: number;
  swapShippingCost: number;
  auctionShippingCost: number;
  regionCosts?: { [key: string]: number };
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
    freeShippingEnabled: true,
    codFee: 10,
    communityShippingCost: 70,
    swapShippingCost: 70,
    auctionShippingCost: 70,
    regionCosts: {
      'القاهرة والجيزة والقليوبية': 55,
      'الإسكندرية والدلتا': 65,
      'مدن القناة': 70,
      'شمال الصعيد': 75,
      'جنوب الصعيد': 100,
      'المناطق النائية': 110
    }
  };

  private cachedRules: FreeShippingRules | null = null;
  private apiUrl = `${environment.apiBaseUrl}/admin/settings/free-shipping-rules`;

  constructor(private http: HttpClient) { }

  getRules(): Observable<FreeShippingRules> {
    if (this.cachedRules) {
      return of(this.cachedRules);
    }

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('kenouz_free_shipping_rules');
      if (stored) {
        try {
          this.cachedRules = JSON.parse(stored);
          return of(this.cachedRules!);
        } catch (e) {}
      }
    }

    return this.http.get<{ success: boolean; rules: FreeShippingRules }>(this.apiUrl).pipe(
      map(response => {
        if (response && response.success && response.rules) {
          this.cachedRules = response.rules;
          if (typeof window !== 'undefined') {
            localStorage.setItem('kenouz_free_shipping_rules', JSON.stringify(response.rules));
          }
          return response.rules;
        }
        return this.defaultRules;
      }),
      catchError(() => of(this.defaultRules))
    );
  }

  saveRules(rules: FreeShippingRules): Observable<any> {
    this.cachedRules = rules;
    if (typeof window !== 'undefined') {
      localStorage.setItem('kenouz_free_shipping_rules', JSON.stringify(rules));
    }
    return this.http.post(this.apiUrl, rules);
  }
}
