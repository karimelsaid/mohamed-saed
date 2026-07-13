import {
  Component,
  Input,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  OnDestroy,
  ElementRef,
  ChangeDetectorRef,
  NgZone,
  PLATFORM_ID,
  Inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

interface DigitSlot {
  char: string;
  isDigit: boolean;
  targetOffset: number;
  currentOffset: number;
}

@Component({
  selector: 'app-youtube-counter',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="yt-counter-wrap">
      <div class="yt-slots">
        <ng-container *ngFor="let slot of slots; let i = index">

          <!-- Separator (comma / +) -->
          <div *ngIf="!slot.isDigit" class="yt-sep"
               [style.fontSize.px]="fontSize * 0.98"
               [style.lineHeight]="slotHeight + 'px'">{{ slot.char }}</div>

          <!-- Rolling digit slot -->
          <div *ngIf="slot.isDigit" class="yt-slot"
               [style.height.px]="slotHeight"
               [style.width.px]="slotWidth">
            <div class="yt-reel"
                 [style.transform]="'translateY(-' + (slot.currentOffset * slotHeight) + 'px)'"
                 [style.transition]="animated ? ('transform ' + getDuration(i) + 'ms cubic-bezier(0.18,1,0.22,1)') : 'none'">
              <div *ngFor="let d of digits" class="yt-digit"
                   [style.height.px]="slotHeight"
                   [style.fontSize.px]="fontSize">{{ d }}</div>
            </div>
            <div class="yt-mask yt-mask-top"></div>
            <div class="yt-mask yt-mask-bottom"></div>
          </div>

        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    :host { display: inline-block; }

    .yt-counter-wrap {
      display: inline-flex;
      align-items: center;
      direction: ltr;
    }

    .yt-slots {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .yt-slot {
      overflow: hidden;
      position: relative;
      border-radius: 10px;
    }

    .yt-reel {
      display: flex;
      flex-direction: column;
      will-change: transform;
    }

    .yt-digit {
      display: flex;
      align-items: center;
      justify-content: center;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      user-select: none;
    }

    .yt-sep {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding-bottom: 4px;
      font-weight: 900;
      user-select: none;
    }

    .yt-mask {
      position: absolute;
      left: 0; right: 0;
      height: 28%;
      pointer-events: none;
      z-index: 3;
    }
    .yt-mask-top    { top: 0;    background: linear-gradient(to bottom, rgba(0,0,0,0.4), transparent); }
    .yt-mask-bottom { bottom: 0; background: linear-gradient(to top,   rgba(0,0,0,0.4), transparent); }
  `]
})
export class YoutubeCounterComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() targetValue: number = 0;
  @Input() duration: number = 2000;
  @Input() slotHeight: number = 80;
  @Input() suffix: string = '+';

  readonly digits = ['0','1','2','3','4','5','6','7','8','9'];

  slots: DigitSlot[] = [];
  animated = false;

  get slotWidth(): number { return Math.round(this.slotHeight * 0.68); }
  get fontSize(): number  { return Math.round(this.slotHeight * 0.60); }

  getDuration(slotIndex: number): number {
    return Math.round(this.duration * 0.72) + slotIndex * 35;
  }

  private observer: IntersectionObserver | null = null;
  private hasAnimated = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private readonly isBrowser: boolean;

  constructor(
    private el: ElementRef,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['targetValue'] && !changes['targetValue'].isFirstChange()) {
      this.buildInitialSlots();
      if (this.hasAnimated) {
        this.animated = false;
        this.cdr.detectChanges();
        this.startRolling();
      }
    }
  }

  ngAfterViewInit(): void {
    // Immediately render the correct number of slots (all showing digit 0)
    this.buildInitialSlots();
    this.cdr.detectChanges();

    if (!this.isBrowser) return;

    // Try IntersectionObserver first
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !this.hasAnimated) {
            this.hasAnimated = true;
            this.zone.run(() => this.startRolling());
          }
        },
        { threshold: 0.05, rootMargin: '0px 0px 80px 0px' }
      );
      this.observer.observe(this.el.nativeElement);
    }

    // Fallback: animate after 500ms even if IntersectionObserver never fires
    const fallback = setTimeout(() => {
      if (!this.hasAnimated) {
        this.hasAnimated = true;
        this.zone.run(() => this.startRolling());
      }
    }, 500);
    this.timers.push(fallback);
  }

  private buildInitialSlots(): void {
    const target = this.targetValue || 0;
    const formatted = target.toLocaleString('en-US');
    const full = formatted + this.suffix;

    this.slots = full.split('').map(char => ({
      char,
      isDigit: /\d/.test(char),
      targetOffset: /\d/.test(char) ? +char : 0,
      currentOffset: 0,
    }));
  }

  private startRolling(): void {
    const t = setTimeout(() => {
      this.animated = true;
      this.slots = this.slots.map(s => ({
        ...s,
        currentOffset: s.isDigit ? s.targetOffset : 0,
      }));
      this.cdr.detectChanges();
    }, 60);
    this.timers.push(t);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.timers.forEach(t => clearTimeout(t));
  }
}
