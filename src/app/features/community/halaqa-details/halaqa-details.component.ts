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
                this.loadMessages(); // Load immediately
                // Setup polling or socket here if needed. Polling every 10s for now?
                // setInterval(() => this.loadMessages(true), 10000);
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
        this.router.navigate(['/mushaf/community']);
    }

    loadHalaqaDetails() {
        this.isLoadingDetails = true;
        this.halaqaService.getHalaqaDetails(this.halaqaId).subscribe({
            next: (res) => {
                this.halaqaData = res.data;
                this.isLoadingDetails = false;
            },
            error: (err) => {
                console.error('Failed to load details', err);
                // show error
                this.isLoadingDetails = false;
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
        this.newMessageContent = ''; // Clear immediately for UX

        this.halaqaService.sendMessage(this.halaqaId, this.currentUser.id || this.currentUser._id, content).subscribe({
            next: (res) => {
                this.messages.push(res.data); // Optimistic append or use response
                this.isSending = false;
                this.scrollToBottom();
            },
            error: (err) => {
                console.error('Failed to send', err);
                this.isSending = false;
                this.newMessageContent = content; // Restore on error
            }
        });
    }

    copyInviteCode() {
        if (!this.halaqaData?.inviteCode) return;
        navigator.clipboard.writeText(this.halaqaData.inviteCode).then(() => {
            this.copySuccess = true;
            setTimeout(() => this.copySuccess = false, 2000);
        });
    }
}
