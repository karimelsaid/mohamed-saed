import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { Router } from '@angular/router';
import { ReadingChallengeService } from '../../services/reading-challenge.service';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-challenge-details-modal',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  templateUrl: './challenge-details-modal.component.html'
})
export class ChallengeDetailsModalComponent {
  @Input() challenge: any = null;
  @Output() close = new EventEmitter<void>();
  @Output() challengeUpdated = new EventEmitter<void>();

  showModal = false;
  currentUserId: string | null = null;
  isHost = false;
  isProcessing = false;
  showConfirmDelete = false;
  showConfirmLeave = false;
  showShareSuccess = false;

  constructor(
      private router: Router,
      private challengeService: ReadingChallengeService,
      private authService: AuthService
  ) {
      this.authService.user$.subscribe(user => {
          this.currentUserId = user ? ((user as any)._id || user.id) : null;
      });
  }

  open(challengeData: any) {
    this.challenge = challengeData;
    this.showModal = true;
    this.showConfirmDelete = false;
    this.showConfirmLeave = false;
    if (this.challenge && this.currentUserId) {
        const hostId = typeof this.challenge.hostId === 'object' ? this.challenge.hostId._id : this.challenge.hostId;
        this.isHost = (hostId === this.currentUserId);
    } else {
        this.isHost = false;
    }
  }

  closeModal() {
    this.showModal = false;
    this.showConfirmDelete = false;
    this.showConfirmLeave = false;
    this.challenge = null;
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }

  getParticipantName(participant: any): string {
    return participant?.userId?.username || 'مستخدم';
  }

  getParticipantAvatar(participant: any): string {
    return participant?.userId?.profilePicture || '';
  }

  getSortedParticipants(): any[] {
    if (!this.challenge?.participants) return [];
    return [...this.challenge.participants].sort((a: any, b: any) => b.progressPercent - a.progressPercent);
  }

  async shareChallenge() {
    const challengeId = this.challenge?._id;
    const title = this.challenge?.title || 'تحدي قراءة';
    const bookTitle = this.challenge?.bookTitle || '';
    const shareUrl = `https://knoozbook.com/library?challenge=${challengeId}`;
    const shareText = `🏆 انضم لتحدي القراءة "${title}"${bookTitle ? ' - كتاب: ' + bookTitle : ''}\n\nانضم الآن وتنافس معنا!`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `تحدي: ${title}`,
          text: shareText,
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        this.showShareSuccess = true;
        setTimeout(() => this.showShareSuccess = false, 3000);
      }
    } catch (e) {
      // User cancelled share or error
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        this.showShareSuccess = true;
        setTimeout(() => this.showShareSuccess = false, 3000);
      } catch (_) {}
    }
  }

  startReading() {
    if (!this.challenge?.bookId) {
        return;
    }
    const bookId = typeof this.challenge.bookId === 'string' ? this.challenge.bookId : this.challenge.bookId._id;
    this.closeModal();
    this.router.navigate(['/reader', bookId]);
  }

  // --- Delete (Host) ---
  openDeleteConfirm() {
    this.showConfirmDelete = true;
  }

  cancelDelete() {
    this.showConfirmDelete = false;
  }

  confirmDelete() {
    this.showConfirmDelete = false;
    this.isProcessing = true;
    this.challengeService.deleteChallenge(this.challenge._id).subscribe({
        next: () => {
            this.isProcessing = false;
            this.challengeUpdated.emit();
            this.closeModal();
        },
        error: (err) => {
            this.isProcessing = false;
            alert(err.error?.message || 'حدث خطأ أثناء إنهاء التحدي');
        }
    });
  }

  // --- Leave (Participant) ---
  openLeaveConfirm() {
    this.showConfirmLeave = true;
  }

  cancelLeave() {
    this.showConfirmLeave = false;
  }

  confirmLeave() {
    this.showConfirmLeave = false;
    this.isProcessing = true;
    this.challengeService.leaveChallenge(this.challenge._id).subscribe({
        next: () => {
            this.isProcessing = false;
            this.challengeUpdated.emit();
            this.closeModal();
        },
        error: (err) => {
            this.isProcessing = false;
            alert(err.error?.message || 'حدث خطأ أثناء مغادرة التحدي');
        }
    });
  }
}
