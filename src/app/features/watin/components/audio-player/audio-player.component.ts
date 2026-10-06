import { Component, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface AudioChapter {
  title: string;
  time: number; // seconds
}

@Component({
  selector: 'app-watin-audio-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Player Container -->
    <div class="player-container" [class.expanded]="isExpanded" [class.minimized]="!isExpanded && hasAudio">

      <!-- Mini Player (collapsed) -->
      <div class="mini-player" *ngIf="!isExpanded && hasAudio" (click)="expand()">
        <div class="mini-info">
          <span class="mini-title">{{ title }}</span>
          <span class="mini-speaker">{{ speaker }}</span>
        </div>
        <div class="mini-controls">
          <button class="mini-btn" (click)="togglePlay(); $event.stopPropagation()">
            <i class="fas" [ngClass]="isPlaying ? 'fa-pause' : 'fa-play'"></i>
          </button>
        </div>
        <div class="mini-progress">
          <div class="mini-progress-fill" [style.width.%]="progressPercent"></div>
        </div>
      </div>

      <!-- Expanded Player -->
      <div class="expanded-player" *ngIf="isExpanded">
        <!-- Header -->
        <div class="player-header">
          <button class="header-btn" (click)="collapse()"><i class="fas fa-chevron-down"></i></button>
          <div class="header-info">
            <h3>{{ title }}</h3>
            <p>{{ speaker }}</p>
          </div>
          <button class="header-btn" (click)="onExportClick()"><i class="fas fa-file-export"></i></button>
        </div>

        <!-- Progress Bar -->
        <div class="progress-section">
          <div class="progress-bar-container" (click)="seekTo($event)" #progressBar>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" [style.width.%]="progressPercent"></div>
              <div class="progress-bar-knob" [style.left.%]="progressPercent"></div>
            </div>
          </div>
          <div class="time-display">
            <span>{{ formatTime(currentTime) }}</span>
            <span>{{ formatTime(duration) }}</span>
          </div>
        </div>

        <!-- Transport Controls -->
        <div class="transport-controls">
          <button class="speed-btn" (click)="cycleSpeed()">{{ playbackSpeed }}x</button>
          <button class="transport-btn" (click)="skip(-15)"><i class="fas fa-undo"></i><span class="skip-label">15</span></button>
          <button class="play-btn-main" (click)="togglePlay()">
            <i class="fas" [ngClass]="isPlaying ? 'fa-pause' : 'fa-play'"></i>
          </button>
          <button class="transport-btn" (click)="skip(15)"><i class="fas fa-redo"></i><span class="skip-label">15</span></button>
          <button class="transport-btn small" (click)="toggleRepeat()">
            <i class="fas fa-redo-alt" [class.active-icon]="isRepeat"></i>
          </button>
        </div>

        <!-- Tabs -->
        <div class="player-tabs">
          <button class="player-tab" [class.active]="activeTab === 'transcript'" (click)="activeTab = 'transcript'">التفريغ</button>
          <button class="player-tab" [class.active]="activeTab === 'notes'" (click)="activeTab = 'notes'">ملاحظات</button>
          <button class="player-tab" [class.active]="activeTab === 'chapters'" (click)="activeTab = 'chapters'">الفواصل</button>
        </div>

        <!-- Tab Content -->
        <div class="tab-content">
          <!-- Transcript Tab -->
          <div *ngIf="activeTab === 'transcript'" class="transcript-tab">
            <div *ngIf="transcriptSegments.length === 0" class="empty-state">
              <i class="fas fa-closed-captioning"></i>
              <p>لم يتم تفريغ هذا الدرس بعد</p>
              <button class="action-btn" (click)="onStartTranscription()">ابدأ التفريغ الآن</button>
            </div>
            <div *ngFor="let seg of transcriptSegments; let i = index" 
                 class="transcript-item"
                 [class.active-segment]="i === activeSegmentIndex"
                 (click)="seekToTime(seg.start)">
              <span class="seg-time">{{ formatTime(seg.start) }}</span>
              <p class="seg-text" [class.quran-match]="seg.type === 'quran'">{{ seg.text }}</p>
            </div>
          </div>

          <!-- Notes Tab -->
          <div *ngIf="activeTab === 'notes'" class="notes-tab">
            <div class="empty-state">
              <i class="fas fa-sticky-note"></i>
              <p>لم تقم بإضافة ملاحظات بعد</p>
              <button class="action-btn">أضف ملاحظة</button>
            </div>
          </div>

          <!-- Chapters Tab -->
          <div *ngIf="activeTab === 'chapters'" class="chapters-tab">
            <div *ngIf="chapters.length === 0" class="empty-state">
              <i class="fas fa-list-ol"></i>
              <p>لا توجد فواصل لهذا الدرس</p>
            </div>
            <div *ngFor="let ch of chapters; let i = index" 
                 class="chapter-item"
                 [class.active-chapter]="isActiveChapter(i)"
                 (click)="seekToTime(ch.time)">
              <div class="chapter-info">
                <span class="chapter-num">{{ i + 1 }}</span>
                <span class="chapter-title">{{ ch.title }}</span>
              </div>
              <span class="chapter-time">{{ formatTime(ch.time) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden Audio Element -->
    <audio #audioElement
           (timeupdate)="onTimeUpdate()"
           (loadedmetadata)="onMetadataLoaded()"
           (ended)="onEnded()">
    </audio>
  `,
  styles: [`
    /* ===== Player Container ===== */
    .player-container {
      position: fixed;
      bottom: 65px; /* above bottom nav */
      left: 0;
      right: 0;
      z-index: 999;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .player-container.expanded {
      top: 0;
      bottom: 0;
      background: var(--watin-forest, #1F3A2E);
      overflow-y: auto;
    }

    /* ===== Mini Player ===== */
    .mini-player {
      position: relative;
      background: var(--watin-forest, #1F3A2E);
      color: white;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 15px;
      cursor: pointer;
      box-shadow: 0 -4px 15px rgba(0,0,0,0.15);
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
    }

    .mini-info {
      flex: 1;
      overflow: hidden;
    }
    .mini-title {
      display: block;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mini-speaker {
      display: block;
      font-size: 11px;
      opacity: 0.7;
      margin-top: 2px;
    }
    .mini-btn {
      background: var(--watin-sand, #A89572);
      border: none;
      color: white;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      cursor: pointer;
    }
    .mini-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: rgba(255,255,255,0.15);
    }
    .mini-progress-fill {
      height: 100%;
      background: var(--watin-sand, #A89572);
      transition: width 0.3s linear;
    }

    /* ===== Expanded Player ===== */
    .expanded-player {
      height: 100%;
      display: flex;
      flex-direction: column;
      color: white;
      padding: 0 0 env(safe-area-inset-bottom, 0);
    }

    .player-header {
      display: flex;
      align-items: center;
      padding: 20px;
      gap: 15px;
    }
    .header-btn {
      background: rgba(255,255,255,0.1);
      border: none;
      color: white;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .header-btn:active {
      background: rgba(255,255,255,0.2);
    }
    .header-info {
      flex: 1;
      text-align: center;
    }
    .header-info h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
    }
    .header-info p {
      margin: 4px 0 0;
      font-size: 13px;
      opacity: 0.7;
    }

    /* ===== Progress Bar ===== */
    .progress-section {
      padding: 10px 25px 5px;
    }
    .progress-bar-container {
      cursor: pointer;
      padding: 10px 0;
    }
    .progress-bar-bg {
      height: 5px;
      background: rgba(255,255,255,0.15);
      border-radius: 3px;
      position: relative;
    }
    .progress-bar-fill {
      height: 100%;
      background: var(--watin-sand, #A89572);
      border-radius: 3px;
      transition: width 0.1s linear;
    }
    .progress-bar-knob {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      background: var(--watin-sand, #A89572);
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      transition: left 0.1s linear;
    }
    .time-display {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      margin-top: 5px;
    }

    /* ===== Transport Controls ===== */
    .transport-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      padding: 15px 20px 25px;
    }
    .transport-btn {
      background: none;
      border: none;
      color: rgba(255,255,255,0.85);
      font-size: 22px;
      cursor: pointer;
      position: relative;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.2s;
    }
    .transport-btn:active {
      background: rgba(255,255,255,0.1);
    }
    .transport-btn.small {
      font-size: 18px;
      width: 40px;
      height: 40px;
    }
    .skip-label {
      position: absolute;
      font-size: 9px;
      font-weight: 700;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      margin-top: 1px;
    }
    .play-btn-main {
      background: var(--watin-sand, #A89572);
      border: none;
      color: white;
      width: 65px;
      height: 65px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(168, 149, 114, 0.4);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .play-btn-main:active {
      transform: scale(0.93);
    }
    .speed-btn {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.85);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
    }
    .active-icon {
      color: var(--watin-sand, #A89572) !important;
    }

    /* ===== Tabs ===== */
    .player-tabs {
      display: flex;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      padding: 0 20px;
    }
    .player-tab {
      flex: 1;
      background: none;
      border: none;
      color: rgba(255,255,255,0.5);
      padding: 12px 0;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      position: relative;
      font-family: inherit;
      transition: color 0.2s;
    }
    .player-tab.active {
      color: var(--watin-sand, #A89572);
    }
    .player-tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 20%;
      right: 20%;
      height: 3px;
      background: var(--watin-sand, #A89572);
      border-radius: 2px;
    }

    /* ===== Tab Content ===== */
    .tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 15px 20px 20px;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: rgba(255,255,255,0.5);
    }
    .empty-state i {
      font-size: 40px;
      margin-bottom: 15px;
      display: block;
    }
    .empty-state p {
      font-size: 14px;
      margin-bottom: 15px;
    }
    .action-btn {
      background: var(--watin-sand, #A89572);
      color: white;
      border: none;
      padding: 10px 22px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      font-family: inherit;
    }

    /* ===== Transcript Items ===== */
    .transcript-item {
      display: flex;
      gap: 12px;
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.2s;
      align-items: flex-start;
    }
    .transcript-item:active,
    .transcript-item.active-segment {
      background: rgba(255,255,255,0.08);
    }
    .seg-time {
      font-size: 11px;
      color: var(--watin-sand, #A89572);
      background: rgba(168, 149, 114, 0.15);
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
      margin-top: 2px;
      font-family: monospace;
    }
    .seg-text {
      margin: 0;
      font-size: 14px;
      line-height: 1.7;
      color: rgba(255,255,255,0.9);
    }
    .seg-text.quran-match {
      color: var(--watin-sand, #A89572);
      font-family: 'Amiri', serif;
      font-size: 16px;
    }

    /* ===== Chapter Items ===== */
    .chapter-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 12px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.2s;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .chapter-item:active,
    .chapter-item.active-chapter {
      background: rgba(255,255,255,0.08);
    }
    .chapter-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .chapter-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: var(--watin-sand, #A89572);
    }
    .chapter-title {
      font-size: 14px;
      font-weight: 600;
    }
    .chapter-time {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      font-family: monospace;
    }
  `]
})
export class AudioPlayerComponent implements OnDestroy {
  @ViewChild('audioElement') audioRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('progressBar') progressBarRef!: ElementRef;

  // State
  hasAudio = false;
  isExpanded = false;
  isPlaying = false;
  isRepeat = false;
  currentTime = 0;
  duration = 0;
  playbackSpeed = 1.0;
  activeTab: 'transcript' | 'notes' | 'chapters' = 'transcript';
  activeSegmentIndex = -1;

  // Data
  title = '';
  speaker = '';
  audioUrl = '';
  transcriptSegments: { start: number; end: number; text: string; type: string }[] = [];
  chapters: AudioChapter[] = [];

  private speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  get progressPercent(): number {
    return this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
  }

  loadAudio(url: string, title: string, speaker: string) {
    this.audioUrl = url;
    this.title = title;
    this.speaker = speaker;
    this.hasAudio = true;
    this.isExpanded = true;

    setTimeout(() => {
      const audio = this.audioRef?.nativeElement;
      if (audio) {
        audio.src = url;
        audio.load();
      }
    });
  }

  loadTranscript(segments: any[]) {
    this.transcriptSegments = segments;
  }

  loadChapters(chapters: AudioChapter[]) {
    this.chapters = chapters;
  }

  expand() { this.isExpanded = true; }
  collapse() { this.isExpanded = false; }

  togglePlay() {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;
    if (this.isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    this.isPlaying = !this.isPlaying;
  }

  skip(seconds: number) {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, this.duration));
  }

  cycleSpeed() {
    const idx = this.speeds.indexOf(this.playbackSpeed);
    this.playbackSpeed = this.speeds[(idx + 1) % this.speeds.length];
    const audio = this.audioRef?.nativeElement;
    if (audio) audio.playbackRate = this.playbackSpeed;
  }

  toggleRepeat() { this.isRepeat = !this.isRepeat; }

  seekTo(event: MouseEvent) {
    const el = this.progressBarRef?.nativeElement;
    const audio = this.audioRef?.nativeElement;
    if (!el || !audio) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const pct = x / rect.width;
    audio.currentTime = pct * this.duration;
  }

  seekToTime(time: number) {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;
    audio.currentTime = time;
    if (!this.isPlaying) {
      audio.play();
      this.isPlaying = true;
    }
  }

  onTimeUpdate() {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;
    this.currentTime = audio.currentTime;
    // Update active segment
    this.activeSegmentIndex = this.transcriptSegments.findIndex(
      seg => this.currentTime >= seg.start && this.currentTime < seg.end
    );
  }

  onMetadataLoaded() {
    const audio = this.audioRef?.nativeElement;
    if (audio) this.duration = audio.duration;
  }

  onEnded() {
    this.isPlaying = false;
    if (this.isRepeat) {
      const audio = this.audioRef?.nativeElement;
      if (audio) {
        audio.currentTime = 0;
        audio.play();
        this.isPlaying = true;
      }
    }
  }

  onExportClick() {
    // Will be connected to parent component
  }

  onStartTranscription() {
    // Will be connected to parent component
  }

  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  isActiveChapter(index: number): boolean {
    const ch = this.chapters[index];
    const next = this.chapters[index + 1];
    return this.currentTime >= ch.time && (!next || this.currentTime < next.time);
  }

  ngOnDestroy() {
    const audio = this.audioRef?.nativeElement;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
  }
}
