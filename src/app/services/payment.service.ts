import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, retry, mergeMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {

  private apiUrl = environment.apiBaseUrl + '/payment/create-payment';

  constructor(private http: HttpClient) { }

  createPayment(orderId: string, amount: number, currency: string, customerEmail: string, merchantRedirect: string, display: string = 'en'): Observable<{ sessionUrl: string }> {
    return this.http.post<{ sessionUrl: string }>(this.apiUrl, {
      orderId,
      amount,
      currency,
      customerEmail,
      merchantRedirect,
      display
    }).pipe(
      // Retry up to 2 times with a 1-second delay on server errors (5xx)
      retry({
        count: 2,
        delay: (error, retryCount) => {
          // Only retry on server errors (5xx) or network errors (status 0)
          if (error.status >= 500 || error.status === 0) {
            console.warn(`[Payment] Retry ${retryCount}/2 after ${error.status} error...`);
            return timer(1000 * retryCount); // Increasing delay: 1s, 2s
          }
          // Don't retry on client errors (4xx)
          return throwError(() => error);
        }
      }),
      catchError(error => {
        console.error('Payment creation failed:', error);
        // Pass the original HTTP error through so the component can read error.error
        return throwError(() => error);
      })
    );
  }
}
