import { Injectable, OnDestroy } from '@angular/core';
import Peer, { MediaConnection } from 'peerjs';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

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
    private peer: Peer;
    private myId: string = '';

    private callSessionSubject = new BehaviorSubject<CallSession | null>(null);
    public callSession$ = this.callSessionSubject.asObservable();

    private onCallEndedSource = new Subject<void>();
    public onCallEnded$ = this.onCallEndedSource.asObservable();

    private myStream?: MediaStream;

    constructor() {
        // PeerJS will auto-generate an ID if none provided, 
        // but we'll initialize it later with userId for consistency
        this.peer = new Peer();
    }

    init(userId: string) {
        if (this.myId === userId && this.peer && !this.peer.destroyed) return;

        console.log('📡 Initializing VoiceCallService for:', userId);
        if (this.peer) this.peer.destroy();

        this.myId = userId;
        this.peer = new Peer(userId);

        this.peer.on('open', (id) => {
            console.log('✅ PeerJS connection opened with ID:', id);
        });

        this.peer.on('error', (err) => {
            console.error('❌ PeerJS error:', err);
            // Re-init if necessary or notify UI
        });

        this.peer.on('call', (call: MediaConnection) => {
            console.log('📞 Incoming call from:', call.peer);
            this.callSessionSubject.next({
                peerId: call.peer,
                username: 'عضو آخر',
                isIncoming: true
            });
            this.handleIncomingCall(call);
        });
    }

    private handleIncomingCall(call: MediaConnection) {
        (window as any).incomingCall = call;
    }

    async startCall(remotePeerId: string, remoteUsername: string): Promise<void> {
        if (!this.peer || this.peer.destroyed) {
            throw new Error('Peer connection not active');
        }
        try {
            console.log('🎤 Requesting microphone for call...');
            this.myStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('📞 Starting call to:', remotePeerId);
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
            (window as any).currentCall = call;
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
            (window as any).currentCall = call;
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
        (window as any).incomingCall = null;
        (window as any).currentCall = null;
    }

    ngOnDestroy() {
        if (this.peer) {
            this.peer.destroy();
        }
    }
}
