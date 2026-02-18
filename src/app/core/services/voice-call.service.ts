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
        if (this.myId === userId) return;

        if (this.peer) this.peer.destroy();

        this.myId = userId;
        this.peer = new Peer(userId);

        this.peer.on('call', (call) => {
            console.log('📞 Incoming call from:', call.peer);
            // In a real app, we'd show a "Accept/Reject" UI. 
            // For now, let's expose the incoming call state.
            this.callSessionSubject.next({
                peerId: call.peer,
                username: 'عضو آخر',
                isIncoming: true
            });

            // Note: We don't answer yet until the user clicks "Answer" in UI
            this.handleIncomingCall(call);
        });
    }

    private handleIncomingCall(call: MediaConnection) {
        // This will be stored for when UI calls 'answer()'
        (window as any).incomingCall = call;
    }

    async startCall(remotePeerId: string, remoteUsername: string): Promise<void> {
        try {
            this.myStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const call = this.peer.call(remotePeerId, this.myStream);

            this.callSessionSubject.next({
                peerId: remotePeerId,
                username: remoteUsername,
                isIncoming: false,
                stream: undefined
            });

            call.on('stream', (remoteStream) => {
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

            call.on('stream', (remoteStream) => {
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
