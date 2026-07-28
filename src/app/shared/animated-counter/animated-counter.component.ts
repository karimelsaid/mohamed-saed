import { Component, Input, ElementRef, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-animated-counter',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [class]="className">{{ animatedValue }}</span>
  `,
  styles: [`
    :host {
      display: inline-block;
    }
  `]
})
export class AnimatedCounterComponent implements OnInit, OnDestroy {
  @Input() targetValue: number = 0;
  @Input() duration: number = 2000;
  @Input() className: string = '';
  @Input() suffix: string = '';
  @Input() prefix: string = '';
  @Input() decimals: number = 0;

  animatedValue: string = '0';
  private animationFrameId: number | null = null;
  private startTime: number | null = null;
  private hasAnimated: boolean = false;

  constructor(
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit() {
    this.observeVisibility();
  }

  private observeVisibility() {
    if (!isPlatformBrowser(this.platformId) || typeof IntersectionObserver === 'undefined') {
      // On the server, we don't animate. We can just set the animatedValue to targetValue directly
      // or just do nothing (it will stay 0 and animate on the client). Let's do nothing.
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.hasAnimated) {
            this.startAnimation();
            this.hasAnimated = true;
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(this.elementRef.nativeElement);

    // Store observer for cleanup
    this.observer = observer;
  }

  private observer: IntersectionObserver | null = null;

  private startAnimation() {
    this.startTime = performance.now();
    this.animate();
  }

  private animate = () => {
    if (!this.startTime) return;

    const currentTime = performance.now();
    const elapsed = currentTime - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);

    // Easing function (easeOutQuart)
    const easeOutQuart = (t: number): number => {
      return 1 - Math.pow(1 - t, 4);
    };

    const easedProgress = easeOutQuart(progress);
    const currentValue = Math.floor(easedProgress * this.targetValue);

    this.animatedValue = `${this.prefix}${currentValue.toLocaleString('en-US', {
      minimumFractionDigits: this.decimals,
      maximumFractionDigits: this.decimals
    })}${this.suffix}`;

    if (progress < 1) {
      this.animationFrameId = requestAnimationFrame(this.animate);
    } else {
      // Ensure final value is exact
      this.animatedValue = `${this.prefix}${this.targetValue.toLocaleString('en-US', {
        minimumFractionDigits: this.decimals,
        maximumFractionDigits: this.decimals
      })}${this.suffix}`;
      this.cdr.markForCheck();
    }
  };

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
