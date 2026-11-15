import {
  Component,
  ElementRef,
  ViewChild,
  Input,
  Output,
  EventEmitter,
  inject,
  AfterViewInit,
  OnDestroy,
  computed,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimelineStore } from './timeline.store';
import { SnappingService } from './snapping.service';
import { PeaksService } from './peaks.service';
import { ThumbnailsService } from './thumbnails.service';
import { Segment, TranscriptWord, TranscriptParagraph, ProjectEDL } from '../../core/types';
import { TimelineCommandService, TrimSegmentCommand, SwitchCameraCommand, ToggleWordRemovalCommand } from './timeline-commands';
import { EdlService } from '../../core/edl.service';

@Component({
  selector: 'app-timeline-lanes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      #lanesContainer
      class="timeline-lanes-container"
      [style.width.px]="contentWidth"
      (click)="onContainerClick($event)"
      (contextmenu)="onContextMenu($event)">

      <!-- 1. VIDEO LANE -->
      @if (isVideoTrackVisible) {
        <div
          class="timeline-lane video-lane"
          [style.height.px]="videoLaneHeight">
          @for (seg of visibleSegments; track seg.id; let i = $index) {
            <div
              class="clip-block video-clip"
              [class.selected]="isClipSelected(seg.id)"
              [style.left.px]="getSegmentLeft(seg, i)"
              [style.width.px]="getSegmentWidth(seg)"
              (click)="onClipClick(seg.id, $event)">

              <!-- Left Trim Handle -->
              <div
                class="trim-handle trim-left"
                (mousedown)="startTrim(seg, 'left', $event)"
                title="تقليم البداية"></div>

              <!-- Clip Content -->
              <div class="clip-content">
                <span class="clip-title">مقطع {{ seg.id }}</span>
                <span class="clip-duration">{{ (seg.srcEnd - seg.srcStart).toFixed(1) }}ث</span>
              </div>

              <!-- Right Trim Handle -->
              <div
                class="trim-handle trim-right"
                (mousedown)="startTrim(seg, 'right', $event)"
                title="تقليم النهاية"></div>
            </div>
          }
        </div>
      }

      <!-- 2. CAMERAS LANE (Only when multi-cam) -->
      @if (isCamerasTrackVisible && hasMultipleCameras) {
        <div
          class="timeline-lane cameras-lane"
          [style.height.px]="camerasLaneHeight">
          @for (seg of visibleSegments; track seg.id; let i = $index) {
            <div
              class="camera-block"
              [class]="'cam-' + seg.camera"
              [style.left.px]="getSegmentLeft(seg, i)"
              [style.width.px]="getSegmentWidth(seg)"
              (click)="onCameraBlockClick(seg, $event)"
              [title]="'كاميرا: ' + seg.camera + ' (انقر للتبديل)'">
              <span class="cam-label">{{ getCameraLabel(seg.camera) }}</span>
            </div>
          }
        </div>
      }

      <!-- 3. AUDIO LANE (Canvas Waveform) -->
      @if (isAudioTrackVisible) {
        <div
          class="timeline-lane audio-lane"
          [style.height.px]="audioLaneHeight">
          <canvas #waveformCanvas class="waveform-canvas"></canvas>
        </div>
      }

      <!-- 4. CAPTIONS / SCRIPT LANE -->
      @if (isCaptionsTrackVisible) {
        <div
          class="timeline-lane captions-lane"
          [style.height.px]="captionsLaneHeight">
          @if (!edl || !edl.transcript || edl.transcript.length === 0) {
            <div class="empty-transcript-hint">
              <span>(لم يتم تفريغ الصوت بعد - اضغط على تفريغ Whisper بالأعلى لكشف الكلمات والفقرات وتعديلها)</span>
            </div>
          } @else if (store.transcriptViewMode() === 'paragraphs') {
            @for (p of visibleParagraphs; track p.id) {
              <div
                class="timeline-paragraph-card"
                [class.removed]="p.allRemoved"
                [class.has-cut]="p.hasRemoved && !p.allRemoved"
                [class.active-playing]="isParagraphActive(p)"
                [style.left.px]="store.timeToPixel(p.start)"
                [style.width.px]="getParagraphWidth(p)"
                (click)="onParagraphCardClick(p, $event)"
                [title]="'الفقرة (' + p.start.toFixed(1) + 's - ' + p.end.toFixed(1) + 's)'">
                <div class="para-card-header">
                  <span class="para-time-badge">{{ p.start.toFixed(1) }}s - {{ p.end.toFixed(1) }}s</span>
                  <div class="para-card-actions">
                    <button
                      type="button"
                      class="btn-para-card-edit"
                      (click)="onEditParagraphClick(p, $event)"
                      title="تعديل نص الفقرة بالكامل دفعة واحدة مع إعادة توزيع التوقيت">
                      ✎ تعديل
                    </button>
                    <button
                      type="button"
                      class="btn-para-card-cut"
                      [class.active-cut]="p.allRemoved"
                      (click)="onToggleParagraphCut(p, $event)"
                      [title]="p.allRemoved ? 'استعادة الفقرة' : 'حذف الفقرة بالكامل'">
                      {{ p.allRemoved ? '↩ استعادة' : '✂ حذف' }}
                    </button>
                  </div>
                </div>
                <p class="para-card-text" dir="rtl">{{ p.text }}</p>
              </div>
            }
          } @else {
            @for (word of filteredTranscriptWords; track word.id) {
              <div
                class="timeline-word-item"
                [class.timeline-silence-item]="word.kind === 'silence'"
                [class.removed]="word.removed"
                [class.active-playing]="isWordActive(word)"
                [style.left.px]="store.timeToPixel(word.start)"
                [style.width.px]="getWordWidth(word)"
                (click)="onToggleWordClick(word, $event)"
                [title]="word.text + ' (' + word.start.toFixed(1) + 's - ' + word.end.toFixed(1) + 's)'">
                <span class="word-label">{{ word.kind === 'silence' ? '⏸ ' + word.text : word.text }}</span>
                @if (word.kind !== 'silence') {
                  <button
                    type="button"
                    class="btn-edit-word-tiny"
                    (click)="onEditWordClick(word, $event)"
                    title="تعديل نص الكلمة">
                    ✎
                  </button>
                }
                @if (word.removed) {
                  <button
                    type="button"
                    class="btn-play-cut-tiny"
                    (click)="onPlaySnippetClick(word, $event)"
                    title="تشغيل هذا الجزء المحذوف فقط للاستماع إليه">
                    ▶
                  </button>
                  <span class="cut-badge">{{ word.kind === 'silence' ? 'سكتة مقصوصة' : 'محذوف' }}</span>
                }
              </div>
            }
          }
        </div>
      }

      <!-- 5. REMOVED-PARTS OVERLAY (Red Diagonal Hatch for all cuts: silences & fillers) -->
      @if (store.showRemovedOverlay()) {
        <div class="removed-overlay-layer" [style.height.px]="totalLanesHeight">
          @for (cut of visibleCuts; track cut.id) {
            <div
              class="removed-hatch-region"
              [style.left.px]="store.timeToPixel(cut.start)"
              [style.width.px]="Math.max(26, store.timeToPixel(cut.duration))"
              [title]="'جزء محذوف (' + cut.reason + ') ' + cut.duration.toFixed(2) + 'ث'">
              <span class="removed-tag">{{ cut.label }}</span>
              <div class="removed-hatch-actions">
                <button
                  type="button"
                  class="btn-hatch-play"
                  (click)="onPlaySnippetRange(cut.start, cut.end, $event)"
                  title="تشغيل هذا الجزء المحذوف فقط للاستماع إليه">
                  ▶ استماع
                </button>
                @if (cut.word) {
                  <button
                    type="button"
                    class="btn-hatch-restore"
                    (click)="onRestoreCutClick(cut.word, $event)"
                    title="استعادة هذا الجزء إلى الفيديو">
                    ↩ استعادة
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- PLAYHEAD NEEDLE & HEAD -->
      <div
        class="playhead-line"
        [style.transform]="'translateX(' + playheadPixelPosition + 'px)'"
        [style.height.px]="totalLanesHeight">
        <div
          class="playhead-head"
          (mousedown)="startPlayheadScrub($event)">
          <div class="head-arrow"></div>
        </div>
      </div>

      <!-- SNAPPING GUIDE LINE -->
      @if (store.snapGuidePosition() !== null) {
        <div
          class="snap-guide-line"
          [style.left.px]="store.snapGuidePosition()"
          [style.height.px]="totalLanesHeight"></div>
      }
    </div>
  `,
  styles: [`
    .timeline-lanes-container {
      position: relative;
      background: #0b0d14;
      min-height: 100%;
      user-select: none;
      overflow: hidden;
    }

    .timeline-lane {
      position: relative;
      width: 100%;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(255, 255, 255, 0.015);

      &:nth-child(even) {
        background: rgba(0, 0, 0, 0.2);
      }
    }

    /* Video Lane */
    .video-lane {
      background: rgba(30, 58, 138, 0.08);
    }

    .clip-block {
      position: absolute;
      top: 3px;
      bottom: 3px;
      background: linear-gradient(135deg, #1e40af, #2563eb);
      border: 1px solid #3b82f6;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      overflow: hidden;

      &:hover {
        border-color: #60a5fa;
      }

      &.selected {
        border-color: #ffffff;
        box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.8);
      }
    }

    .trim-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 7px;
      cursor: ew-resize;
      background: rgba(255, 255, 255, 0.15);
      opacity: 0;
      transition: opacity 0.15s ease, background 0.15s ease;
      z-index: 4;

      &:hover {
        opacity: 1 !important;
        background: #ffffff;
      }

      &.trim-left {
        left: 0;
        border-top-left-radius: 4px;
        border-bottom-left-radius: 4px;
      }

      &.trim-right {
        right: 0;
        border-top-right-radius: 4px;
        border-bottom-right-radius: 4px;
      }
    }

    .clip-block:hover .trim-handle {
      opacity: 0.7;
    }

    .clip-content {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .clip-title {
      font-size: 11px;
      font-weight: 600;
      color: #ffffff;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }

    .clip-duration {
      font-size: 10px;
      color: #93c5fd;
      font-family: monospace;
    }

    /* Cameras Lane */
    .cameras-lane {
      background: rgba(88, 28, 135, 0.08);
    }

    .camera-block {
      position: absolute;
      top: 2px;
      bottom: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      color: #ffffff;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: filter 0.15s ease;

      &:hover {
        filter: brightness(1.2);
      }

      &.cam-cam1 {
        background: #0284c7;
      }

      &.cam-cam2 {
        background: #7c3aed;
      }

      &.cam-cam3 {
        background: #059669;
      }
    }

    /* Audio Lane */
    .audio-lane {
      background: rgba(6, 78, 59, 0.08);
    }

    .waveform-canvas {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      display: block;
    }

    /* Captions Lane */
    .captions-lane {
      background: rgba(180, 83, 9, 0.08);
    }

    .caption-block {
      position: absolute;
      top: 3px;
      bottom: 3px;
      background: #78350f;
      border: 1px solid #d97706;
      border-radius: 4px;
      display: flex;
      align-items: center;
      padding: 0 6px;
      cursor: pointer;
      overflow: hidden;
      transition: background 0.15s ease;

      &:hover {
        background: #92400e;
        border-color: #f59e0b;
      }
    }

    .caption-text {
      font-size: 11px;
      color: #fef3c7;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      text-align: right;
    }

    /* Removed Parts Overlay */
    .removed-overlay-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      pointer-events: none;
      z-index: 5;
    }

    .removed-hatch-region {
      position: absolute;
      top: 0;
      bottom: 0;
      background: repeating-linear-gradient(
        -45deg,
        rgba(239, 68, 68, 0.25),
        rgba(239, 68, 68, 0.25) 5px,
        rgba(220, 38, 38, 0.45) 5px,
        rgba(220, 38, 38, 0.45) 10px
      );
      border-left: 1px solid #ef4444;
      border-right: 1px solid #ef4444;
      pointer-events: auto;
      cursor: pointer;
      display: flex;
      align-items: flex-end;
      padding: 2px;
      transition: filter 0.15s ease;

      &:hover {
        filter: brightness(1.3);
        background: repeating-linear-gradient(
          -45deg,
          rgba(239, 68, 68, 0.45),
          rgba(239, 68, 68, 0.45) 5px,
          rgba(220, 38, 38, 0.65) 5px,
          rgba(220, 38, 38, 0.65) 10px
        );
      }
    }

    .removed-tag {
      font-size: 9px;
      background: rgba(153, 27, 27, 0.85);
      color: #fca5a5;
      padding: 1px 3px;
      border-radius: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .removed-hatch-actions {
      display: flex;
      gap: 2px;
      margin-top: 2px;
    }

    .btn-hatch-play,
    .btn-hatch-restore {
      font-size: 8px;
      padding: 1px 4px;
      border-radius: 2px;
      border: none;
      cursor: pointer;
      white-space: nowrap;
      font-weight: 600;
      transition: filter 0.15s ease;

      &:hover {
        filter: brightness(1.2);
      }
    }

    .btn-hatch-play {
      background: #10b981;
      color: #ffffff;
    }

    .btn-hatch-restore {
      background: rgba(255, 255, 255, 0.25);
      color: #fef3c7;
    }

    .btn-play-cut-tiny {
      font-size: 8px;
      background: #10b981;
      color: #ffffff;
      border: none;
      border-radius: 2px;
      padding: 0 3px;
      cursor: pointer;
      line-height: 1.2;
      transition: transform 0.1s ease;

      &:hover {
        transform: scale(1.15);
      }
    }

    /* Playhead Needle */
    .playhead-line {
      position: absolute;
      top: 0;
      left: 0;
      width: 1.5px;
      background: #ef4444;
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 0 4px rgba(239, 68, 68, 0.6);
      will-change: transform;
    }

    .playhead-head {
      position: absolute;
      top: -14px;
      left: 50%;
      transform: translateX(-50%);
      width: 12px;
      height: 14px;
      pointer-events: auto;
      cursor: ew-resize;

      .head-arrow {
        width: 100%;
        height: 100%;
        background: #ef4444;
        clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%);
      }
    }

    /* Snap Guide Line */
    .snap-guide-line {
      position: absolute;
      top: 0;
      width: 1px;
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
      pointer-events: none;
      z-index: 9;
    }

    /* Empty Transcript Hint */
    .empty-transcript-hint {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: rgba(255, 255, 255, 0.35);
      font-size: 12px;
      font-style: italic;
      direction: rtl;
    }

    /* Paragraph Card */
    .timeline-paragraph-card {
      position: absolute;
      top: 3px;
      bottom: 3px;
      background: linear-gradient(135deg, #78350f, #92400e);
      border: 1px solid rgba(217, 119, 6, 0.6);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      padding: 4px 8px;
      cursor: pointer;
      overflow: hidden;
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      direction: rtl;
      min-width: 40px;

      &:hover {
        background: linear-gradient(135deg, #92400e, #a16207);
        border-color: #f59e0b;
        box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
      }

      &.active-playing {
        border-color: #fbbf24;
        box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.5);
      }

      &.removed {
        opacity: 0.4;
        background: linear-gradient(135deg, #451a03, #78350f);
        border-color: rgba(239, 68, 68, 0.5);
      }

      &.has-cut {
        border-color: rgba(239, 68, 68, 0.6);
        background: linear-gradient(135deg, #78350f, #7f1d1d);
      }
    }

    .para-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      margin-bottom: 2px;
    }

    .para-time-badge {
      font-size: 9px;
      color: #d97706;
      font-family: monospace;
      white-space: nowrap;
      background: rgba(0, 0, 0, 0.3);
      padding: 1px 4px;
      border-radius: 3px;
    }

    .para-card-actions {
      display: flex;
      gap: 2px;
    }

    .btn-para-card-edit,
    .btn-para-card-cut {
      font-size: 9px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fef3c7;
      padding: 1px 5px;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.15s ease;
      white-space: nowrap;

      &:hover {
        background: rgba(255, 255, 255, 0.2);
      }
    }

    .btn-para-card-cut.active-cut {
      background: rgba(239, 68, 68, 0.3);
      border-color: #ef4444;
      color: #fca5a5;
    }

    .para-card-text {
      font-size: 10px;
      color: #fef3c7;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin: 0;
      line-height: 1.4;
    }

    /* Word Items */
    .timeline-word-item {
      position: absolute;
      top: 4px;
      bottom: 4px;
      background: linear-gradient(135deg, #065f46, #047857);
      border: 1px solid rgba(16, 185, 129, 0.5);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 0 3px;
      cursor: pointer;
      overflow: hidden;
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      min-width: 16px;

      &:hover {
        background: linear-gradient(135deg, #047857, #059669);
        border-color: #34d399;
        box-shadow: 0 1px 4px rgba(52, 211, 153, 0.3);
      }

      &.active-playing {
        border-color: #6ee7b7;
        box-shadow: 0 0 0 2px rgba(110, 231, 183, 0.4);
      }

      &.removed {
        opacity: 0.5;
        background: linear-gradient(135deg, #450a0a, #7f1d1d);
        border-color: rgba(239, 68, 68, 0.4);
        text-decoration: line-through;
      }

      &.timeline-silence-item {
        background: linear-gradient(135deg, rgba(67, 56, 202, 0.45), rgba(49, 46, 129, 0.55));
        border: 1px dashed rgba(129, 140, 248, 0.5);

        .word-label {
          color: #c7d2fe;
          font-size: 10px;
        }

        &:hover {
          background: linear-gradient(135deg, rgba(79, 70, 229, 0.6), rgba(67, 56, 202, 0.7));
          border-color: #818cf8;
        }

        &.removed {
          opacity: 0.55;
          background: linear-gradient(135deg, #450a0a, #7f1d1d) !important;
          border-color: rgba(239, 68, 68, 0.5) !important;
        }
      }
    }

    .word-label {
      font-size: 10px;
      color: #d1fae5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      direction: rtl;
    }

    .btn-edit-word-tiny {
      font-size: 9px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      padding: 0 1px;
      line-height: 1;
      transition: color 0.15s ease;

      &:hover {
        color: #ffffff;
      }
    }

    .cut-badge {
      font-size: 8px;
      background: rgba(239, 68, 68, 0.6);
      color: #fecaca;
      padding: 0 3px;
      border-radius: 2px;
      white-space: nowrap;
    }
  `]
})
export class TimelineLanesComponent implements AfterViewInit, OnDestroy {
  store = inject(TimelineStore);
  snapping = inject(SnappingService);
  peaksService = inject(PeaksService);
  thumbnailsService = inject(ThumbnailsService);
  cmd = inject(TimelineCommandService);
  edlService = inject(EdlService);

  Math = Math;

  @ViewChild('lanesContainer') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('waveformCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  @Input() edl: ProjectEDL | null = null;
  @Input() paragraphs: TranscriptParagraph[] = [];
  @Input() totalDuration: number = 0;
  @Input() hasMultipleCameras: boolean = false;

  @Output() seek = new EventEmitter<number>();
  @Output() selectClip = new EventEmitter<string>();
  @Output() editCaption = new EventEmitter<TranscriptParagraph>();
  @Output() contextMenuOpen = new EventEmitter<{ x: number; y: number; time: number; segmentId?: string }>();
  @Output() playSnippet = new EventEmitter<{ start: number; end: number }>();

  private isScrubbing = false;
  private activeTrim: { seg: Segment; edge: 'left' | 'right'; initialStart: number; initialEnd: number } | null = null;

  constructor() {
    effect(() => {
      this.store.zoom();
      this.drawWaveform();
    });
  }

  get contentWidth(): number {
    // Always use full source duration so all timeline content is visible
    const dur = this.totalDuration || 60;
    return Math.max(this.store.containerWidth(), this.store.timeToPixel(dur) + 300);
  }

  get playheadPixelPosition(): number {
    if (this.store.layoutMode() === 'contiguous') {
      const vTime = this.edlService.mapSourceToVirtualTime(this.store.playheadTime());
      return this.store.timeToPixel(vTime);
    }
    return this.store.timeToPixel(this.store.playheadTime());
  }

  getSegmentLeft(seg: Segment, index: number): number {
    if (this.store.layoutMode() === 'contiguous') {
      let t = 0;
      for (let i = 0; i < index; i++) {
        const s = this.visibleSegments[i];
        t += (s.srcEnd - s.srcStart);
      }
      return this.store.timeToPixel(t);
    }
    return this.store.timeToPixel(seg.srcStart);
  }

  onPlaySnippetClick(word: TranscriptWord, event: MouseEvent): void {
    event.stopPropagation();
    this.playSnippet.emit({ start: word.start, end: word.end });
  }

  get isVideoTrackVisible(): boolean {
    return this.store.tracks().find(t => t.id === 'video')?.visible ?? true;
  }

  get isCamerasTrackVisible(): boolean {
    return this.store.tracks().find(t => t.id === 'cameras')?.visible ?? true;
  }

  get isAudioTrackVisible(): boolean {
    return this.store.tracks().find(t => t.id === 'audio')?.visible ?? true;
  }

  get isCaptionsTrackVisible(): boolean {
    return this.store.tracks().find(t => t.id === 'captions')?.visible ?? true;
  }

  get videoLaneHeight(): number {
    const t = this.store.tracks().find(x => x.id === 'video');
    return this.store.TRACK_HEIGHTS[t?.heightMode || 'normal'];
  }

  get camerasLaneHeight(): number {
    const t = this.store.tracks().find(x => x.id === 'cameras');
    return this.store.TRACK_HEIGHTS[t?.heightMode || 'compact'];
  }

  get audioLaneHeight(): number {
    const t = this.store.tracks().find(x => x.id === 'audio');
    return this.store.TRACK_HEIGHTS[t?.heightMode || 'normal'];
  }

  get captionsLaneHeight(): number {
    const t = this.store.tracks().find(x => x.id === 'captions');
    return this.store.TRACK_HEIGHTS[t?.heightMode || 'normal'];
  }

  get totalLanesHeight(): number {
    let h = 0;
    if (this.isVideoTrackVisible) h += this.videoLaneHeight;
    if (this.isCamerasTrackVisible && this.hasMultipleCameras) h += this.camerasLaneHeight;
    if (this.isAudioTrackVisible) h += this.audioLaneHeight;
    if (this.isCaptionsTrackVisible) h += this.captionsLaneHeight;
    return h;
  }

  // Virtualization: only render segments within visible window plus margin
  get visibleSegments(): Segment[] {
    if (!this.edl || !this.edl.segments) return [];
    return this.edl.segments;
  }

  get visibleParagraphs(): TranscriptParagraph[] {
    return this.paragraphs || [];
  }

  get visibleRemovedWords(): TranscriptWord[] {
    if (!this.edl || !this.edl.transcript) return [];
    return this.edl.transcript.filter(w => w.removed);
  }

  get visibleCuts(): Array<{ id: string; start: number; end: number; duration: number; reason: string; label: string; word?: TranscriptWord }> {
    if (!this.edl) return [];
    const cuts: Array<{ id: string; start: number; end: number; duration: number; reason: string; label: string; word?: TranscriptWord }> = [];

    // 1. All removed words (fillers, stutters, repeats, retakes)
    if (this.edl.transcript) {
      for (const w of this.edl.transcript) {
        if (w.removed) {
          cuts.push({
            id: `cut_w_${w.id}`,
            start: w.start,
            end: w.end,
            duration: Math.max(0.05, w.end - w.start),
            reason: this.getArabicReason(w.removeReason),
            label: w.kind === 'silence' ? `✂️ ${w.text}` : `✂️ حشو: "${w.text}"`,
            word: w
          });
        }
      }
    }

    // 2. All silence gaps between active segments
    const segments = this.edl.segments || [];
    for (let i = 0; i < segments.length - 1; i++) {
      const cur = segments[i];
      const next = segments[i + 1];
      const gapStart = cur.srcEnd;
      const gapEnd = next.srcStart;
      if (gapEnd - gapStart > 0.08) {
        const alreadyCovered = cuts.some(c => c.start >= gapStart - 0.05 && c.end <= gapEnd + 0.05);
        if (!alreadyCovered) {
          cuts.push({
            id: `cut_gap_${i}`,
            start: gapStart,
            end: gapEnd,
            duration: gapEnd - gapStart,
            reason: 'وقفة صمت مقصوصة',
            label: `✂️ صمت (${(gapEnd - gapStart).toFixed(1)}ث)`
          });
        }
      }
    }

    // Silence gap before first segment
    if (segments.length > 0 && segments[0].srcStart > 0.15) {
      cuts.push({
        id: 'cut_gap_start',
        start: 0,
        end: segments[0].srcStart,
        duration: segments[0].srcStart,
        reason: 'صمت بداية المقطع',
        label: `✂️ صمت البداية (${segments[0].srcStart.toFixed(1)}ث)`
      });
    }

    return cuts.sort((a, b) => a.start - b.start);
  }

  onPlaySnippetRange(start: number, end: number, event: MouseEvent): void {
    event.stopPropagation();
    this.playSnippet.emit({ start, end });
  }

  get filteredTranscriptWords(): TranscriptWord[] {
    if (!this.edl || !this.edl.transcript) return [];
    const query = this.store.searchQuery?.()?.trim().toLowerCase();
    if (!query) return this.edl.transcript;
    return this.edl.transcript.filter(w => w.text.toLowerCase().includes(query));
  }

  isParagraphActive(p: TranscriptParagraph): boolean {
    const t = this.store.playheadTime();
    return t >= p.start && t <= p.end;
  }

  isWordActive(word: TranscriptWord): boolean {
    const t = this.store.playheadTime();
    return t >= word.start && t <= word.end;
  }

  getWordWidth(word: TranscriptWord): number {
    const dur = Math.max(0.05, word.end - word.start);
    return Math.max(16, this.store.timeToPixel(dur));
  }

  onParagraphCardClick(p: TranscriptParagraph, event: MouseEvent): void {
    event.stopPropagation();
    this.seek.emit(p.start);
  }

  onEditParagraphClick(p: TranscriptParagraph, event: MouseEvent): void {
    event.stopPropagation();
    this.editCaption.emit(p);
  }

  onToggleParagraphCut(p: TranscriptParagraph, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.edl || !this.edl.transcript) return;
    // Find all words in this paragraph range and toggle them
    const words = this.edl.transcript.filter(w => w.start >= p.start && w.end <= p.end);
    const shouldRemove = !p.allRemoved;
    for (const w of words) {
      if (w.removed !== shouldRemove) {
        const cmd = new ToggleWordRemovalCommand(this.edlService, w.id, shouldRemove, w.removed);
        this.cmd.execute(cmd);
      }
    }
  }

  onToggleWordClick(word: TranscriptWord, event: MouseEvent): void {
    event.stopPropagation();
    const cmd = new ToggleWordRemovalCommand(this.edlService, word.id, !word.removed, word.removed);
    this.cmd.execute(cmd);
  }

  onEditWordClick(word: TranscriptWord, event: MouseEvent): void {
    event.stopPropagation();
    const newText = prompt('تعديل الكلمة:', word.text);
    if (newText !== null && newText.trim() !== '') {
      word.text = newText.trim();
    }
  }

  ngAfterViewInit(): void {
    this.drawWaveform();
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
  }

  ngOnDestroy(): void {
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);
  }

  getSegmentWidth(seg: Segment): number {
    const dur = Math.max(0.05, seg.srcEnd - seg.srcStart);
    return Math.max(10, this.store.timeToPixel(dur));
  }

  getParagraphWidth(p: TranscriptParagraph): number {
    const dur = Math.max(0.1, p.end - p.start);
    return Math.max(20, this.store.timeToPixel(dur));
  }

  isClipSelected(clipId: string): boolean {
    return this.store.selectedClipIds().includes(clipId);
  }

  onClipClick(clipId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      const cur = this.store.selectedClipIds();
      if (cur.includes(clipId)) {
        this.store.selectedClipIds.set(cur.filter(id => id !== clipId));
      } else {
        this.store.selectedClipIds.set([...cur, clipId]);
      }
    } else {
      this.store.selectedClipIds.set([clipId]);
    }
    this.selectClip.emit(clipId);
  }

  onContainerClick(event: MouseEvent): void {
    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const pixelX = Math.max(0, event.clientX - rect.left);
    const time = this.store.pixelToTime(pixelX);
    if (this.store.layoutMode() === 'contiguous') {
      const srcTime = this.edlService.mapVirtualToSourceTime(time);
      this.seek.emit(srcTime);
    } else {
      this.seek.emit(Math.min(this.totalDuration, Math.max(0, time)));
    }
    this.store.selectedClipIds.set([]);
  }

  startPlayheadScrub(event: MouseEvent): void {
    event.stopPropagation();
    this.isScrubbing = true;
  }

  startTrim(seg: Segment, edge: 'left' | 'right', event: MouseEvent): void {
    event.stopPropagation();
    this.activeTrim = {
      seg,
      edge,
      initialStart: seg.srcStart,
      initialEnd: seg.srcEnd
    };
  }

  private onWindowMouseMove = (e: MouseEvent) => {
    if (this.isScrubbing) {
      const rect = this.containerRef?.nativeElement.getBoundingClientRect();
      if (rect) {
        const pixelX = Math.max(0, e.clientX - rect.left);
        const time = this.store.pixelToTime(pixelX);
        const snap = this.snapping.findSnapPoint(time);
        this.seek.emit(Math.min(this.totalDuration, Math.max(0, snap.time)));
      }
      return;
    }

    if (this.activeTrim) {
      const rect = this.containerRef?.nativeElement.getBoundingClientRect();
      if (!rect) return;

      const pixelX = Math.max(0, e.clientX - rect.left);
      let targetTime = this.store.pixelToTime(pixelX);
      const snap = this.snapping.findSnapPoint(targetTime, this.activeTrim.seg.id);
      targetTime = snap.time;

      const seg = this.activeTrim.seg;
      if (this.activeTrim.edge === 'left') {
        const newStart = Math.min(seg.srcEnd - 0.1, Math.max(0, targetTime));
        seg.srcStart = Number(newStart.toFixed(3));
      } else {
        const newEnd = Math.max(seg.srcStart + 0.1, targetTime);
        seg.srcEnd = Number(newEnd.toFixed(3));
      }
    }
  };

  private onWindowMouseUp = () => {
    if (this.isScrubbing) {
      this.isScrubbing = false;
      this.store.snapGuidePosition.set(null);
    }

    if (this.activeTrim) {
      const seg = this.activeTrim.seg;
      const edge = this.activeTrim.edge;
      const initialStart = this.activeTrim.initialStart;
      const initialEnd = this.activeTrim.initialEnd;
      const cmd = new TrimSegmentCommand(
        this.edlService,
        seg.id,
        initialStart,
        initialEnd,
        seg.srcStart,
        seg.srcEnd
      );
      this.cmd.execute(cmd);
      this.activeTrim = null;
      this.store.snapGuidePosition.set(null);
    }
  };

  onCameraBlockClick(seg: Segment, event: MouseEvent): void {
    event.stopPropagation();
    const vCams = this.edl?.virtualCameras || this.edlService.getVirtualCameras();
    const cameras = vCams.map(c => c.id);
    const curIdx = cameras.indexOf(seg.camera);
    const nextCam = cameras[(curIdx + 1) % cameras.length];

    const cmd = new SwitchCameraCommand(this.edlService, seg.id, seg.camera, nextCam);
    this.cmd.execute(cmd);
  }

  getCameraLabel(cameraId: string): string {
    const vCam = this.edl?.virtualCameras?.find(c => c.id === cameraId) || this.edlService.getVirtualCameraById(cameraId);
    if (!vCam) return cameraId.toUpperCase();
    return vCam.name.replace(/\(.*?\)/g, '').trim() || cameraId.toUpperCase();
  }

  onCaptionDblClick(p: TranscriptParagraph, event: MouseEvent): void {
    event.stopPropagation();
    this.editCaption.emit(p);
  }

  onRestoreCutClick(word: TranscriptWord, event: MouseEvent): void {
    event.stopPropagation();
    const cmd = new ToggleWordRemovalCommand(this.edlService, word.id, false, word.removed);
    this.cmd.execute(cmd);
  }

  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const pixelX = Math.max(0, event.clientX - rect.left);
    const time = this.store.pixelToTime(pixelX);

    // Check if clicked inside a segment
    const seg = this.edl?.segments.find(s => time >= s.srcStart && time <= s.srcEnd);

    this.contextMenuOpen.emit({
      x: event.clientX,
      y: event.clientY,
      time,
      segmentId: seg?.id
    });
  }

  getArabicReason(reason?: string | null): string {
    switch (reason) {
      case 'silence': return 'صمت ووقفة طويلة';
      case 'filler': return 'كلمة حشو / تردد';
      case 'stutter': return 'لعثمة وتكرار مقطع';
      case 'repeat': return 'تكرار كلمة';
      case 'retake': return 'إعادة جملة';
      default: return 'جزء مقصوص';
    }
  }

  drawWaveform(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const width = this.contentWidth;
    const height = this.audioLaneHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Draw simulated or loaded audio peaks
    const zoom = this.store.zoom();
    const midY = height / 2;

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(0.5, '#34d399');
    grad.addColorStop(1, '#059669');

    ctx.fillStyle = grad;

    // Fast waveform representation: active transcript words have peaks, silences/removed have low or zero amplitude
    if (this.edl && this.edl.transcript) {
      for (const w of this.edl.transcript) {
        const startX = this.store.timeToPixel(w.start);
        const endX = this.store.timeToPixel(w.end);
        const barWidth = Math.max(1, endX - startX);

        if (w.removed) {
          // Flattened/muted peak for removed
          ctx.fillRect(startX, midY - 2, barWidth, 4);
        } else {
          // Spoken amplitude
          const amp = Math.min(height * 0.45, 12 + ((w.text.length * 3) % 20));
          ctx.beginPath();
          ctx.roundRect(startX, midY - amp, barWidth, amp * 2, 2);
          ctx.fill();
        }
      }
    }
  }
}
