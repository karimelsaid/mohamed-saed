import { Component, OnInit } from '@angular/core';
import { MemorizationService } from '../../core/services/memorization.service';
import { UserProgress, PageProgress } from '../../core/models/mushaf.model';
import { Observable, map } from 'rxjs';

@Component({
    selector: 'app-dashboard',
    standalone: false,
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
    progress$?: Observable<UserProgress>;

    newMemorization$?: Observable<PageProgress[]>;
    reviewList$?: Observable<PageProgress[]>;
    forgottenList$?: Observable<PageProgress[]>;

    constructor(private memorizationService: MemorizationService) { }

    ngOnInit(): void {
        this.progress$ = this.memorizationService.progress$;

        this.newMemorization$ = this.progress$.pipe(
            map((p: UserProgress) => p.pages.filter((pg: PageProgress) => pg.level === 'new'))
        );

        this.reviewList$ = this.progress$.pipe(
            map((p: UserProgress) => p.pages.filter((pg: PageProgress) => pg.level === 'review'))
        );

        this.forgottenList$ = this.progress$.pipe(
            map((p: UserProgress) => p.pages.filter((pg: PageProgress) => pg.level === 'forgotten'))
        );
    }

    getCompletionPercentage(pages: PageProgress[]): number {
        return (pages.length / 604) * 100;
    }
}
