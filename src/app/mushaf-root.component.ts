import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { VoiceCallService } from './core/services/voice-call.service';
import { PushNotificationService } from './services/push-notification.service';
import { LiveUpdateService } from './services/live-update.service';
import { AppUpdateService } from './services/app-update.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-root',
    standalone: false,
    template: `
        <router-outlet></router-outlet>
        <app-voice-call></app-voice-call>
        <app-live-update-modal *ngIf="liveUpdateService.status$ | async as status"
          [version]="(liveUpdateService.version$ | async) || ''" [progress]="(liveUpdateService.progress$ | async) || 0"
          [status]="status" [errorMessage]="(liveUpdateService.error$ | async) || ''"
          [sizeBytes]="(liveUpdateService.sizeBytes$ | async) || 0"
          [sizeFormatted]="(liveUpdateService.sizeFormatted$ | async) || ''"
          (onUpdate)="liveUpdateService.startUpdate()"
          (onPostpone)="liveUpdateService.postponeUpdate()">
        </app-live-update-modal>
    `
})
export class MushafRootComponent implements OnInit, OnDestroy {
    private authService = inject(AuthService);
    private voiceCallService = inject(VoiceCallService);
    private pushService = inject(PushNotificationService);
    public liveUpdateService = inject(LiveUpdateService);
    private appUpdateService = inject(AppUpdateService);
    private sub?: Subscription;

    ngOnInit() {
        // Run update checks on startup in the browser
        if (typeof window !== 'undefined') {
            this.appUpdateService.checkForUpdate('mushaf');
            this.liveUpdateService.initialize('mushaf').catch(err => console.error('Mushaf Live Update Init Error:', err));
        }

        this.sub = this.authService.user$.subscribe(user => {
            if (user && (user.id || (user as any)._id)) {
                const userId = (user.id || (user as any)._id).toString();

                // Initialize Voice Call Peer
                this.voiceCallService.init(userId);

                // Subscribe to notifications (Skip Android for now if it crashes)
                import('@capacitor/core').then(cap => {
                    if (cap.Capacitor.getPlatform() !== 'android') {
                        this.pushService.subscribeToNotifications();
                    }
                });
            }
        });
    }

    ngOnDestroy() {
        this.sub?.unsubscribe();
    }
}
