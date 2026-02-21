import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
    faMicrophone, faMicrophoneSlash, faVideo, faVideoSlash,
    faPhoneSlash, faUsers, faClock, faVolumeUp
} from '@fortawesome/free-solid-svg-icons';
import { GroupCallService, GroupCallParticipant } from '../../../core/services/group-call.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-group-call-panel',
    standalone: true,
    imports: [CommonModule, FontAwesomeModule],
    templateUrl: './group-call-panel.component.html',
    styleUrls: ['./group-call-panel.component.css']
})
export class GroupCallPanelComponent implements OnInit, OnDestroy {
    @Input() roomId: string = '';
    @Input() userId: string = '';
    @Input() username: string = '';

    // Icons
    faMicrophone = faMicrophone;
    faMicrophoneSlash = faMicrophoneSlash;
    faVideo = faVideo;
    faVideoSlash = faVideoSlash;
    faPhoneSlash = faPhoneSlash;
    faUsers = faUsers;
    faClock = faClock;
    faVolumeUp = faVolumeUp;

    participants: GroupCallParticipant[] = [];
    callActive = false;
    isMuted = false;
    isVideoOn = false;
    callDuration = 0;
    errorMessage = '';

    private subs: Subscription[] = [];

    constructor(
        public groupCallService: GroupCallService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.subs.push(
            this.groupCallService.participants$.subscribe(map => {
                this.participants = Array.from(map.values());
                this.cdr.detectChanges();
                // Auto-play audio for each participant
                setTimeout(() => this.playParticipantAudio(), 100);
            }),
            this.groupCallService.callActive$.subscribe(v => {
                this.callActive = v;
                this.cdr.detectChanges();
            }),
            this.groupCallService.isMuted$.subscribe(v => {
                this.isMuted = v;
                this.cdr.detectChanges();
            }),
            this.groupCallService.isVideoOn$.subscribe(v => {
                this.isVideoOn = v;
                this.cdr.detectChanges();
            }),
            this.groupCallService.callDuration$.subscribe(v => {
                this.callDuration = v;
                this.cdr.detectChanges();
            }),
            this.groupCallService.error$.subscribe(msg => {
                this.errorMessage = msg;
                setTimeout(() => { this.errorMessage = ''; this.cdr.detectChanges(); }, 5000);
                this.cdr.detectChanges();
            })
        );
    }

    async joinCall() {
        try {
            await this.groupCallService.joinCall(this.roomId, this.userId, this.username, false);
        } catch (err: any) {
            this.errorMessage = err.message || 'فشل في الانضمام';
        }
    }

    leaveCall() {
        this.groupCallService.leaveCall();
    }

    toggleMute() {
        this.groupCallService.toggleMute();
    }

    async toggleVideo() {
        await this.groupCallService.toggleVideo();
    }

    formatDuration(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    private playParticipantAudio() {
        this.participants.forEach(p => {
            if (p.stream) {
                const audioEl = document.getElementById(`audio-${p.userId}`) as HTMLAudioElement;
                if (audioEl && audioEl.srcObject !== p.stream) {
                    audioEl.srcObject = p.stream;
                    audioEl.play().catch(e => console.warn('Auto-play blocked:', e));
                }
            }
        });
    }

    getGridClass(): string {
        const count = this.participants.length + 1; // +1 for local user
        if (count <= 2) return 'grid-cols-1 md:grid-cols-2';
        if (count <= 4) return 'grid-cols-2';
        if (count <= 6) return 'grid-cols-2 md:grid-cols-3';
        return 'grid-cols-3 md:grid-cols-4';
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
    }
}
