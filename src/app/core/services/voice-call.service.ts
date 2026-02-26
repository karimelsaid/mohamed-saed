import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import Peer, { MediaConnection } from 'peerjs';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { SignalingService } from './signaling.service';

export interface CallSession {
    peerId: string;
    username: string;
    isIncoming: boolean;
    stream?: MediaStream;
}

@Injectable({
    providedIn: 'root'
})
export class VoiceCallService implements OnDestroy {
    private peer?: Peer;
    private myId: string = '';
    private isInitialized = false;

    private callSessionSubject = new BehaviorSubject<CallSession | null>(null);
    public callSession$ = this.callSessionSubject.asObservable();

    private isPeerOpenSubject = new BehaviorSubject<boolean>(false);
    public isPeerOpen$ = this.isPeerOpenSubject.asObservable();

    private onCallEndedSource = new Subject<void>();
    public onCallEnded$ = this.onCallEndedSource.asObservable();

    private networkQualitySubject = new BehaviorSubject<{ rtt: number, packetLoss: number } | null>(null);
    public networkQuality$ = this.networkQualitySubject.asObservable();

    private myStream?: MediaStream;
    private statsInterval: any;

    constructor(
        private signalingService: SignalingService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        // We will initialize in init() once we have the userId
    }

    async init(userId: string) {
        if (!userId || !isPlatformBrowser(this.platformId)) return;
        if (this.myId === userId && this.peer && !this.peer.destroyed) return;

        console.log('📡 [VoiceCall] Initializing for:', userId);
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) { }
        }

        this.myId = userId;

        // Fetch dynamic ICE servers (Phase 1 Hardening)
        const iceServers = await this.signalingService.getIceServers();
        console.log('🌐 [VoiceCall] Using ICE Servers:', iceServers.length);

        this.peer = new Peer(userId, {
            debug: 2,
            config: {
                iceServers: iceServers
            }
        });

        this.peer.on('open', (id) => {
            console.log('✅ [VoiceCall] PeerJS connection opened with ID:', id);
            this.isInitialized = true;
        });

        this.peer.on('error', (err) => {
            console.error('❌ [VoiceCall] PeerJS error:', err);
            if (err.type === 'peer-unavailable') {
                // Ignore "peer-unavailable" as it's handled in the call logic
            } else if (err.type === 'disconnected' || err.type === 'network') {
                this.isInitialized = false;
            }
        });

        this.peer.on('disconnected', () => {
            console.warn('⚠️ [VoiceCall] PeerJS disconnected, attempting reconnect...');
            this.isInitialized = false;
            this.peer?.reconnect();
        });

        this.peer.on('call', (call: MediaConnection) => {
            console.log('📞 [VoiceCall] Incoming call from:', call.peer);
            this.callSessionSubject.next({
                peerId: call.peer,
                username: 'عضو آخر',
                isIncoming: true
            });
            this.handleIncomingCall(call);
        });
    }

    private handleIncomingCall(call: MediaConnection) {
        if (isPlatformBrowser(this.platformId)) {
            (window as any).incomingCall = call;
        }
    }

    async startCall(remotePeerId: string, remoteUsername: string): Promise<void> {
        if (!this.peer || this.peer.destroyed) {
            console.error('🚫 [VoiceCall] Peer object is missing or destroyed');
            throw new Error('Peer connection not active');
        }

        if (!this.peer.open) {
            console.warn('📡 [VoiceCall] Peer not open yet, waiting 1s...');
            // Wait up to 2 seconds for it to open
            let attempts = 0;
            while (!this.peer.open && attempts < 4) {
                await new Promise(r => setTimeout(r, 500));
                attempts++;
            }
            if (!this.peer.open) {
                throw new Error('لم يتم تفعيل اتصال المكالمات بعد، يرجى المحاولة مرة أخرى');
            }
        }

        if (!remotePeerId || remotePeerId === 'undefined' || remotePeerId === 'null') {
            console.error('🚫 [VoiceCall] Cannot start call: Invalid remotePeerId', remotePeerId);
            throw new Error('معرف المستخدم الآخر غير صحيح');
        }

        try {
            console.log('🎤 Requesting microphone for call...');
            this.myStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            console.log('📞 Initiating PeerJS call to:', remotePeerId);
            const call = this.peer.call(remotePeerId, this.myStream);

            this.callSessionSubject.next({
                peerId: remotePeerId,
                username: remoteUsername,
                isIncoming: false,
                stream: undefined
            });

            call.on('stream', (remoteStream: MediaStream) => {
                const current = this.callSessionSubject.value;
                if (current) {
                    this.callSessionSubject.next({ ...current, stream: remoteStream });
                }
            });

            call.on('close', () => this.endCall());
            if (isPlatformBrowser(this.platformId)) {
                (window as any).currentCall = call;
            }

            this.startStatsMonitoring(call);
        } catch (err) {
            console.error('Failed to get media stream', err);
            throw err;
        }
    }

    async answerCall(): Promise<void> {
        const call = (window as any).incomingCall as MediaConnection;
        if (!call) return;

        try {
            this.myStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            call.answer(this.myStream);

            call.on('stream', (remoteStream: MediaStream) => {
                const current = this.callSessionSubject.value;
                if (current) {
                    this.callSessionSubject.next({ ...current, stream: remoteStream });
                }
            });

            call.on('close', () => this.endCall());
            if (isPlatformBrowser(this.platformId)) {
                (window as any).currentCall = call;
            }

            this.startStatsMonitoring(call);
        } catch (err) {
            console.error('Failed to answer call', err);
            throw err;
        }
    }

    endCall() {
        const call = (window as any).currentCall as MediaConnection;
        if (call) call.close();

        if (this.myStream) {
            this.myStream.getTracks().forEach(track => track.stop());
            this.myStream = undefined;
        }

        this.callSessionSubject.next(null);
        this.onCallEndedSource.next();
        this.networkQualitySubject.next(null);
        if (this.statsInterval) clearInterval(this.statsInterval);

        if (isPlatformBrowser(this.platformId)) {
            (window as any).incomingCall = null;
            (window as any).currentCall = null;
        }
    }

    private async startStatsMonitoring(call: MediaConnection) {
        if (this.statsInterval) clearInterval(this.statsInterval);

        this.statsInterval = setInterval(async () => {
            const pc = (call as any).peerConnection as RTCPeerConnection;
            if (!pc) return;

            try {
                const stats = await pc.getStats();
                let rtt = 0;
                let packetLoss = 0;

                stats.forEach(report => {
                    if (report.type === 'remote-candidate' && report.roundTripTime) {
                        rtt = report.roundTripTime * 1000; // Convert to ms
                    }
                    if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                        packetLoss = report.packetsLost || 0;
                    }
                });

                this.networkQualitySubject.next({ rtt, packetLoss });
            } catch (e) {
                console.warn('📊 [VoiceCall] Error getting stats:', e);
            }
        }, 3000);
    }

    ngOnDestroy() {
        if (this.peer) {
            this.peer.destroy();
        }
    }
}
