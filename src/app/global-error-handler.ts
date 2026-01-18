import { ErrorHandler, Injectable, Injector, NgZone } from '@angular/core';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
    constructor(private injector: Injector) { }

    handleError(error: any) {
        const chunkFailedMessage = /Loading chunk [\d]+ failed/;

        if (chunkFailedMessage.test(error.message)) {
            console.error('Failed to load application chunk. Please check internet connection.');
        } else {
            // Use alert to show error on mobile screen since we can't see console
            try {
                const message = error.message ? error.message : error.toString();
                // Shorten stack trace
                const stack = error.stack ? error.stack.substring(0, 300) : '';
                // alert(`Error: ${message}\n${stack}`);
                console.error(`GlobalErrorHandler: ${message}`, error);
            } catch (e) {
                console.error('An unknown error occurred in GlobalErrorHandler', e);
            }
        }
        console.error(error);
    }
}
