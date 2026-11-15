import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, Output, EventEmitter, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineStore } from './timeline.store';

@Component({
  selector: 'app-timeline-ruler',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="timeline-ruler-container"
      (mousedown)="onMouseDown($event)"
      [style.width.px]="rulerWidth">
      <canvas #rulerCanvas class="ruler-canvas"></canvas>

      <!-- Markers on the ruler -->
      @for (m of store.markers(); track m.id) {
        <div
          class="ruler-marker"
          [style.left.px]="store.timeToPixel(m.time)"
          [title]="m.label + ' (' + store.formatTimecode(m.time) + ')'"
          (dblclick)="onMarkerDblClick(m.id, $event)">
          <div class="marker-flag" [style.background]="m.color || '#38bdf8'"></div>
          <span class="marker-label">{{ m.label }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .timeline-ruler-container {
      position: relative;
      height: 26px;
      background: #141721;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      cursor: pointer;
      user-select: none;
      overflow: hidden;
    }

    .ruler-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    .ruler-marker {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      pointer-events: auto;
      z-index: 5;

      .marker-flag {
        width: 8px;
        height: 10px;
        clip-path: polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%);
      }

      .marker-label {
        font-size: 8px;
        color: #e2e8f0;
        background: rgba(0, 0, 0, 0.7);
        padding: 0 2px;
        border-radius: 2px;
        margin-top: 1px;
        white-space: nowrap;
      }
    }
  `]
})
export class TimelineRulerComponent implements AfterViewInit, OnDestroy {
  store = inject(TimelineStore);

  @ViewChild('rulerCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() duration: number = 0;
  @Output() seek = new EventEmitter<number>();

  private isDragging = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    // Redraw whenever zoom changes
    effect(() => {
      this.store.zoom();
      this.store.markers();
      this.drawRuler();
    });
  }

  get rulerWidth(): number {
    return Math.max(this.store.containerWidth(), this.store.timeToPixel(this.duration) + 200);
  }

  ngAfterViewInit(): void {
    this.drawRuler();
    this.resizeObserver = new ResizeObserver(() => this.drawRuler());
    if (this.canvasRef?.nativeElement) {
      this.resizeObserver.observe(this.canvasRef.nativeElement);
    }

    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);
  }

  drawRuler(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const width = this.rulerWidth;
    const height = 26;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const zoom = this.store.zoom(); // px per second

    // Determine interval for major ticks based on zoom
    let majorInterval = 10; // seconds
    let minorSubdivisions = 5;

    if (zoom >= 250) {
      majorInterval = 1;
      minorSubdivisions = 30; // frame level (at 30fps)
    } else if (zoom >= 120) {
      majorInterval = 1;
      minorSubdivisions = 10;
    } else if (zoom >= 60) {
      majorInterval = 2;
      minorSubdivisions = 4;
    } else if (zoom >= 30) {
      majorInterval = 5;
      minorSubdivisions = 5;
    } else if (zoom >= 15) {
      majorInterval = 10;
      minorSubdivisions = 5;
    } else {
      majorInterval = 30;
      minorSubdivisions = 6;
    }

    const minorInterval = majorInterval / minorSubdivisions;
    const maxTime = Math.max(this.duration, width / zoom);

    // Minor ticks
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = 0; t <= maxTime; t += minorInterval) {
      const x = Math.round(t * zoom);
      ctx.moveTo(x + 0.5, height - 5);
      ctx.lineTo(x + 0.5, height);
    }
    ctx.stroke();

    // Major ticks and labels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';

    ctx.beginPath();
    for (let t = 0; t <= maxTime; t += majorInterval) {
      const x = Math.round(t * zoom);
      ctx.moveTo(x + 0.5, height - 12);
      ctx.lineTo(x + 0.5, height);

      // Label
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const label = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      ctx.fillText(label, x + 3, height - 13);
    }
    ctx.stroke();
  }

  onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Left click only
    this.isDragging = true;
    this.seekFromEvent(e);
  }

  private onWindowMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    this.seekFromEvent(e);
  };

  private onWindowMouseUp = () => {
    this.isDragging = false;
  };

  private seekFromEvent(e: MouseEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pixelX = Math.max(0, e.clientX - rect.left);
    const time = this.store.pixelToTime(pixelX);
    this.seek.emit(Math.min(this.duration, Math.max(0, time)));
  }

  onMarkerDblClick(markerId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.store.removeMarker(markerId);
  }
}
