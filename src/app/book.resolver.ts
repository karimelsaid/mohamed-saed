import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
@Injectable({ providedIn: 'root' })
export class BookResolver implements Resolve<any> {
  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}
  resolve(route: ActivatedRouteSnapshot): Observable<any> {
    const id = route.paramMap.get('id');
    if (!id) return of(null);
    const baseUrl = isPlatformBrowser(this.platformId)
      ? environment.apiBaseUrl
      : (environment.ssrApiBaseUrl || 'http://localhost:3000/api');
    return this.http.get<{ success: boolean; data: any }>(
      `${baseUrl}/books/details/${id}`
    ).pipe(
      map(res => (res && res.success && res.data) ? res.data : null),
      catchError(() => of(null))
    );
  }
}
