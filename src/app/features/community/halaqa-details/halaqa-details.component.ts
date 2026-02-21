import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
    faArrowRight, faPaperPlane, faInfoCircle, faUsers, faCopy, faCheck,
    faComments, faUserShield, faUser, faSync, faLink, faTrash, faUserGraduate, faStar, faSearch,
    faMicrophone, faStop, faPlay, faPause, faUserCircle, faTimes, faPhone, faReply, faThumbtack,
    faFilePdf, faFileAlt, faDownload, faChartBar, faClock, faImages, faMicrophoneLines, faFileLines,
    faPhoneVolume
} from '@fortawesome/free-solid-svg-icons';
import { HalaqaService } from '../../../core/services/halaqa.service';
import { PresenceService, ActiveUser } from '../../../core/services/presence.service';
import { VoiceCallService, CallSession } from '../../../core/services/voice-call.service';
import { AuthService } from '../../../auth/auth.service';
import { environment } from '../../../../environments/environment';
import { Subscription } from 'rxjs';
import { AudioPlayerComponent } from '../../../shared/components/audio-player/audio-player.component';
import { GroupCallPanelComponent } from '../group-call-panel/group-call-panel.component';
import { GroupCallService } from '../../../core/services/group-call.service';

@Component({
    selector: 'app-halaqa-details',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule, AudioPlayerComponent, GroupCallPanelComponent],
    templateUrl: './halaqa-details.component.html',
    styleUrls: ['./halaqa-details.component.css']
})
export class HalaqaDetailsComponent implements OnInit, AfterViewChecked {
    // Icons
    faArrowRight = faArrowRight;
    faPaperPlane = faPaperPlane;
    faInfoCircle = faInfoCircle;
    faUsers = faUsers;
    faCopy = faCopy;
    faCheck = faCheck;
    faComments = faComments;
    faUserShield = faUserShield;
    faUser = faUser;
    faSync = faSync;
    faLink = faLink;
    faTrash = faTrash;
    faUserGraduate = faUserGraduate;
    faSearch = faSearch;
    faReply = faReply;
    faTimes = faTimes;
    faThumbtack = faThumbtack;
    faFilePdf = faFilePdf;
    faFileAlt = faFileAlt;
    faDownload = faDownload;
    faStar = faStar;
    faMicrophone = faMicrophone;
    faStop = faStop;
    faPlay = faPlay;
    faPause = faPause;
    faUserCircle = faUserCircle;
    faPhone = faPhone;
    faChartBar = faChartBar;
    faClock = faClock;
    faImages = faImages;
    faMicrophoneLines = faMicrophoneLines;
    faFileLines = faFileLines;
    faPhoneVolume = faPhoneVolume;

    // Group Call State
    callRoomActive = false;
    callRoomCount = 0;
    callRoomParticipants: string[] = [];

    // State
    activeTab: 'chat' | 'info' | 'gallery' = 'chat';
    halaqaId: string = '';
    halaqaData: any = null;
    halaqaStats: any = null;
    halaqaMedia: any[] = [];
    isLoadingStats = false;
    isLoadingMedia = false;
    mediaFilter: 'all' | 'image' | 'video' | 'file' | 'voice' = 'all';
    messages: any[] = [];
    currentUser: any = null;
    currentUserId: string = '';
    newMessageContent: string = '';
    replyToMessage: any = null;

    // Pagination State
    hasMoreMessages = true;
    isLoadingMore = false;
    pageSize = 30;

    // Search State
    showSearch = false;
    searchQuery = '';
    searchResults: any[] = [];
    isSearchingMessages = false;

    // Mentions State
    showMentionSuggestions = false;
    mentionSuggestions: any[] = [];
    mentionFilter = '';
    mentionStartIndex = -1;
    pinnedMessages: any[] = [];
    activeUsers: ActiveUser[] = [];
    private presenceSub?: Subscription;

    isLoadingDetails = true;
    isLoadingMessages = false;
    isSending = false;
    copySuccess = false;
    checkingMembership = true;
    isDeleting = false;

    // Profile Modal
    selectedUser: any = null;
    isLoadingProfile = false;

    // Presence & Global Status
    globalOnlineIds: string[] = [];
    isSocketConnected = false;
    isPeerOpen = false;
    socketStatus = 'جاري التزامن...';
    private globalPresenceSub?: Subscription;
    private msgSub?: Subscription;
    private pinSub?: Subscription;
    private connSub?: Subscription;
    private statusSub?: Subscription;
    private peerSub?: Subscription;
    private callRoomSub?: Subscription;

    // Voice Message State
    isRecording = false;
    audioRecorder: any = null;
    audioChunks: any[] = [];
    recordingDuration = 0;
    recordingTimer: any = null;

    // Modal State
    showDeleteConfirm = false;
    showDeleteSuccess = false;
    showRatingModal = false;
    ratingTargetUser: any = null;
    currentRating = 0;
    ratingFeedback = '';
    isSubmittingRating = false;
    deleteError = '';
    showImageModal = false;
    selectedImageUrl = '';
    private userIsNearBottom = true;

    @ViewChild('scrollContainer') private scrollContainer: ElementRef | undefined;

    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private halaqaService = inject(HalaqaService);
    private presenceService = inject(PresenceService);
    private voiceCallService = inject(VoiceCallService);
    private authService = inject(AuthService);
    private location = inject(Location);
    public groupCallService = inject(GroupCallService);

    constructor() { }

    ngOnInit(): void {
        this.halaqaId = this.route.snapshot.paramMap.get('id') || '';
        if (!this.halaqaId) {
            this.goBack();
            return;
        }

        this.authService.user$.subscribe((user: any) => {
            this.currentUser = user;
            if (user) {
                this.currentUserId = (user.id || (user as any)._id)?.toString() || '';
                this.loadHalaqaDetails();

                if (this.halaqaId && this.currentUserId) {
                    // Set global online status
                    this.presenceService.setOnline(this.currentUserId, user.username);

                    // Join room presence
                    this.presenceService.joinHalaqa(
                        this.halaqaId,
                        this.currentUserId,
                        user.username || 'طالب علم'
                    );
                    localStorage.setItem('active_halaqa_id', this.halaqaId);
                    // Initialize Voice Service
                    this.voiceCallService.init(this.currentUserId);
                }
            }
        });

        // Room Presence Subscription
        this.presenceSub = this.presenceService.activeUsers$.subscribe((users: ActiveUser[]) => {
            this.activeUsers = users;
        });

        // Global Presence Subscription
        this.globalPresenceSub = this.presenceService.globalPresence$.subscribe((ids: string[]) => {
            this.globalOnlineIds = ids;
        });

        // Real-time Messages Subscription
        this.msgSub = this.presenceService.newMessage$.subscribe((data: any) => {
            if (data && data.halaqaId === this.halaqaId) {
                const exists = this.messages.some(m => m._id === data.message._id);
                if (!exists) {
                    this.messages = [...this.messages, data.message];
                    // Only scroll if user was already at the bottom
                    if (this.userIsNearBottom) {
                        setTimeout(() => this.scrollToBottom(), 100);
                    }
                }
            }
        });

        // Real-time Pin Updates
        this.pinSub = this.presenceService.pinnedMessageUpdate$.subscribe((data: any) => {
            if (data && data.halaqaId === this.halaqaId) {
                // Find message in list and update
                const msg = this.messages.find(m => m._id === data.message._id);
                if (msg) {
                    msg.isPinned = data.message.isPinned;
                }
                this.updateLocalPinnedList(data.message);
            }
        });

        // Listen for call endings to show rating
        this.voiceCallService.callSession$.subscribe((session: CallSession | null) => {
            if (session && !session.isIncoming) {
                this.ratingTargetUser = { userId: session.peerId, username: session.username };
            }
        });

        this.peerSub = this.voiceCallService.isPeerOpen$.subscribe(status => {
            this.isPeerOpen = status;
        });

        // Connection Status Subscription
        this.connSub = this.presenceService.isConnected$.subscribe(status => {
            this.isSocketConnected = status;
            if (status && this.halaqaId && this.currentUserId) {
                // Re-join room if reconnected
                this.presenceService.joinHalaqa(this.halaqaId, this.currentUserId, this.currentUser?.username || 'طالب علم');
            }
        });

        this.statusSub = this.presenceService.socketStatus$.subscribe(status => {
            this.socketStatus = status;
        });

        // Group Call Presence Subscription
        this.callRoomSub = this.presenceService.callRoomUpdate$.subscribe(data => {
            if (data && data.roomId === this.halaqaId) {
                this.callRoomActive = data.count > 0;
                this.callRoomCount = data.count;
                this.callRoomParticipants = data.participants;
            }
        });

        // Check for active call on load
        this.checkActiveCall();
    }

    private async checkActiveCall() {
        if (!this.halaqaId) return;
        try {
            const info = await this.groupCallService['signalingService'].getRoomInfo(this.halaqaId);
            if (info && info.active) {
                this.callRoomActive = true;
                this.callRoomCount = info.count;
                this.callRoomParticipants = info.participants.map((p: any) => p.username);
            }
        } catch (e) {
            console.warn('⚠️ Failed to check active call:', e);
        }
    }

    joinGroupCall() {
        if (this.halaqaId && this.currentUserId) {
            this.groupCallService.joinCall(
                this.halaqaId,
                this.currentUserId,
                this.currentUser?.username || 'طالب علم'
            );
        }
    }

    leaveGroupCall() {
        this.groupCallService.leaveCall();
    }

    manualSync() {
        if (this.halaqaId && this.currentUserId) {
            console.log('🔄 Manual Sync Triggered');
            this.presenceService.joinHalaqa(
                this.halaqaId,
                this.currentUserId,
                this.currentUser?.username || 'طالب علم'
            );
            this.loadHalaqaDetails();
        }
    }

    ngOnDestroy(): void {
        this.presenceSub?.unsubscribe();
        this.globalPresenceSub?.unsubscribe();
        this.msgSub?.unsubscribe();
        this.pinSub?.unsubscribe();
        this.connSub?.unsubscribe();
        this.statusSub?.unsubscribe();
        this.peerSub?.unsubscribe();
        this.callRoomSub?.unsubscribe();
        this.stopRecording();
    }

    isRoomLeader(userId: string): boolean {
        if (!this.halaqaData?.leader) return false;
        const leaderId = (this.halaqaData.leader._id || this.halaqaData.leader).toString();
        return leaderId === userId;
    }

    submitRating() {
        if (!this.ratingTargetUser || this.currentRating === 0 || this.isSubmittingRating) return;

        this.isSubmittingRating = true;
        this.halaqaService.rateMember({
            fromUserId: this.currentUserId,
            toUserId: this.ratingTargetUser.userId,
            halaqaId: this.halaqaId,
            rating: this.currentRating,
            feedback: this.ratingFeedback
        }).subscribe({
            next: () => {
                this.showRatingModal = false;
                this.isSubmittingRating = false;
                this.resetRating();
            },
            error: (err: any) => {
                console.error('Rating failed', err);
                this.isSubmittingRating = false;
            }
        });
    }

    resetRating() {
        this.currentRating = 0;
        this.ratingFeedback = '';
        this.ratingTargetUser = null;
    }

    ngAfterViewChecked() {
        // Removed aggressive auto-scroll to prevent snapping
    }

    scrollToBottom(): void {
        if (this.scrollContainer) {
            try {
                this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
            } catch (err) { }
        }
    }

    switchTab(tab: 'chat' | 'info' | 'gallery') {
        this.activeTab = tab;
        if (tab === 'info') {
            const userId = (this.currentUser?.id || this.currentUser?._id)?.toString();
            const leaderId = (this.halaqaData?.leader?._id || this.halaqaData?.leader)?.toString();
            if (userId === leaderId) {
                this.loadHalaqaStats();
            }
        } else if (tab === 'gallery') {
            this.loadHalaqaMedia();
        }
    }

    goBack() {
        this.location.back();
    }

    loadHalaqaDetails() {
        if (this.isDeleting) return;
        this.isLoadingDetails = true;
        console.log(`🔍 [HalaqaDetails] Loading details for ID: ${this.halaqaId} from ${environment.apiBaseUrl}`);
        this.halaqaService.getHalaqaDetails(this.halaqaId).subscribe({
            next: (res) => {
                console.log('✅ [HalaqaDetails] Data received:', res.data?.name);
                this.halaqaData = res.data;
                this.isLoadingDetails = false;

                // Initial load: scroll to bottom
                setTimeout(() => {
                    this.userIsNearBottom = true;
                    this.scrollToBottom();
                }, 500);

                // Robust ID extraction
                const userId = (this.currentUser?.id || this.currentUser?._id)?.toString();
                const leaderId = (this.halaqaData.leader?._id || this.halaqaData.leader)?.toString();

                // Membership Check
                const isLeader = leaderId === userId;
                const isMember = this.halaqaData.members?.some((m: any) => (m._id || m)?.toString() === userId);

                if (!isLeader && !isMember) {
                    this.checkingMembership = false;
                    alert('عذراً، يجب الانضمام للحلقة أولاً عبر كود الدعوة للمشاركة في الدردشة.');
                    this.goBack();
                    return;
                }

                this.checkingMembership = false;
                this.loadMessages();
                this.loadPinnedMessages();
            },
            error: (err) => {
                console.error('❌ Failed to load details', err);
                this.isLoadingDetails = false;
                this.checkingMembership = false;
                if (err.status === 404) {
                    alert('عذراً، لم يتم العثور على هذه الحلقة أو تم حذفها.');
                    this.router.navigate(['/community']).then(res => {
                        if (!res) this.router.navigate(['community']);
                    });
                } else {
                    this.goBack();
                }
            }
        });
    }

    loadMessages(silent = false) {
        if (!silent) this.isLoadingMessages = true;
        this.halaqaService.getMessages(this.halaqaId, this.pageSize).subscribe({
            next: (res) => {
                this.messages = res.data;
                this.hasMoreMessages = res.data.length >= this.pageSize;
                if (!silent) {
                    this.isLoadingMessages = false;
                    this.scrollToBottom(); // Force scroll on first load
                }
            },
            error: (err) => {
                console.error('Failed to load messages', err);
                this.isLoadingMessages = false;
            }
        });
    }

    loadMoreMessages() {
        if (this.isLoadingMore || !this.hasMoreMessages || this.messages.length === 0) return;

        this.isLoadingMore = true;
        const oldestMsg = this.messages[0];
        const before = oldestMsg.createdAt;

        // Save current scroll height to prevent jump
        const container = this.scrollContainer?.nativeElement;
        const previousScrollHeight = container?.scrollHeight || 0;

        this.halaqaService.getMessages(this.halaqaId, this.pageSize, false, before).subscribe({
            next: (res) => {
                const newMessages = res.data;
                if (newMessages.length > 0) {
                    this.messages = [...newMessages, ...this.messages];

                    // Maintain scroll position
                    setTimeout(() => {
                        if (container) {
                            container.scrollTop = container.scrollTop + (container.scrollHeight - previousScrollHeight);
                        }
                    }, 0);
                }
                this.hasMoreMessages = newMessages.length >= this.pageSize;
                this.isLoadingMore = false;
            },
            error: (err) => {
                console.error('Failed to load more messages', err);
                this.isLoadingMore = false;
            }
        });
    }

    onScroll(event: any) {
        const element = event.target;
        // User is near bottom if within 100px
        const threshold = 100;
        this.userIsNearBottom = (element.scrollHeight - element.scrollTop <= element.clientHeight + threshold);

        // Trigger if scrolled to the top (with a 50px threshold)
        if (element.scrollTop < 50 && !this.isLoadingMore && this.hasMoreMessages) {
            this.loadMoreMessages();
        }
    }

    sendMessage() {
        if (!this.newMessageContent.trim() || this.isSending) return;

        this.isSending = true;
        const content = this.newMessageContent;
        const replyTo = this.replyToMessage?._id;

        // Extract Mentions
        const mentions: string[] = [];
        if (this.halaqaData) {
            const allMembers = [this.halaqaData.leader, ...this.halaqaData.members];
            allMembers.forEach(m => {
                if (m && content.includes(`@${m.username}`)) {
                    mentions.push(m._id || m.userId);
                }
            });
        }

        this.newMessageContent = '';
        this.replyToMessage = null;
        this.showMentionSuggestions = false;

        this.halaqaService.sendMessage(this.halaqaId, this.currentUserId, content, 'text', replyTo, mentions).subscribe({
            next: (res) => {
                // We don't manually add to array here if Socket takes care of it,
                // but for snappy UI we could add it and then the socket listener checks for duplicates.
                const exists = this.messages.some(m => m._id === res.data._id);
                if (!exists) {
                    this.messages = [...this.messages, res.data];
                }
                this.isSending = false;
                this.newMessageContent = '';
                this.userIsNearBottom = true; // Force scroll to bottom for own message
                setTimeout(() => this.scrollToBottom(), 100);
            },
            error: (err) => {
                console.error('Failed to send', err);
                this.isSending = false;
                this.newMessageContent = content;
            }
        });
    }

    setReply(msg: any) {
        this.replyToMessage = msg;
        // Focus input
        setTimeout(() => {
            const input = document.querySelector('input[type="text"]');
            if (input) (input as any).focus();
        }, 100);
    }

    cancelReply() {
        this.replyToMessage = null;
    }

    onInputChange(event: any) {
        const content = this.newMessageContent;
        const cursorIndex = (event.target as HTMLInputElement).selectionStart || 0;
        const textBeforeCursor = content.substring(0, cursorIndex);

        const lastAtPos = textBeforeCursor.lastIndexOf('@');

        if (lastAtPos !== -1 && (lastAtPos === 0 || textBeforeCursor[lastAtPos - 1] === ' ')) {
            this.showMentionSuggestions = true;
            this.mentionStartIndex = lastAtPos;
            this.mentionFilter = textBeforeCursor.substring(lastAtPos + 1).toLowerCase();
            this.updateMentionSuggestions();
        } else {
            this.showMentionSuggestions = false;
        }
    }

    updateMentionSuggestions() {
        if (!this.halaqaData) return;

        const members = [this.halaqaData.leader, ...this.halaqaData.members];
        this.mentionSuggestions = members.filter(m =>
            m?.username?.toLowerCase().includes(this.mentionFilter)
        );

        if (this.mentionSuggestions.length === 0) {
            this.showMentionSuggestions = false;
        }
    }

    selectMention(user: any) {
        const content = this.newMessageContent;
        const beforeAt = content.substring(0, this.mentionStartIndex);
        const afterMention = content.substring(this.mentionStartIndex + this.mentionFilter.length + 1);

        this.newMessageContent = `${beforeAt}@${user.username} ${afterMention}`;
        this.showMentionSuggestions = false;

        // Focus back to input
        setTimeout(() => {
            const input = document.querySelector('input[type="text"]');
            if (input) (input as any).focus();
        }, 0);
    }

    private getSupportedMimeType(): string {
        const types = [
            'audio/mp4',   // Best for iOS/Safari
            'audio/webm',  // Good for Chrome/Firefox
            'audio/ogg',
            'audio/aac',
            'audio/wav'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

    // --- Voice Message Logic ---
    async startRecording() {
        try {
            const mimeType = this.getSupportedMimeType();
            console.log(`🎙️ [HalaqaDetails] Starting record session. MimeType: ${mimeType || 'default'}`);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            this.audioChunks = [];
            this.audioRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            this.audioRecorder.ondataavailable = (e: any) => this.audioChunks.push(e.data);
            this.audioRecorder.onstop = () => {
                this.sendVoiceMessage(mimeType);
                // Important: Stop the tracks to release microphone immediately
                stream.getTracks().forEach(track => track.stop());
            };
            this.audioRecorder.start();
            this.isRecording = true;
            this.recordingDuration = 0;
            this.recordingTimer = setInterval(() => this.recordingDuration++, 1000);
        } catch (err: any) {
            console.error('Could not start recording', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError') {
                alert('يرجى السماح بالوصول إلى الميكروفون من إعدادات المتصفح أو الهاتف. تأكد من أن الموقع يعمل عبر رابط آمن (HTTPS).');
            } else {
                alert('حدث خطأ أثناء محاولة الوصول للميكروفون. يرجى التأكد من توصيله وإعطاء الصلاحية.');
            }
        }
    }

    stopRecording() {
        if (this.audioRecorder && this.isRecording) {
            this.audioRecorder.stop();
            this.isRecording = false;
            clearInterval(this.recordingTimer);
        }
    }

    triggerFileUpload() {
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        if (fileInput) fileInput.click();
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        // Size limit check (10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('حجم الملف كبير جداً. الحد الأقصى هو 10 ميجابايت.');
            return;
        }

        this.isSending = true;
        this.halaqaService.uploadFile(file, this.currentUserId).subscribe({
            next: (res) => {
                if (res.success) {
                    this.sendGenericMessage(res.url, 'file', res.fileMetadata);
                }
            },
            error: (err) => {
                this.isSending = false;
                console.error('File upload failed', err);
                alert('فشل رفع الملف. يرجى المحاولة مرة أخرى.');
            }
        });

        // Clear input
        event.target.value = '';
    }

    private sendGenericMessage(content: string, type: string, fileMetadata?: any) {
        this.halaqaService.sendMessage(this.halaqaId, this.currentUserId, content, type, undefined, undefined, fileMetadata).subscribe({
            next: (sendRes) => {
                this.isSending = false;
                const exists = this.messages.some(m => m._id === sendRes.data._id);
                if (!exists) {
                    this.messages = [...this.messages, sendRes.data];
                }
                setTimeout(() => this.scrollToBottom(), 100);
            },
            error: (err) => {
                this.isSending = false;
                console.error('Failed to send file message', err);
            }
        });
    }

    async sendVoiceMessage(mimeType?: string) {
        if (this.audioChunks.length === 0) return;

        const type = mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type });
        this.isSending = true;

        this.halaqaService.uploadVoiceMessage(audioBlob, this.currentUserId).subscribe({
            next: (res) => {
                if (res.success) {
                    // Send actual message with audio URL
                    this.halaqaService.sendMessage(this.halaqaId, this.currentUserId, res.url, 'voice').subscribe({
                        next: (sendRes) => {
                            this.isSending = false;
                            // Optimistic update for voice message
                            const exists = this.messages.some(m => m._id === sendRes.data._id);
                            if (!exists) {
                                this.messages = [...this.messages, sendRes.data];
                            }
                            setTimeout(() => this.scrollToBottom(), 100);
                        },
                        error: (err) => {
                            this.isSending = false;
                            console.error('Failed to send message with voice URL', err);
                        }
                    });
                }
            },
            error: (err) => {
                this.isSending = false;
                console.error('Failed to upload voice', err);
                alert('فشل رفع الرسالة الصوتية. يرجى المحاولة مرة أخرى.');
            }
        });
    }

    isUserOnline(user: any): boolean {
        if (!user) return false;
        const id = (user._id || user.id || user).toString();
        const isOnline = this.globalOnlineIds.includes(id);
        return isOnline;
    }

    openUserProfile(user: any) {
        if (!user) return;
        const userId = user._id || user.userId || user;
        this.isLoadingProfile = true;
        this.selectedUser = null; // Reset

        this.authService.getPublicProfile(userId).subscribe({
            next: (data) => {
                this.selectedUser = data;
                this.isLoadingProfile = false;
            },
            error: (err) => {
                console.error('Error loading profile', err);
                this.isLoadingProfile = false;
                alert('عذراً، تعذر تحميل بيانات الملف الشخصي حالياً.');
            }
        });
    }

    startPrivateChat(otherUser: any) {
        if (!otherUser) return;
        const otherUserId = otherUser.id || otherUser._id;

        if (otherUserId === this.currentUserId) {
            alert('لا يمكنك بدء دردشة خاصة مع نفسك.');
            return;
        }

        this.isLoadingDetails = true;
        this.halaqaService.getOrCreateDM(this.currentUserId, otherUserId).subscribe({
            next: (res) => {
                this.selectedUser = null; // Close modal

                // Use absolute path for consistency, but correct one
                // If in Mushaf app, it will be /community/:id
                // If in main app, it might be /community/halaqa/:id

                const currentUrl = this.router.url;
                if (currentUrl.includes('/mushaf') || !currentUrl.includes('/community/halaqa')) {
                    // Assuming Mushaf app or similar flat structure
                    this.router.navigate(['/community', res.data._id]);
                } else {
                    // Assuming main app structure
                    this.router.navigate(['/community/halaqa', res.data._id]);
                }

                this.isLoadingDetails = false;
            },
            error: (err) => {
                console.error('Failed to start DM', err);
                this.isLoadingDetails = false;
                alert('فشل بدء الدردشة الخاصة. يرجى المحاولة مرة أخرى.');
            }
        });
    }

    async startVoiceCall(user: any) {
        if (!user) return;
        const targetPeerId = user.userId || user.id || user._id;
        if (!targetPeerId) {
            console.error('🚫 [HalaqaDetails] Cannot start call: No peer ID found for user', user);
            return;
        }
        try {
            await this.voiceCallService.startCall(targetPeerId, user.username);
            this.selectedUser = null; // Close modal
        } catch (err: any) {
            console.error('Call failed', err);
            const msg = err.message || 'فشل بدء المكالمة الصوتية';
            alert(msg + '. يرجى التأكد من إعطاء صلاحية الميكروفون وأن الطرف الآخر متاح.');
        }
    }

    closeProfileModal() {
        this.selectedUser = null;
    }

    openImageFull(url: string) {
        this.selectedImageUrl = url;
        this.showImageModal = true;
    }

    closeImageModal() {
        this.showImageModal = false;
        this.selectedImageUrl = '';
    }

    getProfileImageUrl(url: string | null | undefined): string {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        const rootUrl = environment.apiBaseUrl.replace('/api', '');
        return `${rootUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    formatDuration(sec: number): string {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    trackByMsgId(index: number, item: any): string {
        return item._id || index;
    }

    copyInviteCode() {
        if (!this.halaqaData?.inviteCode) return;

        // Fallback for non-https or restricted environments
        const textArea = document.createElement("textarea");
        textArea.value = this.halaqaData.inviteCode;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            this.copySuccess = true;
            setTimeout(() => this.copySuccess = false, 2000);
        } catch (err) {
            console.error('Copy failed', err);
        }
        document.body.removeChild(textArea);
    }

    deleteHalaqa() {
        this.showDeleteConfirm = true;
    }

    confirmDelete() {
        this.isDeleting = true;
        this.showDeleteConfirm = false;
        this.isLoadingDetails = true;
        const userId = this.currentUser.id || this.currentUser._id;

        console.log('🚀 [HalaqaDetails] Starting deletion for:', this.halaqaId);

        this.halaqaService.deleteHalaqa(this.halaqaId, userId).subscribe({
            next: (res) => {
                console.log('✅ [HalaqaDetails] Deletion successful');
                this.isLoadingDetails = false;
                this.checkingMembership = false;
                this.showDeleteSuccess = true;

                // Auto-navigate after 1.5 seconds (slightly faster)
                setTimeout(() => {
                    console.log('🔄 [HalaqaDetails] Navigating back to community...');

                    // Priority 1: Relative to app root. Priority 2: With mushaf prefix.
                    const paths = ['/community', 'community', '/mushaf/community', '../'];

                    const tryNavigate = (index: number) => {
                        if (index >= paths.length) {
                            console.error('🚫 [HalaqaDetails] All navigation attempts failed. Falling back to window.location.');
                            // Best fallback: go to the parent directory of current URL
                            const currentUrl = window.location.href;
                            const parentUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
                            window.location.href = parentUrl;
                            return;
                        }

                        const path = paths[index];
                        this.router.navigate([path]).then(success => {
                            if (success) {
                                console.log(`✅ [HalaqaDetails] Successfully navigated to: ${path}`);
                            } else {
                                console.warn(`⚠️ [HalaqaDetails] Navigation to ${path} failed, trying next...`);
                                tryNavigate(index + 1);
                            }
                        }).catch(err => {
                            tryNavigate(index + 1);
                        });
                    };

                    tryNavigate(0);
                }, 1500);
            },
            error: (err) => {
                console.error('❌ [HalaqaDetails] Failed to delete halaqa', err);
                this.deleteError = err.error?.message || err.message;
                this.isLoadingDetails = false;
                this.isDeleting = false;
            }
        });
    }

    closeDeleteModals() {
        this.showDeleteConfirm = false;
        this.showDeleteSuccess = false;
        this.deleteError = '';
    }

    loadPinnedMessages() {
        this.halaqaService.getMessages(this.halaqaId, 10, true).subscribe({
            next: (res) => {
                this.pinnedMessages = res.data;
            },
            error: (err) => console.error('Failed to load pinned messages', err)
        });
    }

    loadHalaqaStats() {
        if (!this.halaqaId || this.isLoadingStats) return;
        this.isLoadingStats = true;
        this.halaqaService.getHalaqaStats(this.halaqaId).subscribe({
            next: (res) => {
                this.halaqaStats = res.data;
                this.isLoadingStats = false;
            },
            error: (err) => {
                console.error('Failed to load stats', err);
                this.isLoadingStats = false;
            }
        });
    }

    loadHalaqaMedia() {
        if (!this.halaqaId || this.isLoadingMedia) return;
        this.isLoadingMedia = true;
        this.halaqaService.getHalaqaMedia(this.halaqaId).subscribe({
            next: (res) => {
                this.halaqaMedia = res.data;
                this.isLoadingMedia = false;
            },
            error: (err) => {
                console.error('Failed to load media', err);
                this.isLoadingMedia = false;
            }
        });
    }

    get filteredMedia() {
        if (this.mediaFilter === 'all') return this.halaqaMedia;
        return this.halaqaMedia.filter(m => {
            if (this.mediaFilter === 'image') return m.fileMetadata?.mimeType?.startsWith('image/');
            if (this.mediaFilter === 'voice') return m.type === 'voice' || m.type === 'audio';
            if (this.mediaFilter === 'file') return m.type === 'file' && !m.fileMetadata?.mimeType?.startsWith('image/');
            return false;
        });
    }

    togglePin(msg: any) {
        if (!msg?._id) return;
        this.halaqaService.togglePinMessage(msg._id, this.currentUserId).subscribe({
            next: (res) => {
                msg.isPinned = res.data.isPinned;
                this.updateLocalPinnedList(res.data);
            },
            error: (err) => console.error('Failed to toggle pin', err)
        });
    }

    updateLocalPinnedList(msg: any) {
        if (msg.isPinned) {
            const exists = this.pinnedMessages.find(p => p._id === msg._id);
            if (!exists) this.pinnedMessages = [msg, ...this.pinnedMessages];
        } else {
            this.pinnedMessages = this.pinnedMessages.filter(p => p._id !== msg._id);
        }
    }

    scrollToMessage(messageId: string, attempts = 0) {
        // Stop if too many attempts to avoid infinite loop
        if (attempts > 10) {
            alert('الرسالة قديمة جداً، يرجى التمرير للأعلى يدوياً.');
            return;
        }

        const element = document.getElementById(`msg-${messageId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('animate-pulse', 'bg-blue-50', 'dark:bg-blue-900/20', 'ring-2', 'ring-blue-500', 'rounded-2xl');
            setTimeout(() => {
                element.classList.remove('animate-pulse', 'bg-blue-50', 'dark:bg-blue-900/20', 'ring-2', 'ring-blue-500', 'rounded-2xl');
            }, 3000);
            this.showSearch = false;
        } else if (this.hasMoreMessages && !this.isLoadingMore) {
            // Message not found, try loading more
            console.log(`🔍 [HalaqaDetails] Message ${messageId} not found, loading more... (Attempt ${attempts + 1})`);
            this.loadMoreMessages();
            // Wait for messages to be added to DOM then try again
            setTimeout(() => this.scrollToMessage(messageId, attempts + 1), 800);
        } else {
            alert('تعذر العثور على الرسالة في هذه الحلقة.');
        }
    }

    toggleSearch() {
        this.showSearch = !this.showSearch;
        if (!this.showSearch) {
            this.searchQuery = '';
            this.searchResults = [];
        } else {
            setTimeout(() => {
                const searchInput = document.getElementById('messageSearchInput');
                if (searchInput) searchInput.focus();
            }, 100);
        }
    }

    onSearch() {
        if (!this.searchQuery.trim()) {
            this.searchResults = [];
            return;
        }

        this.isSearchingMessages = true;
        this.halaqaService.searchMessages(this.halaqaId, this.searchQuery).subscribe({
            next: (res) => {
                this.searchResults = res.data;
                this.isSearchingMessages = false;
            },
            error: (err) => {
                console.error('Search failed', err);
                this.isSearchingMessages = false;
            }
        });
    }
}
