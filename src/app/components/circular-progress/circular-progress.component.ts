import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-circular-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="circular-progress" 
         [style.width.px]="size" 
         [style.height.px]="size"
         [style.background]="getBackground()">
      <div class="inner-circle"
           [style.width.px]="size - (strokeWidth * 2)"
           [style.height.px]="size - (strokeWidth * 2)"
           [style.color]="color">
        <span class="progress-value" [style.font-size.px]="size * 0.3">{{ progress }}%</span>
      </div>
    </div>
  `,
  styles: [`
    .circular-progress {
      position: relative;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .inner-circle {
      position: absolute;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
    }
    :host-context(.dark) .inner-circle {
      background: #1f2937;
    }
  `]
})
export class CircularProgressComponent {
  @Input() progress: number = 0;
  @Input() size: number = 50;
  @Input() strokeWidth: number = 5;
  @Input() color: string = '#4f46e5';

  getBackground(): string {
    return `conic-gradient(${this.color} ${this.progress}%, #e5e7eb ${this.progress}%)`;
  }
}
