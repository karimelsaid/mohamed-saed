import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCheckCircle, faStar, faBox, faBookOpen, faUsers, faCalendar, faShieldAlt } from '@fortawesome/free-solid-svg-icons';
import { StatisticsService, Statistics } from '../../services/statistics.service';
import { AnimatedCounterComponent } from '../animated-counter/animated-counter.component';
import { YoutubeCounterComponent } from '../youtube-counter/youtube-counter.component';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-premium-achievements',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FontAwesomeModule,
    AnimatedCounterComponent,
    YoutubeCounterComponent
  ],
  templateUrl: './premium-achievements.component.html',
  styleUrls: ['./premium-achievements.component.scss']
})
export class PremiumAchievementsComponent implements OnInit, OnDestroy {
  faCheckCircle = faCheckCircle;
  faStar = faStar;
  faBox = faBox;
  faBookOpen = faBookOpen;
  faUsers = faUsers;
  faCalendar = faCalendar;
  faShieldAlt = faShieldAlt;

  statistics: Statistics | null = null;
  loading: boolean = true;
  error: string | null = null;

  /** Responsive height for each digit slot in the YouTube-style hero counter */
  heroSlotHeight: number = this.calcSlotHeight();

  @HostListener('window:resize')
  onResize(): void {
    this.heroSlotHeight = this.calcSlotHeight();
    this.cdr.markForCheck();
  }

  private calcSlotHeight(): number {
    if (typeof window === 'undefined') return 80;
    const w = window.innerWidth;
    if (w >= 1280) return 100;
    if (w >= 1024) return 88;
    if (w >= 768)  return 72;
    if (w >= 480)  return 60;
    return 48;
  }

  // Founder data
  founder = {
    name: 'كريم محمد السعيد',
    description: 'مؤسس ومطور knoozbook أسعي جاهدا لتلبية احتياجات القارئ وطالب العلم من الكتب عسي ان يجازيني الله خيرا',
    image: '/karim_mohamed.png'
  };

  constructor(
    private statisticsService: StatisticsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadStatistics();
  }

  private loadStatistics() {
    this.statisticsService.getStatistics()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.statistics = data;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Failed to load statistics:', err);
          // Use fallback data if API fails
          this.statistics = {
            orders: 4827,
            products: 12000,
            customers: 3500,
            rating: 4.9,
            since: 2025
          };
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy() {
    // Cleanup if needed
  }
}
