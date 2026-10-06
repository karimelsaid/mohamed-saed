import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { LiveUpdateModalComponent } from './shared/components/live-update-modal/live-update-modal.component';
import { LiveUpdateService } from './services/live-update.service';

@Component({
  selector: 'app-watin-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, LiveUpdateModalComponent],
  template: `
    <router-outlet></router-outlet>
    <app-live-update-modal
      *ngIf="(liveUpdateService.status$ | async) !== 'idle'"
      [version]="(liveUpdateService.version$ | async) || ''"
      [progress]="(liveUpdateService.progress$ | async) || 0"
      [status]="(liveUpdateService.status$ | async) || 'idle'"
      [errorMessage]="(liveUpdateService.error$ | async) || ''"
      [sizeBytes]="(liveUpdateService.sizeBytes$ | async) || 0"
      [sizeFormatted]="(liveUpdateService.sizeFormatted$ | async) || ''"
      (onUpdate)="liveUpdateService.startUpdate()"
      (onPostpone)="liveUpdateService.postponeUpdate()">
    </app-live-update-modal>
  `
})
export class WatinRootComponent implements OnInit {
  constructor(
    public liveUpdateService: LiveUpdateService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.liveUpdateService.initialize('watin').catch(err => console.error('Live Update Init Error:', err));
    }
  }
}
