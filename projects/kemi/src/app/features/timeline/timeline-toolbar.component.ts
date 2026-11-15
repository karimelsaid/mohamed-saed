import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineStore } from './timeline.store';
import { TimelineCommandService } from './timeline-commands';

@Component({
  selector: 'app-timeline-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="timeline-toolbar-bar studio-glass">
      <!-- Left side (RTL context: Action tools) -->
      <div class="toolbar-section">
        <button
          type="button"
          class="tool-btn primary"
          (click)="playPause.emit()"
          [title]="isPlaying ? 'إيقاف مؤقت (Space)' : 'تشغيل (Space)'">
          @if (isPlaying) {
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          } @else {
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          }
        </button>

        <div class="btn-divider"></div>

        <button
          type="button"
          class="tool-btn"
          (click)="split.emit()"
          title="قص عند المؤشر (S)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="6" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <line x1="20" y1="4" x2="8.12" y2="15.88"/>
            <line x1="14.47" y1="14.48" x2="20" y2="20"/>
            <line x1="8.12" y1="8.12" x2="12" y2="12"/>
          </svg>
          <span class="btn-label">قص (S)</span>
        </button>

        <button
          type="button"
          class="tool-btn danger-hover"
          (click)="delete.emit()"
          title="حذف الجزء المحدد (Del)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          <span class="btn-label">حذف</span>
        </button>

        <button
          type="button"
          class="tool-btn ripple-btn"
          (click)="rippleDelete.emit()"
          title="حذف مع غلق الفجوة (Shift+Del)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
          </svg>
          <span class="btn-label">غلق الفجوة</span>
        </button>

        <div class="btn-divider"></div>

        <!-- Undo / Redo -->
        <button
          type="button"
          class="tool-btn icon-only"
          [disabled]="!cmd.canUndo()"
          (click)="cmd.undo()"
          title="تراجع (Ctrl+Z)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
          </svg>
        </button>

        <button
          type="button"
          class="tool-btn icon-only"
          [disabled]="!cmd.canRedo()"
          (click)="cmd.redo()"
          title="إعادة (Ctrl+Y)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 7v6h-6"/>
            <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/>
          </svg>
        </button>

        <div class="btn-divider"></div>

        <!-- Snapping (Magnet) -->
        <button
          type="button"
          class="tool-btn magnet-btn"
          [class.active]="store.snappingEnabled()"
          (click)="toggleSnapping()"
          title="المغناطيس (المحاذاة الذكية)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 3v7a6 6 0 0 0 12 0V3"/>
            <line x1="6" y1="7" x2="6" y2="7"/>
            <line x1="18" y1="7" x2="18" y2="7"/>
          </svg>
        </button>

        <!-- Toggle Removed Overlay -->
        <button
          type="button"
          class="tool-btn overlay-toggle"
          [class.active]="store.showRemovedOverlay()"
          (click)="toggleRemovedOverlay()"
          title="إظهار/إخفاء الأجزاء المحذوفة">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <span class="btn-label">المحذوف</span>
        </button>

        <!-- Layout Mode (Contiguous / Ripple like CapCut vs Source with Gaps) -->
        <button
          type="button"
          class="tool-btn layout-btn"
          [class.active]="store.layoutMode() === 'contiguous'"
          (click)="toggleLayoutMode()"
          [title]="store.layoutMode() === 'contiguous' ? 'وضع التتابع بدون فراغات (مثل CapCut و Premiere)' : 'وضع الفراغات المقصوصة'">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="6" width="9" height="12" rx="1"/>
            <rect x="13" y="6" width="9" height="12" rx="1"/>
          </svg>
          <span class="btn-label">{{ store.layoutMode() === 'contiguous' ? 'ضم المقاطع (تتابع)' : 'عرض الفراغات' }}</span>
        </button>

        <!-- Add Marker -->
        <button
          type="button"
          class="tool-btn icon-only"
          (click)="addMarker.emit()"
          title="إضافة علامة (M)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>

      <!-- Center: Timecode & Saved info -->
      <div class="toolbar-center">
        <div class="timecode-badge font-mono" dir="ltr">
          <span class="current-tc">{{ store.formatTimecode(store.playheadTime()) }}</span>
          <span class="tc-sep">/</span>
          <span class="total-tc">{{ store.formatTimecode(totalDuration) }}</span>
        </div>

        @if (savedSec > 0) {
          <div class="saved-time-badge" title="الوقت الذي تم توفيره بالقص التلقائي">
            <span class="sparkle">⚡</span>
            <span>تم توفير {{ savedSec.toFixed(1) }} ث</span>
          </div>
        }
      </div>

      <!-- Right side: Zoom Controls & Fit to screen -->
      <div class="toolbar-section zoom-section" dir="ltr">
        <button
          type="button"
          class="tool-btn icon-only fit-btn"
          (click)="fitToScreen.emit()"
          title="ملاءمة الشاشة">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9"/>
            <polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>

        <button
          type="button"
          class="zoom-step-btn"
          (click)="stepZoom(-15)"
          title="تصغير (-)">
          -
        </button>

        <input
          type="range"
          class="zoom-slider"
          min="15"
          max="300"
          [value]="store.zoom()"
          (input)="onZoomSlider($event)"
          title="مستوى التقريب" />

        <button
          type="button"
          class="zoom-step-btn"
          (click)="stepZoom(+15)"
          title="تكبير (+)">
          +
        </button>

        <span class="zoom-value">{{ ((store.zoom() / 80) * 100).toFixed(0) }}%</span>
      </div>
    </div>
  `,
  styles: [`
    .timeline-toolbar-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 38px;
      padding: 0 10px;
      background: #11141c;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      user-select: none;
      gap: 12px;
      z-index: 10;
    }

    .toolbar-section {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .btn-divider {
      width: 1px;
      height: 18px;
      background: rgba(255, 255, 255, 0.12);
      margin: 0 4px;
    }

    .tool-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 9px;
      font-size: 11.5px;
      font-family: inherit;
      color: #cbd5e1;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
        border-color: rgba(255, 255, 255, 0.2);
      }

      &:active:not(:disabled) {
        transform: scale(0.97);
      }

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      &.primary {
        background: #3b82f6;
        color: #ffffff;
        border-color: #60a5fa;

        &:hover {
          background: #2563eb;
        }
      }

      &.danger-hover:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
        border-color: rgba(239, 68, 68, 0.3);
      }

      &.ripple-btn:hover:not(:disabled) {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
        border-color: rgba(245, 158, 11, 0.3);
      }

      &.magnet-btn.active {
        background: rgba(16, 185, 129, 0.2);
        color: #34d399;
        border-color: rgba(16, 185, 129, 0.5);
      }

      &.overlay-toggle.active {
        background: rgba(244, 63, 94, 0.18);
        color: #fb7185;
        border-color: rgba(244, 63, 94, 0.45);
      }

      &.icon-only {
        padding: 0;
        width: 28px;
        justify-content: center;
      }
    }

    .btn-label {
      font-weight: 500;
    }

    .toolbar-center {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .timecode-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #080a0f;
      padding: 3px 10px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      letter-spacing: 0.5px;
    }

    .current-tc {
      color: #38bdf8;
      font-weight: 600;
    }

    .tc-sep {
      color: rgba(255, 255, 255, 0.3);
    }

    .total-tc {
      color: #94a3b8;
    }

    .saved-time-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 12px;
      font-size: 11px;
      color: #34d399;
      font-weight: 600;
    }

    .zoom-section {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .zoom-step-btn {
      width: 20px;
      height: 20px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      color: #cbd5e1;
      font-size: 13px;
      cursor: pointer;

      &:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #ffffff;
      }
    }

    .zoom-slider {
      width: 75px;
      height: 4px;
      accent-color: #3b82f6;
      cursor: pointer;
    }

    .zoom-value {
      font-size: 11px;
      font-family: monospace;
      color: #94a3b8;
      width: 38px;
      text-align: right;
    }
  `]
})
export class TimelineToolbarComponent {
  store = inject(TimelineStore);
  cmd = inject(TimelineCommandService);

  @Input() isPlaying: boolean = false;
  @Input() totalDuration: number = 0;
  @Input() savedSec: number = 0;

  @Output() playPause = new EventEmitter<void>();
  @Output() split = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  @Output() rippleDelete = new EventEmitter<void>();
  @Output() fitToScreen = new EventEmitter<void>();
  @Output() addMarker = new EventEmitter<void>();

  toggleSnapping(): void {
    this.store.snappingEnabled.set(!this.store.snappingEnabled());
  }

  toggleRemovedOverlay(): void {
    this.store.showRemovedOverlay.set(!this.store.showRemovedOverlay());
  }

  toggleLayoutMode(): void {
    this.store.layoutMode.set(this.store.layoutMode() === 'contiguous' ? 'source' : 'contiguous');
  }

  onZoomSlider(event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    this.store.setZoom(val);
  }

  stepZoom(delta: number): void {
    this.store.setZoom(this.store.zoom() + delta);
  }
}
