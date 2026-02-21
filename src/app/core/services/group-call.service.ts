import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { SignalingService } from './signaling.service';

export interface GroupCallParticipant {
    userId: string;
    username: string;
    stream?: MediaStream;
    isMuted?: boolean;
    isSpeaking?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class GroupCallService implements OnDestroy {
    private peerConnections = new Map<string, RTCPeerConnection>();
    private localStream?: MediaStream;
    private currentRoomId: string = '';
    private currentUserId: string = '';
    private iceServers: any[] = [];
    private subscriptions: Subscription[] = [];

    private participantsSubject = new BehaviorSubject<Map<string, GroupCallParticipant>>(new Map());
    public participants$ = this.participantsSubject.asObservable();

    private callActiveSubject = new BehaviorSubject<boolean>(false);
    public callActive$ = this.callActiveSubject.asObservable();

    private isMutedSubject = new BehaviorSubject<boolean>(false);
    public isMuted$ = this.isMutedSubject.asObservable();

    private isVideoOnSubject = new BehaviorSubject<boolean>(false);
    public isVideoOn$ = this.isVideoOnSubject.asObservable();

    private callDurationSubject = new BehaviorSubject<number>(0);
    public callDuration$ = this.callDurationSubject.asObservable();

    private errorSubject = new Subject<string>();
    public error$ = this.errorSubject.asObservable();

    private durationInterval: any;

    constructor(private signalingService: SignalingService) {
        this.setupSignalingListeners();
    }

    private setupSignalingListeners() {
        // When we receive existing users in the room
        this.subscriptions.push(
            this.signalingService.roomUsers$.subscribe(users => {
                console.log('📞 [GroupCall] Existing users in room:', users);
                users.forEach(u => this.createPeerConnection(u.userId, u.username, true));
            })
        );

        // When a new user joins
        this.subscriptions.push(
            this.signalingService.userJoined$.subscribe(({ userId, username }) => {
                console.log(`📞 [GroupCall] User joined: ${username}`);
                // New user creates offer to us (they see us in room-users)
                // We just need to add them to participants, they'll send offer
                const participants = this.participantsSubject.value;
                if (!participants.has(userId)) {
                    participants.set(userId, { userId, username });
                    this.participantsSubject.next(new Map(participants));
                }
            })
        );

        // When a user leaves
        this.subscriptions.push(
            this.signalingService.userLeft$.subscribe(({ userId }) => {
                console.log(`📞 [GroupCall] User left: ${userId}`);
                this.removePeer(userId);
            })
        );

        // Handle incoming offers
        this.subscriptions.push(
            this.signalingService.groupOffer$.subscribe(async ({ offer, from, roomId }) => {
                if (roomId !== this.currentRoomId) return;
                console.log(`📞 [GroupCall] Received offer from ${from}`);
                await this.handleOffer(from, offer);
            })
        );

        // Handle incoming answers
        this.subscriptions.push(
            this.signalingService.groupAnswer$.subscribe(async ({ answer, from, roomId }) => {
                if (roomId !== this.currentRoomId) return;
                console.log(`📞 [GroupCall] Received answer from ${from}`);
                const pc = this.peerConnections.get(from);
                if (pc && pc.signalingState === 'have-local-offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                }
            })
        );

        // Handle ICE candidates
        this.subscriptions.push(
            this.signalingService.groupIceCandidate$.subscribe(async ({ candidate, from, roomId }) => {
                if (roomId !== this.currentRoomId) return;
                const pc = this.peerConnections.get(from);
                if (pc && candidate) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) {
                        console.warn('📞 [GroupCall] ICE candidate error:', e);
                    }
                }
            })
        );
    }

    async joinCall(roomId: string, userId: string, username: string, withVideo: boolean = false): Promise<void> {
        try {
            this.currentRoomId = roomId;
            this.currentUserId = userId;

            // Get ICE servers
            this.iceServers = await this.signalingService.getIceServers();

            // Request media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });

            this.isVideoOnSubject.next(withVideo);
            this.callActiveSubject.next(true);

            // Join the signaling room
            this.signalingService.joinRoom(roomId, username);

            // Start duration timer
            this.startDurationTimer();

            console.log(`📞 [GroupCall] Joined call room: ${roomId}`);
        } catch (err: any) {
            console.error('📞 [GroupCall] Failed to join:', err);
            this.errorSubject.next(err.message || 'فشل في الانضمام للمكالمة');
            throw err;
        }
    }

    leaveCall(): void {
        console.log('📞 [GroupCall] Leaving call...');

        // Leave signaling room
        if (this.currentRoomId) {
            this.signalingService.leaveRoom(this.currentRoomId);
        }

        // Close all peer connections
        this.peerConnections.forEach((pc, peerId) => {
            pc.close();
        });
        this.peerConnections.clear();

        // Stop local media
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = undefined;
        }

        // Reset state
        this.participantsSubject.next(new Map());
        this.callActiveSubject.next(false);
        this.isMutedSubject.next(false);
        this.isVideoOnSubject.next(false);
        this.callDurationSubject.next(0);
        this.currentRoomId = '';

        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }
    }

    toggleMute(): void {
        if (!this.localStream) return;
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.isMutedSubject.next(!audioTrack.enabled);
        }
    }

    async toggleVideo(): Promise<void> {
        if (!this.localStream) return;

        const currentVideo = this.isVideoOnSubject.value;

        if (currentVideo) {
            // Turn off video
            this.localStream.getVideoTracks().forEach(t => {
                t.stop();
                this.localStream!.removeTrack(t);
            });
            this.isVideoOnSubject.next(false);
        } else {
            // Turn on video
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                const videoTrack = videoStream.getVideoTracks()[0];
                this.localStream.addTrack(videoTrack);

                // Replace track in all peer connections
                this.peerConnections.forEach((pc) => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) {
                        sender.replaceTrack(videoTrack);
                    } else {
                        pc.addTrack(videoTrack, this.localStream!);
                    }
                });

                this.isVideoOnSubject.next(true);
            } catch (err) {
                console.error('📞 [GroupCall] Failed to enable video:', err);
                this.errorSubject.next('فشل في تشغيل الكاميرا');
            }
        }
    }

    getLocalStream(): MediaStream | undefined {
        return this.localStream;
    }

    // === Private Methods ===

    private async createPeerConnection(peerId: string, peerUsername: string, createOffer: boolean): Promise<void> {
        if (this.peerConnections.has(peerId)) return;

        console.log(`📞 [GroupCall] Creating peer connection to ${peerUsername} (${peerId}), initiator: ${createOffer}`);

        const pc = new RTCPeerConnection({
            iceServers: this.iceServers
        });

        this.peerConnections.set(peerId, pc);

        // Add participants
        const participants = this.participantsSubject.value;
        if (!participants.has(peerId)) {
            participants.set(peerId, { userId: peerId, username: peerUsername });
            this.participantsSubject.next(new Map(participants));
        }

        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream!);
            });
        }

        // Handle incoming remote tracks
        pc.ontrack = (event) => {
            console.log(`📞 [GroupCall] Received track from ${peerUsername}`);
            const participants = this.participantsSubject.value;
            const participant = participants.get(peerId);
            if (participant) {
                participant.stream = event.streams[0];
                this.participantsSubject.next(new Map(participants));
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.signalingService.sendGroupIceCandidate(peerId, event.candidate, this.currentRoomId);
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`📞 [GroupCall] Connection to ${peerUsername}: ${pc.connectionState}`);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                this.removePeer(peerId);
            }
        };

        // Create and send offer if we're the initiator
        if (createOffer) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.signalingService.sendGroupOffer(peerId, offer, this.currentRoomId);
            } catch (err) {
                console.error(`📞 [GroupCall] Failed to create offer for ${peerUsername}:`, err);
            }
        }
    }

    private async handleOffer(fromUserId: string, offer: RTCSessionDescriptionInit): Promise<void> {
        // Create peer connection if it doesn't exist
        if (!this.peerConnections.has(fromUserId)) {
            const participants = this.participantsSubject.value;
            const username = participants.get(fromUserId)?.username || 'عضو';
            await this.createPeerConnection(fromUserId, username, false);
        }

        const pc = this.peerConnections.get(fromUserId);
        if (!pc) return;

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.signalingService.sendGroupAnswer(fromUserId, answer, this.currentRoomId);
        } catch (err) {
            console.error(`📞 [GroupCall] Failed to handle offer from ${fromUserId}:`, err);
        }
    }

    private removePeer(peerId: string): void {
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(peerId);
        }

        const participants = this.participantsSubject.value;
        participants.delete(peerId);
        this.participantsSubject.next(new Map(participants));
    }

    private startDurationTimer(): void {
        let seconds = 0;
        this.durationInterval = setInterval(() => {
            seconds++;
            this.callDurationSubject.next(seconds);
        }, 1000);
    }

    ngOnDestroy(): void {
        this.leaveCall();
        this.subscriptions.forEach(s => s.unsubscribe());
    }
}
