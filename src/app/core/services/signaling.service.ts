import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, Subject, lastValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class SignalingService implements OnDestroy {
    private socket: Socket;
    private isConnectedSubject = new BehaviorSubject<boolean>(false);
    public isConnected$ = this.isConnectedSubject.asObservable();

    // 1:1 Call Subjects
    private callMadeSubject = new Subject<{ offer: any, from: string }>();
    public callMade$ = this.callMadeSubject.asObservable();

    private answerMadeSubject = new Subject<{ answer: any, from: string }>();
    public answerMade$ = this.answerMadeSubject.asObservable();

    private iceCandidateSubject = new Subject<{ candidate: any, from: string }>();
    public iceCandidate$ = this.iceCandidateSubject.asObservable();

    // Group Call Subjects
    private roomUsersSubject = new Subject<{ userId: string, username: string }[]>();
    public roomUsers$ = this.roomUsersSubject.asObservable();

    private userJoinedSubject = new Subject<{ userId: string, username: string }>();
    public userJoined$ = this.userJoinedSubject.asObservable();

    private userLeftSubject = new Subject<{ userId: string }>();
    public userLeft$ = this.userLeftSubject.asObservable();

    private groupOfferSubject = new Subject<{ offer: any, from: string, roomId: string }>();
    public groupOffer$ = this.groupOfferSubject.asObservable();

    private groupAnswerSubject = new Subject<{ answer: any, from: string, roomId: string }>();
    public groupAnswer$ = this.groupAnswerSubject.asObservable();

    private groupIceCandidateSubject = new Subject<{ candidate: any, from: string, roomId: string }>();
    public groupIceCandidate$ = this.groupIceCandidateSubject.asObservable();

    constructor(
        private http: HttpClient,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        console.log('📡 [SignalingService] PLATFORM_ID:', this.platformId);
        console.log('📡 [SignalingService] typeof window:', typeof window);

        if (!isPlatformBrowser(this.platformId)) {
            console.log('📡 [SignalingService] Server mode detected. Mocking socket.');
            this.socket = {
                on: () => this,
                off: () => this,
                emit: () => this,
                disconnect: () => this
            } as any;
            return;
        }

        let socketUrl = environment.apiBaseUrl.split('/api')[0] || '';
        if (socketUrl && socketUrl.endsWith('/')) {
            socketUrl = socketUrl.slice(0, -1);
        }

        // Fallback for mobile/relative paths
        if (!socketUrl.startsWith('http')) {
            const proto = window.location.protocol;
            const host = window.location.host;
            socketUrl = `${proto}//${host}`;
        }

        const signalingOptions: any = {};
        signalingOptions.path = '/api/socket.io';
        signalingOptions.transports = ['websocket'];
        signalingOptions.reconnectionAttempts = 10;
        
        this.socket = io(`${socketUrl}/signaling`, signalingOptions);

        this.socket.on('connect', () => {
            console.log('✅ [Signaling] Connected:', this.socket.id);
            this.isConnectedSubject.next(true);

            const userId = localStorage.getItem('last_user_id');
            if (userId) {
                this.register(userId);
            }
        });

        this.socket.on('disconnect', () => {
            console.warn('❌ [Signaling] Disconnected');
            this.isConnectedSubject.next(false);
        });

        // 1:1 call events
        this.socket.on('call-made', (data: any) => this.callMadeSubject.next(data));
        this.socket.on('answer-made', (data: any) => this.answerMadeSubject.next(data));
        this.socket.on('ice-candidate', (data: any) => this.iceCandidateSubject.next(data));

        // Group call events
        this.socket.on('room-users', (data: any) => this.roomUsersSubject.next(data));
        this.socket.on('user-joined', (data: any) => this.userJoinedSubject.next(data));
        this.socket.on('user-left', (data: any) => this.userLeftSubject.next(data));
        this.socket.on('group-offer', (data: any) => this.groupOfferSubject.next(data));
        this.socket.on('group-answer', (data: any) => this.groupAnswerSubject.next(data));
        this.socket.on('group-ice-candidate', (data: any) => this.groupIceCandidateSubject.next(data));
    }

    // === 1:1 Call Methods ===

    register(userId: string) {
        this.socket.emit('register', userId);
    }

    callUser(to: string, offer: any) {
        this.socket.emit('call-user', { to, offer });
    }

    makeAnswer(to: string, answer: any) {
        this.socket.emit('make-answer', { to, answer });
    }

    sendIceCandidate(to: string, candidate: any) {
        this.socket.emit('ice-candidate', { to, candidate });
    }

    // === Group Call Methods ===

    joinRoom(roomId: string, username: string) {
        this.socket.emit('join-room', { roomId, username });
    }

    leaveRoom(roomId: string) {
        this.socket.emit('leave-room', { roomId });
    }

    sendGroupOffer(to: string, offer: any, roomId: string) {
        this.socket.emit('group-offer', { to, offer, roomId });
    }

    sendGroupAnswer(to: string, answer: any, roomId: string) {
        this.socket.emit('group-answer', { to, answer, roomId });
    }

    sendGroupIceCandidate(to: string, candidate: any, roomId: string) {
        this.socket.emit('group-ice-candidate', { to, candidate, roomId });
    }

    getRoomInfo(roomId: string): Promise<{ active: boolean, participants: any[], count: number }> {
        return new Promise((resolve) => {
            this.socket.emit('get-room-info', { roomId }, (data: any) => {
                resolve(data);
            });
        });
    }

    // === Utility ===

    async getIceServers(): Promise<any[]> {
        try {
            const data: any = await lastValueFrom(this.http.get(`${environment.apiBaseUrl}/ice-servers`));
            return data.iceServers || [];
        } catch (err) {
            console.error('❌ [Signaling] Failed to fetch ICE servers:', err);
            return [
                { urls: 'stun:stun.l.google.com:19302' }
            ];
        }
    }

    ngOnDestroy() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
