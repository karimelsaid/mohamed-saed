import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineStore } from './timeline.store';
import { TrackConfig } from './timeline.types';

@Component({
  selector: 'app-track-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="track-headers-column">
      <!-- Top corner spacer matching the time ruler height (26px) -->
      <div class="ruler-spacer">
        <span class="tracks-title">المسارات</span>
      </div>

      <!-- Headers for each lane -->
      <div class="headers-list">
        @for (track of visibleTracks; track track.id) {
          <div
            class="track-header-item"
            [class.locked]="track.locked"
            [style.height.px]="store.TRACK_HEIGHTS[track.heightMode]">
            <div class="header-main-info">
              <span class="track-icon">{{ track.icon }}</span>
              <span class="track-name">{{ track.name }}</span>
            </div>

            <div class="header-actions">
              <!-- Audio specific mute/solo -->
              @if (track.id === 'audio') {
                <button
                  type="button"
                  class="btn-track-action mute-btn"
                  [class.active]="track.muted"
                  (click)="store.toggleTrackMute(track.id)"
                  [title]="track.muted ? 'إلغاء كتم الصوت' : 'كتم الصوت'">
                  M
                </button>
              }

              <!-- Lock toggle -->
              <button
                type="button"
                class="btn-track-action"
                [class.active]="track.locked"
                (click)="store.toggleTrackLock(track.id)"
                [title]="track.locked ? 'فتح القفل' : 'قفل المسار'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  @if (track.locked) {
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  } @else {
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                  }
                </svg>
              </button>

              <!-- Hide / Show toggle -->
              <button
                type="button"
                class="btn-track-action"
                [class.inactive]="!track.visible"
                (click)="store.toggleTrackVisibility(track.id)"
                [title]="track.visible ? 'إخفاء المسار' : 'إظهار المسار'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  @if (track.visible) {
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  } @else {
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  }
                </svg>
              </button>

              <!-- Height toggle mode -->
              <button
                type="button"
                class="btn-track-action height-toggle"
                (click)="store.cycleTrackHeight(track.id)"
                title="تغيير ارتفاع المسار (صغير / متوسط / كبير)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="7 15 12 20 17 15"/>
                  <polyline points="7 9 12 4 17 9"/>
                </svg>
              </button>
            </div>

            <!-- Captions/Transcript Track Mode Switcher (Paragraphs vs Words) -->
            @if (track.id === 'captions' && track.heightMode !== 'compact') {
              <div class="caption-mode-switch">
                <button
                  type="button"
                  class="mode-pill-btn"
                  [class.active]="store.transcriptViewMode() === 'paragraphs'"
                  (click)="store.transcriptViewMode.set('paragraphs')"
                  title="عرض وتعديل كفقرات">
                  📜 فقرات
                </button>
                <button
                  type="button"
                  class="mode-pill-btn"
                  [class.active]="store.transcriptViewMode() === 'words'"
                  (click)="store.transcriptViewMode.set('words')"
                  title="عرض ككلمات مفردة">
                  🔤 كلمات
                </button>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .track-headers-column {
      width: 155px;
      min-width: 155px;
      background: #0f121a;
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      user-select: none;
      display: flex;
      flex-direction: column;
      z-index: 8;
    }

    .caption-mode-switch {
      display: flex;
      align-items: center;
      gap: 3px;
      background: rgba(0, 0, 0, 0.4);
      padding: 2px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      margin-top: 4px;
    }

    .mode-pill-btn {
      flex: 1;
      background: transparent;
      border: none;
      border-radius: 3px;
      color: #94a3b8;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 4px;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s ease;

      &:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.08);
      }

      &.active {
        background: #0284c7;
        color: #ffffff;
      }
    }

    .ruler-spacer {
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #141721;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
    }

    .headers-list {
      display: flex;
      flex-direction: column;
    }

    .track-header-item {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 6px 8px;
      background: #11141e;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      transition: background 0.15s ease;

      &:hover {
        background: #161b28;
      }

      &.locked {
        background: rgba(239, 68, 68, 0.05);
      }
    }

    .header-main-info {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .track-icon {
      font-size: 13px;
    }

    .track-name {
      font-size: 11.5px;
      font-weight: 600;
      color: #cbd5e1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 3px;
      margin-top: 2px;
    }

    .btn-track-action {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 3px;
      color: #94a3b8;
      font-size: 10px;
      font-weight: bold;
      cursor: pointer;
      padding: 0;
      transition: all 0.12s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #ffffff;
      }

      &.active {
        background: #ef4444;
        color: #ffffff;
        border-color: #f87171;
      }

      &.inactive {
        opacity: 0.4;
      }
    }
  `]
})
export class TrackHeaderComponent {
  store = inject(TimelineStore);

  @Input() hasMultipleCameras: boolean = false;

  get visibleTracks(): TrackConfig[] {
    return this.store.tracks().filter(t => {
      if (t.id === 'cameras' && !this.hasMultipleCameras) return false;
      return true;
    });
  }
}
