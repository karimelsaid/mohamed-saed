import {
  Component,
  ElementRef,
  ViewChild,
  Input,
  Output,
  EventEmitter,
  inject,
  HostListener,
  AfterViewInit,
  OnDestroy,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineStore } from './timeline.store';
import { TimelineToolbarComponent } from './timeline-toolbar.component';
import { TimelineRulerComponent } from './timeline-ruler.component';
import { TrackHeaderComponent } from './track-header.component';
import { TimelineLanesComponent } from './timeline-lanes.component';
import { ProjectEDL, TranscriptParagraph, Segment } from '../../core/types';
import {
  TimelineCommandService,
  SplitSegmentCommand,
  DeleteSegmentCommand,
  RippleDeleteSegmentCommand,
  SwitchCameraCommand
} from './timeline-commands';
import { EdlService } from '../../core/edl.service';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [
    CommonModule,
    TimelineToolbarComponent,
    TimelineRulerComponent,
    TrackHeaderComponent,
    TimelineLanesComponent
  ],
  template: `
    <div
      class="pro-timeline-shell studio-glass"
      [class.collapsed]="store.isCollapsed()"
      [style.height.px]="store.isCollapsed() ? 38 : store.timelineHeight()">

      <!-- Drag handle to resize timeline height -->
      <div
        class="resize-drag-handle"
        (mousedown)="startResize($event)"
        (dblclick)="toggleCollapse()"
        title="اسحب لتعديل ارتفاع الشريط الزمني (انقر مرتين للطي)">
        <div class="resize-notch"></div>
      </div>

      <!-- Top Toolbar -->
      <app-timeline-toolbar
        [isPlaying]="isPlaying"
        [totalDuration]="totalDuration"
        [savedSec]="savedSec"
        (playPause)="playPause.emit()"
        (split)="splitAtPlayhead()"
        (delete)="deleteSelectedClip()"
        (rippleDelete)="rippleDeleteSelectedClip()"
        (fitToScreen)="fitToScreen()"
        (addMarker)="addMarkerAtPlayhead()">
      </app-timeline-toolbar>

      <!-- Main Timeline Body (Headers on sticky Left, Tracks on scrollable Right) -->
      @if (!store.isCollapsed()) {
        <div class="timeline-body">
          <!-- Sticky Left Track Headers (RTL: right side of the panel, but visually headers) -->
          <app-track-header
            [hasMultipleCameras]="hasMultipleCameras">
          </app-track-header>

          <!-- Scrollable Viewport (LTR: time runs left to right) -->
          <div
            #scrollViewport
            class="timeline-scroll-viewport"
            dir="ltr"
            (scroll)="onViewportScroll($event)"
            (wheel)="onTimelineWheel($event)">

            <!-- Time Ruler on Top -->
            <app-timeline-ruler
              [duration]="totalDuration"
              (seek)="onSeek($event)">
            </app-timeline-ruler>

            <!-- Lanes (Video, Cameras, Audio, Captions, Removed Overlay) -->
            <app-timeline-lanes
              [edl]="edl"
              [paragraphs]="paragraphs"
              [totalDuration]="totalDuration"
              [hasMultipleCameras]="hasMultipleCameras"
              (seek)="onSeek($event)"
              (selectClip)="onSelectClip($event)"
              (editCaption)="editCaption.emit($event)"
              (contextMenuOpen)="openContextMenu($event)"
              (playSnippet)="playSnippet.emit($event)">
            </app-timeline-lanes>
          </div>
        </div>
      }

      <!-- Arabic Context Menu -->
      @if (contextMenu.visible) {
        <div
          class="timeline-context-menu studio-glass"
          [style.left.px]="contextMenu.x"
          [style.top.px]="contextMenu.y"
          (click)="$event.stopPropagation()">
          <button type="button" class="ctx-item" (click)="splitAtTime(contextMenu.time)">
            <span>✂️ قص عند المؤشر</span>
            <kbd>S</kbd>
          </button>
          @if (contextMenu.segmentId) {
            <button type="button" class="ctx-item danger" (click)="deleteSegmentById(contextMenu.segmentId!)">
              <span>🗑️ حذف الجزء</span>
              <kbd>Del</kbd>
            </button>
            <button type="button" class="ctx-item warning" (click)="rippleDeleteSegmentById(contextMenu.segmentId!)">
              <span>⚡ حذف مع غلق الفجوة</span>
              <kbd>⇧Del</kbd>
            </button>
          }
          <div class="ctx-sep"></div>
          <button type="button" class="ctx-item" (click)="addMarkerAtTime(contextMenu.time)">
            <span>📍 إضافة علامة</span>
            <kbd>M</kbd>
          </button>
        </div>
      }

      <!-- Keyboard Shortcuts Help Modal / Floating Trigger -->
      <button
        type="button"
        class="btn-shortcuts-help"
        (click)="showShortcutsModal = !showShortcutsModal"
        title="اختصارات لوحة المفاتيح">
        ⌨️
      </button>

      @if (showShortcutsModal) {
        <div class="shortcuts-popup studio-glass" (click)="$event.stopPropagation()">
          <div class="popup-header">
            <h4>اختصارات المحرر</h4>
            <button type="button" class="btn-close" (click)="showShortcutsModal = false">✕</button>
          </div>
          <div class="shortcuts-grid">
            <div class="sc-row"><kbd>Space</kbd><span>تشغيل / إيقاف مؤقت</span></div>
            <div class="sc-row"><kbd>S</kbd><span>قص عند المؤشر</span></div>
            <div class="sc-row"><kbd>Del</kbd><span>حذف الجزء المحدد</span></div>
            <div class="sc-row"><kbd>Shift + Del</kbd><span>حذف مع غلق الفجوة</span></div>
            <div class="sc-row"><kbd>Ctrl + Z</kbd><span>تراجع</span></div>
            <div class="sc-row"><kbd>Ctrl + Y</kbd><span>إعادة</span></div>
            <div class="sc-row"><kbd>← / →</kbd><span>تحريك إطار واحد (1 frame)</span></div>
            <div class="sc-row"><kbd>Shift + ← / →</kbd><span>تحريك ثانية كاملة</span></div>
            <div class="sc-row"><kbd>1 / 2 / 3</kbd><span>تبديل الكاميرا الحية</span></div>
            <div class="sc-row"><kbd>M</kbd><span>إضافة علامة</span></div>
            <div class="sc-row"><kbd>+ / -</kbd><span>تكبير / تصغير المسار</span></div>
            <div class="sc-row"><kbd>J / K / L</kbd><span>تشغيل عكسي / إيقاف / تقديم</span></div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .pro-timeline-shell {
      position: relative;
      display: flex;
      flex-direction: column;
      background: #0d0f17;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      width: 100%;
      user-select: none;
      z-index: 10;
      transition: height 0.1s ease-out;
    }

    .resize-drag-handle {
      position: absolute;
      top: -4px;
      left: 0;
      right: 0;
      height: 8px;
      cursor: ns-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 20;

      &:hover .resize-notch {
        background: #3b82f6;
        width: 60px;
      }
    }

    .resize-notch {
      width: 40px;
      height: 3px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 2px;
      transition: all 0.15s ease;
    }

    .timeline-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    .timeline-scroll-viewport {
      flex: 1;
      overflow-x: auto;
      overflow-y: auto;
      position: relative;
      background: #080a0f;

      &::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }

      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;

        &:hover {
          background: rgba(255, 255, 255, 0.4);
        }
      }
    }

    /* Context Menu */
    .timeline-context-menu {
      position: fixed;
      background: #181d29;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      padding: 4px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
      z-index: 1000;
      min-width: 170px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .ctx-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      font-size: 11.5px;
      color: #e2e8f0;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      text-align: right;
      font-family: inherit;

      &:hover {
        background: rgba(59, 130, 246, 0.2);
        color: #ffffff;
      }

      &.danger:hover {
        background: rgba(239, 68, 68, 0.25);
        color: #f87171;
      }

      &.warning:hover {
        background: rgba(245, 158, 11, 0.25);
        color: #fbbf24;
      }

      kbd {
        font-size: 10px;
        padding: 1px 5px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        color: #94a3b8;
        font-family: monospace;
      }
    }

    .ctx-sep {
      height: 1px;
      background: rgba(255, 255, 255, 0.1);
      margin: 3px 0;
    }

    /* Help floating button & popup */
    .btn-shortcuts-help {
      position: absolute;
      bottom: 8px;
      left: 8px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      z-index: 15;

      &:hover {
        background: rgba(255, 255, 255, 0.2);
      }
    }

    .shortcuts-popup {
      position: absolute;
      bottom: 38px;
      left: 8px;
      width: 280px;
      background: #111420;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
      z-index: 30;

      .popup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 4px;

        h4 {
          margin: 0;
          font-size: 12px;
          color: #38bdf8;
        }

        .btn-close {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
        }
      }

      .shortcuts-grid {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .sc-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: #cbd5e1;

        kbd {
          background: rgba(255, 255, 255, 0.1);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 10px;
          font-family: monospace;
          color: #38bdf8;
        }
      }
    }
  `]
})
export class TimelineComponent implements AfterViewInit, OnDestroy {
  store = inject(TimelineStore);
  cmd = inject(TimelineCommandService);
  edlService = inject(EdlService);

  @ViewChild('scrollViewport') viewportRef!: ElementRef<HTMLDivElement>;

  @Input() isPlaying: boolean = false;
  @Input() totalDuration: number = 0;
  @Input() savedSec: number = 0;
  @Input() edl: ProjectEDL | null = null;
  @Input() paragraphs: TranscriptParagraph[] = [];
  @Input() hasMultipleCameras: boolean = false;

  @Output() playPause = new EventEmitter<void>();
  @Output() seek = new EventEmitter<number>();
  @Output() editCaption = new EventEmitter<TranscriptParagraph>();
  @Output() playSnippet = new EventEmitter<{ start: number; end: number }>();

  contextMenu = {
    visible: false,
    x: 0,
    y: 0,
    time: 0,
    segmentId: undefined as string | undefined
  };

  showShortcutsModal = false;
  private isResizing = false;
  private autoScrollPaused = false;

  constructor() {
    // Auto-scroll effect: keeps playhead in view during playback
    effect(() => {
      const time = this.store.playheadTime();
      if (this.isPlaying && !this.autoScrollPaused) {
        this.scrollToPlayhead(time);
      }
    });
  }

  ngAfterViewInit(): void {
    window.addEventListener('click', this.closeContextMenu);
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);

    // Initial container width measurement
    if (this.viewportRef?.nativeElement) {
      this.store.containerWidth.set(this.viewportRef.nativeElement.clientWidth);
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('click', this.closeContextMenu);
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);
  }

  startResize(event: MouseEvent): void {
    event.preventDefault();
    this.isResizing = true;
  }

  private onWindowMouseMove = (e: MouseEvent) => {
    if (!this.isResizing) return;
    const windowH = window.innerHeight;
    const newHeight = windowH - e.clientY;
    const minHeight = 180;
    const maxHeight = Math.floor(windowH * 0.6);
    this.store.timelineHeight.set(Math.max(minHeight, Math.min(maxHeight, newHeight)));
  };

  private onWindowMouseUp = () => {
    this.isResizing = false;
  };

  toggleCollapse(): void {
    this.store.isCollapsed.set(!this.store.isCollapsed());
  }

  onViewportScroll(event: Event): void {
    const el = event.target as HTMLDivElement;
    this.store.scrollLeft.set(el.scrollLeft);
  }

  onSeek(time: number): void {
    this.autoScrollPaused = false;
    this.seek.emit(time);
  }

  onSelectClip(clipId: string): void {
    // Selection synced in store
  }

  private scrollToPlayhead(time: number): void {
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) return;

    const playheadPx = this.store.timeToPixel(time);
    const scrollLeft = viewport.scrollLeft;
    const viewWidth = viewport.clientWidth;

    // Keep playhead within the middle 50% of the viewport
    if (playheadPx > scrollLeft + viewWidth * 0.75 || playheadPx < scrollLeft) {
      viewport.scrollLeft = Math.max(0, playheadPx - viewWidth * 0.25);
    }
  }

  onTimelineWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      // Zoom centered on mouse
      event.preventDefault();
      const viewport = this.viewportRef?.nativeElement;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const mouseX = event.clientX - rect.left + viewport.scrollLeft;
      const mouseTime = this.store.pixelToTime(mouseX);

      const zoomFactor = event.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = this.store.zoom() * zoomFactor;
      this.store.setZoom(newZoom);

      // Re-align scroll so mouseTime stays at same screen position
      setTimeout(() => {
        const newPixelX = this.store.timeToPixel(mouseTime);
        viewport.scrollLeft = newPixelX - (event.clientX - rect.left);
      }, 0);
    } else if (event.shiftKey) {
      // Shift + wheel: horizontal scroll
      const viewport = this.viewportRef?.nativeElement;
      if (viewport) {
        viewport.scrollLeft += event.deltaY;
      }
    }
  }

  fitToScreen(): void {
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport || this.totalDuration <= 0) return;
    const targetZoom = (viewport.clientWidth - 100) / this.totalDuration;
    this.store.setZoom(targetZoom);
    viewport.scrollLeft = 0;
  }

  splitAtPlayhead(): void {
    this.splitAtTime(this.store.playheadTime());
  }

  splitAtTime(time: number): void {
    const edl = this.edlService.getEdl();
    if (!edl) return;
    const seg = edl.segments.find(s => time > s.srcStart + 0.1 && time < s.srcEnd - 0.1);
    if (seg) {
      const cmd = new SplitSegmentCommand(this.edlService, seg.id, time);
      this.cmd.execute(cmd);
    }
    this.closeContextMenu();
  }

  deleteSelectedClip(): void {
    const selected = this.store.selectedClipIds();
    if (selected.length > 0) {
      this.deleteSegmentById(selected[0]);
    }
  }

  rippleDeleteSelectedClip(): void {
    const selected = this.store.selectedClipIds();
    if (selected.length > 0) {
      this.rippleDeleteSegmentById(selected[0]);
    }
  }

  deleteSegmentById(segmentId: string): void {
    const edl = this.edlService.getEdl();
    const seg = edl?.segments.find(s => s.id === segmentId);
    if (seg) {
      const cmd = new DeleteSegmentCommand(this.edlService, seg.id);
      this.cmd.execute(cmd);
      this.store.selectedClipIds.set([]);
    }
    this.closeContextMenu();
  }

  rippleDeleteSegmentById(segmentId: string): void {
    const edl = this.edlService.getEdl();
    const seg = edl?.segments.find(s => s.id === segmentId);
    if (seg) {
      const cmd = new RippleDeleteSegmentCommand(this.edlService, seg.id);
      this.cmd.execute(cmd);
      this.store.selectedClipIds.set([]);
    }
    this.closeContextMenu();
  }

  addMarkerAtPlayhead(): void {
    this.addMarkerAtTime(this.store.playheadTime());
  }

  addMarkerAtTime(time: number): void {
    this.store.addMarker(time);
    this.closeContextMenu();
  }

  openContextMenu(data: { x: number; y: number; time: number; segmentId?: string }): void {
    this.contextMenu = {
      visible: true,
      x: data.x,
      y: data.y,
      time: data.time,
      segmentId: data.segmentId
    };
  }

  closeContextMenu = () => {
    this.contextMenu.visible = false;
  };

  // Keyboard Shortcuts Listener
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    // If user is typing in an input or textarea, don't hijack keys!
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Space: Play / Pause
    if (event.code === 'Space') {
      event.preventDefault();
      this.playPause.emit();
      return;
    }

    // S: Split
    if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      this.splitAtPlayhead();
      return;
    }

    // Delete / Backspace: Delete or Ripple Delete
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (event.shiftKey) {
        this.rippleDeleteSelectedClip();
      } else {
        this.deleteSelectedClip();
      }
      return;
    }

    // Ctrl+Z / Cmd+Z: Undo
    if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z') && !event.shiftKey) {
      event.preventDefault();
      this.cmd.undo();
      return;
    }

    // Ctrl+Y or Cmd+Shift+Z: Redo
    if (
      ((event.ctrlKey || event.metaKey) && (event.key === 'y' || event.key === 'Y')) ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'z' || event.key === 'Z'))
    ) {
      event.preventDefault();
      this.cmd.redo();
      return;
    }

    // M: Add marker
    if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      this.addMarkerAtPlayhead();
      return;
    }

    // 1, 2, 3: Camera switch
    if (['1', '2', '3'].includes(event.key)) {
      const camId = `cam${event.key}`;
      const time = this.store.playheadTime();
      const edl = this.edlService.getEdl();
      const seg = edl?.segments.find(s => time >= s.srcStart && time <= s.srcEnd);
      if (seg && seg.camera !== camId) {
        const cmd = new SwitchCameraCommand(this.edlService, seg.id, seg.camera, camId);
        this.cmd.execute(cmd);
      }
      return;
    }

    // Arrow keys: Step 1 frame (1/30s) or 1 second (with Shift)
    const step = event.shiftKey ? 1.0 : (1.0 / 30);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.onSeek(Math.min(this.totalDuration, this.store.playheadTime() + step));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.onSeek(Math.max(0, this.store.playheadTime() - step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.onSeek(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      this.onSeek(this.totalDuration);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.store.setZoom(this.store.zoom() + 20);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      this.store.setZoom(this.store.zoom() - 20);
    }
  }
}
