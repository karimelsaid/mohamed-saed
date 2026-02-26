import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { animate, style, transition, trigger } from '@angular/animations';

@Component({
    selector: 'app-network-status',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './network-status.component.html',
    styleUrls: ['./network-status.component.css'],
    animations: [
        trigger('slideInOut', [
            transition(':enter', [
                style({ transform: 'translateY(100%)', opacity: 0 }),
                animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
            ]),
            transition(':leave', [
                animate('300ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))
            ])
        ])
    ]
})
export class NetworkStatusComponent implements OnInit, OnDestroy {
    isOnline = true;
    showStatus = false;
    statusType: 'online' | 'offline' = 'online';
    private statusTimeout: any;

    constructor(
        @Inject(PLATFORM_ID) private platformId: any,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        if (isPlatformBrowser(this.platformId)) {
            this.isOnline = window.navigator.onLine;

            window.addEventListener('online', this.updateOnlineStatus.bind(this));
            window.addEventListener('offline', this.updateOnlineStatus.bind(this));
        }
    }

    ngOnDestroy(): void {
        if (isPlatformBrowser(this.platformId)) {
            window.removeEventListener('online', this.updateOnlineStatus.bind(this));
            window.removeEventListener('offline', this.updateOnlineStatus.bind(this));
        }
    }

    private updateOnlineStatus(): void {
        this.isOnline = window.navigator.onLine;
        this.statusType = this.isOnline ? 'online' : 'offline';
        this.showStatus = true;

        if (this.isOnline) {
            // Auto-hide after 3 seconds when back online
            if (this.statusTimeout) clearTimeout(this.statusTimeout);
            this.statusTimeout = setTimeout(() => {
                this.showStatus = false;
                this.cdr.detectChanges();
            }, 3000);
        } else {
            // Keep showing when offline
            if (this.statusTimeout) clearTimeout(this.statusTimeout);
        }

        this.cdr.detectChanges();
    }
}
