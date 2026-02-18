import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
    faArrowRight, faPaperPlane, faInfoCircle, faUsers, faCopy, faCheck,
    faComments, faUserShield, faUser, faSync, faLink, faTrash, faUserGraduate, faStar
} from '@fortawesome/free-solid-svg-icons';
import { HalaqaService } from '../../../core/services/halaqa.service';
import { PresenceService, ActiveUser } from '../../../core/services/presence.service';
import { VoiceCallService } from '../../../core/services/voice-call.service';
import { AuthService } from '../../../auth/auth.service';
import { environment } from '../../../../environments/environment';
import { Subscription } from 'rxjs';
import { VoiceCallComponent } from '../voice-call/voice-call.component';

@Component({
    selector: 'app-halaqa-details',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule, VoiceCallComponent],
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
    faStar = faStar;

    // State
    activeTab: 'chat' | 'info' = 'chat';
    halaqaId: string = '';
    halaqaData: any = null;
    messages: any[] = [];
    currentUser: any = null;
    currentUserId: string = '';
    newMessageContent: string = '';
    activeUsers: ActiveUser[] = [];
    private presenceSub?: Subscription;

    isLoadingDetails = true;
    isLoadingMessages = false;
    isSending = false;
    copySuccess = false;
    checkingMembership = true;
    isDeleting = false;

    // Modal State
    showDeleteConfirm = false;
    showDeleteSuccess = false;
    showRatingModal = false;
    ratingTargetUser: any = null;
    currentRating = 0;
    ratingFeedback = '';
    isSubmittingRating = false;
    deleteError = '';

    @ViewChild('scrollContainer') private scrollContainer: ElementRef | undefined;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private halaqaService: HalaqaService,
        private presenceService: PresenceService,
        private voiceCallService: VoiceCallService,
        private authService: AuthService,
        private location: Location
    ) { }

    ngOnInit(): void {
        this.halaqaId = this.route.snapshot.paramMap.get('id') || '';
        if (!this.halaqaId) {
            this.goBack();
            return;
        }

        this.authService.user$.subscribe(user => {
            this.currentUser = user;
            if (user) {
                this.currentUserId = (user.id || (user as any)._id)?.toString() || '';
                this.loadHalaqaDetails();

                if (this.halaqaId && this.currentUserId) {
                    // Join presence room
                    this.presenceService.joinHalaqa(
                        this.halaqaId,
                        this.currentUserId,
                        user.username || 'طالب علم'
                    );
                    // Initialize Voice Service
                    this.voiceCallService.init(this.currentUserId);
                }
            }
        });

        this.presenceSub = this.presenceService.activeUsers$.subscribe(users => {
            this.activeUsers = users;
        });

        // Listen for call endings to show rating
        this.voiceCallService.callSession$.subscribe(session => {
            if (session && !session.isIncoming) {
                this.ratingTargetUser = { userId: session.peerId, username: session.username };
            }
        });

        this.voiceCallService.onCallEnded$.subscribe(() => {
            if (this.ratingTargetUser) {
                this.showRatingModal = true;
            }
        });
    }

    ngOnDestroy(): void {
        if (this.presenceSub) {
            this.presenceSub.unsubscribe();
        }
    }

    startVoiceCall(user: ActiveUser) {
        if (!user || user.userId === this.currentUserId) return;
        this.voiceCallService.startCall(user.userId, user.username);
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
        this.scrollToBottom();
    }

    scrollToBottom(): void {
        if (this.scrollContainer) {
            try {
                this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
            } catch (err) { }
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

                // Robust ID extraction
                const currentUserId = (this.currentUser?.id || this.currentUser?._id)?.toString();
                const leaderId = (this.halaqaData.leader?._id || this.halaqaData.leader)?.toString();

                // Membership Check
                const isLeader = leaderId === currentUserId;
                const isMember = this.halaqaData.members?.some((m: any) => (m._id || m)?.toString() === currentUserId);

                if (!isLeader && !isMember) {
                    this.checkingMembership = false;
                    alert('عذراً، يجب الانضمام للحلقة أولاً عبر كود الدعوة للمشاركة في الدردشة.');
                    this.goBack();
                    return;
                }

                this.checkingMembership = false;
                this.loadMessages();
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
        this.halaqaService.getMessages(this.halaqaId).subscribe({
            next: (res) => {
                this.messages = res.data;
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

    sendMessage() {
        if (!this.newMessageContent.trim() || this.isSending) return;

        this.isSending = true;
        const content = this.newMessageContent;
        this.newMessageContent = '';

        this.halaqaService.sendMessage(this.halaqaId, this.currentUser.id || this.currentUser._id, content).subscribe({
            next: (res) => {
                // Use spread to ensure change detection triggers
                this.messages = [...this.messages, res.data];
                this.isSending = false;
                setTimeout(() => this.scrollToBottom(), 100);
            },
            error: (err) => {
                console.error('Failed to send', err);
                this.isSending = false;
                this.newMessageContent = content;
            }
        });
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
}
