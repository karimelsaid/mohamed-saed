import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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

    private pinnedUpdateSubject = new Subject<any>();
    public pinnedMessageUpdate$ = this.pinnedUpdateSubject.asObservable();

    private pageSyncSubject = new Subject<any>();
    public pageSync$ = this.pageSyncSubject.asObservable();

    private callRoomUpdateSubject = new Subject<any>();
    public callRoomUpdate$ = this.callRoomUpdateSubject.asObservable();

    private isConnectedSubject = new BehaviorSubject<boolean>(false);
    public isConnected$ = this.isConnectedSubject.asObservable();

    private socketStatusSubject = new BehaviorSubject<string>('جاري التهيئة...');
    public socketStatus$ = this.socketStatusSubject.asObservable();

    constructor(
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        if (!isPlatformBrowser(this.platformId)) {
            console.log('🔌 [PresenceService] Server mode detected. Mocking socket.');
            this.socket = {
                on: () => this,
                off: () => this,
                emit: () => this,
                disconnect: () => this
            } as any;
            return;
        }

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

        const socketOptions: any = {};
        socketOptions.path = '/api/socket.io';
        socketOptions.transports = ['websocket'];
        socketOptions.reconnectionAttempts = 20;
        socketOptions.reconnectionDelay = 1000;
        socketOptions.reconnectionDelayMax = 5000;
        socketOptions.timeout = 20000;
        socketOptions.randomizationFactor = 0.5;
        
        this.socket = io(socketUrl, socketOptions);

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

        this.socket.on('message_pinned_update', (data: any) => {
            console.log('📌 Message pin update received:', data);
            this.pinnedUpdateSubject.next(data);
        });

        this.socket.on('page_sync_update', (data: any) => {
            console.log('📖 Mushaf Page Sync update received:', data);
            this.pageSyncSubject.next(data);
        });

        this.socket.on('call_room_update', (data: any) => {
            console.log('📞 Group call room update received:', data);
            this.callRoomUpdateSubject.next(data);
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

        this.socket.on('reconnect', (attempt: number) => {
            console.log('🔄 Reconnected after attempt:', attempt);
            this.isConnectedSubject.next(true);
            this.socketStatusSubject.next('تم إعادة الاتصال');
        });

        this.socket.on('disconnect', (reason: string) => {
            console.warn('❌ Disconnected from presence server:', reason);
            this.isConnectedSubject.next(false);
            this.socketStatusSubject.next('انقطع الاتصال: ' + reason);
        });

        this.socket.on('connect_error', (error: any) => {
            console.error('⚠️ Socket Connection Error:', error);
            this.isConnectedSubject.next(false);
            this.socketStatusSubject.next('خطأ في الاتصال: ' + error.message);
        });
    }

    setOnline(userId: string, username: string) {
        if (!isPlatformBrowser(this.platformId)) return;
        localStorage.setItem('last_user_id', userId);
        localStorage.setItem('last_username', username);
        this.socket.emit('user_online', { userId, username });
    }

    joinHalaqa(halaqaId: string, userId: string, username: string) {
        if (!isPlatformBrowser(this.platformId)) return;
        console.log(`🏠 Joining Halaqa room: ${halaqaId} as ${username}`);
        this.socket.emit('join_halaqa', { halaqaId, userId, username });
    }

    forceReconnect() {
        if (!isPlatformBrowser(this.platformId)) return;
        this.socketStatusSubject.next('إعادة اتصال يدوي...');
        this.socket.disconnect().connect();
    }

    syncPage(halaqaId: string, userId: string, pageNumber: number) {
        if (!isPlatformBrowser(this.platformId)) return;
        if (this.socket) {
            console.log(`📤 Sending page sync: Page ${pageNumber} for Halaqa ${halaqaId}`);
            this.socket.emit('sync_page', { halaqaId, userId, pageNumber });
        }
    }

    ngOnDestroy() {
        if (isPlatformBrowser(this.platformId) && this.socket) {
            this.socket.disconnect();
        }
    }
}
