import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ActiveUser {
    userId: string;
    username: string;
    socketId: string;
    joinedAt: Date;
}

@Injectable({
    providedIn: 'root'
})
export class PresenceService implements OnDestroy {
    private socket: Socket;
    private activeUsersSubject = new BehaviorSubject<ActiveUser[]>([]);
    public activeUsers$ = this.activeUsersSubject.asObservable();

    constructor() {
        // Use the same base URL as API but without /api prefix for socket
        // Or handle it via proxy if it's configured for WS
        const socketUrl = environment.apiBaseUrl.includes('localhost')
            ? 'http://localhost:3000'
            : 'https://knoozbook.com';

        this.socket = io(socketUrl);

        this.socket.on('presence_update', (users: ActiveUser[]) => {
            this.activeUsersSubject.next(users);
        });

        this.socket.on('connect', () => {
            console.log('✅ Connected to presence server');
        });
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
