import { Component, Input, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlay, faPause, faDownload } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-audio-player',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  template: `
    <div class="audio-bubble flex flex-col gap-1 min-w-[200px] max-w-full" [class.text-white]="isDarkBackground">
      <div class="flex items-center gap-3">
        <!-- Play/Pause Button -->
        <button (click)="togglePlay()" 
                [class]="(isDarkBackground ? 'bg-white/20 text-white' : 'bg-gray-100 text-blue-600') + ' w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90'">
          <fa-icon [icon]="isPlaying ? faPause : faPlay" [class.translate-x-0.5]="!isPlaying"></fa-icon>
        </button>

        <!-- Progress Area -->
        <div class="flex-1 flex flex-col gap-1.5 pt-1">
          <!-- Waveform/Progress Bar Container -->
          <div #progressContainer (click)="seek($event)"
               [class]="(isDarkBackground ? 'bg-white/20' : 'bg-gray-200') + ' h-1.5 rounded-full cursor-pointer relative group'">
            <!-- Actual Progress -->
            <div [class]="(isDarkBackground ? 'bg-white' : 'bg-blue-600') + ' absolute inset-y-0 left-0 rounded-full transition-all duration-75'"
                 [style.width.%]="progress">
              <!-- Slider Thumb -->
              <div [class]="(isDarkBackground ? 'bg-white' : 'bg-blue-600') + ' absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform'"></div>
            </div>
          </div>
          
          <!-- Time and Status -->
          <div class="flex justify-between items-center opacity-70 text-[10px] font-medium"
               [class.text-white]="isDarkBackground"
               [class.text-gray-500]="!isDarkBackground">
            <span>{{ isPlaying ? formatTime(currentTime) : formatTime(duration) }}</span>
            <span *ngIf="isPlaying" class="animate-pulse">جاري التشغيل...</span>
            <span *ngIf="!isPlaying && duration > 0">جاهز للتشغيل</span>
          </div>
        </div>

        <!-- Download Link -->
        <a [href]="audioUrl" target="_blank" download 
           [class.text-white]="isDarkBackground"
           [class.text-gray-400]="!isDarkBackground"
           class="opacity-40 hover:opacity-100 transition-opacity">
           <fa-icon [icon]="faDownload" class="text-xs"></fa-icon>
        </a>
      </div>

      <audio #audioElement 
        [src]="audioUrl" 
        (timeupdate)="onTimeUpdate()" 
        (loadedmetadata)="onLoadedMetadata()"
        (ended)="onEnded()"
        (error)="onError($event)"
        preload="metadata"
        hidden>
      </audio>
    </div>
  `,
  styles: [`
    .audio-bubble {
      direction: ltr;
    }
  `]
})
export class AudioPlayerComponent implements OnDestroy {
  @Input() audioUrl: string = '';
  @Input() isDarkBackground: boolean = true; // Default to dark background
  @ViewChild('audioElement') audioRef!: ElementRef<HTMLAudioElement>;

  faPlay = faPlay;
  faPause = faPause;
  faDownload = faDownload;

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  progress = 0;

  constructor(private cdr: ChangeDetectorRef) { }

  togglePlay() {
    const audio = this.audioRef.nativeElement;
    if (this.isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(err => console.error('Play failed', err));
    }
    this.isPlaying = !this.isPlaying;
  }

  onTimeUpdate() {
    const audio = this.audioRef.nativeElement;
    this.currentTime = audio.currentTime;
    if (this.duration > 0) {
      this.progress = (this.currentTime / this.duration) * 100;
    }
    this.cdr.detectChanges();
  }

  onLoadedMetadata() {
    const audio = this.audioRef.nativeElement;
    this.duration = audio.duration;
    this.cdr.detectChanges();
  }

  onEnded() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.progress = 0;
    this.cdr.detectChanges();
  }

  seek(event: MouseEvent) {
    const container = event.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const audio = this.audioRef.nativeElement;
    if (this.duration > 0) {
      audio.currentTime = percentage * this.duration;
    }
  }

  onError(err: any) {
    console.error('Audio element error', err);
  }

  formatTime(sec: number): string {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  ngOnDestroy() {
    if (this.audioRef) {
      this.audioRef.nativeElement.pause();
      this.audioRef.nativeElement.src = '';
      this.audioRef.nativeElement.load();
    }
  }
}
