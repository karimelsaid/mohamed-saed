import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ActiveUser {
    userId: string;
    username: string;
    socketId: string;
    joinedAt: Date;
}

export interface PresenceUpdate {
    halaqaId: string;
    message: any;
}

@Injectable({
    providedIn: 'root'
})
export class PresenceService implements OnDestroy {
    private socket: Socket;
    private activeUsersSubject = new BehaviorSubject<ActiveUser[]>([]);
    public activeUsers$ = this.activeUsersSubject.asObservable();

    private globalPresenceSubject = new BehaviorSubject<string[]>([]);
    public globalPresence$ = this.globalPresenceSubject.asObservable();

    private newMessageSubject = new BehaviorSubject<PresenceUpdate | null>(null);
    public newMessage$ = this.newMessageSubject.asObservable();

    private isConnectedSubject = new BehaviorSubject<boolean>(false);
    public isConnected$ = this.isConnectedSubject.asObservable();

    private socketStatusSubject = new BehaviorSubject<string>('جاري التهيئة...');
    public socketStatus$ = this.socketStatusSubject.asObservable();

    constructor() {
        let socketUrl = environment.apiBaseUrl.split('/api')[0] || '';
        // Ensure we don't have trailing slashes
        if (socketUrl && socketUrl.endsWith('/')) {
            socketUrl = socketUrl.slice(0, -1);
        }

        // Fallback for relative URLs or missing protocol
        if (!socketUrl.startsWith('http') && typeof window !== 'undefined') {
            const proto = window.location.protocol;
            const host = window.location.host;
            socketUrl = `${proto}//${host}`;
        }

        console.log('🔌 Initializing socket at:', socketUrl, 'with path /api/socket.io');
        this.socketStatusSubject.next('جاري الاتصال بالسيرفر...');

        this.socket = io(socketUrl, {
            path: '/api/socket.io',
            transports: ['websocket'], // Force websocket only to avoid polling issues (xhr poll error)
            reconnectionAttempts: 20,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000, // 20 second timeout for mobile stability
            randomizationFactor: 0.5
        });

        this.socket.on('presence_update', (users: ActiveUser[]) => {
            console.log('👥 Presence update in room:', users.length, 'users');
            this.activeUsersSubject.next(users);
        });

        this.socket.on('global_presence_update', (userIds: string[]) => {
            console.log('🌎 Global presence update:', userIds.length, 'online');
            this.globalPresenceSubject.next(userIds);
        });

        this.socket.on('new_message', (data: PresenceUpdate) => {
            console.log('📨 New real-time message received:', data);
            this.newMessageSubject.next(data);
        });

        this.socket.on('connect', () => {
            console.log('✅ Connected to presence server', this.socket.id);
            this.isConnectedSubject.next(true);
            this.socketStatusSubject.next('متصل الآن');

            const lastUserId = localStorage.getItem('last_user_id');
            const lastUsername = localStorage.getItem('last_username');
            if (lastUserId && lastUsername) {
                this.setOnline(lastUserId, lastUsername);
            }
        });

        this.socket.on('reconnect', (attempt) => {
            console.log('🔄 Reconnected after attempt:', attempt);
            this.isConnectedSubject.next(true);
            this.socketStatusSubject.next('تم إعادة الاتصال');
        });

        this.socket.on('disconnect', (reason) => {
            console.warn('❌ Disconnected from presence server:', reason);
            this.isConnectedSubject.next(false);
            this.socketStatusSubject.next('انقطع الاتصال: ' + reason);
        });

        this.socket.on('connect_error', (error) => {
            console.error('⚠️ Socket Connection Error:', error);
            this.isConnectedSubject.next(false);
            this.socketStatusSubject.next('خطأ في الاتصال: ' + error.message);
        });
    }

    setOnline(userId: string, username: string) {
        localStorage.setItem('last_user_id', userId);
        localStorage.setItem('last_username', username);
        this.socket.emit('user_online', { userId, username });
    }

    joinHalaqa(halaqaId: string, userId: string, username: string) {
        console.log(`🏠 Joining Halaqa room: ${halaqaId} as ${username}`);
        this.socket.emit('join_halaqa', { halaqaId, userId, username });
    }

    forceReconnect() {
        this.socketStatusSubject.next('إعادة اتصال يدوي...');
        this.socket.disconnect().connect();
    }

    ngOnDestroy() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
