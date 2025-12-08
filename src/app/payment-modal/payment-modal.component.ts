import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
    selector: 'app-payment-modal',
    standalone: true,
    imports: [CommonModule, FontAwesomeModule],
    templateUrl: './payment-modal.component.html',
    styleUrls: ['./payment-modal.component.css']
})
export class PaymentModalComponent implements OnInit, OnDestroy {
    @Input() paymentUrl: string = '';
    @Output() close = new EventEmitter<void>();
    @Output() paymentComplete = new EventEmitter<boolean>();

    faTimes = faTimes;
    safeUrl: SafeResourceUrl | null = null;
    private boundHandleMessage: (event: MessageEvent) => void;

    constructor(private sanitizer: DomSanitizer) {
        this.boundHandleMessage = this.handleMessage.bind(this);
    }

    ngOnInit(): void {
        if (this.paymentUrl) {
            this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.paymentUrl);
        }
        window.addEventListener('message', this.boundHandleMessage);
    }

    ngOnDestroy(): void {
        window.removeEventListener('message', this.boundHandleMessage);
    }

    handleMessage(event: MessageEvent): void {
        console.log('PaymentModal received message:', event.data); // Debug log
        if (event.data && event.data.type === 'payment_complete') {
            this.paymentComplete.emit(event.data.success);
            this.close.emit();
        }
    }

    onClose(): void {
        this.close.emit();
    }
}
