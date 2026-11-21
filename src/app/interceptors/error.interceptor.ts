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
    private lastModalTime = 0;
    private readonly MODAL_COOLDOWN_MS = 6000; // منع تكرار النوافذ المنبثقة المتتالية لأكثر من مرة كل 6 ثوانٍ

    // روابط خلفية وروتينية لا يجب أن تظهر نافذة خطأ شاملة للمستخدم في حال فشلها أو إلغائها
    private readonly SILENT_URL_PATTERNS = [
        '/api/ice-servers',
        '/api/users/notifications',
        '/api/promotions/active-theme',
        '/api/books/get-excel-data',
        '/api/amazon/diagnostics',
        '/assets/',
        'fonts.googleapis.com',
        'fonts.gstatic.com'
    ];

    constructor(private modalService: ModalService) { }

    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        return next.handle(request).pipe(
            catchError((error: HttpErrorResponse) => {
                // 1. تجاوز إذا كان الطلب يحمل ترويسة أو بارامتر للتخطي الصامت
                if (
                    request.headers.has('X-Skip-Error-Modal') ||
                    request.headers.has('skip-error-interceptor') ||
                    (request.params && request.params.has('silent'))
                ) {
                    return throwError(() => error);
                }

                // 2. تجاهل الطلبات الخلفية غير الحرجة
                const isSilentEndpoint = this.SILENT_URL_PATTERNS.some(pattern =>
                    request.url.includes(pattern)
                );
                if (isSilentEndpoint) {
                    return throwError(() => error);
                }

                // 3. تجاهل الطلبات الملغاة (Canceled / Aborted)
                // تحدث عند التنقل بين الصفحات أو إلغاء الاشتراك في RxJS
                const errorAny = error as any;
                if (
                    errorAny?.name === 'AbortError' ||
                    (error.error instanceof DOMException && error.error.name === 'AbortError') ||
                    (error.statusText === 'Unknown Error' && error.error instanceof ProgressEvent && (error.error as any).type === 'abort')
                ) {
                    return throwError(() => error);
                }

                const now = Date.now();
                const canShowModal = now - this.lastModalTime > this.MODAL_COOLDOWN_MS;

                if (error.status === 0) {
                    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

                    if (!isOnline) {
                        // لا يوجد اتصال بالإنترنت فعلياً
                        if (canShowModal) {
                            this.lastModalTime = now;
                            this.modalService.openModal({
                                title: 'انقطاع الاتصال بالإنترنت',
                                message: 'يبدو أن جهازك غير متصل بالإنترنت حالياً. يرجى التحقق من الشبكة والمحاولة مرة أخرى.',
                                type: 'error',
                                confirmText: 'حسناً'
                            });
                        }
                    } else {
                        // المستخدم متصل بالإنترنت لكن السيرفر المحلي أو الـ API لم يستجب
                        if (canShowModal && (request.url.includes('/api/') || request.url.startsWith('http'))) {
                            this.lastModalTime = now;
                            this.modalService.openModal({
                                title: 'تعذر الوصول إلى الخادم',
                                message: 'تعذر الاتصال بالخادم في الوقت الحالي. قد يكون الخادم قيد إعادة التشغيل أو الصيانة، يرجى المحاولة لاحقاً.',
                                type: 'warning',
                                confirmText: 'حسناً'
                            });
                        }
                    }
                } else if (error.status === 504 || error.status === 408 || error.message?.includes('Timeout')) {
                    // انتهاء مهلة الاتصال
                    if (canShowModal) {
                        this.lastModalTime = now;
                        this.modalService.openModal({
                            title: 'تنبيه اتصال',
                            message: 'استغرق الطلب وقتاً أطول من المتوقع، يرجى إعادة المحاولة.',
                            type: 'warning',
                            confirmText: 'إعادة المحاولة'
                        });
                    }
                }

                // تمرير الخطأ للمكونات المحلية لمعالجته إن لزم
                return throwError(() => error);
            })
        );
    }
}
