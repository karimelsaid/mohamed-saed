import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
    faArrowRight, faPaperPlane, faInfoCircle, faUsers, faCopy, faCheck,
    faComments, faUserShield, faUser, faSync, faLink
} from '@fortawesome/free-solid-svg-icons';
import { HalaqaService } from '../../../core/services/halaqa.service';
import { AuthService } from '../../../auth/auth.service';

@Component({
    selector: 'app-halaqa-details',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
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

    // State
    activeTab: 'chat' | 'info' = 'chat';
    halaqaId: string = '';
    halaqaData: any = null;
    messages: any[] = [];
    currentUser: any = null;
    newMessageContent: string = '';

    isLoadingDetails = true;
    isLoadingMessages = false;
    isSending = false;
    copySuccess = false;

    @ViewChild('scrollContainer') private scrollContainer: ElementRef | undefined;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private halaqaService: HalaqaService,
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
                this.loadHalaqaDetails();
            }
        });
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
        this.isLoadingDetails = true;
        this.halaqaService.getHalaqaDetails(this.halaqaId).subscribe({
            next: (res) => {
                this.halaqaData = res.data;
                this.isLoadingDetails = false;

                // Membership Check
                const isLeader = this.halaqaData.leader?._id === this.currentUser?.id || this.halaqaData.leader === this.currentUser?.id || this.halaqaData.leader?._id === this.currentUser?._id || this.halaqaData.leader === this.currentUser?._id;
                const isMember = this.halaqaData.members?.some((m: any) => (m._id || m) === (this.currentUser?.id || this.currentUser?._id));

                if (!isLeader && !isMember) {
                    alert('عذراً، يجب الانضمام للحلقة أولاً عبر كود الدعوة للمشاركة في الدردشة.');
                    this.goBack();
                    return;
                }

                this.loadMessages();
            },
            error: (err) => {
                console.error('Failed to load details', err);
                this.isLoadingDetails = false;
                this.goBack();
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
}
