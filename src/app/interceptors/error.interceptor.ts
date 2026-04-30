import { Injectable } from '@angular/core';
import {
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor,
    HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ModalService } from '../services/modal.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {

    constructor(private modalService: ModalService) { }

    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        return next.handle(request).pipe(
            catchError((error: HttpErrorResponse) => {
                let errorMessage = '';

                if (error.status === 0) {
                    // Connection issues
                    errorMessage = 'فشل الاتصال بالخادم. يرجى التأكد من اتصال الإنترنت والمحاولة مرة أخرى.';
                    this.modalService.openModal({
                        title: 'خطأ في الاتصال',
                        message: errorMessage,
                        type: 'error',
                        confirmText: 'حسناً'
                    });
                } else if (error.status === 504 || error.status === 408 || error.message?.includes('Timeout')) {
                    // Timeout issues
                    errorMessage = 'انتهت المهلة المحددة للطلب. قد يكون الإنترنت ضعيفاً حالياً، يرجى المحاولة مرة أخرى.';
                    this.modalService.openModal({
                        title: 'تنبيه اتصال',
                        message: errorMessage,
                        type: 'warning',
                        confirmText: 'إعادة المحاولة'
                    });
                }

                // Pass the error along to the local handlers if they want to do specific logic
                return throwError(() => error);
            })
        );
    }
}
