import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { VoiceCallService } from './core/services/voice-call.service';
import { PushNotificationService } from './services/push-notification.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-root',
    standalone: false,
    template: `
        <router-outlet></router-outlet>
        <app-voice-call></app-voice-call>
    `
})
export class MushafRootComponent implements OnInit, OnDestroy {
    private authService = inject(AuthService);
    private voiceCallService = inject(VoiceCallService);
    private pushService = inject(PushNotificationService);
    private sub?: Subscription;

    ngOnInit() {
        this.sub = this.authService.user$.subscribe(user => {
            if (user && (user.id || (user as any)._id)) {
                const userId = (user.id || (user as any)._id).toString();

                // Initialize Voice Call Peer
                this.voiceCallService.init(userId);

                // Subscribe to notifications
                this.pushService.subscribeToNotifications();
            }
        });
    }

    ngOnDestroy() {
        this.sub?.unsubscribe();
    }
}
