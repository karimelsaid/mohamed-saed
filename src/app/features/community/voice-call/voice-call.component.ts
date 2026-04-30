import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPhone, faPhoneSlash, faMicrophone, faMicrophoneSlash, faVolumeUp, faWindowMinimize } from '@fortawesome/free-solid-svg-icons';
import { VoiceCallService, CallSession } from '../../../core/services/voice-call.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-voice-call',
    standalone: true,
    imports: [CommonModule, FontAwesomeModule],
    template: `
        <div *ngIf="session" 
             [class.minimized]="isMinimized"
             class="fixed z-[999] transition-all duration-500 ease-in-out"
             [ngClass]="isMinimized ? 'bottom-20 right-4' : 'inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'">
            
            <!-- Floating Bubble (Minimized) -->
            <div *ngIf="isMinimized" (click)="isMinimized = false"
                 class="w-16 h-16 bg-blue-600 rounded-full shadow-2xl flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all animate-bounce-subtle border-4 border-white dark:border-gray-800">
                <div class="relative">
                    <fa-icon [icon]="faPhone" class="text-white text-xl"></fa-icon>
                    <span class="absolute -top-1 -right-1 flex h-3 w-3">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                </div>
            </div>

            <!-- Full Call UI (Maximized) -->
            <div *ngIf="!isMinimized" 
                 class="bg-gray-900 text-white rounded-[2.5rem] p-8 shadow-2xl border border-white/10 w-full max-w-sm animate-in zoom-in-95 duration-300 relative overflow-hidden">
                
                <!-- Minimize Button -->
                <button (click)="isMinimized = true" class="absolute top-6 left-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
                    <fa-icon [icon]="faWindowMinimize" class="text-xs"></fa-icon>
                </button>

                <div class="text-center mb-8 pt-4">
                    <div class="relative inline-block mb-6">
                        <div class="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <span class="text-3xl font-bold uppercase">{{ session.username.charAt(0) }}</span>
                        </div>
                        <div class="absolute inset-0 rounded-full border-4 border-blue-500/30 animate-ping"></div>
                    </div>
                    
                    <h4 class="font-bold text-2xl mb-2">{{ session.username }}</h4>
                    <p class="text-blue-400 font-medium animate-pulse">
                        {{ getStatusText() }}
                    </p>
                </div>

                <audio #remoteAudio [srcObject]="session.stream" autoplay *ngIf="session.stream"></audio>

                <div class="grid grid-cols-2 gap-4 mt-8">
                    <!-- Accept Button -->
                    <button *ngIf="session.isIncoming && !session.stream" (click)="answer()"
                        class="col-span-2 py-4 bg-green-500 hover:bg-green-600 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-green-500/20 font-bold mb-2 text-white">
                        <fa-icon [icon]="faPhone"></fa-icon>
                        رد على المكالمة
                    </button>

                    <!-- Mute Toggle -->
                    <button (click)="toggleMute()" [class]="(isMuted ? 'bg-red-500/20 text-red-500' : 'bg-white/10') + ' h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all hover:bg-white/20'">
                        <fa-icon [icon]="isMuted ? faMicrophoneSlash : faMicrophone"></fa-icon>
                        <span class="text-[10px]">كتم الصوت</span>
                    </button>

                    <!-- Hangup -->
                    <button (click)="hangup()" class="h-16 bg-red-500 hover:bg-red-600 text-white rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-lg shadow-red-500/20">
                        <fa-icon [icon]="faPhoneSlash"></fa-icon>
                        <span class="text-[10px]">إنهاء</span>
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; }
        .animate-bounce-subtle {
            animation: bounce-subtle 3s infinite ease-in-out;
        }
        @keyframes bounce-subtle {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }
    `]
})
export class VoiceCallComponent implements OnInit, OnDestroy {
    faPhone = faPhone;
    faPhoneSlash = faPhoneSlash;
    faMicrophone = faMicrophone;
    faMicrophoneSlash = faMicrophoneSlash;
    faVolumeUp = faVolumeUp;
    faWindowMinimize = faWindowMinimize;

    session: CallSession | null = null;
    isMuted = false;
    isMinimized = false;
    private sub?: Subscription;
    private sounds: { ringtone: HTMLAudioElement; calling: HTMLAudioElement } = {} as any;

    constructor(
        private voiceCallService: VoiceCallService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        if (isPlatformBrowser(this.platformId)) {
            this.sounds.ringtone = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
            this.sounds.ringtone.loop = true;
            this.sounds.calling = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
            this.sounds.calling.loop = true;
        }
    }

    ngOnInit() {
        this.sub = this.voiceCallService.callSession$.subscribe(s => {
            const oldSession = this.session;
            this.session = s;

            if (s) {
                this.manageSounds(s);
                if (s.isIncoming && !oldSession) {
                    this.isMinimized = false;
                }
            } else {
                this.stopAllSounds();
            }
        });
    }

    getStatusText(): string {
        if (!this.session) return '';
        if (this.session.stream) return 'متصل الآن - جاري التسميع';
        if (this.session.isIncoming) return 'مكالمة واردة...';
        return 'جاري الاتصال...';
    }

    private manageSounds(session: CallSession) {
        if (!isPlatformBrowser(this.platformId)) return;
        if (session.stream) {
            this.stopAllSounds();
            return;
        }

        if (session.isIncoming) {
            this.sounds.ringtone.play().catch(() => { });
        } else {
            this.sounds.calling.play().catch(() => { });
        }
    }

    private stopAllSounds() {
        if (this.sounds.ringtone) {
            this.sounds.ringtone.pause();
            this.sounds.ringtone.currentTime = 0;
        }
        if (this.sounds.calling) {
            this.sounds.calling.pause();
            this.sounds.calling.currentTime = 0;
        }
    }

    async answer() {
        this.stopAllSounds();
        await this.voiceCallService.answerCall();
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
    }

    hangup() {
        this.stopAllSounds();
        this.voiceCallService.endCall();
    }

    ngOnDestroy() {
        this.sub?.unsubscribe();
        this.stopAllSounds();
    }
}
