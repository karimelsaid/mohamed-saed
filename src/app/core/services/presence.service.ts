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

    private newMessageSubject = new Subject<PresenceUpdate | null>();
    public newMessage$ = this.newMessageSubject.asObservable();

    constructor() {
        // Use the same base URL as API but without /api prefix for socket
        // Path is set to /api/socket.io to match backend proxy configuration
        const socketUrl = environment.apiBaseUrl.includes('localhost')
            ? 'http://localhost:3000'
            : 'https://knoozbook.com';

        this.socket = io(socketUrl, {
            path: '/api/socket.io'
        });

        this.socket.on('presence_update', (users: ActiveUser[]) => {
            this.activeUsersSubject.next(users);
        });

        this.socket.on('global_presence_update', (userIds: string[]) => {
            this.globalPresenceSubject.next(userIds);
        });

        this.socket.on('new_message', (data: PresenceUpdate) => {
            this.newMessageSubject.next(data);
        });

        this.socket.on('connect', () => {
            console.log('✅ Connected to presence server');
            // We'll re-sync online status if needed
        });
    }

    setOnline(userId: string, username: string) {
        this.socket.emit('user_online', { userId, username });
    }

    joinHalaqa(halaqaId: string, userId: string, username: string) {
        this.socket.emit('join_halaqa', { halaqaId, userId, username });
    }

    ngOnDestroy() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
