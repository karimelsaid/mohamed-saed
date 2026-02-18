import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPhone, faPhoneSlash, faMicrophone, faMicrophoneSlash, faVolumeUp } from '@fortawesome/free-solid-svg-icons';
import { VoiceCallService, CallSession } from '../../../core/services/voice-call.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-voice-call',
    standalone: true,
    imports: [CommonModule, FontAwesomeModule],
    template: `
        <div *ngIf="session" class="fixed bottom-24 right-4 z-[100] animate-in zoom-in-95">
            <div class="bg-gray-900 text-white rounded-[2rem] p-6 shadow-2xl border border-white/10 w-72">
                <div class="text-center mb-6">
                    <div class="w-20 h-20 bg-blue-600 rounded-full mx-auto flex items-center justify-center mb-3 animate-pulse">
                        <fa-icon [icon]="faPhone" class="text-2xl"></fa-icon>
                    </div>
                    <h4 class="font-bold text-lg">{{ session.username }}</h4>
                    <p class="text-blue-400 text-xs mt-1">
                        {{ session.isIncoming && !session.stream ? 'مكالمة واردة...' : 'في مكالمة تسميع...' }}
                    </p>
                </div>

                <audio #remoteAudio [srcObject]="session.stream" autoplay *ngIf="session.stream"></audio>

                <div class="flex items-center justify-center gap-4">
                    <!-- Answer Button (Incoming only) -->
                    <button *ngIf="session.isIncoming && !session.stream" (click)="answer()"
                        class="w-14 h-14 bg-green-500 hover:bg-green-600 rounded-2xl flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-green-500/20">
                        <fa-icon [icon]="faPhone"></fa-icon>
                    </button>

                    <!-- Mute Button -->
                    <button (click)="isMuted = !isMuted"
                        [class.bg-gray-700]="!isMuted" [class.bg-yellow-500]="isMuted"
                        class="w-12 h-12 rounded-2xl flex items-center justify-center transition-all">
                        <fa-icon [icon]="isMuted ? faMicrophoneSlash : faMicrophone"></fa-icon>
                    </button>

                    <!-- Hangup Button -->
                    <button (click)="hangup()"
                        class="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-2xl flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-red-500/20">
                        <fa-icon [icon]="faPhoneSlash"></fa-icon>
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; }
    `]
})
export class VoiceCallComponent implements OnInit, OnDestroy {
    faPhone = faPhone;
    faPhoneSlash = faPhoneSlash;
    faMicrophone = faMicrophone;
    faMicrophoneSlash = faMicrophoneSlash;
    faVolumeUp = faVolumeUp;

    session: CallSession | null = null;
    isMuted = false;
    private sub?: Subscription;

    constructor(private voiceCallService: VoiceCallService) { }

    ngOnInit() {
        this.sub = this.voiceCallService.callSession$.subscribe(s => {
            this.session = s;
        });
    }

    async answer() {
        await this.voiceCallService.answerCall();
    }

    hangup() {
        this.voiceCallService.endCall();
    }

    ngOnDestroy() {
        this.sub?.unsubscribe();
    }
}
