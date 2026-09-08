import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReadingChallengeService } from '../../services/reading-challenge.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AuthService } from '../../auth/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-reading-challenge-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './reading-challenge-modal.component.html',
  styleUrls: ['./reading-challenge-modal.component.css']
})
export class ReadingChallengeModalComponent {
  @Input() bookId: string = '';
  @Input() bookTitle: string = '';
  @Input() bookCover: string = '';
  @Output() close = new EventEmitter<void>();

  showModal = false;
  mode: 'select' | 'create' | 'join' = 'select';
  
  // Create Form
  title = '';
  description = '';
  isPublic = true;
  maxParticipants = 10;
  endDate = '';
  
  // Join Form
  inviteCode = '';
  
  // Public Challenges
  publicChallenges: any[] = [];
  loading = false;
  error = '';
  success = '';

  constructor(
    private challengeService: ReadingChallengeService,
    private authService: AuthService,
    private router: Router
  ) {}

  open() {
    this.authService.user$.subscribe(user => {
        if (!user) {
            this.router.navigate(['/login']);
            return;
        }
        this.showModal = true;
        this.mode = 'select';
        this.resetForms();
        this.loadPublicChallenges();
    });
  }

  closeModal() {
    this.showModal = false;
    this.close.emit();
  }

  resetForms() {
    this.title = `تحدي قراءة: ${this.bookTitle}`;
    this.description = '';
    this.isPublic = true;
    this.maxParticipants = 10;
    const date = new Date();
    date.setDate(date.getDate() + 7);
    this.endDate = date.toISOString().split('T')[0];
    this.inviteCode = '';
    this.error = '';
    this.success = '';
  }

  loadPublicChallenges() {
    if (!this.bookId) return;
    this.loading = true;
    this.challengeService.getPublicChallenges(this.bookId).subscribe({
      next: (res: any) => {
        this.publicChallenges = res.data || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.error = 'فشل في تحميل التحديات العامة';
        this.loading = false;
      }
    });
  }

  createChallenge() {
    if (!this.title || !this.endDate) {
      this.error = 'يرجى تعبئة الحقول المطلوبة';
      return;
    }
    
    this.loading = true;
    this.error = '';
    
    const payload = {
      bookId: this.bookId,
      bookTitle: this.bookTitle,
      bookCover: this.bookCover,
      title: this.title,
      description: this.description,
      isPublic: this.isPublic,
      maxParticipants: this.maxParticipants,
      targetType: 'pages',
      targetValue: 100, // Will be updated by epub reader
      endDate: this.endDate
    };
    
    this.challengeService.createChallenge(payload).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.success = 'تم إنشاء التحدي بنجاح! كود الدعوة: ' + res.data.inviteCode;
        setTimeout(() => this.closeModal(), 3000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'حدث خطأ أثناء إنشاء التحدي';
      }
    });
  }

  joinByCode() {
    if (!this.inviteCode) {
      this.error = 'يرجى إدخال كود الدعوة';
      return;
    }
    this.loading = true;
    this.error = '';
    this.challengeService.joinChallenge({ inviteCode: this.inviteCode }).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'تم الانضمام للتحدي بنجاح!';
        setTimeout(() => this.closeModal(), 2000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'كود غير صحيح أو التحدي ممتلئ';
      }
    });
  }
  
  joinPublic(challengeId: string) {
    this.loading = true;
    this.error = '';
    this.challengeService.joinChallenge({ challengeId }).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'تم الانضمام للتحدي بنجاح!';
        setTimeout(() => this.closeModal(), 2000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'حدث خطأ أثناء الانضمام';
      }
    });
  }
}
