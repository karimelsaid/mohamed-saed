import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSyncAlt, faCheckCircle, faDownload, faRocket, faMagic } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-live-update-modal',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  templateUrl: './live-update-modal.component.html',
  styleUrl: './live-update-modal.component.css'
})
export class LiveUpdateModalComponent {
  @Input() version: string = '';
  @Input() progress: number = 0;
  @Input() status: 'idle' | 'checking' | 'downloading' | 'applying' | 'complete' | 'error' = 'idle';
  @Input() errorMessage: string = '';
  @Input() sizeFormatted: string = '';
  @Input() sizeBytes: number = 0;

  faSyncAlt = faSyncAlt;
  faCheckCircle = faCheckCircle;
  faDownload = faDownload;
  faRocket = faRocket;
  faMagic = faMagic;

  @Output() onUpdate = new EventEmitter<void>();
  @Output() onPostpone = new EventEmitter<void>();

  update() {
    this.onUpdate.emit();
  }

  postpone() {
    this.onPostpone.emit();
  }

  get downloadedSizeText() {
    if (!this.sizeBytes) return '';
    const downloadedBytes = (this.sizeBytes * this.progress) / 100;
    const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(2);
    const totalMB = (this.sizeBytes / (1024 * 1024)).toFixed(2);
    return `${downloadedMB} MB / ${totalMB} MB`;
  }

  get updateSizeText() {
    return this.sizeFormatted ? `حجم التحديث: ${this.sizeFormatted}` : '';
  }

  get statusIcon() {
    switch (this.status) {
      case 'downloading': return this.faDownload;
      case 'applying': return this.faMagic;
      case 'complete': return this.faCheckCircle;
      default: return this.faRocket;
    }
  }

  get statusText() {
    switch (this.status) {
      case 'checking': return 'جاري التحقق من وجود سحر جديد... ✨';
      case 'downloading': return `جاري تحميل التحديث... (${this.progress}%) 📥`;
      case 'applying': return 'جاري إضافة اللمسات السحرية... 🪄';
      case 'complete': return 'اكتمل التحميل! استعد للحيوية... 💖';
      case 'error': return 'أوه! حدث خطأ بسيط، دعنا نحاول مجدداً... 🛠️';
      default: return 'تحديث جديد بانتظارك! ✨';
    }
  }
}
