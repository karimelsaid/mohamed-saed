import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ErrorEnvelope } from '@mihnati/contracts';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID();

  const clonedReq = req.clone({
    withCredentials: true,
    setHeaders: {
      'X-Request-ID': requestId,
      'Accept': 'application/json'
    }
  });

  return next(clonedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      let formattedError: ErrorEnvelope | null = null;
      if (error.error && typeof error.error === 'object' && 'error' in error.error) {
        formattedError = error.error as ErrorEnvelope;
      } else {
        formattedError = {
          error: {
            code: 'INTERNAL_ERROR',
            message: error.message || 'حدث خطأ غير متوقع أثناء الاتصال بالخادم',
            requestId: req.headers.get('X-Request-ID') || requestId
          }
        };
      }
      return throwError(() => formattedError);
    })
  );
};

