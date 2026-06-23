import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  template: `<div class="landing-screen">
    <!-- Optional: Add a spinner or logo here -->
  </div>`,
  styles: [`
    .landing-screen {
      height: 100vh;
      width: 100%;
      background: #fff; /* or theme color */
      display: flex;
      justify-content: center;
      align-items: center;
    }
  `],
  standalone: true
})
export class LandingComponent implements OnInit {

  constructor(
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const lastState = localStorage.getItem('last_mushaf_state');
      const hasNavigated = sessionStorage.getItem('app_has_launched');

      // Simple routing decision
      if (lastState === 'mushaf') {
        // Use replaceUrl to prevent back button from returning to landing
        this.router.navigate(['/mushaf'], { replaceUrl: true });
      } else {
        this.router.navigate(['/Home'], { replaceUrl: true });
      }
    }
  }
}
