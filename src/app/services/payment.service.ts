import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {

  private apiUrl = environment.apiBaseUrl + '/payment/create-payment';

  constructor(private http: HttpClient) { }

  createPayment(orderId: string, amount: number, currency: string, customerEmail: string, merchantRedirect: string): Observable<{ sessionUrl: string }> {
    return this.http.post<{ sessionUrl: string }>(this.apiUrl, {
      orderId,
      amount,
      currency,
      customerEmail,
      merchantRedirect
    }).pipe(
      catchError(error => {
        console.error('Payment creation failed:', error);
        return throwError(() => new Error('Payment creation failed. Please try again later.'));
      })
    );
  }
}
