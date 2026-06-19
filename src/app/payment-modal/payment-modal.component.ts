import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
    selector: 'app-payment-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './payment-modal.component.html',
    styleUrls: ['./payment-modal.component.css']
})
export class PaymentModalComponent implements OnInit, OnDestroy {
    @Input() paymentUrl: string = '';
    @Output() close = new EventEmitter<void>();
    @Output() paymentComplete = new EventEmitter<boolean>();

    safeUrl: SafeResourceUrl | null = null;
    isFrameLoaded: boolean = false;
    private boundHandleMessage: (event: MessageEvent) => void;

    constructor(private sanitizer: DomSanitizer) {
        this.boundHandleMessage = this.handleMessage.bind(this);
    }

    ngOnInit(): void {
        if (this.paymentUrl) {
            // Small delay so the loading animation plays first
            setTimeout(() => {
                this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.paymentUrl);
            }, 400);
        }
        window.addEventListener('message', this.boundHandleMessage);
    }

    ngOnDestroy(): void {
        window.removeEventListener('message', this.boundHandleMessage);
    }

    handleMessage(event: MessageEvent): void {
        console.log('[PaymentModal] Received postMessage:', event.data);
        if (event.data && event.data.type === 'payment_complete') {
            this.paymentComplete.emit(event.data.success);
            this.close.emit();
        }
        // Kashier might send success/failure via postMessage with different formats
        if (event.data && typeof event.data === 'string') {
            try {
                const parsed = JSON.parse(event.data);
                if (parsed.status === 'SUCCESS') {
                    this.paymentComplete.emit(true);
                    this.close.emit();
                } else if (parsed.status === 'FAILED') {
                    this.paymentComplete.emit(false);
                }
            } catch (_) { /* not JSON */ }
        }
    }

    onClose(): void {
        this.close.emit();
    }
}
